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

test('off-centre wing and nose contacts create spin and change world velocity', async (t) => {
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
    let peakVelocityChange = 0;
    for (let tick = 0; tick < 36; tick++) {
      world.step(DT);
      const state = actor.read();
      finiteState(state);
      contacts += state.contacts.length;
      peakSpin = Math.max(peakSpin, state.angularVelocity.length());
      peakVelocityChange = Math.max(
        peakVelocityChange,
        state.velocity.distanceTo(initial.velocity),
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
      peakVelocityChange > 0.2,
      `${scenario.name} changes velocity: ${peakVelocityChange}`,
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

test('opposing racers exchange real contact impulses instead of crossing through each other', async (t) => {
  const pairedWorld = await fixture(t, []);
  const isolatedWorld = await fixture(t, []);
  const first = launch(pairedWorld, [-4, 3, 0], [40, 0, 0]);
  const second = launch(pairedWorld, [4, 3, 0], [-40, 0, 0]);
  const isolated = launch(isolatedWorld, [-4, 3, 0], [40, 0, 0]);
  const contacts = [];
  for (let tick = 0; tick < 48; tick++) {
    pairedWorld.step(DT);
    isolatedWorld.step(DT);
    const a = first.read();
    const b = second.read();
    finiteState(a);
    finiteState(b);
    contacts.push(...a.contacts, ...b.contacts);
    assert.ok(
      b.position.x - a.position.x >=
        VEHICLE_HULL.halfWidth * 2 - 80 * DT - 0.01,
      'contact overlap is bounded by one fixed step, not passage through the hull',
    );
    assert.ok(
      Math.abs(a.velocity.x + b.velocity.x) < 1e-4,
      'equal and opposite contact impulses preserve total momentum',
    );
    assert.ok(
      Math.abs(a.position.x + b.position.x) < 1e-5,
      'both bodies keep symmetric physical contact response',
    );
  }
  assert.ok(
    contacts.some(
      (hit) => hit.shape.actorId === first.id && hit.incomingSpeed > 75,
    ),
  );
  assert.ok(
    contacts.some(
      (hit) => hit.shape.actorId === second.id && hit.incomingSpeed > 75,
    ),
  );
  assert.ok(
    first.read().position.x < second.read().position.x,
    'the ships cannot pass through each other',
  );
  assert.ok(
    isolated.read().position.x > first.read().position.x + 10,
    'only the contacting craft is impeded',
  );
  assert.ok(
    first.read().velocity.x <= 0 && second.read().velocity.x >= 0,
    'neither craft continues through the other after contact',
  );
  // Finite-step penetration stabilization can add a small separating speed.
  // The rebound must remain near the material's 0.25 restitution (10 m/s each).
  assert.ok(
    Math.abs(first.read().velocity.x + 10) < 1 &&
      Math.abs(second.read().velocity.x - 10) < 1,
    `the centred pair has a bounded material rebound: ${first.read().velocity.x} / ${second.read().velocity.x}`,
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

// The source mesh spans hundreds of metres; it must not become one enormous
// broad-phase candidate. Every face still exists and tile seams are drivable.
test('spatial collision batches preserve source faces and permit smooth high-speed seam crossings', async (t) => {
  const triangles = [];
  for (let z = 0; z < 480; z += 4) {
    const points = [
      [-15, 0, z],
      [-15, 0, z + 4],
      [15, 0, z],
      [15, 0, z + 4],
    ];
    for (const indices of [
      [0, 1, 2],
      [2, 1, 3],
    ])
      triangles.push({
        id: 'long-deck',
        kind: 'deck',
        distance: z + 2,
        start: 0,
        end: 480,
        points: indices.map((i) => points[i]),
      });
  }
  const world = await fixture(t, triangles, 26);
  const actor = launch(world, [0, 2, 80], [0, -8, 150]);
  let contacts = 0;
  for (let tick = 0; tick < 240; tick++) {
    world.step(DT);
    const state = actor.read();
    assert.ok(state.velocity.z > 149, 'seam must not brake the sliding hull');
    assert.ok(state.position.y > 0.65, 'no tunnelling through the seam');
    for (const contact of state.contacts) {
      contacts++;
      assert.equal(contact.shape.id, 'long-deck');
      assert.equal(contact.shape.kind, 'deck');
      // A cached manifold may advance one CCD substep beyond the 4m face.
      assert.ok(
        Math.abs(contact.point.z - contact.shape.distance) <= 2.4,
        `face mismatch: ${contact.point.z} vs ${contact.shape.distance}`,
      );
      assert.ok(contact.normal.y > 0.99, 'face normal survives partitioning');
    }
  }
  assert.ok(actor.read().position.z > 370 && contacts > 0);
});

test('turning in place cannot rotate a corner through a thin wall', async (t) => {
  const world = await fixture(t, box([0, 3, 0], [0.03, 12, 50], 'wall'));
  const actor = launch(world, [-2.6, 3, 0], [0, 0, 0], { spin: [0, 2, 0] });
  let hits = 0;
  for (let tick = 0; tick < 100; tick++) {
    world.step(DT);
    const state = actor.read();
    hits += state.contacts.length;
    const right = new T.Vector3(1, 0, 0).applyQuaternion(state.quaternion),
      front = new T.Vector3(0, 0, 1).applyQuaternion(state.quaternion);
    const extent =
      Math.abs(right.x) * VEHICLE_HULL.halfWidth +
      Math.abs(front.x) * VEHICLE_HULL.halfLength;
    assert.ok(
      state.position.x + extent < 0.05,
      'rotating corners remain on the original side',
    );
  }
  assert.ok(hits > 0);
});

test('ten racers compressing against a thin wall cannot push each other through it', async (t) => {
  const world = await fixture(t, box([0, 3, 0], [0.03, 12, 50], 'wall'));
  const actors = Array.from({ length: 10 }, (_, i) => {
    const a = world.createActor();
    a.reset({
      pose: pose([-2.27 - i * 4.6, 0.72, 0]),
      support: pose([0, 0.72, 0]),
      velocity: vector([i ? 120 : 0, 0, 0]),
      active: true,
    });
    return a;
  });
  let contacts = 0;
  for (let tick = 0; tick < 120; tick++) {
    world.step(DT);
    for (const a of actors) {
      const state = a.read();
      finiteState(state);
      contacts += state.contacts.length;
      assert.ok(state.position.x < -0.015);
      assert.ok(Math.abs(state.position.y - 0.72) < 0.003);
    }
  }
  assert.ok(contacts > 10);
});

test('disposing an old actor twice preserves a replacement that reused its id', async (t) => {
  const world = await createRapierWorld({ gravity: 0 });
  t.after(() => world.dispose());
  const old = world.createActor();
  old.dispose();
  const replacement = world.createActor();
  assert.equal(replacement.id, old.id);
  replacement.reset({
    active: true,
    pose: { position: new T.Vector3(), quaternion: new T.Quaternion() },
    velocity: new T.Vector3(0, 0, 12),
  });
  old.dispose();
  assert.throws(() => old.read(), /disposed/);
  world.step(1 / 120);
  assert.ok(
    Math.abs(replacement.read().position.z - 0.1) < 1e-6,
    'old cleanup must not remove the live actor',
  );
});
