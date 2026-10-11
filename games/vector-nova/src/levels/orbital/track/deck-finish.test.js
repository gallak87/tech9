import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { createDeckFinish } from './deck-finish.js';
import { fullRoadNeonMaterial } from './materials.js';

function deferredMaps(t) {
  const pending = [];
  t.mock.method(KTX2Loader.prototype, 'detectSupport', function () {
    return this;
  });
  t.mock.method(
    KTX2Loader.prototype,
    'loadAsync',
    () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
  );
  const finish = createDeckFinish({
    capabilities: { getMaxAnisotropy: () => 16 },
  });
  const maps = Array.from({ length: 3 }, () => new THREE.Texture());
  const disposals = [0, 0, 0];
  maps.forEach((map, index) =>
    map.addEventListener('dispose', () => disposals[index]++),
  );
  return { finish, pending, maps, disposals };
}

test('deck maps reach early neon clones and late bindings; borrowed reflection survives disposal', async (t) => {
  const { finish, pending, maps, disposals } = deferredMaps(t);
  const base = new THREE.MeshStandardMaterial();
  finish.bind(base);
  const neon = fullRoadNeonMaterial(base);
  finish.bind(neon);
  const reflection = new THREE.Texture();
  let reflectionDisposed = false;
  reflection.addEventListener('dispose', () => (reflectionDisposed = true));
  finish.setReflection(reflection);
  pending.forEach((load, index) => load.resolve(maps[index]));
  await finish.ready;
  const late = new THREE.MeshStandardMaterial();
  finish.bind(late);
  for (const material of [base, neon, late]) {
    assert.equal(material.map, maps[0]);
    assert.equal(material.normalMap, maps[1]);
    assert.equal(material.roughnessMap, maps[2]);
    assert.equal(material.aoMap, material.metalnessMap);
    assert.equal(material.envMap, reflection);
    material.dispose();
  }
  assert.deepEqual(maps[0].repeat.toArray(), [6, 2]);
  assert.equal(maps[0].colorSpace, THREE.SRGBColorSpace);
  assert.equal(maps[1].colorSpace, THREE.NoColorSpace);
  assert.equal(maps[2].colorSpace, THREE.NoColorSpace);
  finish.dispose();
  finish.dispose();
  assert.deepEqual(disposals, [1, 1, 1]);
  assert.equal(reflectionDisposed, false);
  reflection.dispose();
});

test('disposing during decoding releases late textures without binding them', async (t) => {
  const { finish, pending, maps, disposals } = deferredMaps(t);
  const material = new THREE.MeshStandardMaterial();
  finish.bind(material);
  finish.dispose();
  pending.forEach((load, index) => load.resolve(maps[index]));
  await finish.ready;
  assert.equal(material.map, null);
  assert.deepEqual(disposals, [1, 1, 1]);
  material.dispose();
});

test('a failed deck channel rejects readiness and releases successfully decoded siblings', async (t) => {
  const { finish, pending, maps, disposals } = deferredMaps(t);
  const material = new THREE.MeshStandardMaterial();
  finish.bind(material);
  pending[0].resolve(maps[0]);
  pending[1].reject(new Error('Missing normal map'));
  pending[2].resolve(maps[2]);
  await assert.rejects(finish.ready, /Asterion deck finish failed to load/);
  assert.equal(material.map, null, 'partial material must never become ready');
  finish.dispose();
  assert.deepEqual(disposals, [1, 0, 1]);
  material.dispose();
  maps[1].dispose();
});
