import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Vector3 } from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { generateCollisionHulls } from './generate-ship-collision-hulls.mjs';
import {
  COLLISION_HULLS,
  COLLISION_HULLS_ID,
  getCollisionHull,
} from '../src/ships/collision-hulls.js';

test('all thirteen reduced compounds enclose the GLB surface with at most 10 mm excess', async () => {
  // Generation independently loads each current GLB, applies scene transforms,
  // verifies every triangle fits inside a structural convex part, and checks
  // its exact outer envelope and a 10 mm Euclidean excess bound for every
  // reduced assembly. Deep equality also checks both source hashes.
  assert.deepEqual(await generateCollisionHulls(), COLLISION_HULLS);
  assert.equal(Object.keys(COLLISION_HULLS).length, 13);
});

test('contact proxy identity covers chassis assets and shapes, and lookup is immutable', () => {
  const identity = Object.values(COLLISION_HULLS).map(
    ({ id, assetSha256, hullSha256 }) => [id, assetSha256, hullSha256],
  );
  const digest = createHash('sha256')
    .update(JSON.stringify(identity))
    .digest('hex');
  assert.equal(COLLISION_HULLS_ID, `compound-v2-${digest}`);
  assert.equal(getCollisionHull('tern'), COLLISION_HULLS.tern);
  assert.notEqual(getCollisionHull('tern'), getCollisionHull('shrike'));
  assert.throws(() => getCollisionHull('unknown'), /Unknown collision chassis/);
  assert.throws(
    () => getCollisionHull('toString'),
    /Unknown collision chassis/,
  );
  for (const hull of Object.values(COLLISION_HULLS)) {
    assert.ok(Object.isFrozen(hull));
    assert.ok(Object.isFrozen(hull.vertices));
    assert.ok(Object.isFrozen(hull.bounds.min));
    assert.ok(Object.isFrozen(hull.bounds.max));
    assert.ok(Object.isFrozen(hull.parts));
    assert.ok(hull.parts.length > 1 && hull.parts.length < 20);
    const shapeDigest = createHash('sha256')
      .update(JSON.stringify({ vertices: hull.vertices, parts: hull.parts }))
      .digest('hex');
    assert.equal(
      hull.hullSha256,
      shapeDigest,
      `${hull.id}: part geometry is included in replay identity`,
    );
    for (const part of hull.parts) {
      assert.ok(Object.isFrozen(part));
      assert.ok(Object.isFrozen(part.vertices));
      assert.ok(Object.isFrozen(part.bounds.min));
      assert.ok(Object.isFrozen(part.bounds.max));
    }
  }
});

test('open channels and hammerhead recesses are empty on both sides of the chassis', () => {
  const makeHull = (vertices) => {
    const points = [];
    for (let index = 0; index < vertices.length; index += 3)
      points.push(new Vector3(...vertices.slice(index, index + 3)));
    return new ConvexHull().setFromPoints(points);
  };
  // These points sit inside the previous single-hull collider, in visible air
  // between the authored centre body and its outboard structures.
  const recesses = {
    vise: [1.1, 0.5, 0.3],
    tern: [0.8, 0.3, 0.1],
    bastion: [0.75, 0.4, -0.3],
    latch: [0.75, 0.4, -0.3],
  };
  for (const [id, point] of Object.entries(recesses)) {
    const hull = getCollisionHull(id);
    const envelope = makeHull(hull.vertices);
    const parts = hull.parts.map((part) => makeHull(part.vertices));
    for (const side of [-1, 1]) {
      const probe = new Vector3(side * point[0], point[1], point[2]);
      assert.ok(
        envelope.containsPoint(probe),
        `${id}: regression probe is inside old envelope`,
      );
      assert.ok(
        parts.every((part) => !part.containsPoint(probe)),
        `${id}: visible recess remains empty`,
      );
    }
  }
});
