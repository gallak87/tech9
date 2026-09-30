import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.VN_URL || 'http://127.0.0.1:5192/';
const output = path.resolve(
  process.env.VN_EVIDENCE || '.experiments/gate4-1/ramps-water',
);
await mkdir(output, { recursive: true });
const report = {
  kind: 'Steeper ramps and physical water crossings; short real-key checks',
  checks: [],
  errors: [],
  launches: [],
};
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
page.on('pageerror', (error) => report.errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') report.errors.push(message.text());
});
page.on('response', (response) => {
  if (response.status() >= 400)
    report.errors.push(`${response.status()} ${response.url()}`);
});
const snap = () => page.evaluate(() => window.__VN.getSnapshot());
const load = (name) =>
  page.evaluate((scenario) => window.__VN.loadScenario(scenario, 47219), name);
const waitEvent = (type) =>
  page.waitForFunction(
    (eventType) =>
      window.__VN
        .getSnapshot()
        .events.some((event) => event.type === eventType),
    type,
    { timeout: 20000, polling: 'raf' },
  );
const capture = (name) =>
  page.screenshot({ path: path.join(output, `${name}.png`) });
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
  for (let i = 1; i <= 2; i += 1) {
    for (const name of ['cruise70', 'boost70', 'success', 'long', 'approach']) {
      const scenario = `jump${i}-${name}`;
      await load(scenario);
      if (name === 'approach') await capture(`jump${i}-upturned-ramp`);
      await page.keyboard.down('KeyW');
      if (name === 'long' || name === 'approach')
        await page.keyboard.down('ShiftLeft');
      await waitEvent('jump-launch');
      if (name === 'long') {
        await page.waitForFunction(
          () => window.__VN.getSnapshot().runtime.state.flight?.elapsed > 0.7,
          undefined,
          { timeout: 10000, polling: 'raf' },
        );
        await capture(`jump${i}-full-boost-flight`);
        const airborne = await snap();
        check(
          `jump${i} visibly rises above the ramp`,
          airborne.ship.position[1] > airborne.track.jumps[i - 1].takeoffY + 10,
        );
      }
      await waitEvent('jump-transfer');
      if (name === 'long') await capture(`jump${i}-full-boost-landed`);
      const state = await page.evaluate(() => {
        window.__VN.pause();
        return window.__VN.getSnapshot();
      });
      await page.keyboard.up('KeyW');
      await page.keyboard.up('ShiftLeft');
      const launch = state.events.find((event) => event.type === 'jump-launch');
      const transfer = state.events.find(
        (event) => event.type === 'jump-transfer',
      );
      report.launches.push({
        scenario,
        launch: launch.payload,
        transfer: transfer.payload,
      });
      check(
        `${scenario} lands without miss`,
        transfer.payload.outcome === 'landed' &&
          !state.events.some((event) => event.type === 'jump-miss'),
        transfer.payload,
      );
      check(
        `${scenario} preserves forward speed`,
        state.vehicle.speed > launch.payload.speed * 0.85,
      );
      if (name === 'long') {
        const jump = state.track.jumps[i - 1];
        check(
          `${scenario} catches road beyond former landing strip`,
          transfer.payload.to > jump.landingStart + (i === 1 ? 82 : 76),
        );
        const replay = await page.evaluate(() => window.__VN.getReplay());
        const replayed = await page.evaluate(
          (recording) => window.__VN.playReplay(recording),
          replay,
        );
        check(
          `${scenario} deterministic live/replay`,
          JSON.stringify(state.vehicle) === JSON.stringify(replayed.vehicle) &&
            JSON.stringify(state.runtime.state) ===
              JSON.stringify(replayed.runtime.state),
        );
        const rejected = await page.evaluate((recording) => {
          recording.runtime.version = 2;
          try {
            window.__VN.playReplay(recording);
            return false;
          } catch (error) {
            return /version mismatch/.test(error.message);
          }
        }, replay);
        check(`${scenario} rejects old jump rules`, rejected);
      }
    }
    await load(`jump${i}-short`);
    await page.keyboard.down('KeyS');
    await waitEvent('jump-miss');
    await page.keyboard.up('KeyS');
    const paused = await page.evaluate(() => {
      window.__VN.pause();
      return window.__VN.getSnapshot();
    });
    await page.waitForTimeout(180);
    const frozen = await snap();
    check(
      `jump${i} pause freezes recovery and clock`,
      frozen.lap.elapsed === paused.lap.elapsed &&
        frozen.runtime.state.flight.remaining ===
          paused.runtime.state.flight.remaining,
    );
    await page.locator('#resume').click();
    await waitEvent('jump-transfer');
    const recovered = await page.evaluate(() => {
      window.__VN.pause();
      return window.__VN.getSnapshot();
    });
    check(
      `jump${i} slow miss still recovers stationary beyond landing`,
      recovered.vehicle.speed === 0 &&
        recovered.vehicle.resetCount === 0 &&
        Math.abs(
          recovered.vehicle.distance - recovered.track.jumps[i - 1].recovery,
        ) < 1e-5,
    );
  }
  report.water = [];
  for (const [quality, reducedMotion, scenario, direction] of [
    ['high', false, 'surface-entry', 'entry'],
    ['high', false, 'surface-entry-fast', 'entry'],
    ['low', false, 'surface-entry-fast', 'entry'],
    ['low', true, 'surface-entry-fast', 'entry'],
    ['high', false, 'surface-exit', 'exit'],
  ]) {
    await page.evaluate(() => window.__VN.pause());
    await page.locator('#quality').selectOption(quality);
    await page.locator('#motion').setChecked(reducedMotion);
    await load(scenario);
    await page.waitForFunction(
      () => window.__VN.getSnapshot().environment.water?.eventCount === 0,
    );
    const label = `${scenario}-${quality}-${reducedMotion ? 'reduced' : 'motion'}`;
    if (scenario === 'surface-entry') await capture('waterline-before-entry');
    await page.keyboard.down('KeyW');
    await page.waitForFunction(
      () => window.__VN.getSnapshot().environment.water?.eventCount > 0,
      undefined,
      { timeout: 15000, polling: 'raf' },
    );
    const crossing = await snap();
    check(
      `${label} splashes at the physical water crossing`,
      crossing.environment.water.lastCrossing?.direction === direction &&
        Math.abs(crossing.environment.water.lastCrossing.position[1]) < 1e-8 &&
        crossing.environment.water.activeSplashCount > 0,
      crossing.environment.water,
    );
    await capture(`${label}-splash`);
    await page.keyboard.up('KeyW');
    const paused = await page.evaluate(() => {
      window.__VN.pause();
      return window.__VN.getSnapshot();
    });
    if (scenario === 'surface-entry') {
      const rejected = await page.evaluate(() => {
        const replay = window.__VN.getReplay();
        replay.initial.vehicle.speed += 1;
        try {
          window.__VN.playReplay(replay);
          return false;
        } catch (error) {
          return /initial state mismatch/.test(error.message);
        }
      });
      check('rejected replay preserves current water presentation', rejected);
    }
    await page.waitForTimeout(180);
    const frozen = await snap();
    check(
      `${label} pause freezes splash`,
      JSON.stringify(frozen.environment.water.splashAges) ===
        JSON.stringify(paused.environment.water.splashAges),
    );
    check(
      `${label} water covers both actual road crossings`,
      crossing.environment.water.crossings.length === 2 &&
        crossing.environment.water.crossings.every(
          (line) => line.pointCount >= 30,
        ),
    );
    check(
      `${label} quality and motion settings apply`,
      crossing.environment.water.pointsPerSplash ===
        (quality === 'low' ? 80 : 160) &&
        (!reducedMotion ||
          (crossing.environment.water.activeSprayCount === 0 &&
            crossing.environment.water.waterlineShaderTime === 0)),
    );
    report.water.push({
      label,
      presentation: crossing.environment.water,
      ship: crossing.ship,
      camera: crossing.camera,
      metrics: await page.evaluate(() => window.__VN.getMetrics()),
    });
    await load('staging');
    await page.waitForFunction(
      () => window.__VN.getSnapshot().environment.water?.eventCount === 0,
    );
    check(
      `${label} reset clears splash without teleport burst`,
      (await snap()).environment.water.activeSplashCount === 0,
    );
  }
  for (const query of ['', '?level=orbital']) {
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
      `${query || 'Halcyon'} baseline remains magnetic and drives`,
      state.runtime.id !== 'nacre-flight' && state.vehicle.distance > 1,
    );
  }
} catch (error) {
  report.errors.push(error.stack || String(error));
} finally {
  await browser.close();
  report.browserClosed = true;
  report.passed =
    report.checks.every(({ pass }) => pass) && report.errors.length === 0;
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
        failures: report.checks.filter(({ pass }) => !pass),
        errors: report.errors,
        browserClosed: true,
      },
      null,
      2,
    ),
  );
  if (!report.passed) process.exitCode = 1;
}
