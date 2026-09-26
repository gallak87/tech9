import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { openScene, root, samplePerformance } from './lib/browser.mjs';
import { groundHeight } from '../src/flight/FlightWorld.js';
// Real tab focus changes require a visible browser rather than emulated focus.
process.env.HEADED ??= '1';
const output = `${root}/.artifacts/verification`;
await mkdir(output, { recursive: true });
const harness = await openScene({ mode: 'preview', width: 1440, height: 900 });
const { page, snapshot } = harness;
const report = {
  startedAt: new Date().toISOString(),
  environment: harness.environment,
  checks: [],
};
let held = new Set();
async function keys(wanted) {
  const next = new Set(wanted);
  for (const code of held) if (!next.has(code)) await page.keyboard.up(code);
  for (const code of next) if (!held.has(code)) await page.keyboard.down(code);
  held = next;
}
async function check(name, fn) {
  const detail = await fn();
  report.checks.push({ name, pass: true, detail });
  console.log(`PASS ${name}`);
}
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const angle = (n) => Math.atan2(Math.sin(n), Math.cos(n));
async function circuit(type) {
  await page.locator(`#choose-${type}`).click();
  await page.screenshot({ path: `${output}/${type}-airstrip.png` });
  await page.locator('#start').click();
  const spec =
    type === 'trainer'
      ? { rotate: 23, stall: 18, gear: 1.35, cruise: 42 }
      : { rotate: 29, stall: 23, gear: 1.15, cruise: 48 };
  const route = [
    [-700, 170, -800],
    [-850, 210, 500],
    [-500, 130, 1350],
    [0, 100, 1600],
  ];
  let stage = 0,
    flightCapture = false,
    cockpitCapture = false,
    previousPhase = '';
  const track = [],
    started = Date.now();
  while (Date.now() - started < 260000) {
    const s = await snapshot();
    if (s.phase !== previousPhase) {
      console.log(`${type} ${s.phase} at ${Math.round(s.time)}s`);
      previousPhase = s.phase;
    }
    if (['crashed', 'landed'].includes(s.phase)) {
      await keys([]);
      await page.screenshot({ path: `${output}/${type}-${s.phase}.png` });
      assert.equal(s.phase, 'landed', `${type}: ${s.reason}`);
      assert.equal(
        s.visited.length,
        3,
        `${type} scenic circuit collected all markers`,
      );
      assert.ok(
        s.airborneTime > 90,
        'Full valley circuit used normal flight input',
      );
      return {
        aircraft: type,
        flightSeconds: s.airborneTime,
        totalSeconds: s.time,
        distanceMetres: s.distance,
        markers: s.visited,
        touchdownSink: s.landingSink,
        track,
      };
    }
    if (s.paused)
      throw new Error('Unexpected focus loss paused the browser flight');
    const wanted = [];
    if (stage === 0) {
      wanted.push('KeyW');
      if (s.speed >= spec.rotate - 1) wanted.push('ArrowDown');
      if (s.y > 45) stage = 1;
    } else {
      const target = route[stage - 1];
      let heading,
        altitude,
        speed = spec.cruise;
      if (target) {
        heading = Math.atan2(target[0] - s.x, -(target[2] - s.z));
        altitude = Math.max(
          target[1],
          groundHeight(
            s.x + Math.sin(s.heading) * 120,
            s.z - Math.cos(s.heading) * 120,
          ) + 85,
        );
        if (Math.hypot(target[0] - s.x, target[2] - s.z) < 120) stage++;
      } else {
        heading = clamp(-s.x / 140, -0.35, 0.35);
        altitude = Math.max(spec.gear, (s.z - 270) * 0.07 + spec.gear);
        speed = spec.stall + 6;
      }
      const bank = clamp(angle(heading - s.heading) * 1.4, -0.75, 0.75);
      const pitch = clamp(
        (altitude - s.y) * 0.009 - s.verticalSpeed * 0.015 + 0.02,
        -0.12,
        0.23,
      );
      if (Math.abs(bank - s.roll) > 0.025)
        wanted.push(bank > s.roll ? 'ArrowRight' : 'ArrowLeft');
      if (Math.abs(pitch - s.pitch) > 0.015)
        wanted.push(pitch > s.pitch ? 'ArrowDown' : 'ArrowUp');
      if (Math.abs(speed - s.speed) > 1)
        wanted.push(speed > s.speed ? 'KeyW' : 'KeyS');
      if (!target && s.grounded) {
        wanted.length = 0;
        wanted.push('KeyS', 'KeyB');
      }
    }
    await keys(wanted);
    if (!flightCapture && s.time > 27) {
      await page.screenshot({ path: `${output}/${type}-flight.png` });
      flightCapture = true;
      await keys([]);
      report[`${type}Performance`] = await samplePerformance(page, 2000);
    }
    if (!cockpitCapture && s.time > 55) {
      await keys([]);
      await page.keyboard.press('KeyC');
      await page.waitForTimeout(100);
      assert.equal((await snapshot()).cameraMode, 'mounted');
      await page.screenshot({ path: `${output}/${type}-cockpit.png` });
      await page.keyboard.press('KeyC');
      cockpitCapture = true;
    }
    if (track.length === 0 || s.time - track.at(-1).time >= 10)
      track.push({
        time: s.time,
        x: s.x,
        y: s.y,
        z: s.z,
        speed: s.speed,
        stage,
      });
    await page.waitForTimeout(90);
  }
  throw new Error(`${type} exceeded circuit time budget`);
}
try {
  await check(
    'load and repeated aircraft changes release model resources',
    async () => {
      assert.equal((await snapshot()).phase, 'ready');
      await page.keyboard.press('KeyC');
      assert.equal((await snapshot()).cameraMode, 'mounted');
      await page.locator('#choose-sport').click();
      assert.equal((await snapshot()).cameraMode, 'follow');
      assert.match(await page.locator('#camera').textContent(), /Cockpit/);
      for (let i = 0; i < 3; i++) {
        await page.locator('#choose-sport').click();
        await page.waitForTimeout(100);
        await page.locator('#choose-trainer').click();
        await page.waitForTimeout(100);
      }
      const before = (await snapshot()).app.renderer.memory;
      for (let i = 0; i < 5; i++) {
        await page.locator('#choose-sport').click();
        await page.waitForTimeout(100);
        await page.locator('#choose-trainer').click();
        await page.waitForTimeout(100);
      }
      const after = (await snapshot()).app.renderer.memory;
      assert.ok(after.geometries <= before.geometries + 1);
      assert.ok(after.textures <= before.textures + 1);
      return { before, after };
    },
  );
  await check(
    'pause, real focus change and restart clear held controls',
    async () => {
      await page.locator('#start').click();
      await keys(['KeyW']);
      await page.waitForTimeout(400);
      await page.keyboard.press('KeyP');
      await keys([]);
      let s = await snapshot();
      assert.equal(s.paused, true);
      assert.deepEqual(s.heldKeys, []);
      const frozen = s.time;
      await page.waitForTimeout(300);
      assert.equal((await snapshot()).time, frozen);
      await page.locator('#resume').click();
      await keys(['ArrowDown']);
      const focusSession = await page.context().newCDPSession(page);
      await focusSession.send('Emulation.setFocusEmulationEnabled', {
        enabled: false,
      });
      await page.bringToFront();
      const other = await page.context().newPage();
      const otherSession = await page.context().newCDPSession(other);
      await otherSession.send('Emulation.setFocusEmulationEnabled', {
        enabled: false,
      });
      await other.goto('about:blank');
      await other.bringToFront();
      await page.waitForTimeout(200);
      s = await snapshot();
      await other.close();
      await page.bringToFront();
      await focusSession.send('Emulation.setFocusEmulationEnabled', {
        enabled: true,
      });
      // Keep the focus override for the long flight after the genuine focus-loss
      // check; other desktop apps must not interrupt keyboard validation.
      await keys([]);
      assert.equal(s.paused, true, 'Real tab focus loss pauses flight');
      assert.deepEqual(s.heldKeys, []);
      await page.keyboard.press('KeyR');
      s = await snapshot();
      assert.equal(s.paused, false);
      assert.equal(s.phase, 'taxi');
      // Return to aircraft selection through the actual recoverable rough-ground state.
      await page.evaluate(() => window.__FLIGHT_TEST__.scenario('collision'));
      await page.waitForFunction(
        () => window.__FLIGHT_TEST__.snapshot().phase === 'crashed',
      );
      await page.locator('#hangar').click();
      assert.equal((await snapshot()).phase, 'ready');
      return { pausedTime: frozen, focusPaused: true, restart: true };
    },
  );
  await check('trainer real-input scenic circuit and runway landing', () =>
    circuit('trainer'),
  );
  await page.locator('#hangar').click();
  await check('sport real-input scenic circuit and runway landing', () =>
    circuit('sport'),
  );
  await page.locator('#hangar').click();
  await check('graphics, responsive layout and sound controls', async () => {
    for (const quality of ['high', 'ultra', 'balanced']) {
      await page.locator('#quality').selectOption(quality);
      assert.equal((await snapshot()).app.settings.quality, quality);
    }
    await page.locator('#mute').click();
    assert.match(await page.locator('#mute').textContent(), /off/);
    await page.setViewportSize({ width: 1100, height: 720 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${output}/compact-layout.png` });
    assert.ok(await page.locator('#start').isVisible());
    await page.setViewportSize({ width: 1440, height: 900 });
  });
  await check('clean browser and graphics execution', async () => {
    assert.deepEqual(harness.errors, {
      console: [],
      page: [],
      requests: [],
      webgl: [],
    });
    return harness.errors;
  });
  await check('game lifecycle releases renderer and listeners', async () => {
    await page.evaluate(() => window.__FLIGHT_TEST__.dispose());
    const s = await snapshot();
    assert.equal(s.app.ready, false);
    assert.deepEqual(s.heldKeys, []);
    return { ready: s.app.ready };
  });
} catch (error) {
  report.failure = error.stack;
  await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await keys([]).catch(() => {});
  report.finishedAt = new Date().toISOString();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await harness.close();
}
