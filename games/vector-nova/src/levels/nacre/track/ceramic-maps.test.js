import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SharedKTX2Loader as KTX2Loader } from '../../../assets/ktx2-loader.js';
import { createCeramicMaps } from './ceramic-maps.js';

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
  const material = new THREE.MeshPhysicalMaterial();
  const finish = createCeramicMaps(
    { capabilities: { getMaxAnisotropy: () => 16 } },
    material,
  );
  const maps = Array.from({ length: 3 }, () => new THREE.Texture());
  const disposals = [0, 0, 0];
  maps.forEach((map, index) =>
    map.addEventListener('dispose', () => disposals[index]++),
  );
  return { finish, material, pending, maps, disposals };
}

test('ceramic becomes ready only with all data channels, square metric repeats and bounded filtering', async (t) => {
  const { finish, material, pending, maps, disposals } = deferredMaps(t);
  pending[0].resolve(maps[0]);
  await Promise.resolve();
  assert.equal(material.map, null);
  pending[1].resolve(maps[1]);
  pending[2].resolve(maps[2]);
  await finish.ready;
  assert.equal(material.map, maps[0]);
  assert.equal(material.normalMap, maps[1]);
  assert.equal(material.roughnessMap, maps[2]);
  assert.equal(
    material.clearcoatNormalMap,
    null,
    'fine mineral relief stays beneath the smooth coating',
  );
  for (const map of maps) {
    assert.equal(
      map.repeat.x / 9,
      map.repeat.y / 18,
      'equal texel scale along and across the road',
    );
    assert.equal(map.anisotropy, 8);
  }
  assert.equal(maps[0].colorSpace, THREE.SRGBColorSpace);
  assert.equal(maps[1].colorSpace, THREE.NoColorSpace);
  assert.equal(maps[2].colorSpace, THREE.NoColorSpace);
  finish.dispose();
  finish.dispose();
  assert.deepEqual(disposals, [1, 1, 1]);
  material.dispose();
});

test('failed ceramic channels reject readiness; successful siblings are released on cleanup', async (t) => {
  const { finish, material, pending, maps, disposals } = deferredMaps(t);
  pending[0].resolve(maps[0]);
  pending[1].reject(new Error('missing normal'));
  pending[2].resolve(maps[2]);
  await assert.rejects(finish.ready, /Nacre ceramic finish failed to load/);
  assert.equal(material.map, null);
  finish.dispose();
  assert.deepEqual(disposals, [1, 0, 1]);
  material.dispose();
  maps[1].dispose();
});

test('navigation during ceramic decoding releases late maps without binding them', async (t) => {
  const { finish, material, pending, maps, disposals } = deferredMaps(t);
  finish.dispose();
  pending.forEach((load, i) => load.resolve(maps[i]));
  await finish.ready;
  assert.equal(material.map, null);
  assert.deepEqual(disposals, [1, 1, 1]);
  material.dispose();
});

test('CPU contact construction does not fetch renderer textures', async (t) => {
  t.mock.method(KTX2Loader.prototype, 'loadAsync', () => {
    throw new Error('CPU fetch');
  });
  const material = new THREE.MeshPhysicalMaterial(),
    finish = createCeramicMaps(undefined, material);
  await finish.ready;
  assert.equal(material.map, null);
  assert.equal(finish.count, 0);
  finish.dispose();
  material.dispose();
});
