import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

// Run sequentially against this worktree's frozen production preview.
const base = process.env.VN_URL;
if (!base) throw new Error('VN_URL must select the built preview');
const output = resolve(
  process.env.VN_EVIDENCE || '.experiments/expansion/saffron/targeted',
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.VN_BROWSER_CHANNEL
    ? { channel: process.env.VN_BROWSER_CHANNEL }
    : {}),
  ...(process.env.VN_BROWSER_PATH
    ? { executablePath: process.env.VN_BROWSER_PATH }
    : {}),
});
const report = {
  url: base,
  headless: true,
  cases: [],
  errors: [],
  limits: [
    'Foreground pacing, audible mix and physical devices are unverified.',
  ],
};
const snapshot = (page) => page.evaluate(() => window.__VN.getSnapshot());
function finite(s) {
  assert.deepEqual(s.errors, []);
  for (const values of [
    s.ship.position,
    s.ship.quaternion,
    s.camera.position,
    s.trackFrame.position,
  ])
    assert.ok(values.every(Number.isFinite));
  assert.equal(s.handling.steeringAssist, 0.3);
}
try {
  for (const shape of [true, false]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    await context.addInitScript(() =>
      localStorage.setItem(
        'vector-nova.settings',
        JSON.stringify({ quality: 'high', volume: 0, reducedMotion: false }),
      ),
    );
    const page = await context.newPage();
    page.on('pageerror', (error) => report.errors.push(error.message));
    const url = new URL(base);
    url.search = `?level=saffron${shape ? '&review=shape' : ''}`;
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__VN?.ready, null, {
      timeout: 120000,
    });
    const scenarios = shape
      ? ['skull-descent', 'jump2-success']
      : [
          'skull-descent',
          'hardest-turn',
          'jump1-cruise70',
          'jump2-success',
          'jump3-success',
          'jump3-short',
        ];
    for (const name of scenarios) {
      await page.evaluate((id) => window.__VN.loadScenario(id), name);
      await page.keyboard.down('w');
      const isJump = name.startsWith('jump');
      if (isJump) {
        await page.waitForFunction(
          () =>
            window.__VN
              .getSnapshot()
              .events.some((e) => e.type === 'jump-transfer'),
          null,
          { timeout: 45000 },
        );
      } else {
        await page.waitForFunction(
          () => window.__VN.getSnapshot().tick >= 45,
          null,
          { timeout: 20000 },
        );
        await page.keyboard.down('a');
        const before = (await snapshot(page)).tick;
        await page.waitForFunction(
          (tick) => window.__VN.getSnapshot().tick >= tick + 18,
          before,
          { timeout: 20000 },
        );
        await page.keyboard.up('a');
        await page.keyboard.down('s');
        const brakeStart = (await snapshot(page)).tick;
        await page.waitForFunction(
          (tick) => window.__VN.getSnapshot().tick >= tick + 20,
          brakeStart,
          { timeout: 20000 },
        );
        await page.keyboard.up('s');
      }
      await page.keyboard.up('w');
      await page.keyboard.press('Escape');
      const state = await snapshot(page);
      finite(state);
      assert.equal(state.mode, 'paused');
      if (isJump) {
        assert.ok(state.events.some((e) => e.type === 'jump-launch'));
        const transfer = state.events.find((e) => e.type === 'jump-transfer');
        assert.equal(
          transfer.payload.outcome,
          name.endsWith('short') ? 'recovered' : 'landed',
        );
      }
      const replay = await page.evaluate(() => window.__VN.getReplay());
      const replayed = await page.evaluate(
        (log) => window.__VN.playReplay(log),
        replay,
      );
      assert.deepEqual(replayed.runtime.state, state.runtime.state);
      for (const key of [
        'distance',
        'lateral',
        'speed',
        'heading',
        'energy',
        'time',
      ])
        assert.ok(Math.abs(replayed.vehicle[key] - state.vehicle[key]) < 1e-8);
      const rejected = await page.evaluate((log) => {
        log.runtime.rulesId += '-incompatible';
        try {
          window.__VN.playReplay(log);
          return false;
        } catch (error) {
          return /mismatch/i.test(error.message);
        }
      }, replay);
      assert.equal(rejected, true);
      report.cases.push({
        shape,
        name,
        result: 'pass',
        state,
        metrics: await page.evaluate(() => window.__VN.getMetrics()),
      });
      console.log(`${shape ? 'shape' : 'production'} ${name} passed`);
    }
    await context.close();
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('**/assets/levels/saffron/leviathan-kit.glb', (route) =>
    route.abort('failed'),
  );
  const url = new URL(base);
  url.search = '?level=saffron';
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.locator('.failure').waitFor({ state: 'visible', timeout: 120000 });
  assert.equal(await page.locator('canvas#world').count(), 0);
  report.cases.push({
    name: 'Saffron-owned GLB failure cleanup',
    result: 'pass',
  });
  await context.close();
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.error = error.stack;
  process.exitCode = 1;
  console.error(error.message);
} finally {
  await browser.close();
  await writeFile(
    resolve(output, 'report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log('Browser CLOSED');
}
