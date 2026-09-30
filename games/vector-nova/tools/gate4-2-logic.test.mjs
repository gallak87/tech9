import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AEGIS_DURATION,
  VECTOR_DURATION,
  VECTOR_PROPULSION,
  createPickupSimulation,
  sweptDeviceCrossings,
} from '../src/pickups/halcyon/simulation.js';
import {
  HALCYON_TRACK_ID,
  createHalcyonDevices,
} from '../src/pickups/halcyon/placements.js';
import { createTrack } from '../src/levels/halcyon/track/model.js';
import { createVehicleState, stepVehicle } from '../src/physics/index.js';

const dt = 1 / 120;
const road = {
  length: 5000,
  width: 28,
  sample: () => ({ curvature: 0, bank: 0 }),
};
const idle = { throttle: 0, brake: 0, steer: 0, boost: false, airbrake: false };
const device = (id, type, distance, lateral = 0, width = 8) => ({
  id,
  type,
  distance,
  lateral,
  width,
  length: type === 'vector' ? 18 : 8,
});
const vehicle = (distance = 0, options = {}) => ({
  ...createVehicleState(),
  distance,
  ...options,
});
const simulation = (devices, distance = 0) =>
  createPickupSimulation({
    trackLength: road.length,
    devices,
    vehicle: vehicle(distance),
  });

function cross(sim, start, end, input = idle, events = []) {
  const before = typeof start === 'number' ? vehicle(start) : start;
  const after = typeof end === 'number' ? vehicle(end) : end;
  return sim.afterStep(before, after, input, events);
}

function advance(sim, state, input = idle, seconds = dt) {
  const previous = { ...state };
  const before = sim.beforeStep(input, seconds);
  const physics = stepVehicle(state, input, road, seconds, before.modifiers);
  const after = sim.afterStep(previous, state, input, physics);
  return [...before.events, ...physics, ...after];
}

function acquire(kind, distance = 10) {
  const sim = simulation([device('first', kind, distance)]);
  cross(sim, 0, distance);
  return sim;
}

test('authored plan has four strips and two shields only on exact Halcyon', () => {
  const track = createTrack();
  const devices = createHalcyonDevices(track);
  assert.equal(track.id, HALCYON_TRACK_ID);
  assert.equal(devices.filter((d) => d.type === 'vector').length, 4);
  assert.equal(devices.filter((d) => d.type === 'aegis').length, 2);
  assert.deepEqual(createHalcyonDevices({ ...track, id: 'orbital' }), []);
  assert.deepEqual(createHalcyonDevices({ ...track, id: 'nacre' }), []);
  assert.deepEqual(createHalcyonDevices(), []);
  assert.equal(new Set(devices.map((d) => d.id)).size, devices.length);
  for (const entry of devices) {
    assert.ok(Math.abs(entry.lateral) + entry.width / 2 < track.width / 2 - 1);
    assert.ok(entry.distance > entry.length / 2);
    assert.ok(entry.distance + entry.length / 2 < track.length);
    if (entry.type === 'vector') {
      for (let offset = 0; offset < 140; offset += 10)
        assert.ok(
          Math.abs(track.sample(entry.distance + offset).curvature) < 0.006,
          `${entry.id} must not point immediately into a tight bend`,
        );
    }
  }
  devices[0].distance = -100;
  assert.equal(createHalcyonDevices(track)[0].distance, 70);
});

test('high-speed sweep crosses a device even when both endpoints are distant', () => {
  const sim = simulation([device('strip', 'vector', 100)]);
  const events = cross(sim, 0, 250);
  assert.deepEqual(
    events.map((e) => e.type),
    ['pickup-activate'],
  );
  assert.equal(events[0].payload.deviceId, 'strip');
  assert.equal(sim.snapshot().vectorRemaining, VECTOR_DURATION);
});

test('unwrapped forward seam crossing orders devices on both sides correctly', () => {
  const sim = simulation(
    [device('seam', 'aegis', 0), device('end', 'vector', 4998)],
    4990,
  );
  const events = cross(sim, 4990, 5010);
  assert.deepEqual(
    events.map((e) => e.payload.deviceId),
    ['end', 'seam'],
  );
  assert.equal(sim.snapshot().used.end, 0);
  assert.equal(sim.snapshot().used.seam, 1);
  assert.ok(sim.snapshot().aegisRemaining > 0);
});

test('crossing interpolates the lateral line instead of testing an endpoint', () => {
  const strip = device('strip', 'vector', 100, 0, 2);
  const crossing = sweptDeviceCrossings(
    vehicle(0, { lateral: -10 }),
    vehicle(200, { lateral: 10 }),
    [strip],
    road.length,
  )[0];
  assert.equal(crossing.fraction, 0.5);
  assert.equal(crossing.lateral, 0);
  assert.equal(crossing.overlap, true);
  const missed = sweptDeviceCrossings(
    vehicle(0, { lateral: 12 }),
    vehicle(101, { lateral: 5 }),
    [strip],
    road.length,
  )[0];
  assert.equal(missed.overlap, false);
});

test('hull lateral envelope uses interpolated yaw at the trigger plane', () => {
  const strip = device('strip', 'vector', 50, 0, 2);
  const [rotated] = sweptDeviceCrossings(
    vehicle(0, { lateral: 4.8, heading: 0 }),
    vehicle(100, { lateral: 4.8, heading: Math.PI / 2 }),
    [strip],
    road.length,
  );
  assert.equal(rotated.heading, Math.PI / 4);
  assert.equal(rotated.overlap, true);
  const [straight] = sweptDeviceCrossings(
    vehicle(0, { lateral: 4.8 }),
    vehicle(100, { lateral: 4.8 }),
    [strip],
    road.length,
  );
  assert.equal(straight.overlap, false);
});

test('standing, backward motion and oscillation cannot renew a used device', () => {
  const sim = simulation([device('strip', 'vector', 100)], 90);
  assert.equal(cross(sim, 90, 100).length, 1);
  assert.equal(cross(sim, 100, 100).length, 0);
  assert.equal(cross(sim, 100, 90).length, 0);
  sim.beforeStep(idle, 2);
  assert.equal(cross(sim, 90, 101).length, 0);
  assert.equal(sim.snapshot().vectorRemaining, 0);
  assert.equal(sim.isAvailable('strip'), false);
  assert.equal(sim.isAvailable('missing'), false);
});

test('starting or resetting on a trigger plane does not grant an effect', () => {
  const sim = simulation([device('strip', 'vector', 100)], 100);
  assert.equal(cross(sim, 100, 101).length, 0);
  assert.equal(cross(sim, 101, 99).length, 0);
  assert.equal(cross(sim, 99, 101).length, 0);
  assert.equal(sim.snapshot().vectorRemaining, 0);
});

test('a missed first pass cannot be farmed by reversing onto another line', () => {
  const sim = simulation([device('strip', 'vector', 100)], 90);
  assert.equal(
    cross(sim, vehicle(90, { lateral: 12 }), vehicle(110, { lateral: 12 }))
      .length,
    0,
  );
  cross(sim, 110, 90);
  assert.equal(cross(sim, 90, 110).length, 0);
  assert.equal(sim.snapshot().vectorRemaining, 0);
});

test('a genuine next forward traversal rearms the device, including seam reversal', () => {
  const sim = acquire('vector');
  sim.beforeStep(idle, 2);
  cross(sim, 10, -10);
  assert.equal(cross(sim, -10, 20).length, 0);
  cross(sim, 20, 4999);
  cross(sim, 4999, 5001);
  cross(sim, 5001, 4999);
  assert.equal(sim.isAvailable('first', 4999), false);
  assert.equal(sim.isAvailable('first', 5001), true);
  assert.equal(cross(sim, 4999, 5011).length, 1);
  assert.equal(sim.snapshot().used.first, 1);
});

test('same-type crossing while active spends the device without extending duration', () => {
  for (const kind of ['vector', 'aegis']) {
    const sim = simulation([device('one', kind, 10), device('two', kind, 20)]);
    cross(sim, 0, 10);
    sim.beforeStep(idle, 0.5);
    const before = sim.snapshot()[`${kind}Remaining`];
    const events = cross(sim, 10, 20);
    assert.equal(events[0].type, 'pickup-unavailable');
    assert.equal(events[0].payload.reason, 'active');
    assert.equal(sim.snapshot()[`${kind}Remaining`], before);
    assert.equal(sim.snapshot().used.two, 0);
  }
});

test('different devices can provide one vector profile and one shield concurrently', () => {
  const sim = simulation([
    device('shield', 'aegis', 10),
    device('strip', 'vector', 20),
  ]);
  cross(sim, 0, 30);
  assert.deepEqual(sim.beforeStep(idle, dt).modifiers, {
    propulsion: VECTOR_PROPULSION,
    shield: true,
  });
});

test('timers expire exactly at their simulation boundary before vehicle stepping', () => {
  for (const [kind, duration] of [
    ['vector', VECTOR_DURATION],
    ['aegis', AEGIS_DURATION],
  ]) {
    const sim = acquire(kind);
    for (let step = 0; step < duration / dt - 1; step++) {
      const result = sim.beforeStep(idle, dt);
      assert.equal(result.events.length, 0);
    }
    const result = sim.beforeStep(idle, dt);
    const events = result.events;
    assert.deepEqual(
      events.map((e) => e.type),
      ['pickup-expire'],
    );
    assert.equal(sim.snapshot()[`${kind}Remaining`], 0);
    assert.deepEqual(result.modifiers, {});
    assert.equal(sim.beforeStep(idle, dt).events.length, 0);
  }
});

test('zero, negative and nonfinite steps freeze effect state', () => {
  const sim = acquire('aegis');
  const before = sim.snapshot();
  for (const elapsed of [0, -dt, NaN, Infinity])
    assert.deepEqual(sim.beforeStep(idle, elapsed), {
      modifiers: {},
      events: [],
    });
  assert.deepEqual(sim.snapshot(), before);
});

test('only a qualifying protected physics impact consumes an aegis', () => {
  const sim = acquire('aegis');
  assert.equal(
    cross(sim, 10, 11, idle, [{ type: 'impact', payload: { severity: 0.5 } }])
      .length,
    0,
  );
  assert.ok(sim.snapshot().aegisRemaining > 0);
  const impacts = [
    { type: 'impact', payload: { shielded: true, severity: 0.6, side: -1 } },
  ];
  const events = cross(sim, 11, 12, idle, impacts);
  assert.deepEqual(events, [
    {
      type: 'shield-hit',
      payload: { kind: 'aegis', deviceId: 'first', severity: 0.6, side: -1 },
    },
  ]);
  assert.equal(sim.snapshot().aegisRemaining, 0);
  assert.equal(cross(sim, 12, 13, idle, impacts).length, 0);
});

test('same tick shield impact consumes the old charge before acquiring the next', () => {
  const sim = simulation([
    device('old', 'aegis', 10),
    device('new', 'aegis', 20),
  ]);
  cross(sim, 0, 10);
  const before = sim.beforeStep(idle, dt);
  assert.equal(before.modifiers.shield, true);
  const events = cross(sim, 10, 21, idle, [
    { type: 'impact', payload: { shielded: true, severity: 1, side: 1 } },
  ]);
  assert.deepEqual(
    events.map((e) => e.type),
    ['shield-hit', 'pickup-activate'],
  );
  assert.equal(sim.snapshot().aegisDevice, 'new');
  assert.equal(sim.snapshot().aegisRemaining, AEGIS_DURATION);
});

test('same tick expiry precedes impact, then pickup activates for the next step', () => {
  const sim = simulation([
    device('old', 'aegis', 10),
    device('new', 'aegis', 20),
  ]);
  cross(sim, 0, 10);
  const before = sim.beforeStep(idle, AEGIS_DURATION);
  assert.equal(before.modifiers.shield, undefined);
  const events = cross(sim, 10, 21, idle, [
    { type: 'impact', payload: { severity: 1, side: 1 } },
  ]);
  assert.deepEqual(
    [...before.events, ...events].map((e) => e.type),
    ['pickup-expire', 'pickup-activate'],
  );
  assert.equal(sim.snapshot().aegisDevice, 'new');
});

test('brake cancels active propulsion and suppresses a crossed strip', () => {
  const sim = simulation([
    device('one', 'vector', 10),
    device('two', 'vector', 20),
  ]);
  cross(sim, 0, 10);
  const brake = { ...idle, brake: 0.1 };
  const before = sim.beforeStep(brake, dt);
  assert.deepEqual(before.modifiers, {});
  assert.equal(before.events[0].type, 'pickup-cancel');
  assert.equal(before.events[0].payload.reason, 'brake');
  const events = cross(sim, 10, 21, brake);
  assert.equal(events[0].type, 'pickup-unavailable');
  assert.equal(events[0].payload.reason, 'braking');
  assert.equal(sim.snapshot().vectorRemaining, 0);
  assert.equal(sim.snapshot().used.two, 0);
});

test('manual recovery clears effects while retaining furthest traversal eligibility', () => {
  const sim = simulation([
    device('one', 'vector', 10),
    device('two', 'aegis', 20),
  ]);
  cross(sim, 0, 30);
  const time = sim.snapshot().time;
  sim.reset({ reason: 'manual-recover', state: vehicle(0) });
  assert.equal(sim.snapshot().time, time);
  assert.equal(sim.snapshot().vectorRemaining, 0);
  assert.equal(sim.snapshot().aegisRemaining, 0);
  assert.equal(sim.snapshot().highWaterDistance, 30);
  assert.equal(cross(sim, 0, 30).length, 0);
  sim.reset({ reason: 'manual-recover', state: vehicle(5025) });
  sim.reset({ reason: 'manual-recover', state: vehicle(0) });
  assert.equal(cross(sim, 0, 5030).length, 0);
});

test('fresh restart and scenario reset deliberately establish fresh eligibility', () => {
  const sim = acquire('vector');
  for (const reason of ['fresh-lap', 'scenario', 'initialize']) {
    sim.reset({ reason, state: vehicle(0) });
    assert.equal(cross(sim, 0, 11).length, 1);
  }
  sim.reset({ reason: 'scenario', state: vehicle(10) });
  assert.equal(cross(sim, 10, 11).length, 0);
});

test('unannounced teleport cannot create a swept grant or restore spent pickups', () => {
  const sim = acquire('vector');
  const events = cross(sim, 0, 11);
  assert.deepEqual(
    events.map((e) => e.type),
    ['pickup-cancel'],
  );
  assert.equal(sim.snapshot().vectorRemaining, 0);
  assert.equal(sim.snapshot().used.first, 0);
});

test('serialized replay state produces identical subsequent timers, events and eligibility', () => {
  const devices = [device('one', 'vector', 10), device('two', 'aegis', 25)];
  const live = simulation(devices);
  cross(live, 0, 20);
  live.beforeStep(idle, 0.5);
  const saved = JSON.parse(JSON.stringify(live.snapshot()));
  const replay = simulation(devices);
  replay.restore(saved);
  saved.used.one = 99;
  saved.vectorRemaining = 99;
  assert.deepEqual(replay.snapshot(), live.snapshot());
  for (let frame = 0; frame < 240; frame++) {
    assert.deepEqual(replay.beforeStep(idle, dt), live.beforeStep(idle, dt));
    assert.deepEqual(
      cross(replay, 20 + frame, 21 + frame),
      cross(live, 20 + frame, 21 + frame),
    );
  }
  assert.deepEqual(replay.snapshot(), live.snapshot());
});

test('restore rejects incompatible layouts, timer states and schema versions atomically', () => {
  const sim = acquire('aegis');
  const original = sim.snapshot();
  for (const changed of [
    { version: 999 },
    { layoutKey: 'other-course' },
    { aegisRemaining: 6.01 },
    { aegisDevice: 'missing' },
    { lastDistance: Infinity },
    { used: { first: 0.5 } },
  ]) {
    assert.throws(() => sim.restore({ ...original, ...changed }), /mismatch/);
    assert.deepEqual(sim.snapshot(), original);
  }
});

test('integrated free impulse changes physical motion while manual boost remains stronger and spends reserve', () => {
  const baseline = vehicle(10, { speed: 100, energy: 70 });
  const free = { ...baseline };
  const manual = { ...baseline };
  const freeSim = acquire('vector');
  const manualSim = acquire('vector');
  for (let frame = 0; frame < 90; frame++) {
    stepVehicle(baseline, { ...idle, throttle: 1 }, road, dt);
    advance(freeSim, free, { ...idle, throttle: 1 });
    advance(manualSim, manual, { ...idle, throttle: 1, boost: true });
  }
  assert.ok(free.speed > baseline.speed + 5);
  assert.ok(free.distance > baseline.distance + 2);
  assert.ok(manual.speed > free.speed + 2);
  assert.equal(free.energy, baseline.energy);
  assert.ok(manual.energy < free.energy - 15);
  const speedBeforeExpiry = free.speed;
  freeSim.beforeStep(idle, 2);
  advance(freeSim, free, { ...idle, throttle: 1 });
  assert.ok(
    Math.abs(free.speed - speedBeforeExpiry) < 1,
    'release must not snap speed',
  );
});

test('integrated shield preserves separation and speed consequences, then next contact costs reserve', () => {
  const protectedState = vehicle(10, {
    speed: 100,
    lateral: 10.8,
    lateralSpeed: 120,
    heading: 0.2,
    energy: 70,
  });
  const exposedState = { ...protectedState };
  const sim = acquire('aegis');
  const events = advance(sim, protectedState);
  const exposedEvents = stepVehicle(exposedState, idle, road, dt);
  const impact = events.find((e) => e.type === 'impact');
  assert.equal(impact.payload.shielded, true);
  assert.ok(events.some((e) => e.type === 'shield-hit'));
  assert.ok(exposedEvents.some((e) => e.type === 'impact'));
  assert.equal(protectedState.speed, exposedState.speed);
  assert.equal(protectedState.lateral, exposedState.lateral);
  assert.equal(protectedState.lateralSpeed, exposedState.lateralSpeed);
  assert.equal(protectedState.heading, exposedState.heading);
  assert.ok(protectedState.energy > exposedState.energy + 10);
  assert.equal(sim.snapshot().aegisRemaining, 0);
  Object.assign(protectedState, {
    impact: 0,
    lateral: 10.8,
    lateralSpeed: 120,
    heading: 0.2,
  });
  const energy = protectedState.energy;
  const followup = advance(sim, protectedState);
  assert.equal(
    followup.find((e) => e.type === 'impact').payload.shielded,
    undefined,
  );
  assert.ok(protectedState.energy < energy - 10);
});
