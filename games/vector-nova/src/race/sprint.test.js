import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { createRace } from './index.js';
import { createRacers, getRacerControl } from './racers.js';
import { RACE_OPPONENTS } from './roster.js';
import { presentationDistance, distanceAhead } from './course.js';
import { createVehicleState } from '../physics/index.js';
import { SHIPS } from '../ships/catalog.js';
import {
  createMagneticRuntime,
  advanceSession,
} from '../core/session-runtime.js';
import { createDeviceRuntime } from '../pickups/runtime.js';
import {
  sweptDeviceCrossings,
  sweptVectorContacts,
} from '../pickups/simulation.js';
import { assertTrackContract } from '../../tools/level-checks/track-contract.mjs';
import { crossAirborneGate } from '../physics/finish-gate.js';

const dt = 1 / 120;
const throttle = {
  throttle: 1,
  brake: 0,
  steer: 0,
  boost: true,
  airbrake: false,
};
function makeTrack({ jumps = false } = {}) {
  return {
    id: 'sprint-fixture',
    name: 'Sprint fixture',
    closed: false,
    geometryVersion: 1,
    length: 1500,
    finishDistance: 1000,
    width: 40,
    checkpoints: (jumps
      ? [0, 150, 600, 900, 1000]
      : [0, 250, 500, 750, 1000]
    ).map((distance) => ({ distance })),
    jumps: jumps
      ? [
          {
            id: 'hero',
            takeoff: 200,
            landingStart: 600,
            landingEnd: 800,
            recovery: 850,
            halfWidth: 20,
          },
        ]
      : [],
    sections: [{ id: 'descent', name: 'Descent', start: 0, end: 1500 }],
    scenarios: { staging: {} },
    sample(distance) {
      return {
        position: new Vector3(0, 0, Math.min(1500, distance)),
        tangent: new Vector3(0, 0, 1),
        right: new Vector3(1, 0, 0),
        up: new Vector3(0, 1, 0),
        quaternion: new Quaternion(),
        curvature: 0,
        bank: 0,
      };
    },
  };
}

test('open track contract clamps finish lookahead and permits a rear starting grid', () => {
  const track = makeTrack();
  assertTrackContract(track);
  const wrap = {
    ...track,
    sample: (distance) =>
      track.sample(((distance % track.length) + track.length) % track.length),
  };
  assert.throws(() => assertTrackContract(wrap), /Open endpoints/);
  assert.throws(
    () => createRace({ ...track, finishDistance: track.length }),
    /runout/,
  );
});

test('sprint latches one grounded terminal crossing and freezes the recorded clock', () => {
  const track = makeTrack();
  const race = createRace(track);
  race.step(0, 990, 9.9);
  const events = race.step(990, 1010, 0.2);
  assert.equal(
    events.filter((entry) => entry.type === 'sprint-complete').length,
    1,
  );
  assert.equal(race.complete, true);
  assert.equal(race.elapsed, 10);
  assert.equal(race.history.length, 1);
  assert.deepEqual(race.step(1010, 1500, 8), []);
  assert.equal(race.elapsed, 10);
  assert.equal(race.history.length, 1);
  const airborne = createRace(track);
  airborne.step(0, 990, 9.9);
  airborne.step(990, 1010, 0.2, [], { grounded: false });
  assert.equal(airborne.complete, false);
  assert.equal(airborne.valid, false);
});

test('airborne gates use the forward swept crossing above the real road width', () => {
  const track = makeTrack();
  const nominal = track.sample;
  track.sample = (station) => ({
    ...nominal(station),
    right: new Vector3(0.5, Math.sqrt(0.75), 0),
  });
  const crossing = (x, y, reverse = false) =>
    crossAirborneGate(
      track,
      1000,
      new Vector3(x, y, reverse ? 1003 : 999),
      new Vector3(x, y, reverse ? 999 : 1003),
      2,
      0.1,
    );
  assert.ok(Math.abs(crossing(5, 40) - 1.925) < 1e-10);
  assert.equal(crossing(11, 40), null, 'side fly-by');
  assert.equal(crossing(5, 3), null, 'under the banked surface');
  assert.equal(crossing(5, 40, true), null, 'backwards');

  track.frameAtTime = (station, time) => nominal(station + 2 * time);
  const moving = crossAirborneGate(
    track,
    1000,
    new Vector3(0, 40, 1001.8),
    new Vector3(0, 40, 1002.3),
    1.1,
    0.1,
  );
  assert.ok(Math.abs(moving - (1 + (0.1 * 2) / 3)) < 1e-10);
});

test('an airborne sprint finish credits only ordered, evidenced terminal crossings', () => {
  const direct = createRace(makeTrack(), { laps: 1 });
  direct.step(0, 990, 9.9);
  const pulse = (payload) => [{ type: 'airborne-finish', payload }];
  assert.deepEqual(
    direct.step(990, 990, 0.2, pulse({ from: NaN, time: 10 }), {
      grounded: false,
      time: 10.1,
    }),
    [],
  );
  const events = direct.step(990, 990, 0.2, pulse({ from: 990, time: 10.25 }), {
    grounded: false,
    time: 10.3,
  });
  assert.deepEqual(
    events.map(({ type }) => type),
    ['checkpoint', 'sprint-complete'],
  );
  assert.ok(Math.abs(direct.elapsed - 10.25) < 1e-10);

  const track = makeTrack({ jumps: true });
  track.checkpoints.splice(-2, 1);
  const final = createRace(track, { laps: 1 });
  final.step(0, 200, 2);
  final.step(200, 200, 4);
  const terminal = { from: 200, time: 6.04, receiverTime: 5, jumpId: 'hero' };
  for (const [witness, time] of [
    [{ ...terminal, time: 6.04, jumpId: 'early' }, 6.1],
    [{ ...terminal, time: 6.14, receiverTime: 1 }, 6.2],
  ]) {
    assert.deepEqual(
      final.step(200, 200, 0.1, pulse(witness), { grounded: false, time }),
      [],
    );
    assert.equal(final.checkpoint, 1);
  }
  const completed = final.step(
    200,
    200,
    0.1,
    pulse({ ...terminal, time: 6.24 }),
    {
      grounded: false,
      time: 6.3,
    },
  );
  assert.deepEqual(
    completed.map(({ type }) => type),
    ['checkpoint', 'checkpoint', 'sprint-complete'],
  );
  assert.deepEqual(final.completedTransfers, ['0:hero']);
  assert.equal(final.checkpoint, 3);
  assert.ok(Math.abs(final.splits[1] - 5) < 1e-10);
  assert.ok(Math.abs(final.elapsed - 6.24) < 1e-10);
  assert.equal(final.valid, true);
  assert.deepEqual(
    final.step(200, 200, 0.1, pulse(terminal), { time: 6.4 }),
    [],
  );
});

test('hero flights hold checkpoint credit; recovery costs time; skipping cannot finish', () => {
  const track = makeTrack({ jumps: true });
  for (const outcome of ['landed', 'recovered']) {
    const race = createRace(track);
    race.step(0, 200, 2);
    race.step(200, 200, 5);
    assert.equal(race.checkpoint, 1);
    const to = outcome === 'landed' ? 620 : 850;
    race.step(200, to, dt, [
      {
        type: 'jump-transfer',
        payload: { id: 'hero', from: 200, to, outcome },
      },
    ]);
    assert.equal(race.checkpoint, 2);
    race.step(to, 1000, 4);
    assert.equal(race.complete, true);
    assert.equal(race.valid, true);
    assert.ok(race.elapsed > 11);
  }
  const skip = createRace(track);
  skip.step(0, 200, 2);
  skip.step(200, 1000, 5);
  assert.equal(skip.complete, false);
  assert.equal(skip.valid, false);
  assert.equal(skip.checkpoint, 1);
  const manual = createRace(track);
  manual.step(0, 150, 2);
  assert.equal(manual.recover(), 150);
  assert.equal(manual.valid, false);
});

test('airborne standings advance without granting road distance or a landing checkpoint', () => {
  const track = makeTrack({ jumps: true });
  const state = { ...createVehicleState(), distance: 200 };
  const race = createRace(track);
  race.step(0, 200, 2);
  const progress = presentationDistance(track, state, {
    grounded: false,
    position: new Vector3(0, 80, 400),
  });
  assert.equal(progress, 400);
  assert.equal(state.distance, 200);
  assert.equal(race.checkpoint, 1);
  assert.ok(
    presentationDistance(track, state, {
      grounded: false,
      position: [0, -300, 900],
    }) < 600,
  );
});

test('sprint devices and driver lookahead cannot wrap to a passed launch', () => {
  const track = makeTrack();
  const device = {
    id: 'early',
    type: 'aegis',
    distance: 40,
    lateral: 0,
    width: 20,
    length: 12,
  };
  const previous = { distance: 1530, lateral: 0, speed: 100 },
    current = { ...previous, distance: 1550 };
  assert.equal(
    sweptDeviceCrossings(previous, current, [device], track.length).length,
    1,
  );
  assert.equal(
    sweptDeviceCrossings(previous, current, [device], track.length, false)
      .length,
    0,
  );
  assert.equal(
    sweptVectorContacts(
      previous,
      current,
      [{ ...device, type: 'vector' }],
      track.length,
      false,
    ).length,
    0,
  );
  assert.equal(distanceAhead(track, 1490, 40), -1450);
  assert.equal(distanceAhead({ ...track, closed: true }, 1490, 40), 50);
  const state = { ...createVehicleState(), distance: 1490, speed: 100 };
  assert.deepEqual(
    getRacerControl(state, track),
    getRacerControl(
      state,
      { ...track, jumps: [{ takeoff: 40, targetSpeed: 157 }] },
      { devices: [device] },
    ),
  );
});

test('every ship brakes smoothly inside the supported runout despite held boost/throttle', () => {
  for (const ship of SHIPS) {
    const track = makeTrack(),
      race = createRace(track);
    const state = {
      ...createVehicleState(ship.id),
      distance: 1000,
      speed: 180,
      lateral: 3,
    };
    race.step(0, 1000, 10);
    const runtime = createMagneticRuntime({ track });
    const context = { state, runtime, race, dt, input: throttle, emit() {} };
    advanceSession(context);
    assert.ok(
      state.speed < 180 && state.speed > 178,
      `${ship.id}: smooth first step`,
    );
    for (let tick = 0; tick < 120 * 20; tick++) advanceSession(context);
    assert.equal(state.speed, 0, ship.id);
    assert.ok(
      state.distance > 1100 && state.distance < track.length - 20,
      ship.id,
    );
    assert.equal(race.elapsed, 10);
  }
});

test('authored launch alignment settles actual lateral velocity before long flight', () => {
  for (const ship of SHIPS) {
    const track = makeTrack({ jumps: true });
    track.jumps[0].launchAlignment = 120;
    const runtime = createMagneticRuntime({ track });
    const state = {
      ...createVehicleState(ship.id),
      distance: 80,
      speed: 150,
      lateral: 10,
      heading: -0.06,
      lateralSpeed: -8,
    };
    while (state.distance < 200) {
      runtime.advance(state, getRacerControl(state, track), dt);
    }
    const sideways =
      state.speed * Math.sin(state.heading) + state.lateralSpeed * 0.15;
    assert.ok(Math.abs(sideways) < 1.4, `${ship.id}: ${sideways} m/s at lip`);
    assert.ok(
      Math.abs(state.lateral + sideways * 5) < 17,
      `${ship.id}: keeps a five-second flight within the deck`,
    );
    const airborne = getRacerControl(state, track, {
      runtime: { pose: () => ({ grounded: false }) },
    });
    assert.equal(airborne.steer, 0, 'alignment never steers an airborne craft');
  }
});

for (const difficulty of ['easy', 'medium', 'hard'])
  test(`${difficulty} sprint rivals finish physically once, park, and restore deterministically`, () => {
    const track = makeTrack();
    const racers = createRacers({
      track,
      createRuntime: () => createDeviceRuntime({ track, devices: [] }),
    });
    racers.reset({ enabled: true, difficulty });
    const race = createRace(track),
      state = { ...createVehicleState(), distance: 1000 };
    race.step(0, 1000, 10);
    const context = { playerState: state, playerRace: race };
    racers.advance(dt, context);
    assert.ok(
      racers
        .snapshot(context)
        .standings.filter((entry) => entry.id !== 'player')
        .every((entry) => !entry.finished),
    );
    const saved = racers.serialize();
    const advance = () => {
      const events = [];
      for (let tick = 0; tick < 120 * 35; tick++)
        events.push(...racers.advance(dt, context));
      return events;
    };
    const events = advance();
    assert.equal(
      events.filter((entry) => entry.type === 'racer-complete').length,
      RACE_OPPONENTS.length,
    );
    const results = racers.snapshot(context);
    assert.ok(
      results.standings.every((entry) => entry.finished && entry.valid),
    );
    assert.ok(
      racers.opponents.every(
        ({ state }) =>
          state.speed === 0 && state.distance > 1000 && state.distance < 1480,
      ),
    );
    const expected = racers.serialize();
    racers.restore(saved);
    advance();
    assert.deepEqual(racers.serialize(), expected);
    const wrong = structuredClone(expected);
    wrong.course.finishDistance = 900;
    assert.throws(() => racers.restore(wrong), /mismatch/);
    assert.deepEqual(racers.serialize(), expected);
    racers.reset({ enabled: false });
    const solo = racers.snapshot(context);
    assert.equal(solo.results.playerTotalTime, 10);
    assert.equal(solo.results.standings.length, 1);
    assert.equal(solo.results.standings[0].id, 'player');
    racers.dispose();
  });
