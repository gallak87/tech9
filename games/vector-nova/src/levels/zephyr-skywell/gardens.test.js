import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSkywellGardens } from './gardens.js';

function terrace() {
  const object = new T.Group();
  object.position.set(150, 600, -85);
  object.rotation.y = 0.6;
  object.scale.set(1.3, 0.9, 1.1);
  const ground = new T.Mesh(
    new T.BoxGeometry(260, 20, 180).translate(0, -10, 0),
    new T.MeshStandardMaterial({ name: 'Zephyr · ancient grey strata' }),
  );
  const furniture = new T.Mesh(
    new T.BoxGeometry(70, 25, 80).translate(-42, 12.5, 0),
    new T.MeshStandardMaterial({ name: 'Zephyr · weathered warm limestone' }),
  );
  object.add(ground, furniture);
  return object;
}

test('baked placements reproduce the procedural draw buffers without raycasts', async () => {
  const object = terrace();
  const terraces = [{ object, seed: 57 }];
  const loadTexture = async () => new T.Texture();
  const bakedGroves = [];
  const original = await createSkywellGardens({
    terraces,
    loadTexture,
    onGroveLayout({ trees, shrubs, ...metadata }) {
      bakedGroves.push({
        ...metadata,
        trees: Buffer.from(trees.buffer).toString('base64'),
        shrubs: Buffer.from(shrubs.buffer).toString('base64'),
      });
    },
  });
  object.traverse((mesh) => {
    if (mesh.isMesh)
      mesh.raycast = () => assert.fail('bake requested a raycast');
  });
  const baked = await createSkywellGardens({
    terraces,
    loadTexture,
    bakedGroves,
  });
  const batches = (group) => {
    const matrices = [];
    group.traverse((object) => {
      if (object.isInstancedMesh)
        matrices.push({
          name: object.name,
          values: object.instanceMatrix.array,
        });
    });
    return matrices;
  };
  assert.ok(batches(original.group).length > 0);
  assert.deepEqual(batches(baked.group), batches(original.group));
  assert.deepEqual(baked.group.userData, original.group.userData);
  baked.dispose();
  original.dispose();
  object.traverse((mesh) => {
    mesh.geometry?.dispose();
    mesh.material?.dispose();
  });
});

test('cultivated roots sit on actual transformed terrace tops and avoid masonry furniture', async () => {
  const object = terrace(),
    textures = [],
    gardens = await createSkywellGardens({
      terraces: [{ object, seed: 57 }],
      loadTexture: async () => {
        const texture = new T.Texture();
        textures.push(texture);
        return texture;
      },
    });
  const matrix = new T.Matrix4(),
    point = new T.Vector3(),
    ray = new T.Raycaster();
  assert.ok(gardens.group.userData.treeCount >= 8);
  assert.ok(gardens.group.userData.shrubCount >= 12);
  assert.equal(gardens.group.children.length, 1);
  const draws = [];
  gardens.group.traverse((mesh) => {
    if (!mesh.isInstancedMesh) return;
    draws.push(mesh);
    assert.equal(mesh.castShadow, false);
    assert.equal(mesh.material.transparent, false);
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      point.setFromMatrixPosition(matrix);
      const origin = point.clone();
      origin.y += 100;
      ray.set(origin, new T.Vector3(0, -1, 0));
      const hit = ray.intersectObject(object, true)[0];
      assert.match(hit.object.material.name, /ancient grey strata/);
      assert.ok(point.distanceTo(hit.point) < 0.0001);
    }
  });
  assert.equal(
    draws.length,
    4,
    'one bounded tree batch and shrub batch per terrace',
  );
  const cameraRig = new T.Group(),
    camera = new T.PerspectiveCamera();
  cameraRig.add(camera);
  cameraRig.position.copy(object.position);
  gardens.update(camera);
  assert.equal(gardens.group.children[0].visible, true);
  cameraRig.position.x += 4000;
  gardens.update(camera);
  assert.equal(
    gardens.group.children[0].visible,
    false,
    'distant grove leaves the draw budget',
  );
  cameraRig.position.copy(object.position);
  gardens.update(camera);
  assert.equal(
    gardens.group.children[0].visible,
    true,
    'returning to the district restores its grove',
  );
  const resourceDisposals = new Map();
  const resources = new Set([
    ...draws,
    ...draws.flatMap((mesh) => [mesh.geometry, mesh.material]),
    ...textures,
  ]);
  for (const resource of resources) {
    resourceDisposals.set(resource, 0);
    resource.addEventListener('dispose', () => {
      resourceDisposals.set(resource, resourceDisposals.get(resource) + 1);
    });
  }
  gardens.dispose();
  gardens.dispose();
  assert.ok([...resourceDisposals.values()].every((count) => count === 1));
  assert.equal(gardens.group.children.length, 0);
  gardens.update(camera);
  object.traverse((mesh) => {
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    mesh.material.dispose();
  });
});

test('separate architecture blocks planting even when its roof is above the island rim', async () => {
  const object = terrace(),
    blocker = new T.Group();
  blocker.position.copy(object.position);
  blocker.quaternion.copy(object.quaternion);
  blocker.scale.copy(object.scale);
  const roof = new T.Mesh(
    new T.BoxGeometry(60, 110, 65).translate(42, 55, 0),
    new T.MeshStandardMaterial({ name: 'Zephyr abbey limestone roofs' }),
  );
  blocker.add(roof);
  const gardens = await createSkywellGardens({
    terraces: [{ object, seed: 57, blockers: [blocker] }],
    loadTexture: async () => new T.Texture(),
  });
  assert.ok(gardens.group.userData.treeCount > 0);
  const matrix = new T.Matrix4(),
    point = new T.Vector3(),
    ray = new T.Raycaster();
  gardens.group.traverse((mesh) => {
    if (!mesh.isInstancedMesh) return;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      point.setFromMatrixPosition(matrix);
      const origin = point.clone().setY(900);
      ray.set(origin, new T.Vector3(0, -1, 0));
      assert.equal(ray.intersectObject(blocker, true).length, 0);
    }
  });
  gardens.dispose();
  for (const root of [object, blocker])
    root.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
});

test('a failed canonical image load releases successful arrivals', async () => {
  const texture = new T.Texture(),
    object = terrace();
  let calls = 0,
    disposals = 0;
  texture.addEventListener('dispose', () => disposals++);
  const error = new Error('missing foliage image');
  await assert.rejects(
    createSkywellGardens({
      terraces: [{ object, seed: 1 }],
      loadTexture: async () => {
        if (calls++ === 0) return texture;
        throw error;
      },
    }),
    error,
  );
  assert.equal(disposals, 1);
  object.traverse((mesh) => {
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    mesh.material.dispose();
  });
});

test('canonical Zephyr island geometry exposes real planting terraces', async () => {
  const data = await readFile(
    new URL(
      '../../../public/assets/levels/zephyr/island-grand.glb',
      import.meta.url,
    ),
  );
  const gltf = await new GLTFLoader().parseAsync(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    '',
  );
  gltf.scene.position.set(-450, 800, 1100);
  gltf.scene.rotation.y = -0.7;
  gltf.scene.scale.set(1.35, 1.1, 1.5);
  const gardens = await createSkywellGardens({
    terraces: [{ object: gltf.scene, seed: 719 }],
    loadTexture: async () => new T.Texture(),
  });
  assert.ok(gardens.group.userData.treeCount >= 8);
  assert.ok(gardens.group.userData.shrubCount >= 12);
  gardens.dispose();
  gltf.scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    mesh.material.dispose();
  });
});

test('empty terrace sets allocate no canonical images', async () => {
  const gardens = await createSkywellGardens({
    terraces: [],
    loadTexture() {
      throw new Error('empty gardens must not load art');
    },
  });
  assert.equal(gardens.group.children.length, 0);
  gardens.dispose();
});
