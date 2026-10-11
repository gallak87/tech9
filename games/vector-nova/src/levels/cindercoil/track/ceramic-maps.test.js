import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { createCindercoilCeramicMaps, CERAMIC_REPEAT } from './ceramic-maps.js';
import { createCindercoilRoad, createCindercoilTrack } from './index.js';
import { setCeramicCoordinates } from './surface-finish.js';
import { sweepGeometry } from '../../../track/geometry.js';
import { beveledBoxGeometry } from './beveled-box.js';

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
  const finish = createCindercoilCeramicMaps(
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
test('Cindercoil variants share a complete, correctly filtered texture set and release it once', async (t) => {
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
test('Cindercoil load failures reject readiness and navigation releases late decoded channels', async (t) => {
  for (const fail of [false, true]) {
    const { pending, materials, finish, maps, disposals } = deferredMaps(t);
    if (!fail) finish.dispose();
    pending[0].resolve(maps[0]);
    pending[2].resolve(maps[2]);
    if (fail) pending[1].reject(new Error('missing normal'));
    else pending[1].resolve(maps[1]);
    if (fail)
      await assert.rejects(finish.ready, /Cindercoil ceramic finish failed/);
    else await finish.ready;
    assert.equal(materials[0].map, null);
    finish.dispose();
    assert.deepEqual(disposals, fail ? [1, 0, 1] : [1, 1, 1]);
    if (fail) maps[1].dispose();
    materials.forEach((m) => m.dispose());
    t.mock.restoreAll();
  }
});
test('metric grain coordinates preserve geometry and keep cassette joints independent', () => {
  const track = createCindercoilTrack();
  for (const s of [40, track.landmarks.coil.start + 100]) {
    const geometry = sweepGeometry(
      track,
      [
        [-3, 0],
        [3, 0],
      ],
      { start: s, end: s + 12, step: 2 },
    );
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++)
      uv.setY(i, (geometry.attributes.roadCoord.getX(i) - s) / 12);
    const panel = uv.array.slice(),
      position = geometry.attributes.position.array.slice(),
      route = geometry.attributes.roadCoord.array.slice(),
      indices = geometry.index.array.slice();
    setCeramicCoordinates(geometry, true);
    assert.deepEqual(geometry.attributes.position.array, position);
    assert.deepEqual(geometry.attributes.roadCoord.array, route);
    assert.deepEqual(geometry.index.array, indices);
    assert.deepEqual(geometry.attributes.ceramicPanel.array, panel);
    for (let i = 0; i < uv.count; i += 2) {
      assert.ok(
        Math.abs(
          geometry.attributes.uv.getX(i + 1) -
            geometry.attributes.uv.getX(i) -
            6,
        ) < 0.0001,
      );
      assert.equal(
        geometry.attributes.uv.getY(i),
        geometry.attributes.roadCoord.getX(i),
      );
    }
    geometry.dispose();
  }
  const box = beveledBoxGeometry(3.65, 0.48, 13.2, 0.095);
  setCeramicCoordinates(box);
  assert.ok([...box.attributes.uv.array].every(Number.isFinite));
  assert.ok(
    Math.max(...box.attributes.uv.array) > 6,
    'long bodies use metres, not one stretched tile',
  );
  box.dispose();
});
test('shape and collision-only roads never fetch finish maps; road owns maps but borrows reflections', async (t) => {
  t.mock.method(KTX2Loader.prototype, 'detectSupport', function () {
    return this;
  });
  const maps = [],
    released = [];
  t.mock.method(KTX2Loader.prototype, 'loadAsync', async () => {
    const texture = new THREE.Texture();
    maps.push(texture);
    texture.addEventListener('dispose', () => released.push(texture));
    return texture;
  });
  const track = createCindercoilTrack();
  const view = { renderer: { capabilities: { getMaxAnisotropy: () => 4 } } };
  for (const options of [{ shape: true }, { collectSolid() {} }]) {
    const road = createCindercoilRoad({ track, view, ...options });
    await road.ready;
    road.dispose();
  }
  assert.equal(maps.length, 0);
  const road = createCindercoilRoad({ track, view });
  await road.ready;
  assert.equal(maps.length, 3);
  const probe = new THREE.Texture();
  let releasedProbe = false;
  probe.addEventListener('dispose', () => {
    releasedProbe = true;
  });
  road.setReflection(probe);
  let running = 0;
  road.group.traverse((mesh) => {
    if (!mesh.userData.drivingSurface) return;
    assert.equal(mesh.material.map, maps[0]);
    assert.equal(mesh.material.normalMap, maps[1]);
    assert.equal(mesh.material.roughnessMap, maps[2]);
    assert.equal(mesh.material.envMap, probe);
    assert.ok(mesh.geometry.attributes.ceramicPanel);
    running++;
  });
  assert.equal(running, 4);
  road.dispose();
  road.dispose();
  assert.equal(released.length, 3);
  assert.equal(releasedProbe, false);
  probe.dispose();
});
