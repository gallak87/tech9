import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const shape = process.argv.includes('--shape');
const output = `.experiments/expansion/zephyr/${shape ? 'shape' : 'production'}-check`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: process.env.VN_BROWSER_CHANNEL || 'chrome',
});
const report = {
  shape,
  headless: true,
  checks: [],
  errors: [],
  limitations: [
    'No foreground pacing, listening or physical device certification.',
  ],
};
const deadline = setTimeout(
  () => browser.close().catch(() => {}),
  Math.max(
    1,
    Number(process.env.VN_BATCH_DEADLINE || Date.now() + 260000) - Date.now(),
  ),
);
let page;
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(() =>
    localStorage.setItem(
      'vector-nova.settings',
      JSON.stringify({ quality: 'high', volume: 0, reducedMotion: false }),
    ),
  );
  page = await context.newPage();
  page.on('pageerror', (e) => report.errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') report.errors.push(m.text());
  });
  await page.goto(
    `${process.env.VN_URL || 'http://127.0.0.1:5210/'}?level=zephyr${shape ? '&review=shape' : ''}`,
  );
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
  const snapshot = () => page.evaluate(() => window.__VN.getSnapshot());
  async function capture(id) {
    const snap = await snapshot();
    const metrics = await page.evaluate(() => window.__VN.getMetrics());
    await page.screenshot({ path: `${output}/${id}.png` });
    report.checks.push({ id, snapshot: snap, metrics });
    assert.deepEqual(snap.errors, []);
    for (const value of [...snap.camera.position, ...snap.ship.position])
      assert.ok(Number.isFinite(value));
  }
  async function scenario(name) {
    await page.evaluate((name) => {
      window.__VN.loadScenario(name);
      window.__VN.setCamera('chase');
      window.__VN.start();
    }, name);
  }
  await capture('title');
  await scenario('staging');
  await page.keyboard.down('w');
  await page.waitForTimeout(700);
  await page.keyboard.up('w');
  assert.ok((await snapshot()).vehicle.speed > 0);
  await page.keyboard.down('d');
  await page.waitForTimeout(230);
  await page.keyboard.up('d');
  assert.ok((await snapshot()).vehicle.lateral < 0);
  await page.keyboard.down('s');
  await page.waitForTimeout(500);
  await page.keyboard.up('s');
  await capture('controls');
  for (const [name, duration] of [
    ['rose-window', 4700],
    ['nave-wall', 2200],
    ['cloudspire-showcase', 900],
    ['halo-showcase', 900],
    ['bronzewake-showcase', 900],
    ['hardest-turn', 1400],
  ]) {
    await scenario(name);
    await page.keyboard.down('w');
    await page.waitForTimeout(duration);
    await page.keyboard.up('w');
    await capture(name);
    await page.keyboard.press('Escape');
  }
  for (const name of ['jump1-success', 'jump2-success', 'jump1-short']) {
    await scenario(name);
    await page.keyboard.down('w');
    if (name !== 'jump1-short') await page.keyboard.down('Shift');
    await page.waitForFunction(
      () => window.__VN.getSnapshot().runtime.state.mode === 'flight',
      null,
      { timeout: 10000 },
    );
    await capture(`${name}-flight`);
    await page.waitForFunction(
      () =>
        window.__VN
          .getSnapshot()
          .events.some((e) => e.type === 'jump-transfer'),
      null,
      { timeout: 20000 },
    );
    await page.keyboard.up('w');
    await page.keyboard.up('Shift');
    const snap = await snapshot();
    assert.ok(snap.events.some((e) => e.type === 'jump-launch'));
    assert.ok(snap.events.some((e) => e.type === 'jump-transfer'));
    await capture(`${name}-landed`);
    await page.keyboard.press('Escape');
  }
  if (!shape) {
    await scenario('falling-tower');
    await page.keyboard.down('w');
    await page.waitForTimeout(1200);
    await page.keyboard.up('w');
    await page.keyboard.press('Escape');
    const before = await snapshot();
    await page.waitForTimeout(180);
    const paused = await snapshot();
    assert.equal(before.tick, paused.tick);
    await capture('tower-pause');
    const replay = await page.evaluate(() => window.__VN.getReplay());
    const reproduced = await page.evaluate(
      (replay) => window.__VN.playReplay(replay),
      replay,
    );
    assert.deepEqual(
      reproduced.runtime.state.zephyr,
      paused.runtime.state.zephyr,
    );
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
      { width: 640, height: 360 },
    ]) {
      await page.setViewportSize(viewport);
      await scenario('jump1-approach');
      await capture(`responsive-${viewport.width}x${viewport.height}`);
      await page.keyboard.press('Escape');
    }
  }
  assert.deepEqual(report.errors, []);
  if (!shape) {
    const failedPage = await context.newPage();
    await failedPage.route(
      '**/assets/levels/zephyr/cathedral-facade.glb',
      (route) => route.abort('failed'),
    );
    await failedPage.goto(
      `${process.env.VN_URL || 'http://127.0.0.1:5210/'}?level=zephyr`,
    );
    await failedPage
      .locator('.failure')
      .waitFor({ state: 'visible', timeout: 45000 });
    assert.equal(await failedPage.locator('canvas#world').count(), 0);
    report.checks.push({ id: 'zephyr-owned-asset-failure', status: 'pass' });
    await failedPage.close();
  }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = String(error.stack);
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  console.log(
    JSON.stringify(
      {
        status: report.status,
        checks: report.checks.length,
        failure: report.failure,
        errors: report.errors,
        output,
        browser: 'CLOSED',
      },
      null,
      2,
    ),
  );
}
