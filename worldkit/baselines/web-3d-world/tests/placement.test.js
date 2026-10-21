import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import {
  getForestPlacements,
  getForestColliders,
} from '../src/world/ForestWorld.js';
import { moveGrounded } from '../src/modules/placement-collisions/src/placementCollisions.js';
import { forestDefinition } from '../src/world/forestDefinition.js';

test('forest rendering placements are immutable and drive every substantial collider', () => {
  const placements = getForestPlacements();
  assert.equal(placements, getForestPlacements());
  assert.ok(Object.isFrozen(placements));
  const colliders = getForestColliders();
  for (const [families, radius] of [
    [placements.trees, 0.48],
    [placements.rocks, 1.45],
  ]) {
    for (const entry of families.flat()) {
      assert.ok(Object.isFrozen(entry));
      assert.ok(Object.isFrozen(entry.matrix.elements));
      const collider = colliders.find((item) => item.id === entry.id);
      const point = new Vector3().applyMatrix4(entry.matrix);
      const scale = new Vector3().setFromMatrixScale(entry.matrix);
      assert.equal(collider.x, point.x);
      assert.equal(collider.z, point.z);
      assert.ok(
        Math.abs(collider.radius - radius * Math.max(scale.x, scale.z)) < 1e-8,
      );
    }
  }
});

test('all five rendered deadfall transforms produce full-length blocking chains', () => {
  const deadfall = getForestPlacements().deadfall;
  assert.equal(deadfall.length, 5);
  const colliders = getForestColliders();
  for (const entry of deadfall) {
    const chain = colliders.filter((item) =>
      item.id.startsWith(`${entry.id}-`),
    );
    assert.ok(chain.length > 2);
    const origin = new Vector3().applyMatrix4(entry.matrix);
    const end = new Vector3(5.44, 0, 0).applyMatrix4(entry.matrix);
    assert.deepEqual([chain[0].x, chain[0].z], [origin.x, origin.z]);
    assert.ok(
      Math.hypot(chain.at(-1).x - end.x, chain.at(-1).z - end.z) < 1e-8,
    );
    const middle = new Vector3(2.72, 0, 0).applyMatrix4(entry.matrix);
    const dx = end.x - origin.x,
      dz = end.z - origin.z;
    const length = Math.hypot(dx, dz);
    const normal = { x: -dz / length, z: dx / length };
    const start = { x: middle.x + normal.x * 2, z: middle.z + normal.z * 2 };
    const result = moveGrounded(start, -normal.x * 4, -normal.z * 4, {
      bounds: forestDefinition.bounds,
      playerRadius: 0.3,
      colliders: chain,
    });
    assert.ok(
      (result.x - middle.x) * normal.x + (result.z - middle.z) * normal.z > 0.3,
    );
  }
});
