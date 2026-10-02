import test from 'node:test';
import assert from 'node:assert/strict';
import { createVehicleState, stepVehicle } from '../src/physics/index.js';
import { createHalcyonSimulationRuntime } from '../src/levels/halcyon/device-runtime.js';
import {
  advanceSession,
  createMagneticRuntime,
  compatibleRuntime,
  runtimeIdentity,
} from '../src/core/session-runtime.js';
import { createRace } from '../src/race/index.js';

const track = {
  id: 'halcyon-viaduct-4-compact',
  length: 5000,
  width: 28,
  sample: () => ({
    curvature: 0,
    bank: 0,
    tangent: { x: 0, y: 0, z: 1 },
    right: { x: 1, y: 0, z: 0 },
  }),
};
const dt = 1 / 120;
function session(distance = 30, lateral = 0) {
  const state = {
    ...createVehicleState(),
    distance,
    lateral,
    speed: 100,
    energy: 60,
  };
  const runtime = createHalcyonSimulationRuntime({ track });
  runtime.reset({ reason: 'scenario', state });
  const race = createRace(track, { rulesId: runtime.rulesId });
  const events = [];
  return {
    state,
    runtime,
    race,
    events,
    emit: (event) => events.push(event),
    dt,
  };
}
function tick(run, input) {
  advanceSession({ ...run, input });
}

test('strip entry catapults at the leading hull edge, spends no reserve and stops modifying physics on exit', () => {
  const run = session(35);
  const baseline = { ...run.state };
  let entry = null;
  for (let index = 0; index < 20 && !entry; index++) {
    stepVehicle(baseline, { throttle: 1 }, track, dt);
    tick(run, { throttle: 1 });
    entry = run.events.find((event) => event.type === 'pickup-activate');
  }
  assert.equal(entry.payload.kind, 'vector');
  assert.equal(entry.payload.speedGain, 65);
  assert.ok(
    run.state.distance < 43,
    'front hull contact precedes the visible leadingedge at43m',
  );
  assert.ok(
    run.state.speed > baseline.speed + 64.9,
    'entry gain appears immediately on the contact tick',
  );
  assert.equal(run.state.energy, baseline.energy);
  for (
    let index = 0;
    index < 100 && run.runtime.snapshot().vectorActive;
    index++
  )
    tick(run, { throttle: 1 });
  assert.equal(run.runtime.snapshot().vectorActive, false);
  assert.ok(run.events.some((event) => event.type === 'pickup-exit'));
  assert.ok(
    run.state.speed * 3.6 >= 599,
    'a full strip reaches approximately 600 km/h',
  );
  const ordinary = { ...run.state };
  for (let index = 0; index < 10; index++) {
    stepVehicle(ordinary, { throttle: 1 }, track, dt);
    tick(run, { throttle: 1 });
  }
  assert.deepEqual(
    run.state,
    ordinary,
    'exit retains actual speed with exactly baseline forces afterward',
  );
});

test('full strip traversal reaches 600 km/h on every chassis; leaving early retains only earned speed', () => {
  for (const shipId of ['kestrel', 'shrike', 'bastion', 'needle']) {
    const full = session(30),
      clipped = session(30);
    full.state.shipId = clipped.state.shipId = shipId;
    full.state.speed = clipped.state.speed = 30;
    while (!clipped.runtime.snapshot().vectorActive)
      tick(clipped, { throttle: 1 });
    clipped.state.lateral = 12;
    tick(clipped, { throttle: 1 });
    assert.equal(clipped.runtime.snapshot().vectorActive, false);
    for (
      let tickIndex = 0;
      tickIndex < 180 &&
      !full.events.some((event) => event.type === 'pickup-exit');
      tickIndex++
    )
      tick(full, { throttle: 1 });
    assert.ok(full.events.some((event) => event.type === 'pickup-exit'));
    assert.ok(
      full.state.speed * 3.6 >= 599,
      `${shipId} must reach 600 km/h on a full pass`,
    );
    assert.ok(
      clipped.state.speed < full.state.speed - 40,
      'a brief contact cannot earn the full strip speed',
    );
  }
});

test('actual feature live/replay uses one core advance and preserves all state and event order', () => {
  const live = session();
  const initial = {
    vehicle: structuredClone(live.state),
    runtime: live.runtime.snapshot(),
  };
  const inputs = Array.from({ length: 220 }, (_, i) => ({
    throttle: 1,
    boost: i > 60 && i < 90,
    brake: i > 160 ? 1 : 0,
  }));
  for (const input of inputs) tick(live, input);
  const replay = session();
  Object.assign(replay.state, initial.vehicle);
  replay.runtime.restore(JSON.parse(JSON.stringify(initial.runtime)));
  for (const input of inputs) tick(replay, input);
  assert.deepEqual(replay.state, live.state);
  assert.deepEqual(replay.runtime.snapshot(), live.runtime.snapshot());
  assert.deepEqual(replay.events, live.events);
  assert.equal(replay.race.elapsed, live.race.elapsed);
  assert.ok(live.events.some((event) => event.type === 'pickup-activate'));
  assert.ok(
    !compatibleRuntime(
      createMagneticRuntime({ track }),
      runtimeIdentity(live.runtime),
    ),
  );
});

test('drive-over shield protects one real impact and a follow-up collision loses reserve', () => {
  const run = session(340, 3);
  for (let i = 0; i < 26; i++) tick(run, { throttle: 1 });
  assert.ok(run.runtime.snapshot().aegisRemaining > 5);
  for (let i = 0; i < 220; i++) tick(run, { throttle: 1, steer: -1 });
  const hits = run.events.filter((event) => event.type === 'impact');
  assert.ok(hits.length >= 2);
  assert.equal(hits[0].payload.shielded, true);
  assert.equal(hits[1].payload.shielded, undefined);
  assert.equal(
    run.events.filter((event) => event.type === 'shield-hit').length,
    1,
  );
  assert.equal(run.runtime.snapshot().aegisRemaining, 0);
  assert.ok(run.state.energy < 60);
});

test('pause and presentation updates do not advance deterministic effect time', () => {
  const run = session();
  for (let i = 0; i < 40; i++) tick(run, { throttle: 1 });
  const before = run.runtime.snapshot();
  assert.ok(before.vectorActive);
  for (let i = 0; i < 60; i++)
    run.runtime.update({
      state: run.state,
      mode: 'paused',
      dt: 0,
      time: run.state.time,
    });
  assert.deepEqual(run.runtime.snapshot(), before);
  assert.deepEqual(run.runtime.advance(run.state, {}, 0), []);
  assert.deepEqual(run.runtime.snapshot(), before);
});

test('manual recovery clears effects without rearming; fresh lap deliberately rearms', () => {
  const run = session();
  for (let i = 0; i < 40; i++) tick(run, { throttle: 1 });
  run.state.distance = 30;
  run.runtime.reset({ reason: 'manual-recover', state: run.state });
  assert.equal(run.runtime.snapshot().vectorActive, false);
  assert.equal(run.runtime.snapshot().used['vector-launch'], 0);
  run.events.length = 0;
  for (let i = 0; i < 40; i++) tick(run, { throttle: 1 });
  assert.ok(!run.events.some((event) => event.type === 'pickup-activate'));
  run.state.distance = 30;
  run.runtime.reset({ reason: 'fresh-lap', state: run.state });
  for (let i = 0; i < 40; i++) tick(run, { throttle: 1 });
  assert.ok(run.events.some((event) => event.type === 'pickup-activate'));
});

test('feature records are tagged and never share baseline best/history storage', () => {
  const feature = session();
  const baseline = createRace(track, {
    rulesId: createMagneticRuntime({ track }).rulesId,
  });
  for (let distance = 0; distance < 5000; distance += 625)
    feature.race.step(distance, distance + 625, 5);
  assert.equal(feature.race.history[0].rulesId, feature.runtime.rulesId);
  assert.equal(feature.race.best, 40);
  assert.deepEqual(baseline.history, []);
  assert.equal(baseline.best, null);
});
