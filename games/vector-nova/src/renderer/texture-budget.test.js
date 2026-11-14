import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Group,
  Mesh,
  MeshStandardMaterial,
  Texture,
  CompressedTexture,
  RGBA_ASTC_4x4_Format,
  DataTexture,
} from 'three';
import { createTextureBudget } from './texture-budget.js';
import { textureMemory } from './texture-memory.js';

const sceneWith = (texture) => {
  const scene = new Group();
  scene.add(new Mesh(undefined, new MeshStandardMaterial({ map: texture })));
  return scene;
};
test('Low resizes an owned source without mutating a borrowed clone, and restores High', () => {
  const original = new Texture({ width: 4096, height: 2048 });
  const borrowed = original.clone();
  original.anisotropy = 8;
  const draws = [];
  const budget = createTextureBudget({
    createCanvas: (width, height) => ({
      width,
      height,
      getContext: () => ({ drawImage: (...args) => draws.push(args) }),
    }),
  });
  const scene = sceneWith(original),
    source = original.source;
  budget.apply(scene, { textureSize: 1024, anisotropy: 2 });
  assert.equal(original.image.width, 1024);
  assert.equal(original.image.height, 512);
  assert.equal(borrowed.source, source);
  assert.equal(borrowed.image.width, 4096);
  assert.equal(original.anisotropy, 2);
  assert.equal(draws.length, 1);
  budget.apply(scene, { textureSize: 1024, anisotropy: 2 });
  assert.equal(draws.length, 1);
  budget.apply(scene);
  assert.equal(original.source, source);
  assert.equal(original.anisotropy, 8);
  budget.dispose();
});
test('Low drops large compressed mip levels without decoding or changing source payloads', () => {
  const mips = [2048, 1024, 512].map((width) => ({
    width,
    height: width,
    data: new Uint8Array(width * width),
  }));
  const map = new CompressedTexture(mips, 2048, 2048, RGBA_ASTC_4x4_Format);
  const original = map.source;
  const budget = createTextureBudget();
  budget.apply(sceneWith(map), { textureSize: 1024, anisotropy: 2 });
  assert.equal(map.image.width, 1024);
  assert.deepEqual(map.mipmaps, mips.slice(1));
  assert.equal(textureMemory(map).bytes, 1024 ** 2 + 512 ** 2);
  assert.equal(mips.length, 3);
  budget.dispose();
  assert.equal(map.source, original);
  assert.equal(map.mipmaps, mips);
});
test('authored data fields and render attachments are never resized', () => {
  const map = new DataTexture(new Uint8Array(16), 4096, 4096);
  const source = map.source;
  const budget = createTextureBudget({
    createCanvas: () => assert.fail('data fields must remain exact'),
  });
  budget.apply(sceneWith(map), { textureSize: 1024 });
  assert.equal(map.source, source);
  budget.dispose();
});

test('source switches release prior GPU allocations and disposed textures can be reused safely', () => {
  const map = new Texture({ width: 2048, height: 1024 });
  const original = map.source;
  let releases = 0;
  map.addEventListener('dispose', () => releases++);
  const budget = createTextureBudget({
    createCanvas: (width, height) => ({
      width,
      height,
      getContext: () => ({ drawImage() {} }),
    }),
  });
  const scene = sceneWith(map);
  budget.apply(scene, { textureSize: 512, anisotropy: 2 });
  assert.equal(
    releases,
    1,
    'original GPU allocation released before source replacement',
  );
  budget.apply(scene);
  assert.equal(releases, 2);
  assert.equal(map.source, original);
  map.dispose();
  budget.apply(scene, { textureSize: 512, anisotropy: 2 });
  budget.apply(scene);
  assert.equal(
    map.source,
    original,
    'reuse retains the current original source after an external dispose',
  );
  budget.dispose();
});

test('ShaderMaterial sky image maps are budgeted before their first reflection draw', () => {
  const sky = new Texture({ width: 2048, height: 1024 });
  const data = new DataTexture(new Uint8Array(16), 4096, 4096);
  const source = sky.source;
  const budget = createTextureBudget({
    createCanvas: (width, height) => ({
      width,
      height,
      getContext: () => ({ drawImage() {} }),
    }),
  });
  const scene = new Group();
  scene.add(
    new Mesh(undefined, {
      uniforms: { panorama: { value: sky }, field: { value: data } },
    }),
  );
  budget.apply(scene, { textureSize: 512 });
  assert.equal(sky.image.width, 512);
  assert.equal(sky.image.height, 256);
  assert.equal(data.image.width, 4096);
  budget.apply(scene);
  assert.equal(sky.source, source);
  budget.dispose();
  sky.dispose();
  data.dispose();
});
