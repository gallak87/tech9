import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createLaunchworksTrack } from './track/model.js';
import { createSkywellWaterways } from './waterways.js';
import { createZephyrWater } from '../zephyr/environment/water.js';

test('the actual canal and basin water clears its opaque bed and stays inside the masonry banks', () => {
  const track = createLaunchworksTrack(),
    texture = new T.Texture(),
    water = createZephyrWater(track, texture),
    waterways = createSkywellWaterways({
      track,
      stoneTexture: texture,
      water,
      place: () => new T.Group(),
    }),
    matrix = new T.Matrix4(),
    point = new T.Vector3(),
    ray = new T.Raycaster(),
    down = new T.Vector3(0, -1, 0);
  try {
    waterways.group.updateWorldMatrix(true, true);
    for (const district of waterways.group.children) {
      const bed = district.children.find((part) =>
        part.name.endsWith('contained canal and receiver'),
      );
      for (const flow of district.children.filter((part) =>
        /stepped silver flow|receiving water/.test(part.name),
      )) {
        for (let index = 0; index < flow.count; index++) {
          flow.getMatrixAt(index, matrix);
          point
            .set(0, 0, 0)
            .applyMatrix4(matrix)
            .applyMatrix4(flow.matrixWorld);
          ray.set(point.clone().add(new T.Vector3(0, 1000, 0)), down);
          const bedHit = ray.intersectObject(bed)[0];
          assert.ok(bedHit, `${flow.name} has a real contained bed`);
          const clearance = point.y - bedHit.point.y;
          assert.ok(
            clearance >= 0.25 && clearance < 1,
            `${flow.name} ${index} must be visible above its bed, not buried or floating (${clearance} m)`,
          );
        }
      }
    }
  } finally {
    waterways.dispose();
    water.dispose();
    texture.dispose();
  }
});
