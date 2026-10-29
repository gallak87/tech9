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
import createHelionBreach from '../levels/interceptor-helion/index.js';
import { BASELINE_RULES } from '../core/session-runtime.js';
import { MAGNETIC_BODY_RULES } from '../physics/magnetic-body.js';

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
    assert.equal(runtime.id, 'interceptor-magnetic');
    assert.equal(runtime.version, 3);
    assert.equal(
      runtime.rulesId,
      `${BASELINE_RULES}:${MAGNETIC_BODY_RULES}:${dynamics.rulesId}:courier-facing-v3-driving-axis:self-contact-100:other-contact-180`,
    );
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

async function helionBossFixture(initial, { clear = false, getYaw } = {}) {
  const level = createHelionBreach();
  const original = level.createTrack();
  const track = clear ? { ...original, thermalZones: [] } : original;
  const collisionWorld = level.createCollisionWorld({ track });
  const dynamics = await createRapierWorld({ collisionWorld });
  const state = {
    ...createVehicleState('bastion'),
    chassisId: 'wraith',
    ...initial(track),
  };
  const runtime = createInterceptorMotion(
    {
      track,
      collisionWorld,
      dynamics,
      settings: { steeringAssist: 0.3 },
      presentation: false,
    },
    {
      createMotion: level.racing.createMotion,
      getYaw: () => getYaw?.(state) ?? 0,
    },
  );
  runtime.reset({ state });
  return {
    track,
    state,
    runtime,
    dynamics,
    step(input = {}) {
      // Exercise the same shared physical clock used by the live race.
      runtime.beginAdvance(state, input, DT);
      dynamics.step(DT);
      return runtime.finishAdvance(state);
    },
    snapshot: () => ({
      state: structuredClone(state),
      runtime: runtime.snapshot(),
      dynamics: dynamics.snapshot(),
    }),
    restore(saved) {
      Object.assign(state, structuredClone(saved.state));
      runtime.restore(saved.runtime);
      dynamics.restore(saved.dynamics);
    },
    dispose() {
      runtime.dispose();
      dynamics.dispose();
    },
  };
}

test('a course-composed boss retains real furnace heat, cooling, reversed contact facing and exact replay', async () => {
  const f = await helionBossFixture(
    (track) => ({
      distance:
        track.thermalZones.find((zone) => zone.kind === 'furnace').start + 15,
    }),
    { getYaw: (state) => facingAt(state.time) },
  );
  try {
    assert.equal(f.runtime.id, 'interceptor-helion-thermal-flight');
    assert.ok(f.runtime.rulesId.includes('helion-thermal-flight-v4:'));
    assert.ok(
      f.runtime.rulesId.endsWith(
        'courier-facing-v3-driving-axis:self-contact-100:other-contact-180',
      ),
    );
    for (let i = 0; i < 400; i++) f.step();
    const saved = f.snapshot();
    assert.ok(
      saved.runtime.heat > 80,
      'the live boss wrapper retains active furnace exposure',
    );
    assert.equal(saved.dynamics.actors[0].selfContactSpeedLimit, 100);
    assert.equal(saved.dynamics.actors[0].contactSpeedLimit, 180);
    assert.ok(
      new Vector3(0, 0, 1)
        .applyQuaternion(f.runtime.pose(1).quaternion)
        .dot(f.track.sample(f.state.distance).tangent) < -0.999,
    );
    f.runtime.advance(f.state, {}, 0);
    f.runtime.update({ state: f.state, dt: 0, mode: 'paused' });
    assert.deepEqual(
      f.snapshot(),
      saved,
      'a paused thermal boss does not advance',
    );
    const drive = { throttle: 1, steer: 0, brake: 0, boost: false };
    const expectedEvents = Array.from({ length: 90 }, () => f.step(drive));
    const expected = f.snapshot();
    assert.ok(
      f.state.distance > saved.state.distance,
      'reverse-facing hull still drives forward',
    );
    f.restore(saved);
    assert.deepEqual(
      Array.from({ length: 90 }, () => f.step(drive)),
      expectedEvents,
    );
    assert.deepEqual(
      f.snapshot(),
      expected,
      'thermal state and physical attitude replay together exactly',
    );
    const heat = f.runtime.snapshot().heat;
    Object.assign(f.state, {
      distance:
        f.track.thermalZones.find((zone) => zone.kind === 'cooling').start + 15,
      speed: 0,
      lateral: 0,
      heading: 0,
    });
    f.runtime.reset({ state: f.state });
    f.runtime.restore({
      ...f.runtime.snapshot(),
      heat,
      contactAge: 0,
      contactHeat: heat,
    });
    for (let i = 0; i < 360; i++) f.step();
    assert.equal(
      f.runtime.snapshot().heat,
      0,
      'real cooling surfaces still discharge stored boss heat',
    );
  } finally {
    f.dispose();
  }
});

test('a course-composed boss keeps optional vault flight, physical landing and airborne replay', async () => {
  const f = await helionBossFixture(
    (track) => track.scenarios['jump1-cruise70'],
  );
  const drive = { throttle: 1, steer: 0, brake: 0, boost: false };
  try {
    const events = [];
    for (let i = 0; i < 40; i++) events.push(...f.step(drive));
    assert.ok(events.some((event) => event.type === 'jump-launch'));
    assert.equal(f.runtime.snapshot().mode, 'flight');
    assert.equal(
      f.runtime.pose(1).grounded,
      false,
      'the gap is physically airborne, not magnetically bridged',
    );
    const saved = f.snapshot();
    const expectedEvents = Array.from({ length: 220 }, () => f.step(drive));
    assert.ok(
      expectedEvents
        .flat()
        .some(
          (event) =>
            event.type === 'jump-transfer' &&
            event.payload.outcome === 'landed',
        ),
    );
    assert.equal(f.runtime.snapshot().mode, 'magnetic');
    const expected = f.snapshot();
    f.restore(saved);
    assert.deepEqual(
      Array.from({ length: 220 }, () => f.step(drive)),
      expectedEvents,
    );
    assert.deepEqual(
      f.snapshot(),
      expected,
      'airborne boss continuation and landing restore exactly',
    );
  } finally {
    f.dispose();
  }
});

test('the boss course factory retains immediate fire resistance during boost', async () => {
  const level = createHelionBreach(),
    track = level.createTrack();
  const distance =
    track.thermalZones.find((zone) => zone.kind === 'furnace').start + 5;
  const initial = () => ({ distance, speed: 20 });
  const hot = await helionBossFixture(initial);
  const safe = await helionBossFixture(initial, { clear: true });
  try {
    for (let i = 0; i < 120; i++) {
      const input = { throttle: 1, brake: 0, steer: 0, boost: true };
      hot.step(input);
      safe.step(input);
    }
    assert.ok(hot.runtime.snapshot().heat > 0);
    assert.ok(
      hot.state.speed < safe.state.speed * 0.8,
      `fire=${hot.state.speed}, clear=${safe.state.speed}`,
    );
  } finally {
    hot.dispose();
    safe.dispose();
  }
});
