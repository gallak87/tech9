import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { createTrack } from '../levels/halcyon/track/index.js';
import { createVehicleState, stepVehicle, STEERING_ASSIST } from './index.js';

const idle = {
  throttle: 0,
  brake: 0,
  steer: 0,
  boost: false,
  airbrake: false,
};
const tick = 1 / 120;
const actualTrack = createTrack();
const signatureScenarios = [
  'signature-entry',
  'signature-inverted',
  'signature-drop',
  'signature-exit',
];
function plane(grade = 0, bank = 0, curvature = 0) {
  const tangent = new Vector3(0, Math.sin(grade), Math.cos(grade));
  const rotation = new Quaternion().setFromAxisAngle(tangent, bank);
  const right = new Vector3(1, 0, 0).applyQuaternion(rotation);
  const up = new Vector3().crossVectors(tangent, right);
  const quaternion = new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(right, up, tangent),
  );
  return {
    length: 100000,
    width: 24,
    sample: (distance = 0) => ({
      position: tangent.clone().multiplyScalar(distance),
      tangent,
      right,
      up,
      quaternion,
      curvature,
      bank,
    }),
  };
}
const flat = plane();
function bend(radius = 300, bank = 0) {
  return {
    length: 2 * Math.PI * radius,
    width: 2000,
    sample(distance) {
      const yaw = distance / radius;
      const tangent = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      right.applyAxisAngle(tangent, bank);
      const up = new Vector3().crossVectors(tangent, right);
      return {
        position: new Vector3(
          radius * (1 - Math.cos(yaw)),
          0,
          radius * Math.sin(yaw),
        ),
        tangent,
        right,
        up,
        bank,
        curvature: Math.cos(bank) / radius,
      };
    },
  };
}
function advance(state, input, seconds, track = flat, dt = tick, options) {
  const events = [];
  for (let index = 0; index < Math.round(seconds / dt); index++) {
    const controls = typeof input === 'function' ? input(state, track) : input;
    events.push(
      ...stepVehicle(state, { ...idle, ...controls }, track, dt, options),
    );
  }
  return events;
}
function assertFinite(state) {
  for (const [name, value] of Object.entries(state))
    if (typeof value === 'number')
      assert.ok(Number.isFinite(value), `${name} must remain finite`);
}

test('assist controls actual world yaw over a sustained bend, with 0.3 as the default', () => {
  assert.equal(STEERING_ASSIST, 0.3);
  for (const bank of [0, Math.PI]) {
    const road = bend(300, bank);
    for (const steeringAssist of [0, 0.3, 1]) {
      const state = { ...createVehicleState(), speed: 80 };
      advance(state, { throttle: 1 }, 3, road, tick, { steeringAssist });
      const frame = road.sample(state.distance);
      const forward = frame.tangent
        .clone()
        .multiplyScalar(Math.cos(state.heading))
        .addScaledVector(frame.right, Math.sin(state.heading));
      const worldYaw = Math.atan2(forward.x, forward.z);
      const roadYaw = state.distance / 300;
      assert.ok(roadYaw > 0.6, 'must exercise a sustained material bend');
      assert.ok(Math.abs(worldYaw - roadYaw * steeringAssist) < 1e-9);
    }
  }
});

test('reduced assist retains manual yaw authority; full assist reproduces prior response', () => {
  const road = { ...flat, width: 2000 };
  for (const steer of [-1, 1]) {
    const legacy = { ...createVehicleState(), speed: 80 };
    advance(legacy, { throttle: 1, steer }, 0.2, road, tick, {
      steeringAssist: 1,
    });
    const expected = -steer * 0.18 * (1 - Math.exp(-8.5 * 0.2));
    assert.ok(Math.abs(legacy.heading - expected) < 1e-12);
    for (const steeringAssist of [0, STEERING_ASSIST]) {
      const manual = { ...createVehicleState(), speed: 80 };
      advance(manual, { throttle: 1, steer }, 0.2, road, tick, {
        steeringAssist,
      });
      assert.ok(manual.heading * steer < 0);
      assert.ok(Math.abs(manual.heading) > Math.abs(legacy.heading));
      const persistent = manual.heading - manual.steeringHeading;
      advance(manual, { throttle: 1 }, 1, road, tick, { steeringAssist });
      assert.ok(
        Math.abs(manual.heading - manual.steeringHeading - persistent) < 1e-12,
      );
    }
  }
});

// This tests driver-visible direction through a real perspective projection,
// rather than blessing a local lateral sign that is reversed in a +Z view.
test('driver right projects right, and left projects left, across real track frames', () => {
  const distances = [
    ...[0, 0.18, 0.27, 0.53, 0.86].map(
      (fraction) => actualTrack.length * fraction,
    ),
    ...signatureScenarios.map((name) => actualTrack.scenarios[name].distance),
  ];
  for (const distance of distances) {
    const frame = actualTrack.sample(distance);
    const camera = new PerspectiveCamera(65, 16 / 9, 0.1, 2000);
    camera.position
      .copy(frame.position)
      .addScaledVector(frame.tangent, -15)
      .addScaledVector(frame.up, 6);
    camera.up.copy(frame.up);
    camera.lookAt(frame.position.clone().addScaledVector(frame.tangent, 20));
    camera.updateMatrixWorld();
    const positions = [-1, 0, 1].map((steer) => {
      const state = { ...createVehicleState(), distance, speed: 80 };
      advance(state, { throttle: 1, steer }, 0.15, actualTrack);
      const nextFrame = actualTrack.sample(state.distance);
      return nextFrame.position
        .clone()
        .addScaledVector(nextFrame.right, state.lateral)
        .addScaledVector(nextFrame.up, 1.5)
        .project(camera).x;
    });
    assert.ok(positions[0] < positions[1], `left at ${distance}`);
    assert.ok(positions[2] > positions[1], `right at ${distance}`);
  }
});

test('actual inverted run and steep drop hold at rest, then release cleanly under throttle', () => {
  const inverted = actualTrack.sample(
    actualTrack.scenarios['inverted-rest'].distance,
  );
  const drop = actualTrack.sample(
    actualTrack.scenarios['signature-drop'].distance,
  );
  assert.ok(inverted.up.y < -0.98, 'must test the actual full inversion');
  assert.ok(drop.tangent.y < -Math.sin(Math.PI / 3), 'must test a >60° drop');
  for (const name of signatureScenarios) {
    const distance = actualTrack.scenarios[name].distance;
    const state = { ...createVehicleState(), distance };
    advance(state, { steer: 1 }, 2, actualTrack);
    assert.equal(state.distance, distance);
    assert.equal(state.lateral, 0);
    assert.equal(state.speed, 0);
    assert.equal(state.lateralSpeed, 0);
    stepVehicle(state, { ...idle, throttle: 1 }, actualTrack, tick);
    assert.ok(state.distance > distance);
    assert.ok(state.speed > 0);
    assertFinite(state);
  }
});

test('actual signature segments sustain manually steered boost and brake to a held stop', () => {
  for (const name of signatureScenarios) {
    const scenario = actualTrack.scenarios[name];
    const steerThroughBend = (state, track) =>
      Math.max(
        -1,
        Math.min(
          1,
          (-track.sample(state.distance).curvature * state.speed) / 1.5,
        ),
      );
    const moving = { ...createVehicleState(), ...scenario, speed: 110 };
    const movingEvents = advance(
      moving,
      (state, track) => ({
        throttle: 1,
        boost: true,
        steer: steerThroughBend(state, track),
      }),
      1,
      actualTrack,
    );
    assert.ok(moving.speed > 110);
    assert.equal(moving.boosting, true);
    assert.equal(
      movingEvents.filter((event) => event.type === 'impact').length,
      0,
    );
    assertFinite(moving);

    const braking = {
      ...createVehicleState(),
      ...scenario,
      speed: 157,
      boosting: true,
    };
    const brakingEvents = advance(
      braking,
      (state, track) => ({
        brake: 1,
        boost: true,
        steer: steerThroughBend(state, track),
      }),
      3,
      actualTrack,
    );
    assert.equal(braking.speed, 0);
    assert.equal(braking.lateralSpeed, 0);
    assert.equal(braking.boosting, false);
    assert.equal(
      brakingEvents.filter((event) => event.type === 'impact').length,
      0,
    );
    const stopped = { distance: braking.distance, lateral: braking.lateral };
    advance(braking, {}, 1, actualTrack);
    assert.equal(braking.distance, stopped.distance);
    assert.equal(braking.lateral, stopped.lateral);
    assertFinite(braking);
  }
});

test('stationary hover holds position on every bank and grade, even with steering', () => {
  for (const grade of [-Math.PI / 2, -0.6, 0, 0.6, Math.PI / 2])
    for (const bank of [-0.8, 0, 0.8, Math.PI / 2, Math.PI, Math.PI * 1.5])
      for (const steer of [-1, 0, 1]) {
        const state = { ...createVehicleState(), distance: 123, lateral: 2 };
        advance(state, { steer }, 3, plane(grade, bank));
        assert.equal(state.distance, 123);
        assert.equal(state.lateral, 2);
        assert.equal(state.speed, 0);
        assert.equal(state.lateralSpeed, 0);
        assert.ok(Math.abs(state.heading) <= 0.18 * STEERING_ASSIST + 1e-12);
      }
});

test('driver steering stays screen-correct through inverted and vertical surface frames', () => {
  for (const grade of [-Math.PI / 2, -1.2, 0, Math.PI / 2])
    for (const bank of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const road = plane(grade, bank);
      const frame = road.sample();
      const camera = new PerspectiveCamera(65, 16 / 9, 0.1, 2000);
      camera.position
        .copy(frame.position)
        .addScaledVector(frame.tangent, -15)
        .addScaledVector(frame.up, 6);
      camera.up.copy(frame.up);
      camera.lookAt(frame.position.clone().addScaledVector(frame.tangent, 20));
      camera.updateMatrixWorld();
      const projections = [-1, 0, 1].map((steer) => {
        const state = { ...createVehicleState(), speed: 80 };
        advance(state, { throttle: 1, steer }, 0.15, road);
        assertFinite(state);
        const next = road.sample(state.distance);
        return next.position
          .addScaledVector(next.right, state.lateral)
          .addScaledVector(next.up, 1.5)
          .project(camera).x;
      });
      assert.ok(projections[0] < projections[1]);
      assert.ok(projections[2] > projections[1]);
    }
});

test('vertical grade receives signed world gravity while magnetic adhesion holds normal motion', () => {
  const states = [-Math.PI / 2, 0, Math.PI / 2].map((grade) => {
    const state = { ...createVehicleState(), speed: 60 };
    stepVehicle(state, { ...idle, throttle: 1 }, plane(grade, Math.PI), tick);
    assertFinite(state);
    assert.ok(Math.abs(state.lateral) < 1e-12);
    return state;
  });
  assert.ok(Math.abs(states[0].speed - states[1].speed - 9.81 * tick) < 1e-12);
  assert.ok(Math.abs(states[2].speed - states[1].speed + 9.81 * tick) < 1e-12);

  const upsideDown = createVehicleState();
  const upright = createVehicleState();
  advance(upsideDown, { throttle: 1, boost: true }, 4, plane(0, Math.PI));
  advance(upright, { throttle: 1, boost: true }, 4, flat);
  assert.equal(upsideDown.speed, upright.speed);
  assert.equal(upsideDown.distance, upright.distance);
  assert.equal(upsideDown.energy, upright.energy);
  assert.ok(Math.abs(upsideDown.lateral) < 1e-12);
});

test('braking arrests steep inverted descents and parked steering cannot restart motion', () => {
  for (const bank of [Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const road = plane((-70 * Math.PI) / 180, bank);
    const state = { ...createVehicleState(), speed: 157, lateralSpeed: -3 };
    advance(state, { brake: 1, boost: true }, 3, road);
    assert.equal(state.boosting, false);
    assert.equal(state.speed, 0);
    assert.equal(state.lateralSpeed, 0);
    const stopped = { distance: state.distance, lateral: state.lateral };
    advance(state, { steer: 1 }, 2, road);
    assert.equal(state.distance, stopped.distance);
    assert.equal(state.lateral, stopped.lateral);
  }
});

test('gravity pulls sideways downhill on both sides of full inversion', () => {
  for (const bank of [Math.PI - 0.5, Math.PI + 0.5]) {
    const road = plane(-1.1, bank);
    const state = { ...createVehicleState(), speed: 40 };
    advance(state, {}, 0.25, road);
    assert.ok(state.lateralSpeed * road.sample().right.y < 0);
    assert.ok(state.lateral * road.sample().right.y < 0);
  }
});

test('recovered rest state remains parked at real bank and elevation samples', () => {
  for (let index = 0; index < 32; index++) {
    const distance = (index * actualTrack.length) / 32;
    const state = { ...createVehicleState(), distance, resetCount: 1 };
    advance(state, {}, 0.5, actualTrack);
    assert.equal(state.distance, distance);
    assert.equal(state.lateral, 0);
    assert.equal(state.speed, 0);
  }
});

test('throttle releases parking; gravity sends moving bank slip downhill', () => {
  for (const bank of [-0.7, 0.7]) {
    const road = plane(0, bank);
    const state = createVehicleState();
    advance(state, { throttle: 1 }, 0.25, road);
    assert.ok(state.distance > 0 && state.speed > 0);
    assert.ok(state.lateral * road.sample().right.y < 0);
  }
});

test('actual track frame gravity projects downhill rather than following bank metadata', () => {
  let frame = actualTrack.sample(0);
  for (let index = 0; index < 360; index++) {
    const candidate = actualTrack.sample((index * actualTrack.length) / 360);
    if (Math.abs(candidate.right.y) > Math.abs(frame.right.y))
      frame = candidate;
  }
  assert.ok(Math.abs(frame.right.y) > 0.4, 'test must exercise a steep bank');
  const road = {
    ...flat,
    sample: () => ({ ...frame, curvature: 0, bank: -frame.bank }),
  };
  const state = { ...createVehicleState(), speed: 30 };
  advance(state, {}, 0.2, road);
  assert.ok(state.lateralSpeed * frame.right.y < 0);
});

test('climbing requires propulsion and descent adds speed relative to the same controls', () => {
  const uphill = { ...createVehicleState(), speed: 70 };
  const level = { ...uphill };
  const downhill = { ...uphill };
  advance(uphill, { throttle: 1 }, 2, plane(0.25));
  advance(level, { throttle: 1 }, 2);
  advance(downhill, { throttle: 1 }, 2, plane(-0.25));
  assert.ok(uphill.speed < level.speed - 1);
  assert.ok(downhill.speed > level.speed + 1);
  assert.ok(uphill.distance < level.distance);
  assert.ok(downhill.distance > level.distance);
});

test('braking comes to a held stop without reverse motion or residual bank creep', () => {
  const road = plane(0.2, -0.7);
  const state = { ...createVehicleState(), speed: 35, lateralSpeed: 3 };
  let lastDistance = 0;
  for (let index = 0; index < 240; index++) {
    stepVehicle(state, { ...idle, brake: 1 }, road, tick);
    assert.ok(state.distance >= lastDistance);
    lastDistance = state.distance;
  }
  assert.equal(state.speed, 0);
  assert.equal(state.lateralSpeed, 0);
  const stopped = { distance: state.distance, lateral: state.lateral };
  advance(state, {}, 10, road);
  assert.equal(state.distance, stopped.distance);
  assert.equal(state.lateral, stopped.lateral);
});

test('boost release removes thrust smoothly and braking overrides a held boost', () => {
  const boosted = { ...createVehicleState(), speed: 110 };
  advance(boosted, { throttle: 1, boost: true }, 3);
  assert.ok(boosted.speed > 140);
  const before = boosted.speed;
  const events = stepVehicle(boosted, { ...idle, throttle: 1 }, flat, tick);
  assert.ok(boosted.speed > 112 && before - boosted.speed < 1);
  assert.deepEqual(events, [{ type: 'boost', payload: { active: false } }]);
  const coasting = { ...boosted };
  advance(coasting, {}, 0.5);
  advance(boosted, { throttle: 1, boost: true, brake: 1 }, 0.5);
  assert.equal(boosted.boosting, false);
  assert.ok(boosted.speed < coasting.speed - 20);
});

test('exhausted held boost recharges with hysteresis rather than chattering each tick', () => {
  const state = { ...createVehicleState(), speed: 100, energy: 13 };
  const events = advance(state, { throttle: 1, boost: true }, 2);
  assert.equal(events.filter((event) => event.type === 'boost').length, 2);
  assert.equal(state.boosting, false);
  assert.ok(state.energy > 0 && state.energy < 12);
});

test('airbrake increases yaw authority and counter-steering recovers lateral momentum', () => {
  const road = { ...flat, width: 2000 };
  const normal = { ...createVehicleState(), speed: 90 };
  const slip = { ...normal };
  advance(normal, { throttle: 1, steer: 1 }, 0.35, road);
  advance(slip, { throttle: 1, steer: 1, airbrake: true }, 0.35, road);
  assert.ok(Math.abs(slip.heading) > Math.abs(normal.heading));
  assert.ok(slip.speed < normal.speed);
  const beforeRelease = slip.lateralSpeed;
  stepVehicle(slip, { ...idle, throttle: 1 }, road, tick);
  assert.ok(Math.abs(slip.lateralSpeed - beforeRelease) < 2);
  assert.ok(slip.lateralSpeed < 0, 'release must preserve lateral momentum');
  advance(slip, { throttle: 1 }, 0.8, road);
  assert.ok(Math.abs(slip.steeringHeading) < 0.001);
  assert.ok(
    slip.heading < -0.4,
    'release must not automatically recenter persistent yaw',
  );
  advance(slip, { throttle: 1, steer: -1, airbrake: true }, 0.35, road);
  advance(slip, { throttle: 1 }, 0.8, road);
  assert.ok(Math.abs(slip.heading) < 0.001);
  assert.ok(Math.abs(slip.lateralSpeed) < 1);
});

test('swept rails and contact cooldown work in flat, inverted and vertical frames', () => {
  for (const road of [flat, plane(-1.2, Math.PI), plane(Math.PI / 2)])
    for (const side of [-1, 1]) {
      const state = {
        ...createVehicleState(),
        speed: 100,
        lateral: side * 9,
        lateralSpeed: side * 120,
        heading: side * 0.2,
      };
      const initial = stepVehicle(state, idle, road, tick);
      assert.equal(
        initial.filter((event) => event.type === 'impact').length,
        1,
      );
      assert.ok(Math.abs(state.lateral) < 9.75);
      assert.ok(state.lateralSpeed * side < 0);
      assert.ok(state.speed < 90 && state.energy < 90);
      const repeated = advance(state, { throttle: 1, steer: -side }, 0.1, road);
      assert.equal(
        repeated.filter((event) => event.type === 'impact').length,
        0,
      );
      assert.ok(Math.abs(state.lateral) <= 9.75);
    }
});

test('large finite and nonfinite controls cannot poison the simulation', () => {
  const state = createVehicleState();
  for (const input of [
    { throttle: 1e300, steer: -1e300 },
    { throttle: Infinity, steer: NaN, brake: -Infinity },
    { throttle: 1e300, brake: 1e300, steer: 1e300, boost: true },
    {},
  ]) {
    advance(state, input, 2, actualTrack);
    assertFinite(state);
    assert.ok(state.speed >= 0 && state.speed < 160);
    assert.ok(state.energy >= 0 && state.energy <= 100);
    assert.ok(Math.abs(state.lateral) <= actualTrack.width / 2 - 2.25);
  }
  const before = { ...state };
  for (const dt of [NaN, Infinity, -1, 0])
    assert.deepEqual(stepVehicle(state, idle, actualTrack, dt), []);
  assert.deepEqual(state, before);
});

test('60Hz and 120Hz calls agree when controls change on common tick boundaries', () => {
  const at60 = createVehicleState();
  const at120 = createVehicleState();
  const controls = [
    { throttle: 1 },
    { throttle: 1, steer: 0.2 },
    { throttle: 1, boost: true },
    { brake: 0.7, steer: -0.2 },
    {},
  ];
  for (const input of controls) {
    advance(at60, input, 1, actualTrack, 1 / 60);
    advance(at120, input, 1, actualTrack);
  }
  assert.deepEqual(at60, at120);
});

test('recorded tick controls reproduce all vehicle fields and events exactly', () => {
  const inputs = Array.from({ length: 1800 }, (_, index) => ({
    ...idle,
    throttle: index < 1500 ? 1 : 0,
    steer: index % 240 < 120 ? 0.17 : -0.17,
    boost: index > 600 && index < 900,
    brake: index >= 1500 ? 1 : 0,
    airbrake: index > 1200 && index < 1300,
  }));
  const run = () => {
    const state = createVehicleState();
    const events = inputs.flatMap((input) =>
      stepVehicle(state, input, actualTrack, tick),
    );
    return { state, events };
  };
  assert.deepEqual(run(), run());
});
