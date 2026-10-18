import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import { createRoadSurface } from '../src/physics/road-surface.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';

function deck(id, y, station = 0, reverse = false) {
  const points = [
    [-10, y, 0],
    [-10, y, 40],
    [10, y, 0],
    [10, y, 40],
  ];
  const coords = [
    [station, -10],
    [station + 40, -10],
    [station, 10],
    [station + 40, 10],
  ];
  return [
    [0, 1, 2],
    [2, 1, 3],
  ].map((indices) => {
    if (reverse) indices.reverse();
    return {
      id,
      kind: 'deck',
      start: station,
      end: station + 40,
      points: indices.map((i) => points[i]),
      roadCoordinates: indices.map((i) => coords[i]),
    };
  });
}
const reference = { position: new Vector3(0, 0, 20), up: new Vector3(0, 1, 0) };
const DT = 1 / 120;

test('road sampling selects the local top surface, leaves gaps empty, and keeps crossed roads separate', () => {
  const sample = createRoadSurface([
    ...deck('road', 0),
    ...deck('other-layer', 1.5),
    ...deck('underside', -0.5, 0, true),
    ...deck('crossed-road', 0.8, 100),
  ]);
  const road = sample(20, 0, reference);
  assert.equal(road.position.y, 0);
  assert.deepEqual(road.roadOwners, ['road']);
  assert.equal(sample(50, 0, reference), null);
  assert.equal(sample(20, 11, reference), null);
  assert.equal(sample(120, 0, reference).position.y, 0.8);
});

test('native road ownership releases on takeoff; other decks and undersides remain solid across restore', async (t) => {
  const world = await createRapierWorld({
    collisionWorld: {
      id: 'ownership-fixture',
      version: 1,
      rulesId: 'ownership-fixture',
      triangles: [...deck('road', 0), ...deck('other-road', 1.5, 100)],
    },
  });
  t.after(() => world.dispose());
  const actor = world.createActor();
  const support = {
    position: new Vector3(0, 0.6, 10),
    quaternion: new Quaternion(),
    road: { distance: 10, length: 0, reach: 5, owners: ['road'] },
  };
  actor.reset({ pose: support, support, active: true });
  actor.stage({ acceleration: new Vector3(0, 26, 0), support });
  world.step(DT);
  assert.ok(!actor.read().contacts.some(({ shape }) => shape.id === 'road'));
  // A second supported layer is still a genuine overhead collider.
  actor.reset({
    pose: { position: new Vector3(0, 1.05, 10), quaternion: new Quaternion() },
    support,
    active: true,
  });
  actor.stage({ support, acceleration: new Vector3(0, 26, 0) });
  world.step(DT);
  assert.ok(
    actor.read().contacts.some(({ shape }) => shape.id === 'other-road'),
  );
  // Flight restores both sides of the original deck, even below its top face.
  actor.reset({
    pose: { position: new Vector3(0, -2, 10), quaternion: new Quaternion() },
    velocity: new Vector3(0, 30, 0),
    active: true,
  });
  const saved = JSON.parse(JSON.stringify(world.snapshot()));
  const run = () => {
    const contacts = [];
    for (let i = 0; i < 16; i++) {
      world.step(DT);
      contacts.push(...actor.read().contacts);
    }
    assert.ok(contacts.some(({ shape }) => shape.id === 'road'));
    assert.ok(
      actor.read().position.y < 0,
      'the hull cannot pass through the deck underside',
    );
    return {
      position: actor.read().position.toArray(),
      velocity: actor.read().velocity.toArray(),
    };
  };
  const expected = run();
  world.restore(saved);
  assert.deepEqual(run(), expected);
});

test('authored height stays exact while orientation remains continuous over a tessellation diagonal', () => {
  const triangles = deck('twisted-road', 0);
  triangles[1].points[2] = [10, 2, 40];
  const sample = createRoadSurface(triangles);
  const left = sample(20, -0.001, reference);
  const right = sample(20, 0.001, reference);
  assert.equal(left.position.y, 0, 'do not round or flatten the rendered face');
  assert.ok(Math.abs(sample(30, 0, reference).position.y - 0.5) < 1e-9);
  assert.ok(
    left.up.distanceTo(right.up) < 1e-4,
    'a diagonal must not create an abrupt support rotation',
  );
  sample.dispose();
});

test('grounded road ownership survives snapshots and rejects invalid ownership before changing the world', async (t) => {
  const world = await createRapierWorld({
    collisionWorld: {
      id: 'grounded-ownership',
      version: 1,
      rulesId: 'grounded-ownership',
      triangles: deck('road', 0),
    },
  });
  t.after(() => world.dispose());
  const actor = world.createActor();
  const support = {
    position: new Vector3(0, 0.6, 10),
    quaternion: new Quaternion(),
    road: { distance: 10, length: 0, reach: 5, owners: ['road'] },
  };
  actor.reset({
    pose: support,
    velocity: new Vector3(0, 0, 5),
    support,
    active: true,
  });
  world.step(DT);
  const saved = JSON.parse(JSON.stringify(world.snapshot()));
  const invalid = structuredClone(saved);
  invalid.actors[0].support.road.distance = NaN;
  const before = actor.read();
  assert.throws(() => world.restore(invalid), /snapshot identity or actors/);
  assert.deepEqual(actor.read(), before);
  const run = () => {
    for (let i = 0; i < 12; i++) {
      actor.stage({ support, acceleration: new Vector3(0, 26, 0) });
      world.step(DT);
      assert.equal(
        actor.read().contacts.length,
        0,
        'restored support still owns its floor',
      );
    }
    const body = actor.read();
    return {
      position: body.position.toArray(),
      velocity: body.velocity.toArray(),
    };
  };
  const expected = run();
  world.restore(saved);
  assert.deepEqual(actor.read().support.road, support.road);
  assert.deepEqual(run(), expected);
});

test('panel support owns its thin backing without claiming other road layers', () => {
  const sample = createRoadSurface([
    ...deck('backing', -0.12),
    ...deck('panel', 0.06),
    ...deck('lower-road', -1),
    ...deck('overhead', 0.4),
    ...deck('underside', -0.18, 0, true),
    ...deck('crossing', 0, 100),
  ]);
  const skin = sample(20, 0, reference);
  assert.equal(skin.position.y, 0.06);
  assert.deepEqual(new Set(skin.roadOwners), new Set(['panel', 'backing']));
  sample.dispose();
});

test('backing produces no redundant grounded contacts and becomes solid again in flight', async (t) => {
  const world = await createRapierWorld({
    collisionWorld: {
      id: 'layered-road',
      version: 1,
      rulesId: 'layered-road',
      triangles: [...deck('panel', 0.06), ...deck('backing', -0.12)],
    },
  });
  t.after(() => world.dispose());
  const actor = world.createActor();
  const skin = world.sampleRoadSurface(10, 0, reference);
  const support = {
    position: new Vector3(0, 0.5, 10),
    quaternion: new Quaternion(),
    road: { distance: 10, length: 0, reach: 5, owners: skin.roadOwners },
  };
  actor.reset({ pose: support, support, active: true });
  for (let i = 0; i < 12; i++) {
    actor.stage({ support, acceleration: new Vector3(0, 26, 0) });
    world.step(DT);
    assert.equal(actor.read().contacts.length, 0);
  }
  actor.reset({
    pose: { position: new Vector3(0, -2, 10), quaternion: new Quaternion() },
    velocity: new Vector3(0, 30, 0),
    active: true,
  });
  const hits = [];
  for (let i = 0; i < 16; i++) {
    world.step(DT);
    hits.push(...actor.read().contacts);
  }
  assert.ok(hits.some(({ shape }) => shape.id === 'backing'));
  assert.ok(actor.read().position.y < -0.12);
});

test('a narrow bevel cannot impose its steep normal across a broad flat driving panel', () => {
  const triangles = [];
  for (const [left, right, leftY, rightY] of [
    [0, 0.14, 0, 0.06],
    [0.14, 5, 0.06, 0.06],
  ]) {
    const points = [
      [left, leftY, 0],
      [left, leftY, 40],
      [right, rightY, 0],
      [right, rightY, 40],
    ];
    const coordinates = [
      [0, left],
      [40, left],
      [0, right],
      [40, right],
    ];
    for (const indices of [
      [0, 1, 2],
      [2, 1, 3],
    ])
      triangles.push({
        id: 'bevelled-panel',
        kind: 'deck',
        points: indices.map((i) => points[i]),
        roadCoordinates: indices.map((i) => coordinates[i]),
      });
  }
  const sample = createRoadSurface(triangles);
  for (const distance of [1, 10, 20, 30, 39]) {
    const road = sample(distance, 2, {
      position: new Vector3(2, 0, distance),
      up: reference.up,
    });
    assert.ok(
      road.up.angleTo(reference.up) < Math.PI / 180,
      'tiny edge faces cannot induce multi-degree rolling over the flat panel',
    );
    assert.ok(
      Math.abs(road.position.y - 0.06) < 1e-9,
      'height still follows the actual mesh',
    );
    assert.deepEqual(road.roadOwners, ['bevelled-panel']);
  }
  sample.dispose();
});
