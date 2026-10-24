import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SharedKTX2Loader as KTX2Loader } from '../../../assets/ktx2-loader.js';
import {
  createHelionCeramicMaps,
  setCeramicCoordinates,
  CERAMIC_REPEAT,
} from './ceramic-maps.js';
import { buildHelionRoad, createHelionTrack } from './index.js';

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
  const materials = [
    new THREE.MeshPhysicalMaterial(),
    new THREE.MeshPhysicalMaterial(),
  ];
  const finish = createHelionCeramicMaps(
    { capabilities: { getMaxAnisotropy: () => 16 } },
    materials,
  );
  const maps = Array.from({ length: 3 }, () => new THREE.Texture());
  const disposals = [0, 0, 0];
  maps.forEach((map, i) =>
    map.addEventListener('dispose', () => disposals[i]++),
  );
  return { pending, materials, finish, maps, disposals };
}
test('Helion variants share a complete, correctly filtered texture set and release it once', async (t) => {
  const { pending, materials, finish, maps, disposals } = deferredMaps(t);
  pending[0].resolve(maps[0]);
  await Promise.resolve();
  assert.equal(materials[0].map, null);
  pending[1].resolve(maps[1]);
  pending[2].resolve(maps[2]);
  await finish.ready;
  for (const material of materials) {
    assert.equal(material.map, maps[0]);
    assert.equal(material.normalMap, maps[1]);
    assert.equal(material.clearcoatNormalMap, maps[1]);
    assert.equal(material.roughnessMap, maps[2]);
  }
  assert.equal(maps[0].colorSpace, THREE.SRGBColorSpace);
  for (const map of maps) {
    assert.equal(map.anisotropy, 8);
    assert.deepEqual(
      map.repeat.toArray(),
      CERAMIC_REPEAT.map((v) => 1 / v),
    );
  }
  assert.equal(maps[1].colorSpace, THREE.NoColorSpace);
  assert.equal(maps[2].colorSpace, THREE.NoColorSpace);
  finish.dispose();
  finish.dispose();
  assert.deepEqual(disposals, [1, 1, 1]);
  materials.forEach((m) => m.dispose());
});
test('Helion load failures reject readiness and navigation releases late decoded channels', async (t) => {
  for (const fail of [false, true]) {
    const { pending, materials, finish, maps, disposals } = deferredMaps(t);
    if (!fail) finish.dispose();
    pending[0].resolve(maps[0]);
    pending[2].resolve(maps[2]);
    if (fail) pending[1].reject(new Error('missing normal'));
    else pending[1].resolve(maps[1]);
    if (fail)
      await assert.rejects(finish.ready, /Helion ceramic finish failed/);
    else await finish.ready;
    assert.equal(materials[0].map, null);
    finish.dispose();
    assert.deepEqual(disposals, fail ? [1, 0, 1] : [1, 1, 1]);
    if (fail) maps[1].dispose();
    materials.forEach((m) => m.dispose());
    t.mock.restoreAll();
  }
});
test('metric ceramic mapping preserves production contact geometry and route coordinates', (t) => {
  t.mock.method(KTX2Loader.prototype, 'loadAsync', () => {
    throw new Error('CPU texture fetch');
  });
  const road = buildHelionRoad(createHelionTrack());
  let surfaces = 0;
  try {
    road.group.traverse((mesh) => {
      if (!mesh.userData.drivingSurface) return;
      const g = mesh.geometry,
        position = g.attributes.position.array.slice(),
        route = g.attributes.roadCoord.array.slice();
      setCeramicCoordinates(g);
      assert.deepEqual(g.attributes.position.array, position);
      assert.deepEqual(g.attributes.roadCoord.array, route);
      for (let i = 0; i < g.attributes.uv.count; i++) {
        assert.equal(g.attributes.uv.getX(i), g.attributes.roadCoord.getY(i));
        assert.equal(g.attributes.uv.getY(i), g.attributes.roadCoord.getX(i));
      }
      surfaces++;
    });
    assert.ok(surfaces > 0);
  } finally {
    road.dispose();
  }
});
