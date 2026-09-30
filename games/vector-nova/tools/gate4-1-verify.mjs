import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const base = process.env.VN_URL || 'http://127.0.0.1:5192/';
const output = path.resolve(
  process.env.VN_EVIDENCE || '.experiments/gate4-1/early-review',
);
await mkdir(output, { recursive: true });
const report = {
  kind: 'Gate4.1 short real-input production verification',
  checks: [],
  errors: [],
  views: [],
};
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
const check = (name, pass, detail) =>
  report.checks.push({ name, pass, detail });
async function capture(name) {
  await page.screenshot({ path: path.join(output, name + '.png') });
  report.views.push({
    name,
    state: await snap(),
    metrics: await page.evaluate(() => window.__VN.getMetrics()),
  });
}
async function scenario(name) {
  await page.evaluate((n) => window.__VN.loadScenario(n, 47219), name);
}
async function waitMode(mode) {
  await page.waitForFunction(
    (m) => window.__VN.getSnapshot().runtime.state.mode === m,
    mode,
    { timeout: 10000, polling: 'raf' },
  );
}
try {
  await page.goto(
    base +
      (process.env.VN_SHAPE === '1'
        ? '?level=nacre&review=shape'
        : '?level=nacre'),
  );
  await page.waitForFunction(() => window.__VN?.ready, undefined, {
    timeout: 90000,
  });
  report.build = await page.locator('script[type=module]').getAttribute('src');
  check('exactly two authored jumps', (await snap()).track.jumps.length === 2);
  for (const view of ['perspective', 'top', 'profile']) {
    await page.evaluate((v) => window.__VN.overview(v), view);
    await page.waitForTimeout(80);
    await capture('shape-' + view);
  }
  await page.locator('#start').click();
  await capture('grid-deck');
  for (let i = 1; i <= 2; i++) {
    await scenario(`jump${i}-success`);
    await page.keyboard.down('KeyW');
    await waitMode('flight');
    await capture(`jump${i}-flight`);
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(100);
    check(`jump${i} real midair right input`, (await snap()).vehicle.steer > 0);
    await page.keyboard.up('KeyD');
    await page.waitForFunction(
      () =>
        window.__VN
          .getSnapshot()
          .events.some((e) => e.type === 'jump-transfer'),
      undefined,
      { timeout: 10000, polling: 'raf' },
    );
    await page.keyboard.up('KeyW');
    await capture(`jump${i}-landing`);
    await page.keyboard.press('Escape');
    let s = await snap();
    check(
      `jump${i} successful swept landing`,
      s.events.some(
        (e) => e.type === 'jump-transfer' && e.payload.outcome === 'landed',
      ),
    );
    const replay = await page.evaluate(() => window.__VN.getReplay());
    let replayState = await page.evaluate(
      (r) => window.__VN.playReplay(r),
      replay,
    );
    check(
      `jump${i} deterministic live/replay`,
      JSON.stringify(s.vehicle) === JSON.stringify(replayState.vehicle) &&
        JSON.stringify(s.runtime.state) ===
          JSON.stringify(replayState.runtime.state),
    );
    check(
      `jump${i} replay re-export retains inputs`,
      JSON.stringify(replay.inputs) ===
        JSON.stringify(
          await page.evaluate(() => window.__VN.getReplay().inputs),
        ),
    );
    await scenario(`jump${i}-short`);
    await page.keyboard.down('KeyS');
    await waitMode('recovery');
    await page.keyboard.up('KeyS');
    await capture(`jump${i}-miss`);
    await page.keyboard.press('Escape');
    s = await snap();
    const elapsed = s.lap.elapsed;
    const remaining = s.runtime.state.flight.remaining;
    await page.waitForTimeout(180);
    let frozen = await snap();
    check(
      `jump${i} pause freezes failure delay and lap`,
      frozen.lap.elapsed === elapsed &&
        frozen.runtime.state.flight.remaining === remaining,
    );
    await page.locator('#resume').click();
    await waitMode('magnetic');
    s = await snap();
    const jump = s.track.jumps[i - 1];
    check(
      `jump${i} recovers beyond landing stationary`,
      Math.abs(s.vehicle.distance - jump.recovery) < 1e-5 &&
        s.vehicle.speed === 0 &&
        s.vehicle.resetCount === 0,
    );
    await capture(`jump${i}-recovered`);
    const before = s.vehicle.distance;
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(500);
    await page.keyboard.up('KeyW');
    check(
      `jump${i} normal throttle resumes`,
      (await snap()).vehicle.distance > before + 1,
    );
  }
  for (const name of [
    'surface-entry',
    'surface-exit',
    'hardest-turn',
    'trench-showcase',
  ]) {
    await scenario(name);
    await capture(name);
  }
  for (const section of (await snap()).track.sections) {
    await scenario(`${section.id}-showcase`);
    await capture(`district-${section.id}`);
  }
  for (const name of ['jump1-lateral', 'jump2-lateral']) {
    await scenario(name);
    await page.keyboard.down('KeyW');
    await waitMode('recovery');
    await page.keyboard.up('KeyW');
    check(
      `${name} genuinely misses`,
      (await snap()).events.some((event) => event.type === 'jump-miss'),
    );
    await capture(name);
  }
  await scenario('surface-entry');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2300);
  await page.keyboard.up('KeyW');
  await capture('surface-entry-motion');
  check(
    'ship and camera genuinely submerge',
    (await snap()).ship.position[1] < 0 &&
      (await snap()).camera.position[1] < 0,
  );
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('low');
  await page.locator('#motion').check();
  await page.locator('#resume').click();
  await scenario('trench-showcase');
  await capture('low-underwater');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('portrait-underwater');
  await page.evaluate(() => window.__VN.restart());
  check(
    'restart clears flight',
    (await snap()).runtime.state.mode === 'magnetic' &&
      (await snap()).vehicle.distance === 0,
  );
  await page.setViewportSize({ width: 844, height: 390 });
  await capture('landscape-nacre');
  for (const query of [
    '',
    '?features=halcyon-pickups',
    '?level=orbital',
    '?level=orbital&review=shape',
  ]) {
    await page.goto(base + query);
    await page.waitForFunction(() => window.__VN?.ready, undefined, {
      timeout: 90000,
    });
    await page.locator('#start').click();
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(450);
    await page.keyboard.up('KeyW');
    const state = await snap();
    check(
      `${query} baseline movement/guard`,
      state.vehicle.distance > 1 &&
        state.runtime.id !== 'nacre-flight' &&
        state.handling.steeringAssist === 0.3,
    );
    const clear = await page.evaluate(() => {
      const a = document.querySelector('#minimap').getBoundingClientRect(),
        b = document.querySelector('.speed').getBoundingClientRect();
      return (
        a.right <= b.left ||
        a.left >= b.right ||
        a.bottom <= b.top ||
        a.top >= b.bottom
      );
    });
    check(`${query} landscape map clears speed`, clear);
    await capture(
      `landscape-${query.includes('orbital') ? (query.includes('shape') ? 'orbital-shape' : 'orbital') : query ? 'noop-feature' : 'halcyon'}`,
    );
    await page.evaluate(() => window.__VN.dispose());
  }
} catch (error) {
  report.errors.push(error.stack || String(error));
} finally {
  await browser.close();
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2),
  );
}
console.log(
  JSON.stringify({
    build: report.build,
    passed: report.checks.filter((c) => c.pass).length,
    total: report.checks.length,
    failures: report.checks.filter((c) => !c.pass),
    errors: report.errors,
    output,
  }),
);
if (report.errors.length || report.checks.some((c) => !c.pass))
  process.exitCode = 1;
