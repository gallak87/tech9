import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createLevel3Track } from '../src/levels/nacre/track/model.js';
import { createNacreRuntime } from '../src/levels/nacre/track/runtime.js';
import { createDevices } from '../src/levels/nacre/devices.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import { createVehicleState } from '../src/physics/index.js';
import { createRace } from '../src/race/index.js';
import { RACE_GRID, getRacerControl } from '../src/race/racers.js';

const base = process.env.VN_URL;
if (!base) throw new Error('Set VN_URL to the local preview');
const output = resolve(process.env.VN_EVIDENCE ?? '.experiments/nacre-racing');
await mkdir(output, { recursive: true });
// Fast numerical recording, followed by the real browser replay/finish path.
const track = createLevel3Track();
const devices = createDevices(track);
const runtime = createDeviceRuntime({
  track,
  devices,
  motion: createNacreRuntime({ track }),
});
const vehicle = { ...createVehicleState(), ...RACE_GRID.player };
const race = createRace(track);
runtime.reset({ state: vehicle });
const inputs = [];
while (vehicle.time < 150) {
  const input = getRacerControl(vehicle, track, { devices, runtime });
  const previous = vehicle.distance;
  const events = runtime.advance(vehicle, input, 1 / 120);
  race.step(previous, vehicle.distance, 1 / 120, events);
  runtime.update({});
  inputs.push({ tick: inputs.length, input });
}
runtime.dispose();
assert.ok(
  race.history.length >= 2 &&
    race.history.slice(0, 2).every((lap) => lap.valid),
);
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--mute-audio', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const report = { cases: [] };
const cases = [
  { quality: 'high', width: 1440, height: 900 },
  { quality: 'low', width: 1280, height: 720 },
  { quality: 'low', width: 390, height: 844, mobile: true },
  { quality: 'low', width: 844, height: 390, mobile: true },
].filter(
  (entry) =>
    !(process.env.VN_DESKTOP_ONLY === '1' && entry.mobile) &&
    !(process.env.VN_MOBILE_ONLY === '1' && !entry.mobile),
);
try {
  for (const entry of cases) {
    const faults = [];
    const context = await browser.newContext({
      viewport: { width: entry.width, height: entry.height },
      ...(entry.mobile ? { isMobile: true, hasTouch: true } : {}),
    });
    try {
      await context.addInitScript(
        (quality) =>
          localStorage.setItem(
            'vector-nova.settings',
            JSON.stringify({
              volume: 0.35,
              quality,
              reducedMotion: quality === 'low',
              difficulty: 'medium',
            }),
          ),
        entry.quality,
      );
      const page = await context.newPage();
      page.on('pageerror', (error) => faults.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') faults.push(message.text());
      });
      page.on('response', (response) => {
        if (response.status() >= 400)
          faults.push(`${response.status()} ${response.url()}`);
      });
      const url = new URL(base);
      url.searchParams.set('level', 'nacre');
      await page.goto(url.href);
      await page.waitForFunction(() => window.__VN?.ready, null, {
        timeout: 45000,
      });
      const snap = () => page.evaluate(() => window.__VN.getSnapshot());
      const capture = (name) =>
        page.screenshot({
          path: resolve(output, `${entry.width}-${entry.quality}-${name}.png`),
        });
      await page.locator('#start').click();
      await page.evaluate(() => window.__VN.pause());
      const header = await page.evaluate(() => window.__VN.getReplay());
      const finished = await page.evaluate(
        (log) => window.__VN.playReplay(log),
        { ...header, inputs },
      );
      assert.equal(finished.competition.playerFinished, true);
      assert.ok(
        finished.competition.standings.every(
          (actor) => actor.finished && actor.valid && actor.totalTime > 0,
        ),
      );
      await page.evaluate(() => window.__VN.resume());
      await page.keyboard.press('Escape');
      assert.equal((await snap()).mode, 'title');
      const roster = page.locator('#race-roster.in-paddock');
      await roster.scrollIntoViewIfNeeded();
      assert.ok((await roster.innerText()).includes('NACRE TEMPEST'));
      const box = await roster.boundingBox();
      assert.ok(
        box.x >= 0 &&
          box.x + box.width <= entry.width &&
          box.y >= 0 &&
          box.y + box.height <= entry.height,
      );
      await capture('results');

      for (const id of ['trench-vector', 'trench-aegis', 'tide-vector']) {
        await page.evaluate((id) => window.__VN.loadScenario(id), id);
        await page.keyboard.down('KeyW');
        try {
          await page.waitForFunction(
            (id) => {
              const data = window.__VN.getSnapshot();
              return id.includes('aegis')
                ? data.runtime.state.aegisRemaining > 0
                : data.runtime.state.vectorActive;
            },
            id,
            { timeout: 15000 },
          );
        } finally {
          await page.keyboard.up('KeyW');
        }
        const data = await snap();
        assert.equal(data.competition.enabled, false);
        const wet = id.startsWith('trench');
        for (const mix of [
          data.environment.audio.immersion,
          data.environment.devices.audio.immersion,
        ]) {
          assert.ok(mix, 'both buses unlocked');
          assert.ok(
            wet
              ? mix.submerged > 0.99 && mix.cutoff <= 561
              : mix.submerged === 0 && mix.cutoff > 10000,
            'listener water blend follows actual camera',
          );
        }
        await capture(id);
      }
      await page.evaluate(() => window.__VN.loadScenario('jump2-approach'));
      await page.keyboard.down('KeyW');
      await page.keyboard.down('Shift');
      try {
        await page.waitForFunction(
          () =>
            window.__VN.getSnapshot().environment.water.bubbleEvents.takeoff >
            0,
          null,
          { timeout: 15000 },
        );
        const flight = await snap();
        assert.equal(flight.runtime.state.mode, 'flight');
        assert.ok(flight.environment.water.lastBubble.position[1] < 0);
        assert.ok(
          entry.quality === 'low'
            ? flight.environment.water.activeBubbleCount === 0
            : flight.environment.water.activeBubbleCount > 0,
        );
        await capture('submerged-flight');
        await page.evaluate(() => window.__VN.pause());
        const frozen = (await snap()).environment.water;
        await page.waitForTimeout(100);
        assert.deepEqual((await snap()).environment.water, frozen);
        assert.equal((await snap()).environment.audio.audible, false);
        await page.evaluate(() => window.__VN.resume());
        await page.waitForFunction(
          () =>
            window.__VN.getSnapshot().environment.water.bubbleEvents.landing >
            0,
          null,
          { timeout: 15000 },
        );
        assert.equal((await snap()).runtime.state.mode, 'magnetic');
        await capture('submerged-landing');
      } finally {
        await page.keyboard.up('KeyW');
        await page.keyboard.up('Shift');
      }
      await page.evaluate(() => window.__VN.dispose());
      assert.equal(
        await page.locator('.race-devices,.nacre-immersion').count(),
        0,
      );
      assert.deepEqual(faults, []);
      report.cases.push({ ...entry, status: 'passed' });
      console.log(
        `Nacre ${entry.width} ${entry.quality}: finish/results, wet/dry devices/audio, submerged jump and lifecycle passed`,
      );
    } finally {
      await context.close();
    }
  }
} catch (error) {
  report.failure = error.stack;
  throw error;
} finally {
  await writeFile(
    resolve(output, 'report.json'),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
