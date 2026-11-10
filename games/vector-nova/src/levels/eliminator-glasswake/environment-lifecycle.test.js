import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createGlasswakeEliminatorTrack } from './track/model.js';
import { createGlasswakeEliminatorEnvironment } from './environment.js';

test('a failed massif observes all settled acquisitions and releases every successful owner', async (t) => {
  const releases = new Map(),
    scenes = [];
  const owned = (resource) => {
    releases.set(resource, 0);
    resource.addEventListener('dispose', () =>
      releases.set(resource, releases.get(resource) + 1),
    );
    return resource;
  };
  t.mock.method(
    T.TextureLoader.prototype,
    'loadAsync',
    () =>
      new Promise((resolve) => {
        setTimeout(() => resolve(owned(new T.Texture())), 8);
      }),
  );
  t.mock.method(
    GLTFLoader.prototype,
    'loadAsync',
    (url) =>
      new Promise((resolve, reject) => {
        if (String(url).includes('fault-massif'))
          setTimeout(() => reject(new Error('Massif fixture failure')), 0);
        else
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
    createGlasswakeEliminatorEnvironment({}),
    /Massif fixture failure/,
  );
  assert.equal(releases.size, 3);
  for (const count of releases.values()) assert.equal(count, 1);
  assert.ok(scenes.every((scene) => scene.children.length === 0));
});

test('private ice owners dispose once and restore the borrowed road finish and backing', async (t) => {
  const releases = new Map(),
    scenes = [];
  const owned = (resource) => {
    if (releases.has(resource)) return resource;
    releases.set(resource, 0);
    resource.addEventListener('dispose', () =>
      releases.set(resource, releases.get(resource) + 1),
    );
    return resource;
  };
  t.mock.method(T.TextureLoader.prototype, 'loadAsync', async () =>
    owned(new T.Texture()),
  );
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async (url) => {
    const relative = String(url).split('assets/levels/')[1];
    const bytes = await fs.readFile(
      new URL(`../../../public/assets/levels/${relative}`, import.meta.url),
    );
    const result = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    );
    result.scene.traverse((object) => {
      if (!object.isMesh) return;
      owned(object.geometry);
      for (const material of [object.material].flat()) owned(material);
    });
    scenes.push(result.scene);
    return result;
  });
  const group = new T.Group(),
    backing = new T.Group();
  backing.name = 'Closed underside carrier';
  group.add(backing);
  const surface = new T.MeshStandardMaterial({
    color: '#123456',
    roughness: 0.51,
    opacity: 0.82,
  });
  const structure = new T.MeshStandardMaterial(),
    edge = new T.MeshStandardMaterial();
  const originalEdge = {
    roughness: edge.roughness,
    metalness: edge.metalness,
    color: edge.color.getHexString(),
  };
  let borrowedDisposals = 0;
  for (const material of [surface, structure, edge])
    material.addEventListener('dispose', () => borrowedDisposals++);
  const before = {
    name: surface.name,
    transparent: surface.transparent,
    opacity: surface.opacity,
    depthWrite: surface.depthWrite,
    roughness: surface.roughness,
    metalness: surface.metalness,
    onBeforeCompile: surface.onBeforeCompile,
    customProgramCacheKey: surface.customProgramCacheKey,
  };
  const environment = await createGlasswakeEliminatorEnvironment({
    track: createGlasswakeEliminatorTrack(),
    road: { group, materials: { surface, structure, edge } },
    view: { renderer: { capabilities: { getMaxAnisotropy: () => 1 } } },
  });
  try {
    assert.equal(backing.visible, false);
    assert.notEqual(surface.onBeforeCompile, before.onBeforeCompile);
    assert.equal(environment.group.userData.fracture.staticWorld, true);
    assert.ok(
      environment.group.children.some((object) => object.isInstancedMesh),
    );
  } finally {
    environment.dispose();
    environment.dispose();
    assert.equal(backing.visible, true);
    for (const [key, value] of Object.entries(before))
      assert.equal(surface[key], value, key);
    assert.equal(surface.color.getHexString(), '123456');
    assert.equal(edge.roughness, originalEdge.roughness);
    assert.equal(edge.metalness, originalEdge.metalness);
    assert.equal(edge.color.getHexString(), originalEdge.color);
    assert.equal(borrowedDisposals, 0);
    for (const count of releases.values()) assert.equal(count, 1);
    assert.ok(scenes.every((scene) => scene.children.length === 0));
    for (const material of [surface, structure, edge]) material.dispose();
  }
});
