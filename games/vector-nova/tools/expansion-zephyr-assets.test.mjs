import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createZephyrBackdrop } from '../src/levels/zephyr/backdrop/index.js';

test('Zephyr selected sky owns one texture, remains static and disposes once', async () => {
  const texture = new T.Texture();
  let released = 0;
  texture.addEventListener('dispose', () => released++);
  const urls = [];
  const sky = await createZephyrBackdrop({
    loadTexture: async (url) => {
      urls.push(url);
      return texture;
    },
  });
  assert.deepEqual(urls, ['/assets/levels/zephyr/zephyr-sky-v2.png']);
  assert.equal(texture.wrapS, T.RepeatWrapping);
  assert.equal(texture.colorSpace, T.SRGBColorSpace);
  const camera = new T.PerspectiveCamera();
  camera.position.set(50, 110, 70);
  sky.update({
    camera,
    time: 20,
    settings: { quality: 'low', reducedMotion: true },
  });
  assert.deepEqual(
    sky.group.children[0].position.toArray(),
    camera.position.toArray(),
  );
  sky.dispose();
  sky.dispose();
  assert.equal(released, 1);
  assert.equal(sky.group.children.length, 0);
});
test('Zephyr sky failure propagates to boot cleanup; neutral review owns no image', async () => {
  await assert.rejects(
    createZephyrBackdrop({
      loadTexture: async () => {
        throw new Error('fixture missing');
      },
    }),
    /fixture missing/,
  );
  let requests = 0;
  const sky = await createZephyrBackdrop({
    shape: true,
    loadTexture: async () => {
      requests++;
    },
  });
  assert.equal(requests, 0);
  sky.dispose();
});

import createLevel from '../src/levels/zephyr/index.js';
import { createZephyrEnvironment } from '../src/levels/zephyr/environment/index.js';
test('Zephyr failed stone load releases every fulfilled mesh; failed mesh releases late stone texture', async () => {
  for (const failure of ['texture', 'mesh']) {
    let releasedGeometry = 0,
      releasedMaterials = 0,
      releasedTexture = 0;
    const texture = new T.Texture();
    texture.addEventListener('dispose', () => releasedTexture++);
    const loadAsset = async (url) => {
      if (failure === 'mesh' && url.endsWith('chapel.glb'))
        throw new Error('missing mesh');
      const geometry = new T.BoxGeometry(),
        material = new T.MeshStandardMaterial();
      geometry.addEventListener('dispose', () => releasedGeometry++);
      material.addEventListener('dispose', () => releasedMaterials++);
      const scene = new T.Group();
      scene.add(new T.Mesh(geometry, material));
      return { scene };
    };
    const loadTexture = async () => {
      if (failure === 'texture') throw new Error('missing texture');
      return texture;
    };
    await assert.rejects(
      createZephyrEnvironment({
        track: createLevel().createTrack(),
        view: { scene: new T.Scene() },
        loadAsset,
        loadTexture,
      }),
      /missing/,
    );
    assert.equal(releasedGeometry, failure === 'mesh' ? 11 : 12);
    assert.equal(releasedMaterials, releasedGeometry);
    assert.equal(releasedTexture, failure === 'mesh' ? 1 : 0);
  }
});
test('Zephyr neutral environment loads no assets', async () => {
  const fail = async () => {
    throw new Error('unexpected owned load');
  };
  const env = await createZephyrEnvironment({
    shape: true,
    loadAsset: fail,
    loadTexture: fail,
  });
  env.dispose();
  env.dispose();
  assert.equal(env.group.children.length, 0);
});
