import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import createLevel from '../src/levels/nomad/index.js';
import { createVehicleState, getVehiclePace } from '../src/physics/index.js';
import { createNomadRecovery } from '../src/levels/nomad/recovery.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import { recoverSession } from '../src/core/session-runtime.js';
import { createRace } from '../src/race/index.js';
import { getRacerControl } from '../src/race/racers.js';

const definition = createLevel();
const track = definition.createTrack();
const majors = track.jumps.filter((jump) => jump.bigAir);
const copy = (value) => JSON.parse(JSON.stringify(value));
const DT = 1 / 120;
let collisionWorld, dynamics;
before(async () => {
  collisionWorld = definition.createCollisionWorld({ track });
  dynamics = await definition.createDynamics({ track, collisionWorld });
});
after(() => {
  dynamics?.dispose();
  collisionWorld?.dispose();
});

function positionAlong(jump, progress, time) {
  return track
    .frameAtTime(jump.takeoff, time)
    .position.lerp(
      track.frameAtTime(jump.landingStart, time).position,
      progress,
    );
}
const expectedApproach = (jump) =>
  Math.max(track.carrierAt(jump.takeoff - 1).start + 20, jump.takeoff - 220);

test('major recovery follows current moving receivers, with a real run-up for early misses', () => {
  assert.equal(majors.length, 4);
  for (const jump of majors) {
    assert.equal(jump.recovery, jump.landingStart + 120);
    for (const time of [0, 19]) {
      const policy = createNomadRecovery(track);
      const state = { distance: jump.takeoff, time };
      const flight = { flight: { id: jump.id } };
      const early = policy.manualTarget(state, flight, {
        position: positionAlong(jump, 0.2, time),
      });
      assert.deepEqual(early, { distance: expectedApproach(jump), speed: 100 });
      const late = policy.manualTarget(state, flight, {
        position: positionAlong(jump, 0.9, time),
      });
      assert.equal(late.distance, jump.landingStart + 120);
      assert.equal(late.speed, 100);
      assert.deepEqual(late.transfer, {
        type: 'jump-transfer',
        payload: {
          id: jump.id,
          from: jump.takeoff,
          to: jump.recovery,
          outcome: 'recovered',
        },
      });
      assert.equal(track.carrierAt(late.distance).id, jump.receivingCarrierId);
      // The early/late decision is captured at the miss, before the tumbling
      // ship can drift through the destination during the recovery delay.
      policy.observe(state, [{ type: 'jump-miss', payload: { id: jump.id } }], {
        position: positionAlong(jump, 0.2, time),
      });
      assert.equal(
        policy.manualTarget(state, flight, {
          position: positionAlong(jump, 1.2, time),
        }).distance,
        expectedApproach(jump),
      );
    }
  }
});

test('a real touchdown banks only its carrier, survives manual reset, and restores transactionally', () => {
  const jump = majors[1];
  const policy = createNomadRecovery(track);
  const state = { distance: jump.landingStart + 350, time: 12 };
  const landed = {
    type: 'jump-transfer',
    payload: { id: jump.id, outcome: 'landed' },
  };
  assert.equal(policy.manualTarget(state, { flight: null }), null);
  policy.observe(state, [landed], null);
  assert.equal(policy.snapshot().banked, jump.id);
  const expected = { distance: jump.recovery, speed: 100 };
  assert.deepEqual(policy.manualTarget(state, { flight: null }), expected);
  const roadRecovery = {
    type: 'road-recovery',
    payload: { distance: state.distance },
  };
  assert.deepEqual(policy.observe(state, [roadRecovery], null), expected);
  assert.equal(roadRecovery.payload.distance, jump.recovery);
  const saved = copy(policy.snapshot());
  policy.reset({ preserveBank: true });
  assert.deepEqual(policy.snapshot(), saved);
  assert.throws(
    () => policy.restore({ banked: 'missing-carrier', missed: null }),
    /recovery checkpoint/,
  );
  assert.deepEqual(policy.snapshot(), saved);
  policy.reset();
  assert.equal(policy.manualTarget(state, { flight: null }), null);
  policy.restore(saved);
  assert.deepEqual(policy.manualTarget(state, { flight: null }), expected);
  const elsewhere = { distance: track.carriers.at(-1).end - 40, time: 20 };
  assert.equal(policy.manualTarget(elsewhere, { flight: null }), null);
});

test('ordinary manual recovery retains its checkpoint and invalidates the attempt', () => {
  const state = {
    ...createVehicleState(),
    distance: 60,
    speed: 120,
    time: 8,
    energy: 47,
  };
  const race = createRace(track);
  const time = state.time,
    energy = state.energy;
  assert.deepEqual(recoverSession({ state, runtime: {}, race }), []);
  assert.equal(state.distance, 0);
  assert.equal(state.speed, 0);
  assert.equal(race.valid, false);
  assert.equal(state.time, time);
  assert.equal(state.energy, energy);
});

test('a late manual transfer credits exactly its receiving checkpoint through the device wrapper', () => {
  for (const jump of majors) {
    const policy = createNomadRecovery(track);
    const state = {
      ...createVehicleState(),
      distance: jump.takeoff,
      time: 18,
      energy: 43,
    };
    const motion = {
      id: 'manual-recovery-fixture',
      version: 1,
      rulesId: 'fixture',
      manualRecoveryTarget: () =>
        policy.manualTarget(
          state,
          { flight: { id: jump.id } },
          {
            position: positionAlong(jump, 0.9, state.time),
          },
        ),
      pose: () => ({ grounded: false }),
      dispose() {},
    };
    const runtime = createDeviceRuntime({ track, devices: [], motion });
    try {
      const race = createRace(track);
      // Bookkeeping setup represents the preceding valid part of the course.
      race.placeScenario(jump.takeoff);
      race.valid = true;
      const before = race.checkpoint;
      const events = recoverSession({ state, runtime, race });
      assert.equal(state.distance, jump.recovery);
      assert.equal(state.speed, 100);
      assert.equal(state.time, 18);
      assert.equal(state.energy, 43);
      assert.equal(race.valid, false);
      assert.equal(race.checkpoint, before + 1);
      assert.equal(race.startDistance, jump.landingStart);
      assert.equal(race.complete, false);
      assert.deepEqual(race.completedTransfers, [`0:${jump.id}`]);
      assert.equal(events[0].payload.outcome, 'recovered');
    } finally {
      runtime.dispose();
    }
  }
});

test('an actual Native approach edge fall returns with a full run-up and live forward momentum', () => {
  const jump = majors[0];
  const runtime = definition.createRuntime({ track, collisionWorld, dynamics });
  try {
    dynamics.reset();
    const state = {
      ...createVehicleState(),
      distance: jump.takeoff - 30,
      lateral: track.halfWidthAt(jump.takeoff - 30) + 20,
      speed: 100,
      time: 4,
    };
    runtime.reset({ reason: 'scenario', state });
    let departure = null,
      recovery = null;
    for (let tick = 0; tick < 500 && !recovery; tick++) {
      const events = runtime.advance(
        state,
        { throttle: 0, brake: 0, steer: 0, boost: false },
        DT,
      );
      if (events.some((event) => event.type === 'road-departure'))
        departure ??= state.time;
      if (events.some((event) => event.type === 'road-recovery'))
        recovery = state.time;
    }
    assert.ok(
      departure !== null && recovery !== null,
      'the real edge fall uses normal timed recovery',
    );
    assert.ok(Math.abs(recovery - departure - 1.5) <= DT + 1e-9);
    assert.equal(state.distance, expectedApproach(jump));
    assert.equal(state.speed, 100);
    assert.equal(runtime.pose(1).grounded, true);
    const before = state.distance;
    runtime.advance(
      state,
      { throttle: 1, brake: 0, steer: 0, boost: false },
      DT,
    );
    assert.ok(state.distance > before);
    assert.ok(
      state.speed > 95,
      'the actual Native actor retains the recovery momentum',
    );
  } finally {
    runtime.dispose();
  }
});

test('a real moving-deck touchdown banks recovery before the following grounded tick', () => {
  const jump = majors[0];
  const motion = definition.createRuntime({ track, collisionWorld, dynamics });
  const runtime = createDeviceRuntime({ track, devices: [], motion });
  try {
    dynamics.reset();
    const state = {
      ...createVehicleState(),
      distance: jump.takeoff - 250,
      speed: getVehiclePace('kestrel', track.pace).cruiseSpeed,
      time: 0,
    };
    runtime.reset({ reason: 'scenario', state });
    const race = createRace(track);
    race.placeScenario(state.distance);
    let landed = false;
    for (let tick = 0; tick < 1800 && !landed; tick++) {
      const before = state.distance;
      const input = getRacerControl(state, track, {
        difficulty: 'easy',
        devices: [],
        runtime,
      });
      const events = runtime.advance(state, input, DT);
      race.step(before, state.distance, DT, events, {
        grounded: runtime.pose(1).grounded,
      });
      assert.ok(
        !events.some((event) =>
          ['jump-miss', 'road-recovery'].includes(event.type),
        ),
        'ordinary production controls make the intended physical landing',
      );
      landed = events.some(
        (event) =>
          event.type === 'jump-transfer' && event.payload.outcome === 'landed',
      );
    }
    assert.equal(landed, true);
    assert.equal(motion.snapshot().recovery.banked, jump.id);
    assert.equal(race.startDistance, jump.landingStart);
    recoverSession({ state, runtime, race });
    runtime.reset({ reason: 'manual-recover', state });
    assert.equal(state.distance, jump.recovery);
    assert.equal(state.speed, 100);
    assert.equal(motion.snapshot().recovery.banked, jump.id);
    assert.equal(track.carrierAt(state.distance).id, jump.receivingCarrierId);
    assert.equal(runtime.pose(1).grounded, true);
  } finally {
    runtime.dispose();
  }
});
