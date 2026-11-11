import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createRavelFreestyleTrack } from './track/model.js';
import { createRavelFreestyleEnvironment } from './environment.js';

// Vite deduplicates Three.js. Direct Node tests also cover the linked package's
// own dependency so both public material owners use the same failure fixture.
const worldkitRequire = createRequire(
  import.meta.resolve('@worldkit/environment/package.json'),
);
const worldkitThree = await import(
  pathToFileURL(
    resolve(dirname(worldkitRequire.resolve('three')), 'three.module.js'),
  )
);

test('an early foil failure is observed while fleet assets settle and every acquired resource is released', async (t) => {
  const releases = new Map();
  const scenes = [];
  const owned = (resource) => {
    releases.set(resource, 0);
    resource.addEventListener('dispose', () =>
      releases.set(resource, releases.get(resource) + 1),
    );
    return resource;
  };
  const textureLoad = (url) =>
    new Promise((resolve, reject) => {
      if (String(url).includes('sail-foil-height'))
        setTimeout(() => reject(new Error('Early foil fixture failure')), 0);
      else setTimeout(() => resolve(owned(new T.Texture())), 8);
    });
  for (const Loader of new Set([T.TextureLoader, worldkitThree.TextureLoader]))
    t.mock.method(Loader.prototype, 'loadAsync', textureLoad);
  t.mock.method(
    GLTFLoader.prototype,
    'loadAsync',
    () =>
      new Promise((resolve) => {
        setTimeout(() => {
          const scene = new T.Group();
          scene.add(
            new T.Mesh(
              owned(new T.BoxGeometry()),
              owned(new T.MeshStandardMaterial()),
            ),
          );
          scenes.push(scene);
          resolve({ scene });
        }, 20);
      }),
  );
  await assert.rejects(
    createRavelFreestyleEnvironment({
      track: createRavelFreestyleTrack(),
      view: { renderer: { capabilities: { getMaxAnisotropy: () => 1 } } },
    }),
    /Ravel sail foil could not load/,
  );
  assert.equal(
    scenes.length,
    5,
    'all five geometry loads settle before cleanup',
  );
  assert.equal(
    releases.size,
    12,
    'five geometry/material pairs and two finish maps were acquired',
  );
  for (const count of releases.values()) assert.equal(count, 1);
  assert.ok(scenes.every((scene) => scene.children.length === 0));
});

test('connected anchors pack mixed source geometry and restore borrowed road slots on disposal', async (t) => {
  for (const Loader of new Set([T.TextureLoader, worldkitThree.TextureLoader]))
    t.mock.method(Loader.prototype, 'loadAsync', async () => new T.Texture());
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async (url) => {
    const file = String(url).split('/').at(-1);
    const namespace = file.startsWith('receiver-')
      ? 'freestyle-ravel'
      : 'ravel';
    const bytes = await fs.readFile(
      new URL(
        `../../../public/assets/levels/${namespace}/${file}`,
        import.meta.url,
      ),
    );
    return new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    );
  });
  const group = new T.Group(),
    geometry = new T.PlaneGeometry();
  geometry.setAttribute(
    'roadCoord',
    new T.Float32BufferAttribute(new Float32Array(8), 2),
  );
  const original = new T.MeshStandardMaterial({
    name: 'freestyle-ravel / satin mineral-composite running slab',
  });
  let borrowedDisposals = 0;
  original.addEventListener('dispose', () => borrowedDisposals++);
  const roadMesh = new T.Mesh(geometry, original);
  group.add(roadMesh);
  const receiverMaterials = [0, 1].map(
    () =>
      new T.MeshStandardMaterial({
        name: 'Skywell / woven turquoise receiver inlay',
        emissiveIntensity: 0.16,
      }),
  );
  const receiverMeshes = receiverMaterials.map(
    (material) => new T.Mesh(geometry, material),
  );
  group.add(...receiverMeshes);
  const environment = await createRavelFreestyleEnvironment({
    track: createRavelFreestyleTrack(),
    road: { group },
    view: { renderer: { capabilities: { getMaxAnisotropy: () => 1 } } },
  });
  try {
    assert.notEqual(roadMesh.material, original);
    assert.notEqual(receiverMeshes[0].material, receiverMeshes[1].material);
    receiverMeshes[0].material.emissiveIntensity = 0.95;
    assert.equal(
      receiverMeshes[1].material.emissiveIntensity,
      0.16,
      'a catch flash belongs only to its own arrival',
    );
    assert.equal(environment.group.userData.sailbreak.anchorStations.length, 5);
    assert.equal(
      environment.group.userData.sailbreak.anchorStations[0].clearance.safe,
      true,
    );
    assert.ok(
      environment.group.children.some((object) => object.isBatchedMesh),
    );
    assert.equal(environment.group.userData.sailbreak.wingStations.length, 5);
    assert.equal(
      environment.group.userData.sailbreak.wingStations[0].clearance.safe,
      true,
    );
    assert.ok(
      environment.group.userData.sailbreak.wingStations[0].rootContactError <
        1e-8,
    );
    assert.equal(environment.group.userData.sailbreak.jawStations.length, 10);
    assert.equal(environment.group.userData.sailbreak.bayStations.length, 2);
    assert.equal(
      environment.group.userData.sailbreak.bayStations[0].clearance.safe,
      true,
    );
  } finally {
    environment.dispose();
    environment.dispose();
    assert.equal(roadMesh.material, original);
    assert.equal(
      borrowedDisposals,
      0,
      'environment never disposes the borrowed road coating',
    );
    receiverMeshes.forEach((mesh, index) =>
      assert.equal(mesh.material, receiverMaterials[index]),
    );
    receiverMaterials.forEach((material) => material.dispose());
    original.dispose();
    geometry.dispose();
  }
});
