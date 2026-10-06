import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  createCollisionWorld,
  indexedTriangles,
} from '../src/physics/collision-world.js';
import { VEHICLE_HULL } from '../src/physics/hull.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';

const DT = 1 / 120;
const vector = (values) => new T.Vector3(...values);
const pose = (position, yaw = 0, roll = 0) => ({
  position: vector(position),
  quaternion: new T.Quaternion().setFromEuler(new T.Euler(0, yaw, roll, 'YXZ')),
});
function box(position, dimensions, id, yaw = 0) {
  const geometry = new T.BoxGeometry(...dimensions);
  const matrix = new T.Matrix4().compose(
    vector(position),
    new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw),
    new T.Vector3(1, 1, 1),
  );
  const triangles = indexedTriangles(
    geometry.attributes.position.array,
    geometry.index.array,
    { id, kind: 'structure' },
    matrix,
  );
  geometry.dispose();
  return triangles;
}
const ground = [
  {
    id: 'ground',
    kind: 'terrain',
    points: [
      [-50, 0, -50],
      [-50, 0, 50],
      [50, 0, -50],
    ],
  },
  {
    id: 'ground',
    kind: 'terrain',
    points: [
      [-50, 0, 50],
      [50, 0, 50],
      [50, 0, -50],
    ],
  },
];
async function fixture(t, triangles, gravity = 0) {
  const source = createCollisionWorld({
    id: 'rapier-proof',
    version: 1,
    geometryId: 'rapier-proof-v1',
    triangles,
  });
  const world = await createRapierWorld({ collisionWorld: source, gravity });
  t.after(() => {
    world.dispose();
    source.dispose();
  });
  return world;
}
function launch(
  world,
  position,
  velocity,
  { yaw = 0, roll = 0, spin = [0, 0, 0] } = {},
) {
  const actor = world.createActor({ hull: VEHICLE_HULL });
  actor.stage({
    pose: pose(position, yaw, roll),
    velocity: vector(velocity),
    angularVelocity: vector(spin),
    active: true,
  });
  return actor;
}
function values(actor) {
  const state = actor.read();
  return {
    position: state.position.toArray(),
    quaternion: state.quaternion.toArray(),
    velocity: state.velocity.toArray(),
    angularVelocity: state.angularVelocity.toArray(),
    active: state.active,
    contacts: state.contacts.map(({ point, normal, shape }) => ({
      point: point.toArray(),
      normal: normal.toArray(),
      collider: shape.id,
    })),
  };
}
function finiteState(state) {
  for (const name of [
    'position',
    'quaternion',
    'velocity',
    'angularVelocity',
  ]) {
    assert.ok(
      state[name].toArray().every(Number.isFinite),
      `${name} stays finite`,
    );
  }
  assert.ok(
    Math.abs(state.quaternion.length() - 1) < 1e-5,
    'orientation stays normalized',
  );
}

test('600 km/h CCD catches the rotated whole hull against a 3 cm wall', async (t) => {
  const world = await fixture(t, box([0, 4, 0], [0.03, 20, 60], 'thin-wall'));
  const actor = launch(world, [-4.5, 4, 0], [600 / 3.6, 0, 0], {
    yaw: Math.PI / 3,
  });
  const contacts = [];
  const positions = [];
  for (let tick = 0; tick < 18; tick++) {
    world.step(DT);
    const state = actor.read();
    finiteState(state);
    positions.push(state.position.x);
    contacts.push(...state.contacts);
  }
  assert.ok(
    contacts.length > 0,
    'the nose/wing hits before the centre reaches the wall',
  );
  assert.ok(
    positions.every((x) => x < -0.015),
    'the centre never tunnels through the wall',
  );
  assert.ok(
    actor.read().velocity.x < 150,
    'contact changes the 166.7 m/s incoming velocity',
  );
  assert.ok(
    contacts.some(({ shape }) => shape.id === 'thin-wall'),
    'contacts retain source metadata',
  );
  assert.ok(
    contacts.some(({ point }) => Math.abs(point.x) < 0.04),
    'contact point is on the thin wall',
  );
  assert.ok(
    contacts.some(({ normal }) => normal.x < -0.9),
    'normal faces the approaching hull',
  );
});

test('off-centre wing and nose contacts create spin and deflect world velocity', async (t) => {
  for (const scenario of [
    {
      name: 'wing',
      triangles: box([2, 4, 0], [1, 8, 0.06], 'wing-obstacle'),
      position: [0, 4, -4.8],
      velocity: [0, 0, 100],
      yaw: 0,
    },
    {
      name: 'nose',
      triangles: box([0, 4, 0], [0.06, 8, 30], 'nose-wall'),
      position: [-4.5, 4, 0],
      velocity: [100, 0, 0],
      yaw: 0.65,
    },
  ]) {
    const world = await fixture(t, scenario.triangles);
    const actor = launch(world, scenario.position, scenario.velocity, {
      yaw: scenario.yaw,
    });
    const initial = actor.read();
    let contacts = 0;
    let peakSpin = 0;
    let peakDeflection = 0;
    for (let tick = 0; tick < 36; tick++) {
      world.step(DT);
      const state = actor.read();
      finiteState(state);
      contacts += state.contacts.length;
      peakSpin = Math.max(peakSpin, state.angularVelocity.length());
      peakDeflection = Math.max(
        peakDeflection,
        state.velocity
          .clone()
          .cross(initial.velocity.clone().normalize())
          .length(),
      );
    }
    assert.ok(contacts > 0, `${scenario.name} reaches a real obstacle`);
    assert.ok(
      peakSpin > 0.2,
      `${scenario.name} contact produces measurable angular velocity: ${peakSpin}`,
    );
    assert.ok(
      initial.quaternion.angleTo(actor.read().quaternion) > 0.02,
      `${scenario.name} changes orientation`,
    );
    assert.ok(
      peakDeflection > 0.2,
      `${scenario.name} changes velocity direction: ${peakDeflection}`,
    );
  }
});

test('repeated recovery contacts with ground and a thin edge keep a tumbling hull finite and above ground', async (t) => {
  const world = await fixture(
    t,
    [...ground, ...box([0, 0.5, 0], [40, 1, 0.03], 'edge')],
    26,
  );
  const actor = launch(world, [0, 3, -8], [1, -10, 20], {
    yaw: 0.1,
    roll: 0.35,
    spin: [0.7, 1.5, 0.4],
  });
  const sources = new Set();
  let contactFrames = 0;
  let rotatingContactFrames = 0;
  let before = actor.read();
  for (let tick = 0; tick < 144; tick++) {
    world.step(DT);
    const state = actor.read();
    finiteState(state);
    assert.ok(
      state.position.y > -0.2,
      'recovery never tunnels beneath the ground',
    );
    if (state.contacts.length) {
      contactFrames++;
      for (const contact of state.contacts) sources.add(contact.shape.id);
      if (before.quaternion.angleTo(state.quaternion) > 0.001)
        rotatingContactFrames++;
    }
    before = state;
  }
  assert.ok(
    sources.has('ground') && sources.has('edge'),
    'both ground and edge physically participate',
  );
  assert.ok(
    contactFrames >= 3,
    `repeated contacts are exercised: ${contactFrames}`,
  );
  assert.ok(
    rotatingContactFrames >= 2,
    `orientation continues changing during contacts: ${rotatingContactFrames}`,
  );
});

test('overlapping and crossing ship actors match isolated motion because racer filters exclude each other', async (t) => {
  const pairedWorld = await fixture(t, []);
  const isolatedWorld = await fixture(t, []);
  const first = launch(pairedWorld, [-4, 3, 0], [40, 0, 0]);
  const second = launch(pairedWorld, [4, 3, 0], [-40, 0, 0]);
  const isolated = launch(isolatedWorld, [-4, 3, 0], [40, 0, 0]);
  let overlapFrames = 0;
  for (let tick = 0; tick < 48; tick++) {
    pairedWorld.step(DT);
    isolatedWorld.step(DT);
    const a = first.read();
    const b = second.read();
    if (Math.abs(a.position.x - b.position.x) < VEHICLE_HULL.halfWidth * 2)
      overlapFrames++;
    assert.deepEqual(
      values(first),
      values(isolated),
      'another racer has no influence on physical motion',
    );
    assert.equal(a.contacts.length + b.contacts.length, 0);
    assert.ok(
      Math.abs(a.position.x + b.position.x) < 1e-5,
      'both bodies keep symmetric free motion',
    );
  }
  assert.ok(overlapFrames > 0, 'the hulls overlap while moving');
  assert.ok(
    first.read().position.x > second.read().position.x,
    'the ships pass through each other',
  );
});

test('JSON engine snapshot restore reproduces a contact continuation through the same actor handles', async (t) => {
  const world = await fixture(
    t,
    [...ground, ...box([0, 0.5, 0], [40, 1, 0.03], 'edge')],
    26,
  );
  const first = launch(world, [0, 3, -8], [1, -10, 20], {
    yaw: 0.1,
    roll: 0.35,
    spin: [0.7, 1.5, 0.4],
  });
  const second = launch(world, [0.5, 4, -7.5], [-1, -9, 19], {
    yaw: -0.1,
    spin: [0.4, -0.6, 0.2],
  });
  for (let tick = 0; tick < 20; tick++) world.step(DT);
  const saved = JSON.parse(JSON.stringify(world.snapshot()));
  const advance = () => {
    const trace = [];
    for (let tick = 0; tick < 48; tick++) {
      first.stage({ active: true, acceleration: vector([0.25, 0, -0.5]) });
      second.stage({ active: true, acceleration: vector([-0.25, 0, 0.5]) });
      world.step(DT);
      trace.push([values(first), values(second)]);
    }
    return trace;
  };
  const expected = advance();
  assert.ok(
    expected.some((actors) => actors.some((actor) => actor.contacts.length)),
    'continuation includes physical contact',
  );
  world.restore(saved);
  assert.deepEqual(
    advance(),
    expected,
    'restoring engine state reproduces every pose, velocity, spin and contact',
  );
});
