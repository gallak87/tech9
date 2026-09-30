import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createVehicleState, stepVehicle } from '../src/physics/index.js';
import { createFlightModel } from '../src/physics/flight.js';
import { createRace } from '../src/race/index.js';
import {
  advanceSession,
  compatibleRuntime,
} from '../src/core/session-runtime.js';

const DT = 1 / 120;
const identity = {
  id: 'expansion-fixture',
  version: 1,
  rulesId: 'fixture-flight-v1',
};
function course(optional = false) {
  return {
    id: 'expansion-fixture',
    length: 1000,
    width: 40,
    checkpoints: [0, 50, 160, 400, 700].map((distance) => ({ distance })),
    scenarios: {},
    jumps: [
      {
        id: 'fracture',
        takeoff: 100,
        landingStart: 160,
        landingEnd: 260,
        recovery: 280,
        halfWidth: 20,
        optional,
      },
    ],
    sample(s) {
      return {
        position: new THREE.Vector3(0, s >= 160 ? -10 : 0, s),
        tangent: new THREE.Vector3(0, 0, 1),
        right: new THREE.Vector3(1, 0, 0),
        up: new THREE.Vector3(0, 1, 0),
        quaternion: new THREE.Quaternion(),
        curvature: 0,
        bank: 0,
      };
    },
  };
}
function runtime(track, options = {}, rules = {}) {
  return createFlightModel(rules).createRuntime(
    { track },
    { ...identity, ...options },
  );
}
function run(adapter, track, initial = {}) {
  const state = {
    ...createVehicleState(),
    distance: 99.5,
    speed: 100,
    ...initial,
  };
  const race = createRace(track);
  race.step(0, state.distance, 0);
  const events = [];
  for (let i = 0; i < 1200; i++) {
    advanceSession({
      state,
      input: { throttle: 1 },
      dt: DT,
      runtime: adapter,
      race,
      emit: (e) => events.push(e),
    });
    if (events.some((e) => e.type === 'jump-transfer') || state.distance > 300)
      break;
  }
  return { state, race, events };
}

test('shared flight lands on a non-Nacre receiving road and awards its one ordered checkpoint', () => {
  const track = course(),
    adapter = runtime(track);
  const { state, race, events } = run(adapter, track);
  const transfer = events.find((e) => e.type === 'jump-transfer');
  assert.equal(transfer.payload.outcome, 'landed');
  assert.ok(state.distance > 180 && state.distance < 220);
  assert.equal(race.valid, true);
  assert.equal(race.checkpoint, 2);
  assert.equal(events.filter((e) => e.type === 'checkpoint').length, 1);
  assert.equal(state.resetCount, 0);
  adapter.dispose();
  adapter.dispose();
});

test('optional bypass selects only the authored lateral lane; supported main road stays timed', () => {
  const track = course(true);
  for (const lateral of [-7, 7]) {
    const adapter = runtime(track, {
      shouldLaunch: ({ state }) => state.lateral < -4,
    });
    const result = run(adapter, track, { lateral });
    assert.equal(
      result.events.some((e) => e.type === 'jump-launch'),
      lateral < 0,
    );
    assert.equal(result.race.valid, true);
    assert.equal(result.race.checkpoint, 2);
  }
});

test('mandatory jump cannot be disabled by an optional-lane predicate', () => {
  const track = course();
  assert.ok(
    run(runtime(track, { shouldLaunch: () => false }), track).events.some(
      (e) => e.type === 'jump-launch',
    ),
  );
});

test('failed launch includes timed recovery and reset clears all flight state', () => {
  const track = course(),
    adapter = runtime(track);
  const result = run(adapter, track, { speed: 25 });
  assert.equal(
    result.events.find((e) => e.type === 'jump-transfer').payload.outcome,
    'recovered',
  );
  assert.equal(result.state.distance, 280);
  assert.equal(result.race.valid, true);
  assert.ok(result.race.elapsed > 1.5);
  adapter.reset({ reason: 'manual-recover', seed: 11 });
  assert.equal(adapter.snapshot().mode, 'magnetic');
  assert.equal(adapter.snapshot().flight, null);
  assert.equal(adapter.pose(), null);
});

test('world force bends airborne motion and snapshot/restore replays the same continuation', () => {
  const track = course();
  const options = { airAcceleration: () => new THREE.Vector3(5, 0, 0) };
  const a = runtime(track, options),
    b = runtime(track, options),
    plain = runtime(track);
  const state = { ...createVehicleState(), distance: 99.5, speed: 100 };
  const control = { ...state };
  for (let i = 0; i < 35; i++) {
    a.advance(state, {}, DT);
    plain.advance(control, {}, DT);
  }
  assert.ok(a.pose().position.x > plain.pose().position.x + 0.15);
  b.restore(JSON.parse(JSON.stringify(a.snapshot())));
  const restored = { ...state };
  for (let i = 0; i < 180; i++)
    assert.deepEqual(a.advance(state, {}, DT), b.advance(restored, {}, DT));
  assert.deepEqual(state, restored);
  assert.deepEqual(a.snapshot(), b.snapshot());
  assert.equal(compatibleRuntime(a, { ...identity, rulesId: 'other' }), false);
});

test('zero dt freezes force/flight and bad force vectors fail explicitly', () => {
  const track = course(),
    a = runtime(track, { airAcceleration: () => new THREE.Vector3(NaN, 0, 0) });
  const s = { ...createVehicleState(), distance: 99.5, speed: 100 };
  const before = a.snapshot();
  assert.deepEqual(a.advance(s, {}, 0), []);
  assert.deepEqual(a.snapshot(), before);
  assert.throws(() => a.advance(s, {}, DT), /finite world vector/);
});

test('sap drag, frost grip, tidal pull and heat power loss are opt-in per call', () => {
  const track = course();
  track.jumps = [];
  const simulate = (surface) => {
    const s = { ...createVehicleState(), speed: 90, lateralSpeed: 8 };
    for (let i = 0; i < 60; i++)
      stepVehicle(s, { throttle: 1 }, track, DT, { surface });
    return s;
  };
  const plain = simulate();
  assert.deepEqual(simulate({}), plain);
  assert.ok(simulate({ drag: 4 }).speed < plain.speed - 1.7);
  assert.ok(simulate({ grip: 0.25 }).lateral > plain.lateral + 1.4);
  assert.ok(
    simulate({ lateralAcceleration: 12 }).lateral > plain.lateral + 0.5,
  );
  assert.ok(simulate({ thrustScale: 0.4 }).speed < plain.speed - 5);
  assert.deepEqual(simulate({ grip: NaN, drag: NaN, thrustScale: NaN }), plain);
  const parking = createVehicleState();
  for (let i = 0; i < 120; i++)
    stepVehicle(parking, {}, track, DT, { surface: { grip: 0.25, drag: 4 } });
  assert.equal(parking.speed, 0);
  assert.equal(parking.lateral, 0);
});

test('ground callbacks leave flight time and baseline reserve accounting intact', () => {
  const track = course();
  track.jumps = [];
  const a = runtime(track, { groundOptions: () => ({ surface: { drag: 3 } }) });
  const state = { ...createVehicleState(), speed: 90 };
  const expected = { ...state };
  for (let i = 0; i < 120; i++) {
    a.advance(state, { throttle: 1, boost: true }, DT);
    stepVehicle(expected, { throttle: 1, boost: true }, track, DT, {
      surface: { drag: 3 },
    });
  }
  assert.deepEqual(state, expected);
});

test('invalid flight rules, optional selector and missing landing checkpoint reject early', () => {
  assert.throws(() => createFlightModel({ step: 0 }), /positive/);
  assert.throws(
    () => createFlightModel({ gravity: NaN }),
    /Invalid flight rule/,
  );
  assert.throws(() => runtime(course(true)), /shouldLaunch/);
  const track = course();
  track.checkpoints[2].distance = 170;
  assert.throws(() => runtime(track), /checkpoint at landingStart/);
});

test('authored eruption impulse changes launch velocity once and is deterministic', () => {
  const track = course();
  let calls = 0;
  const adapter = runtime(track, {
    launchImpulse: () => {
      calls++;
      return new THREE.Vector3(0, 4, 0);
    },
  });
  const plain = runtime(track);
  const state = { ...createVehicleState(), distance: 99.5, speed: 100 };
  const baseline = { ...state };
  for (let i = 0; i < 10; i++) {
    adapter.advance(state, {}, DT);
    plain.advance(baseline, {}, DT);
  }
  assert.equal(calls, 1);
  assert.ok(
    Math.abs(
      adapter.snapshot().flight.velocity[1] -
        plain.snapshot().flight.velocity[1] -
        4,
    ) < 1e-9,
  );
  const restored = runtime(track);
  restored.restore(adapter.snapshot());
  assert.deepEqual(restored.snapshot(), adapter.snapshot());
});

test('split-deck bounds contain grounded hulls at inner divider with accurate impact contact', () => {
  const track = course();
  track.jumps = [];
  const options = { roadBounds: { min: -20, max: 5.5 } };
  const state = {
    ...createVehicleState(),
    speed: 95,
    lateral: 3,
    lateralSpeed: 15,
  };
  const events = [];
  for (let i = 0; i < 120; i++) {
    events.push(
      ...stepVehicle(state, { throttle: 1, steer: -1 }, track, DT, options),
    );
    assert.ok(state.lateral <= 5.5 - 2.25 + 1e-8);
  }
  const impact = events.find((e) => e.type === 'impact');
  assert.equal(impact.payload.railLateral, 5.5);
  assert.equal(impact.payload.side, 1);
  assert.ok(state.energy < 100);
  const baseline = {
    ...createVehicleState(),
    speed: 95,
    lateral: 3,
    lateralSpeed: 15,
  };
  const full = { ...baseline };
  for (let i = 0; i < 100; i++) {
    stepVehicle(baseline, { throttle: 1, steer: -1 }, track, DT);
    stepVehicle(full, { throttle: 1, steer: -1 }, track, DT, {
      roadBounds: { min: -20, max: 20 },
    });
  }
  assert.deepEqual(full, baseline);
});

test('mirrored split-deck divider catches driver-right movement', () => {
  const track = course();
  track.jumps = [];
  const state = {
    ...createVehicleState(),
    speed: 95,
    lateral: -3,
    lateralSpeed: -15,
  };
  const events = stepVehicle(state, { steer: 1 }, track, 0.1, {
    roadBounds: { min: -5.5, max: 20 },
  });
  assert.ok(state.lateral >= -5.5 + 2.25 - 1e-8);
  assert.equal(
    events.find((e) => e.type === 'impact').payload.railLateral,
    -5.5,
  );
});

test('curved receiving surface catches a real crossing between cached tangent planes', () => {
  const track = course(),
    jump = track.jumps[0];
  track.sample = (s) => {
    const slope = 0.05 * (s - 201);
    const tangent = new THREE.Vector3(0, slope, 1).normalize();
    const right = new THREE.Vector3(1, 0, 0);
    const up = tangent.clone().cross(right);
    return {
      position: new THREE.Vector3(0, 0.025 * (s - 201) ** 2, s),
      tangent,
      right,
      up,
      quaternion: new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(right, up, tangent),
      ),
    };
  };
  const before = {
    position: new THREE.Vector3(0, 0.721, 201),
    quaternion: new THREE.Quaternion(),
  };
  const after = {
    position: new THREE.Vector3(0, 0.719, 201.05),
    quaternion: new THREE.Quaternion(),
  };
  const velocity = new THREE.Vector3(0, -0.24, 6);
  assert.equal(
    createFlightModel({ curvedContact: false }).sweptLanding(
      track,
      jump,
      before,
      after,
      velocity,
    ),
    null,
    'cached plane sweep alone misses the true sampled-surface crossing',
  );
  const model = createFlightModel();
  const hit = model.sweptLanding(track, jump, before, after, velocity);
  assert.ok(hit && hit.fraction > 0 && hit.fraction < 1);
  assert.ok(hit.distance >= 201 && hit.distance <= 201.05);
  assert.equal(
    model.sweptLanding(track, jump, after, before, velocity.clone().negate()),
    null,
    'never relatch upward through underside',
  );
  const below = {
    ...before,
    position: before.position.clone().add(new THREE.Vector3(0, -2, 0)),
  };
  assert.equal(model.sweptLanding(track, jump, below, after, velocity), null);
});

test('a descending deck hit resolves before a later side-rail hit in the same tick', () => {
  const track = course();
  const results = [];
  for (const curvedContact of [false, true]) {
    const adapter = runtime(track, {}, { curvedContact });
    const state = { ...createVehicleState(), distance: 99.5, speed: 100 };
    adapter.advance(state, {}, DT);
    const snapshot = adapter.snapshot();
    snapshot.currentPose = {
      position: [16.5, -9, 200],
      quaternion: [0, 0, 0, 1],
    };
    snapshot.previousPose = structuredClone(snapshot.currentPose);
    snapshot.flight.velocity = [180, -60, 100];
    adapter.restore(snapshot);
    results.push(adapter.advance(state, {}, DT));
  }
  assert.equal(
    results[0].some((e) => e.type === 'jump-transfer'),
    false,
    'legacy rail-first ordering loses this earlier floor contact',
  );
  assert.equal(
    results[1].find((e) => e.type === 'jump-transfer')?.payload.outcome,
    'landed',
  );
  assert.equal(
    results[1].some((e) => e.type === 'impact'),
    false,
    'a rail beyond the first supported floor contact cannot hit the airborne hull',
  );
});
