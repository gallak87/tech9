import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  Texture,
  Vector3,
} from 'three';
import { createVesperTrack } from '../src/levels/vesper/track/model.js';
import { createVesperEnvironment } from '../src/levels/vesper/environment/index.js';
import { vesperTerrainHeight } from '../src/levels/vesper/environment/terrain.js';

const track = createVesperTrack();
function watchedAsset() {
  const scene = new Group();
  const geometry = new BoxGeometry();
  const map = new Texture();
  const material = new MeshStandardMaterial({ map });
  scene.add(new Mesh(geometry, material));
  const counts = [0, 0, 0];
  [geometry, material, map].forEach((resource, i) =>
    resource.addEventListener('dispose', () => counts[i]++),
  );
  return { scene, counts };
}

test('tree seating samples the rendered terrain triangles rather than the analytic surface between vertices', () => {
  const environment = createVesperEnvironment({ track });
  try {
    environment.group.updateMatrixWorld(true);
    const floor = environment.group.getObjectByName(
      'Vesper / continuous ravine floor and root terraces',
    );
    const ray = new Raycaster();
    const samples = Array.from({ length: 64 }, (_, i) => [
      -1580 + ((i * 977) % 3750),
      -1650 + ((i * 631) % 3280),
    ]);
    // The composed bank crosses coarse/dense grid boundaries and rooted groves.
    samples.push(
      [330, -490],
      [670, -40],
      [485.173, -257.453],
      [580.324, -349.492],
      [448.615, -179.264],
      [500, -265],
    );
    for (const [x, z] of samples) {
      ray.set(new Vector3(x, 50, z), new Vector3(0, -1, 0));
      const hit = ray.intersectObject(floor)[0];
      assert.ok(hit);
      assert.ok(
        Math.abs(hit.point.y - vesperTerrainHeight(x, z, track.groundY)) <
          0.0001,
      );
    }
  } finally {
    environment.dispose();
  }
});

test('a rejected secondary forest load releases the already loaded main library', async () => {
  const first = watchedAsset();
  const environment = createVesperEnvironment({
    track,
    loadAsset: async (url) => {
      if (url.endsWith('vesper-canopy.glb')) return first;
      throw new Error('Missing forest fixture');
    },
  });
  try {
    await assert.rejects(environment.ready, {
      message: 'Vesper connected forest could not load. Reload to retry.',
    });
    assert.deepEqual(first.counts, [1, 1, 1]);
    assert.equal(environment.group.userData.metrics.loadState, 'failed');
  } finally {
    environment.dispose();
    environment.dispose();
  }
  assert.deepEqual(first.counts, [1, 1, 1]);
});

test('disposing while the secondary forest is loading releases both late libraries once', async () => {
  const first = watchedAsset(),
    second = watchedAsset();
  let resolveSecond, started;
  const loadingSecond = new Promise((resolve) => {
    started = resolve;
  });
  const environment = createVesperEnvironment({
    track,
    loadAsset: async (url) => {
      if (url.endsWith('vesper-canopy.glb')) return first;
      started();
      return new Promise((resolve) => {
        resolveSecond = resolve;
      });
    },
  });
  await loadingSecond;
  environment.dispose();
  resolveSecond(second);
  await environment.ready;
  environment.dispose();
  assert.deepEqual(first.counts, [1, 1, 1]);
  assert.deepEqual(second.counts, [1, 1, 1]);
  assert.equal(environment.group.children.length, 0);
});

test('the secondary forest shares named primary PBR materials without disposing their textures early', async () => {
  const { shareForestMaterials } =
    await import('../src/levels/vesper/environment/materials.js');
  const { disposeResources } =
    await import('../src/levels/vesper/environment/geometry.js');
  const primary = watchedAsset(),
    secondary = watchedAsset();
  const source = primary.scene.children[0].material;
  const placeholder = secondary.scene.children[0].material;
  source.name = placeholder.name = 'Vesper | ridged indigo bark';
  // Match the texture-free secondary export contract.
  placeholder.map.dispose();
  placeholder.map = null;
  shareForestMaterials(primary.scene, secondary.scene);
  shareForestMaterials(primary.scene, secondary.scene);
  assert.equal(secondary.scene.children[0].material, source);
  assert.deepEqual(primary.counts, [0, 0, 0]);
  assert.deepEqual(secondary.counts, [0, 1, 1]);
  disposeResources([primary.scene, secondary.scene]);
  assert.deepEqual(primary.counts, [1, 1, 1]);
  assert.deepEqual(secondary.counts, [1, 1, 1]);
});
