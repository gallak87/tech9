import test from 'node:test';
import { setImmediate } from 'node:timers';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { createResources } from './geometry.js';
import {
  createSaffronMaterials,
  applyFossilWeathering,
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
    loadSurface: () => {
      loads++;
    },
  });
  assert.equal(await shape.ready, false);
  assert.equal(shape.weatheringTexture, null);
  assert.equal(loads, 0);
  shapeResources.dispose();
});

test('mineral surface readiness and ownership are shared by bone and bedrock only', async () => {
  let resolveSurface;
  const pending = new Promise((resolve) => {
    resolveSurface = resolve;
  });
  const resources = createResources();
  const texture = new T.Texture();
  let releases = 0;
  texture.addEventListener('dispose', () => releases++);
  const urls = [];
  const materials = createSaffronMaterials(resources, false, {
    loadNoise: volume,
    loadSurface: (url) => {
      urls.push(url);
      return pending;
    },
  });
  let ready = false;
  materials.ready.then(() => {
    ready = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ready, false);
  assert.equal(urls.length, 1);
  assert.ok(urls[0].endsWith('assets/levels/shatterline/limestone-v1.png'));
  resolveSurface(texture);
  assert.equal(await materials.ready, true);
  assert.equal(materials.mineralSurface.texture, texture);
  assert.equal(texture.colorSpace, T.SRGBColorSpace);
  assert.equal(texture.wrapS, T.RepeatWrapping);
  assert.equal(texture.wrapT, T.RepeatWrapping);
  const shell = resources.material(
    new T.MeshStandardMaterial({ name: 'Saffron_pale_fossil' }),
  );
  applyFossilWeathering(
    shell,
    materials.weatheringTexture,
    materials.mineralSurface,
  );
  for (const material of [
    shell,
    materials.bone,
    materials.bedrock,
    materials.sand,
    materials.terrain,
  ]) {
    const shader = {
      uniforms: {},
      vertexShader: T.ShaderLib.standard.vertexShader,
      fragmentShader: T.ShaderLib.standard.fragmentShader,
    };
    material.onBeforeCompile(shader);
    const mineral = [shell, materials.bone, materials.bedrock].includes(
      material,
    );
    assert.equal(
      shader.uniforms.saffronMineralSurface?.value,
      mineral ? texture : undefined,
    );
    assert.equal(material.saffronMineralSurface, mineral ? texture : undefined);
  }
  resources.dispose();
  resources.dispose();
  assert.equal(releases, 1);
});

test('late mineral completion is disposed without reviving a cancelled environment', async () => {
  let resolveSurface;
  const pending = new Promise((resolve) => {
    resolveSurface = resolve;
  });
  const resources = createResources();
  const materials = createSaffronMaterials(resources, false, {
    loadSurface: () => pending,
  });
  const texture = new T.Texture();
  let releases = 0;
  texture.addEventListener('dispose', () => releases++);
  resources.dispose();
  resolveSurface(texture);
  assert.equal(await materials.ready, false);
  assert.equal(materials.mineralSurface.texture, null);
  assert.equal(releases, 1);
});

test('mineral load failure rejects readiness for the environment error path', async () => {
  const resources = createResources();
  const materials = createSaffronMaterials(resources, false, {
    loadSurface: async () => {
      throw new Error('missing surface');
    },
  });
  await assert.rejects(
    materials.ready,
    /Saffron mineral surface could not load/,
  );
  resources.dispose();
});
