import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createVesperTrack } from '../track/model.js';
import { createForestTerrain } from './terrain.js';

test('the river has a continuous submerged bed and its ribbon edges remain buried in banks', () => {
  const terrain = createForestTerrain(createVesperTrack());
  try {
    const { points, halfWidth, level } = terrain.river;
    for (let i = 0; i < points.length; i++) {
      const [x, z] = points[i];
      assert.ok(
        terrain.height(x, z) <= level - 20,
        'connected submerged channel',
      );
      const a = points[Math.max(0, i - 1)],
        b = points[Math.min(points.length - 1, i + 1)];
      const dx = b[0] - a[0],
        dz = b[1] - a[1],
        length = Math.hypot(dx, dz);
      for (const side of [-1, 1]) {
        const edge = terrain.height(
          x - ((side * dz) / length) * halfWidth,
          z + ((side * dx) / length) * halfWidth,
        );
        assert.ok(
          edge > level + 5,
          `exposed ribbon edge at ${x},${z}: ${edge}`,
        );
      }
    }
  } finally {
    terrain.dispose();
  }
});

test('water depth follows the rendered terrain triangles across both banks and cell diagonals', () => {
  const terrain = createForestTerrain(createVesperTrack());
  const ray = new T.Raycaster(new T.Vector3(), new T.Vector3(0, -1, 0));
  terrain.mesh.updateMatrixWorld(true);
  try {
    for (const [x, z] of terrain.river.points
      .slice(2, -2)
      .filter((_, i) => i % 3 === 0)) {
      for (const offset of [-120, -65, 0, 65, 120]) {
        const sampleX = x + 3.73,
          sampleZ = z + offset + 2.19;
        ray.ray.origin.set(sampleX, 1000, sampleZ);
        const [hit] = ray.intersectObject(terrain.mesh);
        assert.ok(hit, 'retained terrain must cover the sampled river banks');
        assert.ok(
          Math.abs(terrain.surfaceHeight(sampleX, sampleZ) - hit.point.y) <
            0.001,
          `water/bank depth disagrees with the actual mesh at ${sampleX},${sampleZ}`,
        );
      }
    }
    assert.equal(terrain.surfaceHeight(-1500, 0), terrain.height(-1500, 0));
  } finally {
    terrain.dispose();
  }
});
