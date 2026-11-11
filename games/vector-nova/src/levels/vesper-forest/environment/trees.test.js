import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createVesperTrack } from '../track/model.js';
import { createVesperEnvironment } from './index.js';
import { allowWorldkitAssetReads } from './asset-test-utils.js';
import {
  createCollisionWorld,
  indexedTriangles,
} from '../../../physics/collision-world.js';

test('all four Sapling grove forms and both rendered qualities clear the complete road and camera sweep', async (t) => {
  allowWorldkitAssetReads(t);
  t.mock.method(
    T.TextureLoader.prototype,
    'loadAsync',
    async () => new T.Texture(),
  );
  const track = createVesperTrack(),
    environment = await createVesperEnvironment({ track });
  environment.group.updateMatrixWorld(true);
  const poses = [];
  for (let s = 0; s <= track.length + 4; s += 4) {
    const frame = track.sample(s);
    poses.push({
      distance: s,
      position: frame.position.clone().addScaledVector(frame.up, 12.5),
      quaternion: frame.quaternion,
    });
  }
  const distant = environment.group.children.filter(
    (mesh) => mesh.isInstancedMesh && mesh.name.endsWith('distant'),
  );
  const worlds = new Map();
  const trees = new Set();
  let checks = 0;
  const worldFor = (geometry) => {
    if (!worlds.has(geometry)) {
      const triangles = indexedTriangles(
        geometry.attributes.position.array,
        geometry.index.array,
        { id: `tree-${worlds.size}`, kind: 'structure' },
      );
      worlds.set(
        geometry,
        createCollisionWorld({
          id: `tree-${worlds.size}`,
          version: 1,
          geometryId: 'retained-forest-wood',
          triangles,
        }),
      );
    }
    return worlds.get(geometry);
  };
  try {
    for (const far of distant) {
      const near = environment.group.children.find(
        (mesh) =>
          mesh.isInstancedMesh &&
          mesh.name === far.name.replace('distant', 'near') &&
          mesh.material === far.material,
      );
      for (let i = 0; i < far.count; i++) {
        trees.add(`${far.name}:${i}`);
        const instance = new T.Matrix4();
        far.getMatrixAt(i, instance);
        instance.premultiply(far.matrixWorld);
        const inverse = instance.clone().invert(),
          position = new T.Vector3(),
          rotation = new T.Quaternion(),
          scale = new T.Vector3();
        instance.decompose(position, rotation, scale);
        rotation.invert();
        assert.ok(
          Math.abs(scale.x - scale.y) < 1e-6 &&
            Math.abs(scale.x - scale.z) < 1e-6,
          'tree transforms retain uniform authored scale',
        );
        const local = (pose) => ({
          position: pose.position.clone().applyMatrix4(inverse),
          quaternion: rotation.clone().multiply(pose.quaternion),
        });
        for (const mesh of [near, far]) {
          // Inflate the independent swept hull by the complete shader offset
          // bound. Every possible leaf displacement stays outside this space.
          const margin = mesh.geometry.attributes.windAnchor ? 2.4 : 0;
          const hull = {
            halfWidth: (track.width / 2 + 1.5 + margin) / scale.x,
            hover: (13 + margin) / scale.x,
            halfLength: (1.5 + margin) / scale.x,
          };
          const geometry = mesh.geometry,
            world = worldFor(geometry);
          const bounds = geometry.boundingBox
            .clone()
            .applyMatrix4(instance)
            .expandByScalar(26);
          for (let j = 0; j < poses.length - 1; j++) {
            const a = poses[j],
              b = poses[j + 1];
            if (
              !bounds.containsPoint(a.position) &&
              !bounds.containsPoint(b.position)
            )
              continue;
            checks++;
            const hit = world.sweepHull(local(a), local(b), hull);
            assert.equal(
              hit,
              null,
              `${mesh.name} instance${i} crosses road/camera at${a.distance.toFixed(1)}m`,
            );
          }
        }
      }
    }
    assert.ok(
      trees.size > 150,
      'the forest keeps substantial founded tree coverage',
    );
    assert.equal(
      worlds.size,
      16,
      'wood and foliage in all four Sapling forms and both qualities are checked',
    );
    assert.ok(
      checks > 1000,
      'bounded queries cover the near-road wood across the complete route',
    );
  } finally {
    for (const world of worlds.values()) world.dispose();
    environment.dispose();
  }
});
