import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const base = process.env.VN_URL || 'http://127.0.0.1:5196';
const output = path.resolve(
  process.env.VN_EVIDENCE || '.experiments/kestrel-runtime',
);
await mkdir(output, { recursive: true });
const report = {
  created: new Date().toISOString(),
  base,
  checks: [],
  errors: [],
  samples: [],
  caveat:
    'Hidden Chrome screenshots and resource samples do not certify foreground frame rate, audio or physical devices.',
};
const check = (name, pass, details) =>
  report.checks.push({ name, pass, details });
const monitor = (page) => {
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') report.errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      report.errors.push(`${response.status()}: ${response.url()}`);
  });
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const assetPath = new URL(
  '../public/assets/ships/kestrel/kestrel.glb',
  import.meta.url,
);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
try {
  report.assetSha256 = hash(await readFile(assetPath));
  const productionAsset = await fetch(
    `${base}/assets/ships/kestrel/kestrel.glb`,
  );
  check(
    'Production serves the current runtime GLB',
    productionAsset.ok &&
      hash(Buffer.from(await productionAsset.arrayBuffer())) ===
        report.assetSha256,
  );
  for (const level of ['halcyon', 'orbital']) {
    for (const quality of ['high', 'low']) {
      const label = `${level}-${quality}`;
      const context = await browser.newContext({
        viewport: { width: 1600, height: 1000 },
        deviceScaleFactor: 1,
      });
      await context.addInitScript(
        (quality) =>
          localStorage.setItem(
            'vector-nova.settings',
            JSON.stringify({ quality, volume: 0, reducedMotion: false }),
          ),
        quality,
      );
      const page = await context.newPage();
      monitor(page);
      const fetchedModels = [];
      page.on('response', (response) => {
        if (response.url().endsWith('/kestrel.glb'))
          fetchedModels.push(response.status());
      });
      await page.goto(`${base}/${level === 'orbital' ? '?level=orbital' : ''}`);
      await page.waitForFunction(() => window.__VN?.ready, null, {
        timeout: 60000,
      });
      check(
        `${label}: production asset fetched before ready`,
        fetchedModels.length === 1 && fetchedModels[0] === 200,
        fetchedModels,
      );
      await page.locator('#inspect').click();
      const inspection = await page.evaluate(() => window.__VN.getSnapshot());
      check(
        `${label}: menu opens the ship viewer`,
        inspection.mode === 'inspection' &&
          inspection.ship.id === 'kestrel' &&
          inspection.inspection.preview.autoRotate,
        inspection.inspection,
      );
      await page.locator('[data-preview="autoRotate"]').click();
      await page.locator('[data-preview="driving"]').click();
      await page.screenshot({
        path: path.join(output, `${label}-inspection-driving.png`),
      });
      await page.locator('[data-preview="boost"]').click();
      const preview = await page.evaluate(() => window.__VN.getSnapshot());
      check(
        `${label}: preview controls leave race state unchanged`,
        !preview.inspection.preview.autoRotate &&
          preview.inspection.preview.driving &&
          preview.inspection.preview.boost &&
          JSON.stringify(preview.vehicle) ===
            JSON.stringify(inspection.vehicle),
        preview.inspection,
      );
      check(
        `${label}: experimental heat toggle is absent`,
        (await page.locator('[data-preview="heat"]').count()) === 0,
      );
      await page.screenshot({
        path: path.join(output, `${label}-inspection-boost.png`),
      });
      await page.locator('#inspect-back').click();
      await page.evaluate(() => {
        window.__VN.loadScenario('staging', 47219);
        window.__VN.setCamera('chase');
        window.__VN.start();
      });
      await page.keyboard.down('ArrowUp');
      await page.waitForFunction(
        () => window.__VN.getSnapshot().vehicle.speed > 45,
        { timeout: 45000 },
      );
      await page.screenshot({ path: path.join(output, `${label}-cruise.png`) });
      const cruise = await page.evaluate(() => window.__VN.getSnapshot());
      await page.keyboard.down('Shift');
      await page.waitForFunction(
        () => window.__VN.getSnapshot().vehicle.boosting,
        { timeout: 10000 },
      );
      await page.screenshot({ path: path.join(output, `${label}-boost.png`) });
      const boost = await page.evaluate(() => window.__VN.getSnapshot());
      check(
        `${label}: real throttle and boost`,
        cruise.vehicle.speed > 45 &&
          boost.vehicle.boosting &&
          boost.vehicle.energy < cruise.vehicle.energy,
        { cruise: cruise.vehicle, boost: boost.vehicle },
      );
      await page.keyboard.up('Shift');
      await page.keyboard.up('ArrowUp');
      await page.waitForFunction(
        () => !window.__VN.getSnapshot().vehicle.boosting,
        { timeout: 10000 },
      );
      check(`${label}: boost released`, true);
      await page.evaluate(() => window.__VN.loadScenario('bank', 47219));
      await page.keyboard.down('ArrowUp');
      const before = await page.evaluate(() => window.__VN.getSnapshot().tick);
      await page.waitForFunction(
        (tick) => window.__VN.getSnapshot().tick > tick + 30,
        before,
        { timeout: 10000 },
      );
      await page.screenshot({ path: path.join(output, `${label}-bank.png`) });
      await page.keyboard.up('ArrowUp');
      report.samples.push(
        await page.evaluate(() => ({
          snapshot: window.__VN.getSnapshot(),
          metrics: window.__VN.getMetrics(),
        })),
      );
      if (quality === 'high') {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() =>
          window.__VN.loadScenario('inspection', 47219),
        );
        await page.screenshot({
          path: path.join(output, `${label}-portrait.png`),
        });
      }
      await context.close();
    }
  }
  check(
    'Asset stayed unchanged throughout capture',
    hash(await readFile(assetPath)) === report.assetSha256,
  );
} catch (error) {
  report.errors.push(error.message);
  throw error;
} finally {
  await browser.close();
  check(
    'No browser or failed-resource errors',
    report.errors.length === 0,
    report.errors,
  );
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2),
  );
}
console.log(
  JSON.stringify(
    {
      output,
      checks: report.checks.map(({ name, pass }) => ({ name, pass })),
      errors: report.errors,
    },
    null,
    2,
  ),
);
if (report.checks.some((entry) => !entry.pass)) process.exitCode = 1;
