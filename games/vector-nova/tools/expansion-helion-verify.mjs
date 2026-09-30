import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const url = process.env.VN_URL;
if (!url)
  throw new Error('VN_URL requires the coordinated Helion production preview.');
const output = resolve(
  process.env.VN_EVIDENCE || '.experiments/expansion/helion/production',
);
await mkdir(output, { recursive: true });
const report = {
  url,
  cases: [],
  errors: [],
  limitations: [
    'Hidden browser timings only; foreground pacing, listening, physical gamepad/mobile remain unverified.',
  ],
};
const browser = await chromium.launch({
  headless: true,
  ...(process.env.VN_BROWSER_PATH
    ? { executablePath: process.env.VN_BROWSER_PATH }
    : {}),
});
try {
  for (const quality of ['high', 'low']) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    await context.addInitScript(
      (settings) =>
        localStorage.setItem('vector-nova.settings', JSON.stringify(settings)),
      { quality, reducedMotion: quality === 'low', volume: 0 },
    );
    const page = await context.newPage();
    page.on('pageerror', (e) => report.errors.push(e.message));
    await page.goto(url + '/?level=helion', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.__VN?.ready || document.querySelector('.failure'),
      null,
      { timeout: 120000 },
    );
    assert.equal(
      await page.locator('.failure').count(),
      0,
      await page.locator('.failure').allTextContents(),
    );
    const result = { quality, sections: [], states: [] };
    report.cases.push(result);
    await page.locator('#start').click();
    const toggle = page.locator('#review-toggle');
    if (
      (await toggle.count()) &&
      (await toggle.getAttribute('aria-expanded')) === 'true'
    )
      await toggle.click();
    const names = [
      'dawnshield-showcase',
      'radiator-showcase',
      'heliopause-showcase',
      'umbrae-showcase',
      'prominence-showcase',
      'coronal-showcase',
      'afterglow-showcase',
    ];
    for (const name of names) {
      await page.evaluate(
        (name) => window.__VN.loadScenario(name, 47219),
        name,
      );
      await page.keyboard.down('w');
      await page.waitForTimeout(250);
      await page.keyboard.up('w');
      await page.waitForTimeout(60);
      const snapshot = await page.evaluate(() => window.__VN.getSnapshot());
      assert.ok(snapshot.vehicle.speed > 0);
      assert.deepEqual(snapshot.errors, []);
      await page.screenshot({
        path: resolve(output, `${quality}-${name}.png`),
      });
      result.sections.push({
        name,
        vehicle: snapshot.vehicle,
        metrics: await page.evaluate(() => window.__VN.getMetrics()),
      });
    }
    for (const name of [
      'jump1-success',
      'jump2-success',
      'jump1-short',
      'jump2-detour',
      'heat-hot',
      'flare-contact',
      'wall-entry',
      'wall-exit',
      'hardest-turn',
      'impact',
    ]) {
      await page.evaluate(
        (name) => window.__VN.loadScenario(name, 47219),
        name,
      );
      await page.keyboard.down('w');
      await page.waitForTimeout(name.includes('jump') ? 2200 : 700);
      await page.keyboard.up('w');
      const snapshot = await page.evaluate(() => window.__VN.getSnapshot());
      assert.deepEqual(snapshot.errors, []);
      await page.screenshot({
        path: resolve(output, `${quality}-${name}.png`),
      });
      result.states.push({ name, snapshot });
    }
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
      { width: 640, height: 360 },
    ]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => window.__VN.loadScenario('heat-hot', 47219));
      await page.keyboard.down('w');
      await page.waitForTimeout(400);
      await page.keyboard.up('w');
      await page.screenshot({
        path: resolve(
          output,
          `${quality}-${viewport.width}x${viewport.height}.png`,
        ),
      });
      result.states.push({
        name: `viewport-${viewport.width}x${viewport.height}`,
        snapshot: await page.evaluate(() => window.__VN.getSnapshot()),
      });
    }
    await page.evaluate(() => window.__VN.dispose());
    await context.close();
  }
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = error.stack;
  throw error;
} finally {
  await browser.close();
  await writeFile(
    resolve(output, 'report.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      report: resolve(output, 'report.json'),
      cases: report.cases.length,
      errors: report.errors,
      browser: 'CLOSED',
    }),
  );
}
