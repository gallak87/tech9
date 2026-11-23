import test from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as T from 'three';
import { EDITOR_BIOMES } from './biomes.js';
import { createEditorBackdrop } from './biome-backdrop.js';
import { createUmbraBackdrop } from '../levels/umbra/backdrop/index.js';

const fakeTexture = () => {
  const texture = new T.DataTexture(new Uint8Array(4 * 16 * 8), 16, 8);
  let disposals = 0;
  texture.addEventListener('dispose', () => disposals++);
  return { texture, count: () => disposals };
};
test('all17 backdrops use existing registered assets, follow arbitrary cameras and dispose owned resources once', async () => {
  const verified = new Set();
  for (const biome of EDITOR_BIOMES) {
    const loaded = [];
    const part = await createEditorBackdrop(
      { biome: biome.id },
      {
        preview: true,
        loadTexture: async (url) => {
          assert.match(url, /^\/assets\/levels\//);
          if (!verified.has(url)) {
            assert(
              (
                await stat(
                  resolve(import.meta.dirname, '../../public', url.slice(1)),
                )
              ).isFile(),
              url,
            );
            verified.add(url);
          }
          const value = fakeTexture();
          loaded.push(value);
          return value.texture;
        },
      },
    );
    await part.ready;
    assert.equal(part.group.userData.editorBiome, biome.id);
    assert.equal(part.group.userData.editorSkyOnly, true);
    assert(part.group.children.length > 0);
    assert(part.sunDirection.length() > 0.99);
    part.update();
    const camera = new T.PerspectiveCamera();
    camera.position.set(23000, 16000, -22000);
    part.update({
      camera,
      time: 10,
      settings: { quality: 'low', reducedMotion: true },
    });
    assert.deepEqual(part.group.position.toArray(), camera.position.toArray());
    if (['helion', 'umbra', 'orbital'].includes(biome.id))
      assert.equal(part.group.userData.editorCelestial, true);
    part.dispose();
    part.dispose();
    part.update({ camera });
    assert(
      loaded.every((value) => value.count() === 1),
      biome.id,
    );
  }
  assert(
    verified.size >= 15,
    'panoramas and planetary maps are checked on disk',
  );
});

test('late texture loads are disposed on abort, including the original Nightweir owner', async () => {
  for (const biome of ['nightweir', 'cindercoil', 'helion']) {
    const abort = new AbortController();
    let resolveMap, started;
    const waiting = new Promise((resolveStart) => {
      started = resolveStart;
    });
    const value = fakeTexture();
    const pending = createEditorBackdrop(
      { biome },
      {
        signal: abort.signal,
        loadTexture: () => {
          started();
          return new Promise((resolveTexture) => {
            resolveMap = resolveTexture;
          });
        },
      },
    );
    await waiting;
    abort.abort(new Error('canceled fixture'));
    resolveMap(value.texture);
    await assert.rejects(pending, /canceled fixture/);
    assert.equal(value.count(), 1, biome);
  }
  const abort = new AbortController();
  abort.abort(new Error('already canceled'));
  let calls = 0;
  await assert.rejects(
    createEditorBackdrop(
      { biome: 'nacre' },
      {
        signal: abort.signal,
        loadTexture: () => {
          calls++;
        },
      },
    ),
    /already canceled/,
  );
  assert.equal(calls, 0);
});

test('partial planetary loading failure disposes every fulfilled registered map', async () => {
  const value = fakeTexture();
  await assert.rejects(
    createEditorBackdrop(
      { biome: 'orbital' },
      {
        loadTexture: async (url) => {
          if (url.includes('clouds')) throw new Error('cloud load failed');
          return value.texture;
        },
      },
    ),
    /cloud load failed/,
  );
  assert.equal(value.count(), 1);
});

test('Orbital keeps the layered planet below the Workshop roads when the camera rises', async () => {
  const part = await createEditorBackdrop(
    { biome: 'orbital' },
    { loadTexture: async () => fakeTexture().texture },
  );
  const globe = part.group.getObjectByName(
    'Asterion ocean and continental crust',
  );
  const clouds = part.group.getObjectByName(
    'Asterion separated cyclonic cloud deck',
  );
  const atmosphere = part.group.getObjectByName(
    'Asterion luminous atmospheric limb',
  );
  const camera = new T.PerspectiveCamera();
  for (const height of [50, 12500, -700]) {
    camera.position.set(-14000, height, 17600);
    part.update({ camera });
    part.group.updateMatrixWorld(true);
    const centre = globe.getWorldPosition(new T.Vector3());
    assert.deepEqual(clouds.getWorldPosition(new T.Vector3()), centre);
    assert.deepEqual(atmosphere.material.uniforms.planetCenter.value, centre);
    assert.deepEqual(globe.material.uniforms.planetCenter.value, centre);
    assert(
      centre.y + atmosphere.geometry.parameters.radius < Math.min(0, height),
    );
    assert.deepEqual(globe.material.uniforms.orbitOrigin.value.toArray(), [
      camera.position.x,
      Math.min(height, 0),
      camera.position.z,
    ]);
  }
  part.dispose();
});

test('Helion keeps its opaque photosphere and additive corona behind the road', async () => {
  const part = await createEditorBackdrop(
    { biome: 'helion' },
    { loadTexture: async () => fakeTexture().texture },
  );
  const star = part.group.getObjectByName(
    'Helion / 24 km visible photospheric shell',
  );
  const shells = part.group.children.filter(
    (node) => node.material?.blending === T.AdditiveBlending,
  );
  assert(star.material.depthTest && star.material.depthWrite);
  assert.equal(shells.length, 2);
  for (const shell of shells)
    assert(shell.material.depthTest && !shell.material.depthWrite);
  const nearestCorona = Math.min(
    ...shells.map(
      (shell) =>
        (shell.position.length() - shell.geometry.parameters.radius) *
        part.group.scale.x,
    ),
  );
  assert(
    nearestCorona > 10000,
    'large Workshop overviews can fit between the eye and corona',
  );
  part.dispose();
});

test('Umbra keeps the authored silhouette and depth occlusion in the editor and custom races', async () => {
  const loadTexture = async () => fakeTexture().texture;
  const original = await createUmbraBackdrop({ loadTexture });
  const diskName = 'Layered incandescent orbital accretion';
  const originalDisk = original.group.getObjectByName(diskName);
  const authoredEye = new T.Vector3(0, 130, 0);
  const direction = originalDisk.parent.position.clone().sub(authoredEye);
  const angularScale = originalDisk.scale.x / direction.length();
  direction.normalize();

  for (const preview of [true, false]) {
    const part = await createEditorBackdrop(
      { biome: 'umbra' },
      { preview, loadTexture },
    );
    const disk = part.group.getObjectByName(diskName);
    const horizon = disk.parent.children.find(
      (child) => child.geometry.type === 'SphereGeometry',
    );
    assert(horizon.material.depthWrite && horizon.material.depthTest);
    assert(disk.material.depthTest && !disk.material.depthWrite);
    const camera = new T.PerspectiveCamera();
    camera.position.set(-23000, 16000, 12000);
    part.update({ camera });
    part.group.updateMatrixWorld(true);
    const toCenter = horizon
      .getWorldPosition(new T.Vector3())
      .sub(camera.position);
    assert(toCenter.clone().normalize().distanceTo(direction) < 1e-8);
    assert(
      Math.abs(
        disk.getWorldScale(new T.Vector3()).x / toCenter.length() -
          angularScale,
      ) < 1e-8,
    );
    assert(
      disk
        .getWorldQuaternion(new T.Quaternion())
        .angleTo(originalDisk.getWorldQuaternion(new T.Quaternion())) < 1e-6,
    );

    // Transparent stars draw before the transparent disk, after the opaque
    // horizon. They must sit behind the black hole for its depth to mask them.
    const stars = part.group.getObjectByProperty('isPoints', true);
    const outerRadius =
      disk.material.uniforms.outerRadius.value * disk.parent.scale.x;
    const starDistance = new T.Vector3()
      .fromBufferAttribute(stars.geometry.attributes.position, 0)
      .applyMatrix4(stars.matrixWorld)
      .distanceTo(camera.position);
    assert(
      starDistance > toCenter.length() + outerRadius && starDistance < part.far,
    );
    assert(stars.material.depthTest);
    part.dispose();
  }
  original.dispose();
});

test('Nacre shares its authored storm with the water and follows the surveyed sea level', async () => {
  const value = fakeTexture();
  const part = await createEditorBackdrop(
    {
      biome: 'nacre',
      environment: { layoutVersion: 4 },
      settings: { waterLevel: -8 },
    },
    {
      track: { editorRegionPlan: { oceanWaterY: -180 } },
      loadTexture: async () => value.texture,
    },
  );
  const camera = new T.PerspectiveCamera();
  camera.position.set(1080, -165, 4000);
  part.update({ camera, mode: 'racing', time: 14 });
  assert.equal(part.assets.skyTexture, value.texture);
  assert.equal(
    part.group.children[0].material.uniforms.stormSky.value,
    value.texture,
  );
  assert.deepEqual(
    part.group.children[0].getWorldPosition(new T.Vector3()).toArray(),
    camera.position.toArray(),
  );
  assert.equal(part.getPresentation().wetness, 0);
  part.update({ camera, time: 15, oceanWaterY: -140 });
  assert.equal(part.getPresentation().wetness, 1);
  part.dispose();
  assert.equal(value.count(), 1);
});
