import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { createResources } from './geometry.js';
import {
  createSaffronMaterials,
  SAFFRON_WEATHERING_SIZE,
} from './materials.js';

const volume = () =>
  readFile(
    new URL(
      '../../../../public/assets/levels/saffron/weathering-noise-v1.r8',
      import.meta.url,
    ),
  );

test('baked weathering loads one shared mipmapped volume and releases it once', async () => {
  const resources = createResources();
  const materials = createSaffronMaterials(resources, false, {
    loadNoise: volume,
  });
  const texture = materials.weatheringTexture;
  let releases = 0;
  texture.addEventListener('dispose', () => releases++);
  assert.equal(await materials.ready, true);
  assert.equal(texture.image.data.length, SAFFRON_WEATHERING_SIZE ** 3);
  assert.equal(texture.format, T.RedFormat);
  assert.equal(texture.generateMipmaps, true);
  for (const material of [materials.terrain, materials.sand, materials.bone]) {
    const shader = {
      uniforms: {},
      vertexShader: T.ShaderLib.standard.vertexShader,
      fragmentShader: T.ShaderLib.standard.fragmentShader,
    };
    material.onBeforeCompile(shader);
    assert.equal(shader.uniforms.saffronWeatheringNoise.value, texture);
    assert.match(shader.fragmentShader, /textureGrad\(saffronWeatheringNoise/);
    assert.ok(!shader.fragmentShader.includes('sHash'));
  }
  resources.dispose();
  resources.dispose();
  assert.equal(releases, 1);
});

test('late baked volume completion cannot revive a disposed texture', async () => {
  let resolve;
  const pending = new Promise((done) => {
    resolve = done;
  });
  const resources = createResources();
  const materials = createSaffronMaterials(resources, false, {
    loadNoise: () => pending,
  });
  const texture = materials.weatheringTexture;
  const originalData = texture.image.data,
    version = texture.version;
  resources.dispose();
  resolve(await volume());
  assert.equal(await materials.ready, false);
  assert.equal(texture.image.data, originalData);
  assert.equal(texture.version, version);
});

test('corrupt baked detail rejects loading and shape review stays asset-free', async () => {
  const resources = createResources();
  const materials = createSaffronMaterials(resources, false, {
    loadNoise: async () => new Uint8Array(2),
  });
  await assert.rejects(materials.ready, /baked material detail could not load/);
  resources.dispose();
  const shapeResources = createResources();
  let loads = 0;
  const shape = createSaffronMaterials(shapeResources, true, {
    loadNoise: () => {
      loads++;
    },
  });
  assert.equal(await shape.ready, false);
  assert.equal(shape.weatheringTexture, null);
  assert.equal(loads, 0);
  shapeResources.dispose();
});
