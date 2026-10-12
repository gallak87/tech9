import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.VN_URL || 'http://127.0.0.1:5192/';
const output = path.resolve(
  process.env.VN_EVIDENCE || '.experiments/gate4-1/edge-catch',
);
await mkdir(output, { recursive: true });
const report = { checks: [], errors: [], cases: [] };
const check = (name, pass, detail) =>
  report.checks.push({ name, pass, detail });
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--mute-audio', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
page.on('pageerror', (e) => report.errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') report.errors.push(m.text());
});
page.on('response', (r) => {
  if (r.status() >= 400) report.errors.push(`${r.status()} ${r.url()}`);
});
const snap = () => page.evaluate(() => window.__VN.getSnapshot());
try {
  await page.goto(base + '?level=nacre');
  await page.waitForFunction(() => window.__VN?.ready, undefined, {
    timeout: 90000,
  });
  report.build = await page.locator('script[type=module]').getAttribute('src');
  report.stylesheet = await page
    .locator('link[rel=stylesheet]')
    .getAttribute('href');
  await page.locator('#start').click();
  for (const index of [1, 2])
    for (const side of ['left', 'right']) {
      const name = `jump${index}-edge-${side}`,
        sign = side === 'left' ? 1 : -1;
      await page.evaluate((n) => window.__VN.loadScenario(n, 47219), name);
      await page.keyboard.down('KeyW');
      await page.keyboard.down('ShiftLeft');
      await page.waitForFunction(
        () =>
          window.__VN
            .getSnapshot()
            .events.some((e) => e.payload?.source === 'nacre-edge-catch'),
        undefined,
        { timeout: 10000, polling: 'raf' },
      );
      const caught = await snap();
      const impact = caught.events.find(
        (e) => e.payload?.source === 'nacre-edge-catch',
      );
      check(
        `${name} swept rail catches before falling`,
        caught.runtime.state.mode === 'flight' &&
          impact.payload.overlap >= 0.5 &&
          !caught.events.some((e) => e.type === 'jump-miss'),
        impact.payload,
      );
      check(
        `${name} small bump penalty`,
        impact.payload.speedRetention === 0.95 &&
          impact.payload.energyCost === 2,
      );
      await page.screenshot({ path: path.join(output, `${name}-catch.png`) });
      await page.waitForFunction(
        () =>
          window.__VN
            .getSnapshot()
            .events.some((e) => e.type === 'jump-transfer'),
        undefined,
        { timeout: 10000, polling: 'raf' },
      );
      await page.waitForTimeout(420);
      await page.keyboard.up('KeyW');
      await page.keyboard.up('ShiftLeft');
      await page.evaluate(() => window.__VN.pause());
      const landed = await snap();
      const transfer = landed.events.find((e) => e.type === 'jump-transfer');
      check(
        `${name} returns inside and lands`,
        transfer.payload.outcome === 'landed' &&
          transfer.payload.edgeCaught &&
          sign * landed.vehicle.lateral < 12.5 &&
          sign * landed.vehicle.lateralSpeed < 0,
        landed.vehicle,
      );
      check(
        `${name} penalty is charged only once`,
        landed.events.filter((e) => e.type === 'impact').length === 1 &&
          !landed.events.some((e) => e.type === 'jump-miss'),
      );
      const replay = await page.evaluate(() => window.__VN.getReplay());
      const replayed = await page.evaluate(
        (r) => window.__VN.playReplay(r),
        replay,
      );
      check(
        `${name} replay preserves collision and one-time penalty`,
        JSON.stringify(replayed.vehicle) === JSON.stringify(landed.vehicle) &&
          JSON.stringify(replayed.runtime.state) ===
            JSON.stringify(landed.runtime.state),
      );
      report.cases.push({
        name,
        caught,
        landed,
        metrics: await page.evaluate(() => window.__VN.getMetrics()),
      });
    }
} catch (error) {
  report.errors.push(error.stack || String(error));
} finally {
  await browser.close();
  report.browserClosed = true;
  report.passed =
    report.errors.length === 0 && report.checks.every((c) => c.pass);
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    JSON.stringify(
      {
        build: report.build,
        passed: report.passed,
        checks: report.checks.length,
        failures: report.checks.filter((c) => !c.pass),
        errors: report.errors,
        browserClosed: true,
      },
      null,
      2,
    ),
  );
  if (!report.passed) process.exitCode = 1;
}
