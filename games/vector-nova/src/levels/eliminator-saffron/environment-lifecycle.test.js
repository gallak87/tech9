import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSaffronEliminatorTrack } from './track/model.js';
import { createSaffronEliminatorEnvironment } from './environment.js';

test('an unavailable fossil kit releases the material owners acquired before loading', async (t) => {
  let materials = 0,
    textures = 0;
  const disposeMaterial = T.Material.prototype.dispose,
    disposeTexture = T.Texture.prototype.dispose;
  t.mock.method(T.Material.prototype, 'dispose', function () {
    materials++;
    disposeMaterial.call(this);
  });
  t.mock.method(T.Texture.prototype, 'dispose', function () {
    textures++;
    disposeTexture.call(this);
  });
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async () => {
    throw new Error('Fossil fixture unavailable');
  });
  await assert.rejects(
    createSaffronEliminatorEnvironment({}),
    /Fossil fixture unavailable/,
  );
  assert.ok(materials >= 8, 'the preloaded material family is released');
  assert.equal(textures, 1, 'the owned baked volume releases on failure');
});

test('Ossuary teardown releases source/instance owners once and restores the borrowed floor', async (t) => {
  const releases = new Map();
  const observe = (resource) => {
    if (releases.has(resource)) return;
    releases.set(resource, 0);
    resource.addEventListener('dispose', () =>
      releases.set(resource, releases.get(resource) + 1),
    );
  };
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async (url) => {
    const file = String(url).split('assets/levels/')[1];
    const bytes = await fs.readFile(
      new URL(`../../../public/assets/levels/${file}`, import.meta.url),
    );
    const result = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    );
    result.scene.traverse((object) => {
      if (!object.isMesh) return;
      observe(object.geometry);
      for (const material of [object.material].flat()) observe(material);
    });
    return result;
  });
  const group = new T.Group(),
    geometry = new T.PlaneGeometry(),
    original = new T.MeshStandardMaterial();
  const structure = new T.MeshStandardMaterial(),
    reflection = new T.Texture();
  let borrowedDisposals = 0;
  for (const resource of [geometry, original, structure, reflection])
    resource.addEventListener('dispose', () => borrowedDisposals++);
  const floor = new T.Mesh(geometry, original);
  floor.userData.drivingSurface = true;
  const backing = new T.Group();
  backing.name = 'Closed underside carrier';
  group.add(floor, backing);
  const environment = await createSaffronEliminatorEnvironment({
    track: createSaffronEliminatorTrack(),
    road: { group, materials: { structure } },
  });
  try {
    assert.notEqual(floor.material, original);
    assert.equal(backing.visible, false);
    assert.equal(environment.group.userData.ossuary.staticWorld, true);
    environment.group.traverse((object) => {
      if (object.isInstancedMesh) observe(object);
      if (!object.isMesh) return;
      observe(object.geometry);
      for (const material of [object.material].flat()) {
        if (material === structure) continue;
        observe(material);
        for (const value of Object.values(material))
          if (value?.isTexture && value !== reflection) observe(value);
      }
    });
    observe(floor.material);
    environment.setReflection(reflection);
  } finally {
    environment.dispose();
    environment.dispose();
    assert.equal(floor.material, original);
    assert.equal(backing.visible, true);
    assert.equal(
      borrowedDisposals,
      0,
      'the level does not dispose borrowed road or reflection owners',
    );
    for (const count of releases.values()) assert.equal(count, 1);
    for (const resource of [geometry, original, structure, reflection])
      resource.dispose();
  }
});
