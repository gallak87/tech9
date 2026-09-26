import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { openScene, root, samplePerformance } from './lib/browser.mjs';
import { groundHeight } from '../src/flight/LandscapeLayout.js';
process.env.HEADED ??= '1';
const output = `${root}/.artifacts/exploration-flight`;
await mkdir(output, { recursive: true });
const h = await openScene({ mode: 'preview', width: 1440, height: 900 });
const report = { environment: h.environment, track: [], captures: [] };
const simulationRate = Number(process.env.SIMULATION_RATE ?? 8);
report.simulationRate = simulationRate;
const rate = (value) =>
  h.page.evaluate(
    (value) => window.__FLIGHT_TEST__.setSimulationRate(value),
    value,
  );
let held = new Set();
async function keys(wanted) {
  const next = new Set(wanted);
  for (const key of held) if (!next.has(key)) await h.page.keyboard.up(key);
  for (const key of next) if (!held.has(key)) await h.page.keyboard.down(key);
  held = next;
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const angle = (x) => Math.atan2(Math.sin(x), Math.cos(x));
async function capture(name) {
  await rate(1);
  await h.page.waitForTimeout(180);
  await h.page.screenshot({ path: `${output}/${name}.png` });
  report.captures.push({ name, state: await h.snapshot() });
}
async function rollAndInvert() {
  await rate(1);
  await keys([]);
  await h.page.keyboard.press('KeyF');
  assert.equal((await h.snapshot()).stabilization, false);
  let accumulated = 0,
    previous = (await h.snapshot()).roll;
  await keys(['ArrowRight']);
  for (let i = 0; i < 120 && accumulated < Math.PI * 2; i++) {
    await h.page.waitForTimeout(70);
    const s = await h.snapshot();
    accumulated += angle(s.roll - previous);
    previous = s.roll;
    assert.equal(s.phase, 'flight', s.reason);
  }
  assert.ok(accumulated >= Math.PI * 2, 'ordinary keyboard full roll');
  await keys(['Space']);
  await h.page.waitForTimeout(1700);
  await keys(['ArrowRight']);
  for (let i = 0; i < 100; i++) {
    await h.page.waitForTimeout(40);
    if (Math.abs((await h.snapshot()).roll) > 3.08) break;
  }
  await keys([]);
  await h.page.keyboard.press('KeyC');
  const inverted = await h.snapshot();
  assert.ok(Math.abs(inverted.roll) > 3.0);
  await h.page.waitForTimeout(1500);
  assert.ok(
    Math.abs((await h.snapshot()).roll) > 3.0,
    'release preserves inverted attitude',
  );
  await capture('inverted-cockpit');
  await keys(['ArrowUp']);
  await h.page.waitForTimeout(250);
  await keys([]);
  assert.ok(
    (await h.snapshot()).pitch > inverted.pitch + 0.08,
    'push raises nose while inverted',
  );
  await h.page.keyboard.press('KeyC');
  await keys(['Space']);
  await h.page.waitForTimeout(2400);
  await keys([]);
  assert.ok(Math.abs((await h.snapshot()).roll) < 0.02);
  await h.page.keyboard.press('KeyF');
  report.roll = { accumulated, invertedSeconds: 1.5, recovered: true };
}
try {
  const focus = await h.page.context().newCDPSession(h.page);
  await focus.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await h.page.locator('#quality').selectOption('high');
  await h.page.locator('#choose-sport').click();
  await h.page.locator('#start').click();
  await rate(simulationRate);
  const route = [
    [1300, 460, -950],
    [-1250, 'low', -1450],
    [-1700, 'low', 700],
    [500, 620, 1400],
  ];
  let stage = -1,
    rolled = false,
    lastSample = -10;
  const started = Date.now();
  while (Date.now() - started < 340000 && stage < route.length) {
    const s = await h.snapshot();
    assert.equal(s.paused, false, 'exploration stays focused');
    assert.notEqual(s.phase, 'crashed', s.reason);
    const wanted = [];
    if (stage < 0) {
      wanted.push('KeyW');
      if (s.speed > 28) wanted.push('ArrowDown');
      if (s.y > 55) stage = 0;
    } else {
      const [x, height, z] = route[stage];
      const ahead = groundHeight(
        s.x + Math.sin(s.heading) * 180,
        s.z - Math.cos(s.heading) * 180,
      );
      const targetY =
        height === 'low'
          ? Math.max(groundHeight(s.x, s.z), ahead) + 72
          : Math.max(height, ahead + 85);
      const heading = Math.atan2(x - s.x, -(z - s.z));
      const bank = clamp(angle(heading - s.heading) * 1.4, -0.7, 0.7);
      const pitch = clamp(
        (targetY - s.y) * 0.009 - s.verticalSpeed * 0.018 + 0.025,
        -0.19,
        0.28,
      );
      if (Math.abs(bank - s.roll) > 0.025)
        wanted.push(bank > s.roll ? 'ArrowRight' : 'ArrowLeft');
      if (Math.abs(pitch - s.pitch) > 0.012)
        wanted.push(pitch > s.pitch ? 'ArrowDown' : 'ArrowUp');
      if (s.speed < 53) wanted.push('KeyW');
      if (s.speed > 56) wanted.push('KeyS');
      if (Math.hypot(x - s.x, z - s.z) < 130) {
        await keys([]);
        await capture(`exploration-${stage}`);
        report[`performance${stage}`] = await samplePerformance(h.page, 1800);
        if (!rolled) {
          await rollAndInvert();
          rolled = true;
        }
        await rate(simulationRate);
        stage++;
        console.log(`PASS ordinary exploration leg ${stage}`);
        continue;
      }
    }
    await keys(wanted);
    if (s.time - lastSample >= 2) {
      report.track.push({
        time: s.time,
        x: s.x,
        y: s.y,
        z: s.z,
        agl: s.y - groundHeight(s.x, s.z),
        landscape: s.landscape,
        memory: s.app.renderer.memory,
        frameTimes: s.frameTimes,
      });
      lastSample = s.time;
    }
    await h.page.waitForTimeout(15);
  }
  await keys([]);
  assert.equal(stage, route.length, 'all remote exploration legs complete');
  const recent = report.track.slice(-20),
    warm = report.track.filter((v) => v.time < 100);
  for (const key of ['geometries', 'textures', 'programs'])
    assert.ok(
      Math.max(...recent.map((v) => v.memory[key])) <=
        Math.max(...warm.map((v) => v.memory[key])) + 2,
      `${key} plateaus after warmup`,
    );
  assert.ok(report.track.every((v) => v.landscape.detailTiles === 25));
  assert.ok(
    report.track.at(-1).landscape.rebuilds > 100,
    'travel crossed many detail cells',
  );
  report.errors = h.errors;
  assert.ok(
    Object.values(h.errors).every((e) => !e.length),
    JSON.stringify(h.errors),
  );
  report.pass = true;
  console.log(
    'PASS roll, inversion, recovery, remote low/high flight and bounded resources',
  );
} catch (error) {
  report.error = error.stack;
  await capture('failure').catch(() => {});
  throw error;
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await h.close();
}
