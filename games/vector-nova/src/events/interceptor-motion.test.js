import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import { createInterceptorMotion } from './interceptor-motion.js';
import { createInterceptorField } from './interceptor-field.js';
import { createInterceptorTrack } from '../levels/interceptor/track/model.js';
import { createRapierWorld } from '../physics/rapier-world.js';
import { withMagneticBoundaries } from '../physics/magnetic-boundaries.js';
import { createVehicleState } from '../physics/index.js';
import { createCombatSimulation } from '../pickups/combat.js';
import { createInterceptorEvent } from './interceptor.js';
import { createDeviceRuntime } from '../pickups/runtime.js';

const DT = 1 / 120;
const smooth = (value) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
const facingAt = (time) =>
  time < 2
    ? Math.PI * smooth(time / 2)
    : time < 4
      ? Math.PI
      : Math.PI * (1 - smooth((time - 4) / 2));
const straight = {
  id: 'courier-facing-road',
  length: 5000,
  width: 44,
  closed: true,
  sample(distance) {
    return {
      position: new Vector3(0, 0, distance),
      tangent: new Vector3(0, 0, 1),
      right: new Vector3(1, 0, 0),
      up: new Vector3(0, 1, 0),
      quaternion: new Quaternion(),
      curvature: 0,
      bank: 0,
    };
  },
};
const stateFor = () => ({
  ...createVehicleState('bastion'),
  chassisId: 'goliath',
  distance: 240,
  speed: 300 / 3.6,
});

const field = createInterceptorField();
function step(
  runtime,
  state,
  input = field.control({
    opponent: { specification: field.opponents[0], state, runtime },
    track: straight,
    nearby: [state],
  }),
) {
  return runtime.advance(state, input, DT);
}

test('courier facing rotates the actual contact hull and fires real projectiles backwards without reversing progress', async () => {
  const dynamics = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(straight),
  });
  const state = stateFor();
  const runtime = createInterceptorMotion(
    { track: straight, dynamics },
    { getYaw: () => facingAt(state.time) },
  );
  try {
    runtime.reset({ state });
    for (let i = 0; i < 3 * 120; i++) step(runtime, state);
    const pose = runtime.pose(1),
      actor = dynamics.snapshot().actors[0];
    const forward = new Vector3(0, 0, 1).applyQuaternion(pose.quaternion);
    assert.ok(forward.z < -0.999, 'the physical nose faces the pursuers');
    assert.ok(
      state.heading < 0.02 && state.heading > -0.02,
      'route heading stays independent of the hull reversal',
    );
    assert.ok(
      state.distance > 450 && state.speed > 70,
      'the hull keeps moving forward while facing backward',
    );
    assert.equal(actor.contactShape.id, 'goliath');
    assert.ok(
      pose.quaternion.angleTo(
        new Quaternion(
          actor.quaternion.x,
          actor.quaternion.y,
          actor.quaternion.z,
          actor.quaternion.w,
        ),
      ) < 1e-8,
      'render/combat and the collision engine observe the same real attitude',
    );
    const targetState = {
      ...createVehicleState(),
      distance: state.distance - 100,
    };
    const targetPose = {
      grounded: true,
      position: pose.position.clone().add(new Vector3(0, 0, -100)),
      quaternion: new Quaternion(),
    };
    const hits = [];
    const combat = createCombatSimulation({
      track: straight,
      onHit: (hit) => hits.push(hit),
    });
    const bind = () => {
      combat.bind('goliath', {
        state,
        team: 'quarry',
        pose: () => runtime.pose(1),
        notify() {},
        hit() {},
      });
      combat.bind('player', {
        state: targetState,
        team: 'hunters',
        pose: () => targetPose,
        notify() {},
        hit() {},
      });
    };
    bind();
    assert.equal(combat.fireLance('goliath'), true);
    assert.ok(
      Math.abs(combat.snapshot().shots[0].heading) > 3.12,
      'actual muzzle pose aims the shot rearwards',
    );
    for (let i = 0; i < 120 && hits.length === 0; i++) {
      bind();
      combat.step(DT);
    }
    assert.equal(hits.length, 1);
    assert.equal(hits[0].source, 'goliath');
    assert.equal(hits[0].target, 'player');
    assert.equal(hits[0].equipment, 'lance');
    const beforeImpulse = state.speed;
    runtime.applyImpulse(state, new Vector3(0, 0, 4));
    assert.ok(
      Math.abs(state.speed - beforeImpulse - 4) < 0.01,
      'a forward impulse remains forward when the hull faces backward',
    );
    for (let i = 0; i < 4 * 120; i++) step(runtime, state);
    assert.ok(
      new Vector3(0, 0, 1).applyQuaternion(runtime.pose(1).quaternion).z >
        0.999,
      'the real hull settles facing forward again',
    );
    assert.ok(state.distance > 750 && state.speed > 70);
  } finally {
    runtime.dispose();
    dynamics.dispose();
  }
});

test('turning courier snapshots restore actual attitude, movement and angular velocity exactly', async () => {
  const dynamics = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(straight),
  });
  const state = stateFor();
  const runtime = createInterceptorMotion(
    { track: straight, dynamics },
    { getYaw: () => facingAt(state.time) },
  );
  try {
    runtime.reset({ state });
    for (let i = 0; i < 120; i++) step(runtime, state);
    const saved = {
      state: structuredClone(state),
      runtime: runtime.snapshot(),
      dynamics: dynamics.snapshot(),
    };
    assert.ok(saved.runtime.headingOffset > 1);
    for (let i = 0; i < 180; i++) step(runtime, state);
    const expected = {
      state: structuredClone(state),
      runtime: runtime.snapshot(),
      dynamics: dynamics.snapshot(),
    };
    Object.assign(state, saved.state);
    runtime.restore(saved.runtime);
    dynamics.restore(saved.dynamics);
    for (let i = 0; i < 180; i++) step(runtime, state);
    assert.deepEqual(
      { state, runtime: runtime.snapshot(), dynamics: dynamics.snapshot() },
      expected,
    );
    assert.throws(
      () => runtime.restore({ ...runtime.snapshot(), headingOffset: Infinity }),
      /Invalid magnetic body state/,
    );
  } finally {
    runtime.dispose();
    dynamics.dispose();
  }
});

test('a physically clipped turnaround cannot reverse the driving observation or create a route-speed spike', async () => {
  const track = { ...straight, width: 19 };
  const dynamics = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(track),
  });
  const state = stateFor();
  const runtime = createInterceptorMotion(
    { track, dynamics },
    { getYaw: () => Math.PI * smooth(state.time / 0.75) },
  );
  let clipped = false;
  try {
    runtime.reset({ state });
    for (let i = 0; i < 2 * 120; i++) {
      const input = {
        throttle: 0.6,
        steer: 0,
        brake: 0,
        boost: false,
        airbrake: false,
      };
      const events = step(runtime, state, input);
      clipped ||= events.some((event) => event.type === 'impact');
      const velocity = runtime.pose(1).velocity;
      assert.ok(
        velocity.length() <= 100.001,
        'clipped rotation cannot inject unbounded contact energy',
      );
      assert.ok(
        Math.abs(state.speed - velocity.z) < 0.01,
        'speed observes actual driving velocity independently of the clipped hull',
      );
      assert.ok(
        Math.abs(state.heading) < 0.1,
        'driving direction does not inherit a blocked hull turn',
      );
    }
    assert.equal(
      clipped,
      true,
      'the narrow fixture actually constrains the physical hull',
    );
    assert.ok(
      state.distance < 445,
      'physical contact cannot warp the route kilometres forward',
    );
    assert.ok(runtime.pose(1).position.z < 445);
  } finally {
    runtime.dispose();
    dynamics.dispose();
  }
});

test('a real disruption slows the backwards-facing courier instead of accelerating it on every stun tick', async () => {
  const dynamics = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(straight),
  });
  const state = stateFor();
  let stunned = false;
  const motion = createInterceptorMotion(
    { track: straight, dynamics },
    { getYaw: () => facingAt(state.time) },
  );
  const runtime = createDeviceRuntime({
    track: straight,
    devices: [],
    combatId: 'goliath',
    motion,
    combat: {
      bind() {},
      resetActor() {},
      request() {},
      disruption: () => (stunned ? { speedLimit: 55 } : null),
      avoidance: () => null,
    },
  });
  try {
    runtime.reset({ state });
    for (let i = 0; i < 3 * 120; i++) step(runtime, state);
    assert.ok(
      new Vector3(0, 0, 1).applyQuaternion(runtime.pose(1).quaternion).z <
        -0.999,
    );
    assert.ok(
      new Vector3(0, 0, 1).applyQuaternion(runtime.pose(1).drivingQuaternion)
        .z > 0.999,
    );
    const before = state.distance;
    stunned = true;
    for (let i = 0; i < 120; i++) {
      step(runtime, state);
      assert.ok(
        state.speed <= 55.001,
        'every speed-limiter impulse reduces actual driving speed',
      );
      assert.ok(
        runtime.pose(1).velocity.length() < 55.1,
        'the counterattack cannot turn stun into positive thrust feedback',
      );
    }
    assert.ok(
      state.distance - before < 56,
      'disruption cannot launch the courier kilometres forward',
    );
  } finally {
    runtime.dispose();
    dynamics.dispose();
  }
});

test('the forty-metre turning hull sweeps safely through the actual dispatch course while continuing its escape', async () => {
  const track = createInterceptorTrack(),
    field = createInterceptorField();
  const dynamics = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(track),
  });
  const state = stateFor();
  const mission = createInterceptorEvent({
    escapeDistance: track.length * 2,
    difficulty: 'easy',
  });
  const runtime = createInterceptorMotion(
    { track, dynamics },
    { getYaw: () => mission.snapshot().counterattack.yaw },
  );
  const impacts = [];
  let facedBackwards = false,
    blasts = 0;
  try {
    runtime.reset({ state });
    for (let i = 0; i < 13 * 120; i++) {
      const input = field.control({
        opponent: { specification: field.opponents[0], state, runtime },
        track,
        nearby: [state],
      });
      impacts.push(
        ...step(runtime, state, input).filter((event) =>
          ['impact', 'road-departure'].includes(event.type),
        ),
      );
      const events = mission.step(DT, {
        targetDistance: state.distance,
        playerDistance: state.distance - 100,
      });
      blasts += events.filter(
        (event) =>
          event.type === 'interceptor-fire' &&
          event.payload.source === 'goliath' &&
          event.payload.kind === 'lance',
      ).length;
      facedBackwards ||=
        new Vector3(0, 0, 1)
          .applyQuaternion(runtime.pose(1).quaternion)
          .dot(track.sample(state.distance).tangent) < -0.99;
    }
    assert.ok(state.distance > 1200);
    assert.ok(state.speed > 75);
    assert.ok(Math.abs(state.lateral) < 2);
    assert.equal(
      facedBackwards,
      true,
      'the production marker and phase rotate the real hull',
    );
    assert.equal(
      blasts,
      1,
      'Easy requests its one signature blast after turning',
    );
    assert.equal(
      impacts.length,
      0,
      'rotation uses shared collision queries without clipping the road',
    );
  } finally {
    runtime.dispose();
    dynamics.dispose();
  }
});
