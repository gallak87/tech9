import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  createCollisionWorld,
  indexedTriangles,
} from '../src/physics/collision-world.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { createFlightModel } from '../src/physics/flight.js';
import { createVehicleState } from '../src/physics/index.js';

const DT = 1 / 120;
const ZERO = () => new T.Vector3();
const pose = (x, y, z) => ({
  position: new T.Vector3(x, y, z),
  quaternion: new T.Quaternion(),
});
function deck({
  halfWidth = 10,
  from = 100,
  to = 220,
  motionGroup = 'receiver',
} = {}) {
  const points = [
    [-halfWidth, 0, from],
    [-halfWidth, 0, to],
    [halfWidth, 0, from],
    [halfWidth, 0, to],
  ];
  return [
    [0, 1, 2],
    [1, 3, 2],
  ].map((ids) => ({
    id: 'receiving-deck',
    kind: 'deck',
    start: from,
    end: to,
    motionGroup,
    points: ids.map((id) => points[id]),
    roadCoordinates: ids.map((id) => [points[id][2], points[id][0]]),
  }));
}
async function fixture(t, triangles) {
  const source = createCollisionWorld({
    id: 'moving-proof',
    version: 1,
    geometryId: 'moving-proof-v1',
    triangles,
  });
  const world = await createRapierWorld({ collisionWorld: source, gravity: 0 });
  t.after(() => {
    world.dispose();
    source.dispose();
  });
  return { source, world };
}
function actorAt(world, position, velocity) {
  const actor = world.createActor();
  actor.stage({ pose: position, velocity, active: true });
  return actor;
}

test('a translating 3cm wall continuously reaches a stationary native hull', async (t) => {
  const geometry = new T.BoxGeometry(0.03, 20, 60);
  const triangles = indexedTriangles(
    geometry.attributes.position.array,
    geometry.index.array,
    { id: 'moving-wall', kind: 'structure', motionGroup: 'carrier' },
    new T.Matrix4().makeTranslation(-30, 4, 0),
  );
  geometry.dispose();
  for (const moving of [false, true]) {
    const { world } = await fixture(t, triangles);
    world.setGroupMotion('carrier', {
      translation: ZERO(),
      velocity: new T.Vector3(moving ? 6000 : 0, 0, 0),
    });
    const actor = actorAt(world, pose(0, 4, 0), ZERO());
    world.step(DT);
    const result = actor.read();
    if (!moving) {
      assert.equal(result.contacts.length, 0);
      continue;
    }
    assert.ok(
      result.contacts.some(
        (hit) =>
          hit.shape.id === 'moving-wall' && hit.shape.kind === 'structure',
      ),
    );
    assert.ok(
      result.velocity.x > 1000,
      'real relative contact transfers lateral momentum',
    );
    assert.ok(
      result.position.x > 10,
      'the moving wall cannot pass through the stationary hull',
    );
    assert.ok(
      result.contacts.every((hit) => hit.shape.motionGroup === 'carrier'),
    );
  }
});

test('a laterally arriving deck catches a falling native hull only at the intercepted phase', async (t) => {
  for (const moving of [false, true]) {
    const { world } = await fixture(t, deck());
    world.setGroupMotion('receiver', {
      translation: new T.Vector3(20, 0, 0),
      velocity: new T.Vector3(moving ? -200 : 0, 0, 0),
    });
    const actor = actorAt(world, pose(0, 3.5, 150), new T.Vector3(0, -30, 0));
    world.step(0.1);
    const result = actor.read();
    if (!moving) {
      assert.equal(result.contacts.length, 0);
      assert.ok(result.position.y < 0.6);
      continue;
    }
    const hit = result.contacts.find((entry) => entry.shape.kind === 'deck');
    assert.ok(hit, 'actual moving receiving geometry catches the fall');
    assert.equal(hit.shape.id, 'receiving-deck');
    assert.ok(
      hit.shape.roadCoordinates.length === 3,
      'route ownership survives native mesh contact',
    );
    assert.ok(hit.normal.y > 0.9);
    assert.ok(result.position.y >= 0.71);
    assert.ok(Math.abs(world.snapshot().motionGroups[0].translation.x) < 1e-9);
  }
});

test('motion snapshots restore geometry and future contacts, and reject malformed groups atomically', async (t) => {
  const { world } = await fixture(t, deck());
  const actor = actorAt(world, pose(0, 4, 150), new T.Vector3(0, -30, 0));
  world.setGroupMotion('receiver', {
    translation: new T.Vector3(14, 0, 0),
    velocity: new T.Vector3(-60, 0, 0),
  });
  const saved = world.snapshot();
  let contacts = 0;
  for (let i = 0; i < 15; i++) {
    world.step(DT);
    contacts += actor.read().contacts.length;
  }
  const expected = world.snapshot();
  world.restore(saved);
  for (let i = 0; i < 15; i++) world.step(DT);
  assert.deepEqual(world.snapshot(), expected);
  assert.ok(contacts > 0, 'the replay window includes a real deck contact');
  for (const invalid of [
    { ...saved, motionGroups: [] },
    { ...saved, motionGroups: [{ ...saved.motionGroups[0], id: 'unknown' }] },
    {
      ...saved,
      motionGroups: [
        { ...saved.motionGroups[0], velocity: { x: NaN, y: 0, z: 0 } },
      ],
    },
  ]) {
    const before = world.snapshot();
    assert.throws(() => world.restore(invalid));
    assert.deepEqual(world.snapshot(), before);
  }
});

test('static worlds keep the existing replay identity and snapshot shape', async (t) => {
  const triangles = deck().map((triangle) => {
    const staticTriangle = { ...triangle };
    delete staticTriangle.motionGroup;
    return staticTriangle;
  });
  const { world } = await fixture(t, triangles);
  assert.equal(world.setGroupMotion, undefined);
  assert.equal('motionGroups' in world.snapshot(), false);
  assert.ok(!world.rulesId.includes('moving-translations'));
});

test('moving sampled receivers refresh their cached frames instead of landing at an obsolete location', () => {
  const jump = {
    id: 'transfer',
    takeoff: 100,
    landingStart: 160,
    landingEnd: 260,
    recovery: 280,
    halfWidth: 10,
  };
  const model = createFlightModel();
  let offset = 0;
  const track = {
    length: 400,
    width: 20,
    jumps: [jump],
    movingSurfaces: true,
    sample: (distance) => ({
      ...pose(offset, 0, distance),
      tangent: new T.Vector3(0, 0, 1),
      right: new T.Vector3(1, 0, 0),
      up: new T.Vector3(0, 1, 0),
    }),
  };
  const fall = (x) =>
    model.sweptLanding(
      track,
      jump,
      pose(x, 3, 190),
      pose(x, 0, 190),
      new T.Vector3(0, -30, 0),
    );
  assert.ok(fall(0), 'prime the receiving segment cache');
  offset = 35;
  assert.ok(fall(35), 'the real moved receiver is supported');
  assert.equal(fall(0), null, 'the obsolete nominal deck is empty');
});

test('equipment release inherits support velocity without charging ground speed', async (t) => {
  const jump = {
    id: 'transfer',
    takeoff: 100,
    landingStart: 200,
    landingEnd: 500,
    recovery: 550,
    halfWidth: 16,
  };
  const track = {
    id: 'support-velocity-proof',
    length: 1000,
    width: 32,
    closed: false,
    jumps: [jump],
    checkpoints: [{ distance: 0 }, { distance: 200 }, { distance: 700 }],
    sample: (distance) => ({
      ...pose(0, 0, distance),
      tangent: new T.Vector3(0, 0, 1),
      right: new T.Vector3(1, 0, 0),
      up: new T.Vector3(0, 1, 0),
      bank: 0,
      curvature: 0,
    }),
  };
  const { source, world } = await fixture(
    t,
    deck({ from: 200, to: 500, halfWidth: 16 }),
  );
  const runtime = createFlightModel().createRuntime(
    { track, collisionWorld: source, dynamics: world },
    {
      id: 'support-proof',
      version: 1,
      rulesId: 'support-proof-v1',
      supportVelocity: () => new T.Vector3(0, 0, 12),
      forgivingContacts: true,
    },
  );
  t.after(() => runtime.dispose());
  const state = { ...createVehicleState(), distance: 30, speed: 80 };
  runtime.reset({ state });
  assert.equal(runtime.jump(state), true);
  assert.ok(Math.abs(runtime.snapshot().flight.velocity[2] - 92) < 1e-9);
  assert.equal(
    state.speed,
    80,
    'release does not award the deck velocity as propulsion',
  );
});

test('leaving a moving road edge inherits its material velocity once during the physical fall', async (t) => {
  for (const startsOutside of [true, false]) {
    const track = {
      id: 'moving-edge-proof',
      length: 1000,
      width: 32,
      closed: false,
      jumps: [],
      sample: (distance) => ({
        ...pose(0, 0, distance),
        tangent: new T.Vector3(0, 0, 1),
        right: new T.Vector3(1, 0, 0),
        up: new T.Vector3(0, 1, 0),
        bank: 0,
        curvature: 0,
      }),
    };
    const { source, world } = await fixture(
      t,
      deck({ from: 0, to: 200, halfWidth: 16 }),
    );
    // The analytic road is the moving support chart; native triangles retain
    // free contacts, as on Nomad. We inspect the transition before the next
    // native step so any real deck collision cannot mask material velocity.
    const dynamics = { ...world, sampleRoadSurface: undefined };
    const materialVelocity = new T.Vector3(4, 0, 12),
      phases = [];
    const runtime = createFlightModel().createRuntime(
      { track, collisionWorld: source, dynamics },
      {
        id: 'moving-edge-proof',
        version: 1,
        rulesId: 'moving-edge-proof-v1',
        supportVelocity({ phase, jump, state }) {
          phases.push({ phase, jump, distance: state.distance });
          return materialVelocity;
        },
        forgivingContacts: true,
        automaticRecovery: false,
      },
    );
    t.after(() => runtime.dispose());
    const state = {
      ...createVehicleState(),
      distance: 30,
      lateral: startsOutside ? 30 : 16.1,
      lateralSpeed: startsOutside ? 0 : 45,
      speed: 80,
    };
    runtime.reset({ state });
    runtime.beginAdvance(state, {}, DT);
    const before = world.snapshot().actors[0].velocity;
    if (startsOutside) {
      assert.equal(before.x, 4);
      assert.equal(before.z, 92);
    }
    world.step(DT);
    const inertialBeforeFinish = world.snapshot().actors[0].velocity;
    const events = runtime.finishAdvance(state);
    assert.ok(events.some((event) => event.type === 'road-departure'));
    assert.equal(runtime.pose(1).recovering, true);
    const released = world.snapshot().actors[0].velocity;
    if (!startsOutside) {
      assert.ok(
        Math.abs(released.x - inertialBeforeFinish.x - materialVelocity.x) <
          1e-9,
      );
      assert.ok(
        Math.abs(released.z - inertialBeforeFinish.z - materialVelocity.z) <
          1e-9,
      );
    }
    for (let tick = 0; tick < 8; tick++) runtime.advance(state, {}, DT);
    assert.equal(
      phases.length,
      1,
      'recovery must not repeatedly add the support velocity',
    );
    assert.equal(phases[0].phase, 'launch');
    assert.equal(
      phases[0].jump,
      undefined,
      'an ordinary side departure uses its current carrier',
    );
    assert.ok(Math.abs(phases[0].distance - 30) < 1e-9);
    const fallingVelocity = world.snapshot().actors[0].velocity;
    assert.equal(
      runtime.jump(state),
      true,
      'equipment may rescue the existing physical side fall',
    );
    const rescuedVelocity = world.snapshot().actors[0].velocity;
    assert.ok(Math.abs(rescuedVelocity.x - fallingVelocity.x) < 1e-9);
    assert.ok(Math.abs(rescuedVelocity.z - fallingVelocity.z) < 1e-9);
    assert.equal(
      phases.length,
      1,
      'an already inertial falling hull cannot inherit its old support twice',
    );
  }
});

test('native moving-deck transfer converts inertial flight speed back to receiver-relative driving speed', async (t) => {
  const results = [];
  for (const inherit of [false, true]) {
    const jump = {
      id: 'transfer',
      takeoff: 100,
      landingStart: 200,
      landingEnd: 500,
      recovery: 550,
      halfWidth: 16,
    };
    let clock = 0;
    const track = {
      id: 'moving-transfer-proof',
      length: 1000,
      width: 32,
      closed: false,
      jumps: [jump],
      movingSurfaces: true,
      checkpoints: [{ distance: 0 }, { distance: 200 }, { distance: 700 }],
      sample: (distance) => ({
        ...pose(0, 0, distance + clock * 12),
        tangent: new T.Vector3(0, 0, 1),
        right: new T.Vector3(1, 0, 0),
        up: new T.Vector3(0, 1, 0),
        bank: 0,
        curvature: 0,
      }),
    };
    const { source, world } = await fixture(
      t,
      deck({ from: 200, to: 500, halfWidth: 16 }),
    );
    const phases = [];
    const runtime = createFlightModel().createRuntime(
      { track, collisionWorld: source, dynamics: world },
      {
        id: 'moving-transfer-proof',
        version: 1,
        rulesId: 'moving-transfer-proof-v1',
        ...(inherit
          ? {
              supportVelocity({ phase }) {
                phases.push(phase);
                return new T.Vector3(0, 0, 12);
              },
            }
          : {}),
        forgivingContacts: true,
        testLaunch: true,
      },
    );
    t.after(() => runtime.dispose());
    const state = { ...createVehicleState(), distance: 100, speed: 80 };
    runtime.reset({ state });
    runtime.launch(state, {
      jump: jump.id,
      position: [0, 20, 180],
      velocity: [0, -20, 90],
    });
    let landed = false;
    for (let tick = 0; tick < 240 && !landed; tick++) {
      clock = state.time + DT;
      world.setGroupMotion('receiver', {
        translation: new T.Vector3(0, 0, state.time * 12),
        velocity: new T.Vector3(0, 0, 12),
      });
      const events = runtime.advance(
        state,
        { throttle: 0, brake: 0, steer: 0, boost: false, airbrake: false },
        DT,
      );
      landed = events.some(
        (event) =>
          event.type === 'jump-transfer' && event.payload.outcome === 'landed',
      );
      assert.ok(!events.some((event) => event.type === 'jump-miss'));
    }
    assert.equal(
      landed,
      true,
      'native moving receiving mesh restores supported traction',
    );
    assert.equal(runtime.pose(1).grounded, true);
    results.push(state.speed);
    if (inherit) assert.deepEqual(phases, ['launch', 'landing']);
    assert.ok(
      Math.abs(world.snapshot().actors[0].velocity.z - state.speed) < 1e-6,
    );
  }
  assert.ok(
    Math.abs(results[0] - results[1] - 12) < 1e-6,
    'the receiver velocity is removed exactly once rather than becoming a free speed pickup',
  );
});
