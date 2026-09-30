import test from 'node:test';
import assert from 'node:assert/strict';
import createLevel from '../src/levels/zephyr/index.js';
import { createZephyrRuntime } from '../src/levels/zephyr/runtime.js';
import {
  interiorAt,
  wetnessAt,
  wetnessForFrame,
  sampleTowerEvent,
} from '../src/levels/zephyr/environment/atmosphere.js';
import { createVehicleState } from '../src/physics/index.js';
const track = createLevel({ shape: false }).createTrack();
const neutral = {
  throttle: 0,
  brake: 0,
  steer: 0,
  boost: false,
  airbrake: false,
};
test('Zephyr dark zones and transparent curtain presentation are finite and route-bound', () => {
  assert.equal(wetnessAt(track, track.curtains[0].s + 3), 1);
  assert.equal(wetnessAt(track, track.curtains[0].s + 150), 0);
  assert.equal(interiorAt(track, track.landmarks.nave.s), 1);
  assert.equal(interiorAt(track, track.landmarks.halo.s), 0);
  for (let s = 0; s < track.length; s += 1) {
    assert.ok(wetnessAt(track, s) >= 0 && wetnessAt(track, s) <= 1);
    assert.ok(interiorAt(track, s) >= 0 && interiorAt(track, s) <= 1);
  }
});
test('Zephyr falling tower is seeded by simulation and survives snapshot restore/reset', () => {
  const runtime = createZephyrRuntime({ track });
  const state = {
    ...createVehicleState(),
    distance: track.sections.find((s) => s.id === 'falls').start + 1,
    speed: 0,
  };
  runtime.reset();
  runtime.advance(state, neutral, 1 / 120);
  const start = runtime.snapshot();
  assert.ok(start.zephyr.towerStart > 0);
  for (let i = 0; i < 120; i++) runtime.advance(state, neutral, 1 / 120);
  assert.deepEqual(runtime.snapshot().zephyr, start.zephyr);
  const a = sampleTowerEvent(state.time - start.zephyr.towerStart);
  runtime.reset();
  assert.equal(runtime.snapshot().zephyr.towerStart, null);
  runtime.restore(start);
  assert.deepEqual(runtime.snapshot(), start);
  assert.deepEqual(
    sampleTowerEvent(state.time - runtime.snapshot().zephyr.towerStart),
    a,
  );
  assert.throws(
    () =>
      runtime.restore({ ...start, zephyr: { towerStart: NaN, lastLap: 0 } }),
    /Invalid Zephyr/,
  );
  runtime.dispose();
});
test('Zephyr falling geometry uses a bounded slow event and no simulation forces', () => {
  assert.deepEqual(sampleTowerEvent(-1), {
    fall: 0,
    tilt: 0,
    drop: 0,
    trail: 0,
    dust: 0,
  });
  let previous = 0;
  for (let age = 0; age < 40; age += 0.1) {
    const e = sampleTowerEvent(age);
    assert.ok(e.fall >= previous);
    assert.ok(e.tilt <= 1.17 && e.drop <= 165);
    previous = e.fall;
  }
  const runtime = createZephyrRuntime({ track });
  const state = { ...createVehicleState(), distance: track.landmarks.nave.s };
  for (let i = 0; i < 240; i++) runtime.advance(state, neutral, 1 / 120);
  assert.equal(state.speed, 0);
  assert.equal(state.lateral, 0);
  runtime.dispose();
});

test('Water curtain streams persist through flight and restore with recorded simulation time', () => {
  const runtime = createZephyrRuntime({ track });
  const state = {
    ...createVehicleState(),
    distance: track.curtains[0].s - 0.2,
    speed: 112,
  };
  runtime.advance(state, { ...neutral, throttle: 1 }, 1 / 120);
  const data = runtime.snapshot();
  assert.ok(data.zephyr.wetStart > 0);
  assert.ok(
    wetnessForFrame(
      track,
      track.jumps[0].landingStart + 160,
      data.zephyr.wetStart + 2,
    ) > 0.5,
  );
  assert.equal(
    wetnessForFrame(
      track,
      track.jumps[0].landingStart + 160,
      data.zephyr.wetStart + 7,
    ),
    0,
  );
  runtime.reset();
  assert.equal(runtime.snapshot().zephyr.wetStart, null);
  runtime.restore(data);
  assert.deepEqual(runtime.snapshot(), data);
  runtime.dispose();
});
