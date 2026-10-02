import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createTrack } from '../src/levels/halcyon/track/model.js';
import { createVehicleState } from '../src/physics/index.js';
import { createRace } from '../src/race/index.js';
import { HALCYON_GRID, getRacerControl } from '../src/race/halcyon-racers.js';
import { createHalcyonSimulationRuntime } from '../src/pickups/halcyon/runtime.js';

// A CPU-generated input recording exercises the real replay/finish path without
// running a normal-speed automated lap or teleporting over checkpoints.
const track = createTrack();
const vehicle = { ...createVehicleState(), ...HALCYON_GRID.player };
const race = createRace(track);
const runtime = createHalcyonSimulationRuntime({ track });
runtime.reset({ reason: 'fresh-lap', state: vehicle });
const inputs = [];
while (vehicle.time < 125) {
  const input = getRacerControl(vehicle, track);
  const previous = vehicle.distance;
  const events = runtime.advance(vehicle, input, 1 / 120);
  race.step(previous, vehicle.distance, 1 / 120, events);
  runtime.update({});
  inputs.push({ tick: inputs.length, input });
}
assert.ok(
  race.history.length >= 2 &&
    race.history.slice(0, 2).every((lap) => lap.valid),
);
runtime.dispose();

const output = path.resolve(
  process.env.VN_EVIDENCE || '.experiments/halcyon-gameplay',
);
await mkdir(output, { recursive: true });
const base = process.env.VN_URL || 'http://127.0.0.1:5180/';
const report = { checks: [], errors: [], snapshots: {}, captures: [] };
const browser = await chromium.launch({
  ...(process.env.VN_BROWSER_PATH
    ? { executablePath: process.env.VN_BROWSER_PATH }
    : { channel: 'chrome' }),
  headless: true,
  args: ['--mute-audio', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (error) => report.errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') report.errors.push(message.text());
});
page.on('response', (response) => {
  if (response.status() >= 400)
    report.errors.push(`${response.status()} ${response.url()}`);
});
function check(name, pass, detail) {
  report.checks.push({ name, pass, detail });
  assert.ok(pass, name);
}
const snapshot = () => page.evaluate(() => window.__VN.getSnapshot());
async function capture(name) {
  await page.screenshot({ path: path.join(output, `${name}.png`) });
  report.captures.push(name);
  report.snapshots[name] = await snapshot();
}
async function go(query = '') {
  await page.goto(base + query);
  await page.waitForFunction(() => window.__VN?.ready, undefined, {
    timeout: 90000,
  });
}
async function acquire(name, kind) {
  await page.evaluate((name) => window.__VN.loadScenario(name), name);
  if (kind === 'vector')
    await capture(
      (await snapshot()).settings.quality === 'high'
        ? 'boost-approach'
        : 'low-boost-approach',
    );
  await page.keyboard.down('KeyW');
  try {
    await page.waitForFunction(
      (kind) => {
        const effects = window.__VN.getSnapshot().runtime.state;
        return kind === 'vector'
          ? effects.vectorActive
          : effects.aegisRemaining > 0;
      },
      kind,
      { timeout: 15000, polling: 'raf' },
    );
  } finally {
    await page.keyboard.up('KeyW');
  }
}
try {
  await go();
  check(
    'default Halcyon has devices without query flags',
    (await snapshot()).runtime.id === 'halcyon-pickups',
  );
  await page.locator('#start').click();
  await page.evaluate(() => {
    window.__VN.home();
    window.__VN.start();
    window.__VN.pause();
  });
  const grid = await snapshot();
  const field = grid.competition.standings;
  check(
    'normal launch creates the 2x2 grid',
    field.length === 4 &&
      field.find((r) => r.id === 'rook').lateral === -4 &&
      field.find((r) => r.id === 'latch').distance === -12 &&
      grid.vehicle.lateral === 4,
    field,
  );
  await capture('grid');
  await page.evaluate(() => window.__VN.resume());
  await page.waitForFunction(
    () => window.__VN.getSnapshot().countdown?.running,
  );
  check(
    'countdown keeps player, rivals and clocks on the grid',
    (await snapshot()).vehicle.time === 0 &&
      (await snapshot()).competition.elapsed === 0,
  );
  await capture('countdown-lights');
  await page.keyboard.down('KeyW');
  await page.waitForFunction(
    () => window.__VN.getSnapshot().vehicle.time > 1.2,
    undefined,
    { timeout: 30000 },
  );
  await page.keyboard.up('KeyW');
  await page.evaluate(() => window.__VN.pause());
  const frozen = await snapshot();
  await page.waitForTimeout(180);
  check(
    'pause freezes the entire field and clock',
    JSON.stringify((await snapshot()).competition) ===
      JSON.stringify(frozen.competition),
  );
  const replayCheck = await page.evaluate(() => {
    const before = window.__VN.getSnapshot();
    const replay = window.__VN.getReplay();
    const after = window.__VN.playReplay(replay);
    const invalid = structuredClone(replay);
    invalid.initial.vehicle.energy -= 1;
    const retained = window.__VN.getSnapshot();
    let rejected = false;
    try {
      window.__VN.playReplay(invalid);
    } catch {
      rejected = true;
    }
    return {
      before,
      after,
      rejected,
      preserved:
        JSON.stringify(retained) === JSON.stringify(window.__VN.getSnapshot()),
    };
  });
  check(
    'competitive replay reproduces player and opponent state',
    JSON.stringify(replayCheck.before.vehicle) ===
      JSON.stringify(replayCheck.after.vehicle) &&
      JSON.stringify(replayCheck.before.competition) ===
        JSON.stringify(replayCheck.after.competition),
  );
  check(
    'rejected replay preserves the complete session',
    replayCheck.rejected && replayCheck.preserved,
  );
  await page.evaluate(() => window.__VN.home());
  await page.locator('#practice').click();
  check(
    'Practice Lap stays solo with devices',
    !(await snapshot()).competition.enabled &&
      (await snapshot()).runtime.id === 'halcyon-pickups',
  );
  await acquire('vector-launch', 'vector');
  await capture('boost-acquired');
  check(
    'Vector acquisition shows a toast without a timer',
    (await page.locator('.halcyon-devices').innerText()).includes('CATAPULT') &&
      (await page.locator('[data-kind="vector"] em').count()) === 0,
  );
  check(
    'boost enables bounded high-quality edge blur',
    (await page.evaluate(() => window.__VN.getMetrics())).pipeline
      .racingBlurStrength > 0,
  );
  await acquire('aegis-crown', 'aegis');
  check(
    'Aegis acquisition shows a toast',
    (await page.locator('.halcyon-devices').innerText()).includes(
      'SHIELD ACQUIRED',
    ),
  );
  await capture('shield-pulse-a');
  await page.waitForTimeout(240);
  await capture('shield-pulse-b');
  await page.evaluate(() => window.__VN.pause());
  await page.locator('#quality').selectOption('low');
  await page.locator('#motion').check();
  await page.locator('#volume').evaluate((control) => {
    control.value = '0';
    control.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#resume').click();
  await acquire('vector-launch', 'vector');
  await capture('low-reduced-boost');
  check(
    'low/reduced-motion disable blur while retaining pickup feedback',
    (await page.evaluate(() => window.__VN.getMetrics())).pipeline
      .racingBlurStrength === 0 &&
      (await snapshot()).runtime.state.vectorActive,
  );
  await page.evaluate(() => window.__VN.pause());
  await page.locator('#quality').selectOption('high');
  await page.locator('#motion').uncheck();
  await page.evaluate(() => window.__VN.home());
  await page.locator('#start').click();
  await page.evaluate(() => window.__VN.pause());
  const header = await page.evaluate(() => window.__VN.getReplay());
  const finished = await page.evaluate(
    (replay) => window.__VN.playReplay(replay),
    { ...header, inputs },
  );
  check(
    'two valid laps produce real placements and total times',
    finished.competition.playerFinished &&
      finished.competition.results.playerValid &&
      finished.competition.standings.every(
        (r) => r.finished && r.valid && r.totalTime > 0,
      ),
    finished.competition,
  );
  check(
    'recorded lap times remain the first two after further driving',
    finished.lap.history.length >= 2 &&
      finished.competition.results.playerTotalTime ===
        finished.lap.history[0].duration + finished.lap.history[1].duration,
  );
  await page.evaluate(() => window.__VN.resume());
  const continued = (await snapshot()).vehicle.distance;
  await page.keyboard.down('KeyW');
  await page.waitForFunction(
    (distance) => window.__VN.getSnapshot().vehicle.distance > distance + 5,
    continued,
  );
  await page.keyboard.up('KeyW');
  await capture('completed-free-drive');
  await page.keyboard.press('Escape');
  const paddock = await snapshot();
  check(
    'Escape returns to paddock retaining actual results',
    paddock.mode === 'title' && paddock.lastResults.standings.length === 4,
  );
  await capture('paddock-results');
  const bounds = await page.locator('#race-roster').boundingBox();
  const menu = await page.locator('#title-panel').boundingBox();
  check(
    'retained results are beside the menu and clear of ship center',
    bounds.x > menu.x + menu.width &&
      bounds.x + bounds.width < (paddock.camera.playerScreenX + 1) * 800,
    { bounds, menu, playerScreenX: paddock.camera.playerScreenX },
  );
  await page.locator('#difficulty').selectOption('medium');
  await page.locator('#start').click();
  check(
    'difficulty selection applies to the next competitive field',
    (await snapshot()).competition.difficulty === 'medium',
  );
  await go('?level=orbital');
  const orbital = await snapshot();
  check(
    'other circuits retain their own runtime without AI allocation',
    orbital.runtime.id === 'magnetic' &&
      orbital.competition === null &&
      (await page.locator('.halcyon-devices').count()) === 0,
  );
  check(
    'no runtime, asset or shader errors',
    report.errors.length === 0,
    report.errors,
  );
} catch (error) {
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
  console.log(
    JSON.stringify(
      {
        checks: report.checks,
        errors: report.errors,
        failure: report.failure,
        output,
      },
      null,
      2,
    ),
  );
}
