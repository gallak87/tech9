import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AEGIS_DURATION,
  VECTOR_PROPULSION,
  createPickupSimulation,
  sweptDeviceCrossings,
  sweptVectorContacts,
} from '../src/pickups/simulation.js';
import {
  HALCYON_TRACK_ID,
  createHalcyonDevices,
} from '../src/levels/halcyon/devices.js';
import { createTrack } from '../src/levels/halcyon/track/model.js';
import { createVehicleState } from '../src/physics/index.js';

const dt = 1 / 120;
const idle = { throttle: 0, brake: 0, steer: 0, boost: false, airbrake: false };
const device = (id, type, distance, lateral = 0, width = 8) => ({
  id,
  type,
  distance,
  lateral,
  width,
  length: type === 'vector' ? 54 : 8,
});
const vehicle = (distance = 0, options = {}) => ({
  ...createVehicleState(),
  distance,
  speed: 100,
  ...options,
});
const simulation = (devices, distance = 0) =>
  createPickupSimulation({
    trackLength: 5000,
    devices,
    vehicle: vehicle(distance),
  });
const cross = (sim, start, end, input = idle, events = []) =>
  sim.afterStep(
    typeof start === 'number' ? vehicle(start) : start,
    typeof end === 'number' ? vehicle(end) : end,
    input,
    events,
  );
const acquireShield = () => {
  const sim = simulation([device('shield', 'aegis', 10)]);
  cross(sim, 0, 10);
  return sim;
};

test('Halcyon retains four 54m strips and adds opening protection plus combat gates', () => {
  const track = createTrack(),
    devices = createHalcyonDevices(track);
  assert.equal(track.id, HALCYON_TRACK_ID);
  assert.equal(devices.filter((entry) => entry.type === 'vector').length, 4);
  assert.deepEqual(
    devices.filter((entry) => entry.type === 'aegis').map(({ id }) => id),
    ['aegis-launch', 'aegis-crown', 'aegis-corkscrew', 'aegis-sky-exit'],
  );
  for (const entry of devices) {
    assert.ok(Math.abs(entry.lateral) + entry.width / 2 < track.width / 2 - 1);
    if (entry.type === 'vector') assert.equal(entry.length, 54);
  }
  assert.deepEqual(createHalcyonDevices({ ...track, id: 'orbital' }), []);
  assert.deepEqual(createHalcyonDevices(), []);
  devices[0].length = 1;
  assert.equal(createHalcyonDevices(track)[0].length, 54);
});

test('leading hull contact activates before the strip centre and exit removes force immediately', () => {
  const sim = simulation([device('strip', 'vector', 100)]);
  assert.deepEqual(
    cross(sim, 0, 69).map((entry) => entry.type),
    [],
  );
  assert.deepEqual(
    cross(sim, 69, 70).map((entry) => entry.type),
    ['pickup-activate'],
  );
  assert.equal(sim.snapshot().vectorActive, true);
  assert.deepEqual(sim.beforeStep(idle, dt, vehicle(70)).modifiers, {
    propulsion: VECTOR_PROPULSION,
  });
  cross(sim, 70, 130);
  assert.equal(
    sim.snapshot().vectorActive,
    true,
    'rear hull still overlaps the trailingedge',
  );
  const exit = cross(sim, 130, 131);
  assert.equal(exit[0].type, 'pickup-exit');
  assert.equal(sim.snapshot().vectorActive, false);
  assert.equal(sim.snapshot().vectorDevice, null);
  assert.deepEqual(sim.beforeStep(idle, dt, vehicle(131)).modifiers, {});
  assert.equal('vectorRemaining' in sim.snapshot(), false);
});

test('a high-speed sweep through the whole strip emits entry and exit without leaving a powerup timer', () => {
  const sim = simulation([device('strip', 'vector', 100)]);
  assert.deepEqual(
    cross(sim, 0, 250).map((entry) => entry.type),
    ['pickup-activate', 'pickup-exit'],
  );
  assert.equal(sim.snapshot().vectorActive, false);
  assert.equal(sim.snapshot().used.strip, 0);
});

test('a fresh Vector strip activates while the previous strip still overlaps the hull', () => {
  const sim = simulation([
    device('first', 'vector', 100),
    device('second', 'vector', 120),
  ]);
  assert.equal(cross(sim, 0, 80)[0].payload.deviceId, 'first');
  const events = cross(sim, 80, 100);
  assert.deepEqual(events, [
    {
      type: 'pickup-activate',
      payload: { kind: 'vector', deviceId: 'second', speedGain: 65 },
    },
  ]);
  assert.equal(sim.snapshot().vectorDevice, 'second');
  cross(sim, 100, 140);
  assert.equal(sim.snapshot().vectorActive, true);
  assert.deepEqual(sim.beforeStep(idle, dt, vehicle(140)).modifiers, {
    propulsion: VECTOR_PROPULSION,
  });
  assert.equal(cross(sim, 140, 151)[0].type, 'pickup-exit');
  assert.equal(sim.snapshot().vectorActive, false);
});

test('one fast sweep collects every distinct Vector strip in crossing order', () => {
  const sim = simulation([
    device('second', 'vector', 120),
    device('first', 'vector', 100),
  ]);
  assert.deepEqual(
    cross(sim, 0, 200).map(({ type, payload }) => [type, payload.deviceId]),
    [
      ['pickup-activate', 'first'],
      ['pickup-activate', 'second'],
      ['pickup-exit', 'second'],
    ],
  );
});

test('lateral entry remains eligible after the nose is already longitudinally over the strip', () => {
  const strip = device('strip', 'vector', 100, 0, 2);
  const sim = simulation([strip]);
  cross(sim, vehicle(0, { lateral: 10 }), vehicle(90, { lateral: 10 }));
  assert.equal(
    sim.snapshot().used.strip,
    -1,
    'a side miss at the leadingedge must not consume late entry',
  );
  const events = cross(
    sim,
    vehicle(90, { lateral: 10 }),
    vehicle(110, { lateral: 2.8 }),
  );
  assert.equal(events[0].type, 'pickup-activate');
  assert.equal(sim.snapshot().vectorActive, true);
  assert.ok(
    sweptVectorContacts(
      vehicle(110, { lateral: 10 }),
      vehicle(111, { lateral: 2.8 }),
      [strip],
      5000,
    ).length,
  );
});

test('yaw changes longitudinal contact consistently with the front hull footprint', () => {
  const strip = device('strip', 'vector', 100);
  assert.equal(
    sweptVectorContacts(vehicle(68), vehicle(69), [strip], 5000).length,
    0,
  );
  assert.equal(
    sweptVectorContacts(
      vehicle(68, { heading: Math.PI / 4 }),
      vehicle(69, { heading: Math.PI / 4 }),
      [strip],
      5000,
    ).length,
    1,
  );
});

test('lateral exit, braking, reversal and stationary parking cannot reacquire the same occurrence', () => {
  for (const exitKind of ['lateral', 'brake', 'reverse']) {
    const sim = simulation([device('strip', 'vector', 100)]);
    cross(sim, 0, 100);
    if (exitKind === 'lateral') cross(sim, 100, vehicle(110, { lateral: 12 }));
    else if (exitKind === 'brake')
      assert.equal(
        sim.beforeStep({ ...idle, brake: 0.1 }, dt, vehicle(100)).events[0]
          .type,
        'pickup-cancel',
      );
    else cross(sim, 100, 80);
    const distance =
      exitKind === 'lateral' ? 110 : exitKind === 'reverse' ? 80 : 100;
    cross(
      sim,
      vehicle(distance, { lateral: exitKind === 'lateral' ? 12 : 0 }),
      vehicle(distance + 1),
    );
    assert.equal(sim.snapshot().vectorActive, false);
    assert.equal(sim.snapshot().used.strip, 0);
  }
  const parked = simulation([device('strip', 'vector', 100)], 100);
  assert.equal(
    cross(parked, vehicle(100, { speed: 0 }), vehicle(100, { speed: 0 }))
      .length,
    0,
  );
  assert.equal(cross(parked, 100, 110).length, 0);
  const stationary = simulation([device('strip', 'vector', 100)], 60);
  assert.equal(
    cross(stationary, vehicle(60, { speed: 0 }), vehicle(70, { speed: 0 }))
      .length,
    0,
  );
});

test('a completely missed pass is consumed after its trailingedge and a real next lap rearms it', () => {
  const sim = simulation([device('strip', 'vector', 100)]);
  cross(sim, vehicle(0, { lateral: 12 }), vehicle(140, { lateral: 12 }));
  assert.equal(sim.snapshot().used.strip, 0);
  cross(sim, 140, 60);
  assert.equal(cross(sim, 60, 110).length, 0);
  cross(sim, 110, 5060);
  assert.equal(cross(sim, 5060, 5070)[0].type, 'pickup-activate');
  assert.equal(sim.snapshot().used.strip, 1);
});

test('seam crossing orders Vector volume entry and Aegis arch by actual contact distance', () => {
  const sim = simulation(
    [device('end', 'vector', 4990), device('seam', 'aegis', 0)],
    4940,
  );
  const events = cross(sim, 4940, 5005);
  assert.deepEqual(
    events.map((entry) => entry.payload.deviceId),
    ['end', 'seam'],
  );
  assert.equal(sim.snapshot().vectorActive, true);
  assert.equal(sim.snapshot().aegisRemaining, AEGIS_DURATION);
  assert.equal(sim.snapshot().used.end, 0);
  assert.equal(sim.snapshot().used.seam, 1);
});

test('unsupported motion cannot collect ground strips or shield arches', () => {
  const sim = simulation([
    device('strip', 'vector', 100),
    device('shield', 'aegis', 100),
  ]);
  assert.equal(
    cross(
      sim,
      vehicle(0, { grounded: false }),
      vehicle(110, { grounded: false }),
    ).length,
    0,
  );
  assert.equal(sim.snapshot().vectorActive, false);
  assert.equal(sim.snapshot().aegisRemaining, 0);
});

test('Aegis centre crossing retains interpolated lateral and yaw coverage', () => {
  const shield = device('shield', 'aegis', 100, 0, 2);
  const [diagonal] = sweptDeviceCrossings(
    vehicle(0, { lateral: -10 }),
    vehicle(200, { lateral: 10 }),
    [shield],
    5000,
  );
  assert.equal(diagonal.fraction, 0.5);
  assert.equal(diagonal.lateral, 0);
  assert.equal(diagonal.overlap, true);
  const [rotated] = sweptDeviceCrossings(
    vehicle(0, { lateral: 4.8 }),
    vehicle(200, { lateral: 4.8, heading: Math.PI / 2 }),
    [shield],
    5000,
  );
  assert.equal(rotated.heading, Math.PI / 4);
  assert.equal(rotated.overlap, true);
});

test('Aegis expiry is exact and only a qualifying protected impact consumes the charge', () => {
  const sim = acquireShield();
  cross(sim, 10, 11, idle, [{ type: 'impact', payload: { severity: 1 } }]);
  assert.equal(sim.snapshot().aegisRemaining, AEGIS_DURATION);
  assert.equal(
    cross(sim, 11, 12, idle, [
      { type: 'impact', payload: { shielded: true, severity: 0.6, side: -1 } },
    ])[0].type,
    'shield-hit',
  );
  assert.equal(sim.snapshot().aegisRemaining, 0);
  const timed = acquireShield();
  for (let tick = 0; tick < AEGIS_DURATION / dt - 1; tick++)
    assert.equal(timed.beforeStep(idle, dt).events.length, 0);
  assert.equal(timed.beforeStep(idle, dt).events[0].type, 'pickup-expire');
  assert.deepEqual(timed.beforeStep(idle, dt).modifiers, {});
});

test('each fresh Aegis gate refreshes the full duration and shield source, including after restore', () => {
  for (const closed of [false, true]) {
    const options = {
      trackLength: 5000,
      closed,
      devices: [device('first', 'aegis', 10), device('second', 'aegis', 20)],
      vehicle: vehicle(0),
    };
    const live = createPickupSimulation(options);
    cross(live, 0, 10);
    live.beforeStep(idle, 2.5, vehicle(10));
    assert.equal(live.snapshot().aegisRemaining, AEGIS_DURATION - 2.5);
    const replay = createPickupSimulation(options);
    replay.restore(JSON.parse(JSON.stringify(live.snapshot())));
    const events = cross(live, 10, 20);
    assert.deepEqual(cross(replay, 10, 20), events);
    assert.deepEqual(events, [
      {
        type: 'pickup-activate',
        payload: {
          kind: 'aegis',
          deviceId: 'second',
          duration: AEGIS_DURATION,
        },
      },
    ]);
    assert.equal(live.snapshot().aegisRemaining, AEGIS_DURATION);
    assert.equal(live.snapshot().aegisDevice, 'second');
    assert.deepEqual(replay.snapshot(), live.snapshot());
    assert.deepEqual(live.beforeStep(idle, AEGIS_DURATION - dt).modifiers, {
      shield: true,
    });
    assert.deepEqual(live.beforeStep(idle, dt).events, [
      { type: 'pickup-expire', payload: { kind: 'aegis', deviceId: 'second' } },
    ]);
    assert.equal(live.snapshot().aegisRemaining, 0);
    assert.equal(live.consumeShield(), null);
  }
});

test('Aegis refresh retains one charge and cannot be farmed by reversing through a spent gate', () => {
  const sim = simulation([
    device('first', 'aegis', 10),
    device('second', 'aegis', 20),
  ]);
  cross(sim, 0, 10);
  sim.beforeStep(idle, 1);
  cross(sim, 10, 20);
  assert.deepEqual(sim.consumeShield(), {
    type: 'shield-hit',
    payload: { kind: 'aegis', deviceId: 'second', combat: true },
  });
  assert.equal(sim.consumeShield(), null);
  assert.deepEqual(cross(sim, 20, 0), []);
  assert.deepEqual(cross(sim, 0, 20), []);
  assert.equal(sim.snapshot().aegisRemaining, 0);
  const nextLap = cross(sim, 20, 5020);
  assert.deepEqual(
    nextLap.map(({ payload }) => payload.deviceId),
    ['first', 'second'],
  );
  assert.equal(sim.snapshot().aegisRemaining, AEGIS_DURATION);
  assert.equal(sim.snapshot().aegisDevice, 'second');
});

test('shield impact and expiry resolve before acquiring a new shield in the same tick', () => {
  for (const expire of [false, true]) {
    const sim = simulation([
      device('old', 'aegis', 10),
      device('new', 'aegis', 20),
    ]);
    cross(sim, 0, 10);
    const before = sim.beforeStep(idle, expire ? AEGIS_DURATION : dt);
    const after = cross(sim, 10, 21, idle, [
      {
        type: 'impact',
        payload: expire
          ? { severity: 1 }
          : { shielded: true, severity: 1, side: 1 },
      },
    ]);
    assert.deepEqual(
      [...before.events, ...after].map((entry) => entry.type),
      [expire ? 'pickup-expire' : 'shield-hit', 'pickup-activate'],
    );
    assert.equal(sim.snapshot().aegisDevice, 'new');
  }
});

test('automatic road recovery clears effects without renewing a device at the same station', () => {
  const sim = simulation([
    device('strip', 'vector', 100),
    device('shield', 'aegis', 90),
  ]);
  cross(sim, 0, 95);
  assert.equal(sim.snapshot().vectorActive, true);
  assert.ok(sim.snapshot().aegisRemaining > 0);
  const spent = { ...sim.snapshot().used };
  const events = cross(
    sim,
    vehicle(95, { grounded: false }),
    vehicle(95, { speed: 0 }),
    idle,
    [{ type: 'road-recovery', payload: { distance: 95 } }],
  );
  assert.equal(events.filter(({ type }) => type === 'pickup-cancel').length, 2);
  assert.equal(sim.snapshot().vectorActive, false);
  assert.equal(sim.snapshot().aegisRemaining, 0);
  assert.deepEqual(sim.snapshot().used, spent);
  assert.deepEqual(sim.beforeStep(idle, dt, vehicle(95)).modifiers, {});
});

test('manual recovery and unannounced teleport clear effects without renewing spent devices', () => {
  const sim = simulation([
    device('shield', 'aegis', 90),
    device('strip', 'vector', 100),
  ]);
  cross(sim, 0, 110);
  assert.equal(sim.snapshot().vectorActive, true);
  assert.equal(sim.snapshot().aegisRemaining, AEGIS_DURATION);
  const canceled = sim.reset({ reason: 'manual-recover', state: vehicle(0) });
  assert.equal(canceled.length, 2);
  assert.equal(cross(sim, 0, 110).length, 0);
  assert.equal(sim.snapshot().vectorActive, false);
  sim.reset({ reason: 'fresh-lap', state: vehicle(0) });
  assert.equal(cross(sim, 0, 110).length, 2);
  assert.equal(
    cross(sim, 0, 120).length,
    2,
    'unannounced teleport cancels both effects, rather than sweeping another grant',
  );
});

test('pause freezes simulation and serialized contact state restores deterministically', () => {
  const devices = [
    device('strip', 'vector', 100),
    device('shield', 'aegis', 150),
  ];
  const live = simulation(devices);
  cross(live, 0, 100);
  const saved = live.snapshot();
  for (const invalid of [0, -dt, NaN, Infinity])
    assert.deepEqual(live.beforeStep(idle, invalid), {
      modifiers: {},
      events: [],
    });
  assert.deepEqual(live.snapshot(), saved);
  const replay = simulation(devices);
  replay.restore(saved);
  saved.used.strip = 999;
  saved.vectorActive = false;
  for (let distance = 100; distance < 180; distance++) {
    assert.deepEqual(
      replay.beforeStep(idle, dt, vehicle(distance)),
      live.beforeStep(idle, dt, vehicle(distance)),
    );
    assert.deepEqual(
      cross(replay, distance, distance + 1),
      cross(live, distance, distance + 1),
    );
  }
  assert.deepEqual(replay.snapshot(), live.snapshot());
});

test('restore rejects stale timers, wrong strip dimensions and malformed contacts atomically', () => {
  const sim = simulation([device('strip', 'vector', 100)]);
  cross(sim, 0, 100);
  const original = sim.snapshot();
  for (const changed of [
    { version: 1 },
    { version: 2 },
    { layoutKey: 'old-length' },
    { vectorActive: 'yes' },
    { vectorDevice: 'missing' },
    { vectorTraversal: 0.5 },
    { lastDistance: Infinity },
    { used: { strip: 0.5 } },
  ]) {
    assert.throws(() => sim.restore({ ...original, ...changed }), /mismatch/);
    assert.deepEqual(sim.snapshot(), original);
  }
  const changedLength = createPickupSimulation({
    trackLength: 5000,
    devices: [{ ...device('strip', 'vector', 100), length: 18 }],
  });
  assert.throws(() => changedLength.restore(original), /mismatch/);
});
