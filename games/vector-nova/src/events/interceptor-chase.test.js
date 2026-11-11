import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Quaternion, Matrix4, BoxGeometry } from 'three';
import {
  createInterceptorChaseMotion,
  INTERCEPTOR_CHASE_GAP,
} from './interceptor-chase.js';
import { createInterceptorMotion } from './interceptor-motion.js';
import { createInterceptorField } from './interceptor-field.js';
import { createVehicleState } from '../physics/index.js';
import { createRapierWorld } from '../physics/rapier-world.js';
import { withMagneticBoundaries } from '../physics/magnetic-boundaries.js';
import {
  createCollisionWorld,
  indexedTriangles,
} from '../physics/collision-world.js';
import { createFlightModel } from '../physics/flight.js';
import { getRacerControl } from '../race/racers.js';
import { projectMagneticBody } from '../physics/magnetic-body.js';
import { createCombatSimulation, COMBAT_RULES } from '../pickups/combat.js';

const DT = 1 / 120;
const copy = (value) => JSON.parse(JSON.stringify(value));
const straight = {
  id: 'pursuit-envelope-road',
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
const forward = {
  throttle: 1,
  brake: 0,
  steer: 0,
  boost: true,
  airbrake: false,
};
async function fixture({
  track = straight,
  distance = 0,
  gap = 240,
  speed = 0,
  quarrySpeed = 300 / 3.6,
  createMotion,
  collisionWorld = null,
  bossId = 'bulwark',
} = {}) {
  const dynamics = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(track, collisionWorld),
  });
  const field = createInterceptorField({ bossId, track });
  const quarryState = {
    ...createVehicleState('bastion'),
    chassisId: bossId,
    distance: distance + gap,
    speed: quarrySpeed,
  };
  const state = {
    ...createVehicleState('shrike'),
    distance,
    speed,
    lateral: 8,
  };
  const quarry = {
    state: quarryState,
    specification: field.opponents[0],
    runtime: createInterceptorMotion({ track, dynamics }),
  };
  const runtime = createInterceptorChaseMotion(
    { track, dynamics, equipment: true },
    {
      ...(createMotion ? { createMotion } : {}),
      getTarget: () => quarry,
    },
  );
  quarry.runtime.reset({ state: quarryState });
  runtime.reset({ state });
  return {
    track,
    dynamics,
    field,
    state,
    quarry,
    runtime,
    step(input = forward, quarryInput = null) {
      const controls =
        quarryInput ??
        field.control({
          opponent: quarry,
          track,
          nearby: [state, quarryState],
          devices: [],
        });
      runtime.beginAdvance(state, input, DT);
      quarry.runtime.beginAdvance(quarryState, controls, DT);
      dynamics.step(DT);
      const events = [
        ...runtime.finishAdvance(state),
        ...quarry.runtime.finishAdvance(quarryState),
      ];
      return events;
    },
    gap() {
      const projection = projectMagneticBody(
        track,
        runtime.pose(1).position,
        runtime.snapshot().chase.player?.distance ?? state.distance,
        state.lateral,
        dynamics.sampleRoadSurface,
      );
      return quarryState.distance - projection.distance;
    },
    snapshot() {
      return copy({
        state,
        quarry: quarryState,
        runtime: runtime.snapshot(),
        quarryRuntime: quarry.runtime.snapshot(),
        dynamics: dynamics.snapshot(),
      });
    },
    restore(snapshot) {
      Object.assign(state, copy(snapshot.state));
      Object.assign(quarryState, copy(snapshot.quarry));
      runtime.restore(copy(snapshot.runtime));
      quarry.runtime.restore(copy(snapshot.quarryRuntime));
      dynamics.restore(copy(snapshot.dynamics));
    },
    dispose() {
      runtime.dispose();
      quarry.runtime.dispose();
      dynamics.dispose();
    },
  };
}

test('quarry does not yield or brake when a hunter passes into its traffic preview', () => {
  const field = createInterceptorField({ bossId: 'bulwark' });
  const state = {
    ...createVehicleState('bastion'),
    chassisId: 'bulwark',
    distance: 400,
    speed: 300 / 3.6,
  };
  const opponent = { specification: field.opponents[0], state };
  const clear = field.control({ opponent, track: straight, nearby: [state] });
  const passed = field.control({
    opponent,
    track: straight,
    nearby: [
      state,
      { ...createVehicleState(), distance: 408, lateral: 0, speed: 0 },
    ],
  });
  assert.deepEqual(passed, clear);
  assert.equal(passed.brake, 0);
  assert.ok(passed.throttle > 0, 'the quarry keeps driving away');
});

test('held manual boost closes naturally into a physical 30m gap without stopping the quarry', async () => {
  const f = await fixture();
  let minimum = Infinity,
    boosted = false,
    maxDeceleration = 0,
    oldSpeed = f.state.speed;
  try {
    for (let tick = 0; tick < 25 * 120; tick++) {
      const input = {
        ...getRacerControl(f.state, f.track, {
          lane: 8,
          nearby: [],
          difficulty: 'hard',
          runtime: f.runtime,
        }),
        boost: true,
      };
      const events = f.step(input);
      const gap = f.gap();
      minimum = Math.min(minimum, gap);
      boosted ||= f.state.boosting;
      maxDeceleration = Math.max(
        maxDeceleration,
        (oldSpeed - f.state.speed) / DT,
      );
      oldSpeed = f.state.speed;
      assert.ok(gap >= INTERCEPTOR_CHASE_GAP, `gap ${gap} at tick ${tick}`);
      assert.equal(events.filter((event) => event.type === 'impact').length, 0);
    }
    assert.ok(boosted, 'manual boost remains active');
    assert.ok(minimum < 33, `player settles into firing range: ${minimum}m`);
    assert.ok(
      f.quarry.state.distance > 2200,
      'quarry continues forward throughout',
    );
    assert.ok(f.quarry.state.speed > 82, 'no traffic-braking stall');
    assert.ok(
      maxDeceleration < 65,
      `smooth approach deceleration ${maxDeceleration}`,
    );
    assert.ok(f.state.energy < 100, 'boost still consumes reserve');
  } finally {
    f.dispose();
  }
});

test('ordinary Repulsor pulses hit every real boss from the settled chase buffer', async () => {
  for (const bossId of ['goliath', 'wraith', 'bulwark']) {
    const f = await fixture({ bossId });
    const hits = [];
    const combat = createCombatSimulation({
      track: f.track,
      dynamics: f.dynamics,
      onHit: (hit) => hits.push(hit),
    });
    const bind = () => {
      combat.bind('player', {
        state: f.state,
        team: 'hunters',
        pose: () => f.runtime.pose(1),
        notify() {},
        hit() {
          return false;
        },
      });
      combat.bind(bossId, {
        state: f.quarry.state,
        team: 'quarry',
        hitBounds: f.quarry.specification.hitBounds,
        combatResistance: 0.9,
        pose: () => f.quarry.runtime.pose(1),
        notify() {},
        hit(hit) {
          f.quarry.runtime.applyImpulse(f.quarry.state, hit.impulse);
          return false;
        },
      });
    };
    try {
      for (let tick = 0; tick < 25 * 120; tick++) f.step();
      const gap = f.gap();
      assert.ok(
        gap >= INTERCEPTOR_CHASE_GAP && gap < 33,
        `${bossId} settles inside usable Repulsor range: ${gap}m`,
      );
      const separation = f.runtime
        .pose(1)
        .position.distanceTo(f.quarry.runtime.pose(1).position);
      assert.ok(
        separation < COMBAT_RULES.pulseRadius,
        `${bossId} physical separation ${separation}m is inside the existing pulse`,
      );
      bind();
      combat.request('player', {
        type: 'pickup-activate',
        payload: {
          kind: 'repulsor',
          deviceId: 'ordinary-pursuit-repulsor',
          fraction: 0.5,
        },
      });
      for (let tick = 0; tick < 62; tick++) {
        f.step();
        bind();
        combat.step(DT);
        assert.ok(
          f.gap() >= INTERCEPTOR_CHASE_GAP,
          'pulse impulse preserves chase safety',
        );
      }
      assert.equal(hits.length, 1, `${bossId} receives a real pulse contact`);
      assert.equal(hits[0].source, 'player');
      assert.equal(hits[0].target, bossId);
      assert.equal(hits[0].kind, 'repulsor');
      assert.equal(hits[0].shielded, false);
    } finally {
      f.dispose();
    }
  }
});

test('the physical envelope absorbs extreme boosted closing and sudden quarry braking without a wall impact', async () => {
  const f = await fixture({ gap: 35, speed: 150 });
  try {
    for (let tick = 0; tick < 5 * 120; tick++) {
      const events = f.step(
        forward,
        tick > 60
          ? { throttle: 0, brake: 1, steer: 0, boost: false, airbrake: false }
          : null,
      );
      assert.ok(
        f.gap() >= INTERCEPTOR_CHASE_GAP,
        `minimum gap ${f.gap()} tick ${tick}`,
      );
      assert.equal(events.filter((event) => event.type === 'impact').length, 0);
      assert.ok(f.state.speed >= -1e-6, 'hunter is not bounced backwards');
    }
    assert.ok(f.state.speed < 1, 'hunter can stop behind a stopped quarry');
  } finally {
    f.dispose();
  }
});

test('an emergency quarry contact stops the pursuit without collapsing the 30m buffer', async () => {
  const geometry = new BoxGeometry(30, 20, 0.1);
  const world = createCollisionWorld({
    id: 'pursuit-emergency-stop',
    version: 1,
    geometryId: 'pursuit-emergency-stop-v1',
    triangles: indexedTriangles(
      geometry.attributes.position.array,
      geometry.index.array,
      { id: 'quarry-stop-wall', kind: 'structure' },
      new Matrix4().makeTranslation(0, 8, 65),
    ),
  });
  geometry.dispose();
  const f = await fixture({ gap: 40, speed: 100, collisionWorld: world });
  let minimum = Infinity,
    impacts = 0;
  try {
    for (let tick = 0; tick < 5 * 120; tick++) {
      impacts += f.step().filter((event) => event.type === 'impact').length;
      minimum = Math.min(minimum, f.gap());
      assert.ok(
        f.gap() >= INTERCEPTOR_CHASE_GAP,
        `wall-stop gap ${f.gap()} tick ${tick}`,
      );
    }
    assert.ok(impacts > 0, 'the real quarry hull hits the thin obstacle');
    assert.ok(
      f.quarry.state.speed < 1,
      'the obstacle physically stops the quarry',
    );
    assert.ok(
      f.state.speed < 1,
      'hunter stops behind it without an invisible-wall impact',
    );
    assert.ok(minimum < 35, `close emergency-follow gap ${minimum}`);
  } finally {
    f.dispose();
    world.dispose();
  }
});

test('an allied hull cannot shove the hunter through the chase envelope', async () => {
  const f = await fixture({ gap: 31.5, speed: 0, quarrySpeed: 0 });
  const ally = f.dynamics.createActor({ mass: 20 });
  const pose = f.runtime.pose(1);
  ally.reset({
    active: true,
    pose: {
      position: pose.position.clone().add(new Vector3(0, 0, -10)),
      quaternion: pose.quaternion,
    },
    velocity: new Vector3(0, 0, 120),
  });
  let contacts = 0;
  try {
    for (let tick = 0; tick < 120; tick++) {
      const body = ally.read();
      ally.stage({
        support: {
          position: body.position,
          quaternion: body.quaternion,
          destination: body.position.clone().addScaledVector(body.velocity, DT),
        },
      });
      contacts += f
        .step(forward, { throttle: 0, brake: 1, steer: 0, boost: false })
        .filter((event) => event.type === 'impact').length;
      assert.ok(
        f.gap() >= INTERCEPTOR_CHASE_GAP,
        `contact gap ${f.gap()} tick ${tick}`,
      );
    }
    assert.ok(contacts > 0, 'real pair collisions push on the player hull');
  } finally {
    ally.dispose();
    f.dispose();
  }
});

test('route metres remain unwrapped across a closed-course seam and snapshot replay is exact', async () => {
  const f = await fixture({
    distance: straight.length - 80,
    gap: 50,
    speed: 110,
  });
  try {
    for (let tick = 0; tick < 240; tick++) f.step();
    assert.ok(f.state.distance > straight.length);
    const initial = f.snapshot();
    for (let tick = 0; tick < 240; tick++) f.step();
    const expected = f.snapshot();
    for (let pause = 0; pause < 20; pause++)
      assert.deepEqual(f.snapshot(), expected);
    f.restore(initial);
    for (let tick = 0; tick < 240; tick++) f.step();
    assert.deepEqual(f.snapshot(), expected);
    assert.ok(f.gap() >= INTERCEPTOR_CHASE_GAP);
    const bad = copy(initial);
    bad.dynamics.actors[1].movementLimitId = 'wrong-rules';
    assert.throws(() => f.dynamics.restore(bad.dynamics), /identity or actors/);
  } finally {
    f.dispose();
  }
});

test('boosted pursuit retains its gap through a real graded, rolling loop and physical seam', async () => {
  const length = 2000,
    radius = length / (2 * Math.PI);
  const track = {
    ...straight,
    id: 'pursuit-rolled-loop',
    length,
    sample(distance) {
      const angle = distance / radius;
      const position = new Vector3(
        radius * Math.sin(angle),
        25 * Math.sin(angle * 2),
        radius * (1 - Math.cos(angle)),
      );
      const tangent = new Vector3(
        Math.cos(angle),
        (50 / radius) * Math.cos(angle * 2),
        Math.sin(angle),
      ).normalize();
      const right = new Vector3(0, 1, 0).cross(tangent).normalize();
      const up = tangent.clone().cross(right).normalize();
      const roll = angle;
      right.applyAxisAngle(tangent, roll);
      up.applyAxisAngle(tangent, roll);
      return {
        position,
        tangent,
        right,
        up,
        bank: roll,
        quaternion: new Quaternion().setFromRotationMatrix(
          new Matrix4().makeBasis(right, up, tangent),
        ),
        curvature: 1 / radius,
      };
    },
  };
  const f = await fixture({ track, gap: 50, speed: 110 });
  let minimum = Infinity;
  try {
    for (let tick = 0; tick < 30 * 120; tick++) {
      const input = {
        ...getRacerControl(f.state, track, {
          lane: 8,
          difficulty: 'hard',
          runtime: f.runtime,
        }),
        boost: true,
      };
      f.step(input);
      const gap = f.gap();
      minimum = Math.min(minimum, gap);
      assert.ok(
        gap >= INTERCEPTOR_CHASE_GAP,
        `graded/rolling gap ${gap} tick ${tick}`,
      );
    }
    assert.ok(
      f.state.distance > length,
      'both bodies cross the real world-space loop seam',
    );
    assert.ok(minimum < 36, `a useful close firing gap ${minimum}`);
    assert.ok(
      Math.abs(f.runtime.pose(1).position.y) > 1,
      'physical route has vertical reach',
    );
  } finally {
    f.dispose();
  }
});

test('airborne boost is constrained using actual physical progress instead of the frozen launch station', async () => {
  const jump = {
    id: 'long-transfer',
    takeoff: 0,
    landingStart: 400,
    landingEnd: 600,
    recovery: 650,
    halfWidth: 20,
  };
  const track = {
    ...straight,
    jumps: [jump],
    checkpoints: [{ distance: jump.landingStart }],
  };
  const flightModel = createFlightModel();
  const f = await fixture({
    track,
    gap: 55,
    speed: 130,
    createMotion: (context) =>
      flightModel.createRuntime(context, {
        id: 'pursuit-air',
        version: 1,
        rulesId: 'pursuit-air-v1',
        automaticRecovery: false,
        testLaunch: true,
      }),
  });
  try {
    const frame = track.sample(0);
    f.runtime.launch(f.state, {
      jump: jump.id,
      position: frame.position
        .clone()
        .addScaledVector(frame.up, 50)
        .addScaledVector(frame.right, 8)
        .toArray(),
      velocity: [0, 15, 130],
      quaternion: frame.quaternion.toArray(),
    });
    let crossed = 0;
    for (let tick = 0; tick < 180; tick++) {
      f.step();
      assert.ok(f.gap() >= INTERCEPTOR_CHASE_GAP, `air gap ${f.gap()}`);
      crossed = Math.max(crossed, f.runtime.pose(1).position.z);
    }
    assert.ok(
      crossed > 120,
      `physical hull advances while airborne: ${crossed}m`,
    );
    assert.equal(
      f.state.distance,
      jump.takeoff,
      'flight retains its ordinary launch-station cache',
    );
    const initial = f.snapshot();
    for (let tick = 0; tick < 30; tick++) f.step();
    const expected = f.snapshot();
    f.restore(initial);
    for (let tick = 0; tick < 30; tick++) f.step();
    assert.deepEqual(f.snapshot(), expected);
  } finally {
    f.dispose();
  }
});

test('ordinary actors retain free boosted movement and cannot accidentally accept a chase envelope', async () => {
  const dynamics = await createRapierWorld();
  const actor = dynamics.createActor();
  try {
    actor.reset({
      active: true,
      pose: { position: new Vector3(), quaternion: new Quaternion() },
      velocity: new Vector3(0, 0, 200),
    });
    assert.throws(
      () =>
        actor.stage({
          movementLimit: { normal: new Vector3(0, 0, 1), offset: 0 },
        }),
      /opted-in/,
    );
    dynamics.step(DT);
    assert.ok(actor.read().position.z > 1.6);
    assert.ok(!('movementLimitId' in dynamics.snapshot().actors[0]));
  } finally {
    actor.dispose();
    dynamics.dispose();
  }
});
