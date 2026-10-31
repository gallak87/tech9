import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers';
import * as T from 'three';
import { createNacreMineralSurface } from './mineral-surface.js';
import { createNacreMaterials } from './materials.js';

function texture() {
  const value = new T.Texture();
  let disposed = 0;
  value.addEventListener('dispose', () => disposed++);
  return { value, disposals: () => disposed };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test('Nacre mineral finish is asset-free in CPU construction', async () => {
  const finish = createNacreMineralSurface();
  assert.equal(await finish.ready, false);
  assert.equal(finish.color, null);
  finish.dispose();
});

test('Nacre mineral finish owns exactly one shared pair and publishes accounting properties', async () => {
  const color = texture(),
    normal = texture(),
    calls = [];
  const finish = createNacreMineralSurface({
    loadTexture: async (url, kind) => {
      calls.push({ url, kind });
      return kind === 'color' ? color.value : normal.value;
    },
  });
  const material = new T.MeshStandardMaterial();
  finish.register(material);
  const ready = finish.ready;
  assert.equal(finish.ready, ready);
  assert.equal(await ready, true);
  assert.equal(calls.length, 2);
  assert.equal(material.nacreMineralColor, color.value);
  assert.equal(material.nacreMineralNormal, normal.value);
  assert.equal(color.value.colorSpace, T.SRGBColorSpace);
  assert.equal(normal.value.colorSpace, T.NoColorSpace);
  assert.ok(
    [color.value, normal.value].every(
      (map) => map.wrapS === T.RepeatWrapping && map.generateMipmaps,
    ),
  );
  finish.dispose();
  finish.dispose();
  assert.equal(color.disposals(), 1);
  assert.equal(normal.disposals(), 1);
  assert.equal(material.nacreMineralColor, null);
  assert.equal(material.nacreMineralNormal, null);
  material.dispose();
});

test('Nacre mineral cancellation releases both late arrivals once', async () => {
  const inputs = { color: deferred(), normal: deferred() };
  const maps = { color: texture(), normal: texture() };
  const finish = createNacreMineralSurface({
    loadTexture: (_url, kind) => inputs[kind].promise,
  });
  const ready = finish.ready;
  await Promise.resolve();
  finish.dispose();
  inputs.color.resolve(maps.color.value);
  inputs.normal.resolve(maps.normal.value);
  assert.equal(await ready, false);
  assert.equal(maps.color.disposals(), 1);
  assert.equal(maps.normal.disposals(), 1);
});

test('Nacre mineral partial failure releases loaded input and clears published references', async () => {
  const color = texture(),
    failed = deferred();
  const finish = createNacreMineralSurface({
    loadTexture: (_url, kind) =>
      kind === 'color' ? Promise.resolve(color.value) : failed.promise,
  });
  const material = new T.MeshStandardMaterial();
  finish.register(material);
  const ready = finish.ready;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(material.nacreMineralColor, color.value);
  failed.reject(new Error('normal unavailable'));
  await assert.rejects(ready, /mineral finish could not load/);
  assert.equal(color.disposals(), 1);
  assert.equal(material.nacreMineralColor, null);
  material.dispose();
});

test('Nacre mineral failure releases an input that arrives after rejection', async () => {
  const color = texture(),
    late = deferred();
  const finish = createNacreMineralSurface({
    loadTexture: (_url, kind) =>
      kind === 'color'
        ? late.promise
        : Promise.reject(new Error('normal unavailable')),
  });
  const ready = finish.ready;
  await assert.rejects(ready, /mineral finish could not load/);
  late.resolve(color.value);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(color.disposals(), 1);
  assert.equal(finish.color, null);
});

test('Nacre mineral disposal before readiness starts no loaders', async () => {
  let calls = 0;
  const finish = createNacreMineralSurface({
    loadTexture: () => {
      calls++;
      return texture().value;
    },
  });
  finish.dispose();
  assert.equal(await finish.ready, false);
  assert.equal(calls, 0);
});

test('Nacre mineral duplicate inputs fail without double disposal', async () => {
  const same = texture();
  const finish = createNacreMineralSurface({
    loadTexture: async () => same.value,
  });
  await assert.rejects(finish.ready, /mineral finish could not load/);
  assert.equal(same.disposals(), 1);
});

test('Nacre scan shader is basalt-only, world triplanar and preserves macroplanes and wet zones', async () => {
  const maps = { color: texture(), normal: texture() };
  const finish = createNacreMineralSurface({
    loadTexture: async (_url, kind) => maps[kind].value,
  });
  const materials = createNacreMaterials({ value: 0 }, 0, {
    mineralSurface: finish,
  });
  assert.ok(Object.values(materials).every((value) => value.isMaterial));
  const before = materials.basalt.customProgramCacheKey();
  await finish.ready;
  assert.notEqual(materials.basalt.customProgramCacheKey(), before);
  assert.equal(materials.basalt.nacreMineralColor, maps.color.value);
  assert.equal(materials.basalt.nacreMineralNormal, maps.normal.value);
  for (const [name, material] of Object.entries(materials)) {
    const shader = {
      uniforms: {},
      vertexShader: T.ShaderLib.standard.vertexShader,
      fragmentShader: T.ShaderLib.standard.fragmentShader,
    };
    material.onBeforeCompile(shader);
    assert.equal(Boolean(shader.uniforms.nacreMineralColor), name === 'basalt');
    if (name === 'basalt') {
      assert.match(shader.fragmentShader, /nacreMineralFrame/);
      assert.match(shader.fragmentShader, /mineralUVX=nacreWorld\.zy\/16\./);
      assert.match(shader.fragmentShader, /mineralLuma=dot/);
      assert.match(
        shader.fragmentShader,
        /roughnessFactor=mix\(roughnessFactor,\.54,deepWater\)/,
      );
      assert.match(shader.fragmentShader, /mineralFace\*=faceDirection/);
      assert.equal(
        (shader.fragmentShader.match(/textureGrad\(nacreMineral/g) ?? [])
          .length,
        6,
      );
    } else
      assert.doesNotMatch(
        shader.fragmentShader,
        /uniform sampler2D nacreMineral/,
      );
  }
  assert.equal(materials.basalt.flatShading, true);
  assert.equal(materials.basalt.vertexColors, true);
  finish.dispose();
  for (const material of Object.values(materials)) material.dispose();
});
