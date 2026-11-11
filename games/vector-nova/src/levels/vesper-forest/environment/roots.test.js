import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createVesperTrack } from '../track/model.js';
import { createVesperEnvironment } from './index.js';
import {
  createCollisionWorld,
  indexedTriangles,
} from '../../../physics/collision-world.js';

test('actual forest supports and hollow triangles clear the entire driving width and chase-camera corridor through every roll', async (t) => {
  t.mock.method(
    T.TextureLoader.prototype,
    'loadAsync',
    async () => new T.Texture(),
  );
  const track = createVesperTrack(),
    environment = await createVesperEnvironment({ track });
  const roots = environment.group.getObjectByName(
    'Living Forest / rooted road foundations',
  );
  assert.ok(roots, 'rooted construction remains visible');
  environment.group.updateMatrixWorld(true);
  const hollow = environment.group.getObjectByName(
    'Living Forest / ancient hollow cathedral',
  );
  const triangles = [roots, ...hollow.children].flatMap((mesh) =>
    indexedTriangles(
      mesh.geometry.attributes.position.array,
      mesh.geometry.index.array,
      { id: mesh.name, kind: 'structure' },
      mesh.matrixWorld,
    ),
  );
  const world = createCollisionWorld({
    id: 'forest-structural-clearance',
    version: 1,
    geometryId: 'actual-rendered-roots-and-hollow',
    triangles,
  });
  try {
    assert.ok(
      roots.userData.attachments.length > 30,
      'the fix preserves rooted supports throughout the forest',
    );
    assert.ok(
      roots.userData.attachments.some(({ distance }) =>
        track.inversions.some(
          ({ start, end }) => distance > start && distance < end,
        ),
      ),
      'the rolled span retains founded supports',
    );
    const pose = (s) => {
      const f = track.sample(s);
      return {
        position: f.position.clone().addScaledVector(f.up, 12.5),
        quaternion: f.quaternion,
      };
    };
    const hull = {
      halfWidth: track.width / 2 + 2,
      hover: 13.5,
      halfLength: 1.5,
    };
    for (let s = 0; s < track.length; s += 4) {
      const hit = world.sweepHull(pose(s), pose(s + 4), hull);
      assert.equal(
        hit,
        null,
        `support/hollow crosses driving/camera space at ${s.toFixed(1)}m: ${hit?.shape.id}`,
      );
    }
  } finally {
    world.dispose();
    environment.dispose();
  }
});
