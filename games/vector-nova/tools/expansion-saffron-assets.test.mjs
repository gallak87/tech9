import test from 'node:test';
import assert from 'node:assert/strict';
import { Texture, Vector3 } from 'three';
import { createSaffronBackdrop } from '../src/levels/saffron/backdrop/index.js';

test('Saffron selected panorama owns one texture, follows the camera and releases it exactly once', async () => {
  const texture = new Texture();
  let released = 0;
  texture.addEventListener('dispose', () => released++);
  const urls = [];
  const sky = await createSaffronBackdrop({
    loadTexture: async (url) => {
      urls.push(url);
      return texture;
    },
  });
  assert.ok(urls[0].endsWith('assets/levels/saffron/saffron-sky-v2.png'));
  assert.equal(sky.ownedTextures.length, 1);
  sky.update({ camera: { position: new Vector3(120, 80, -30) } });
  assert.deepEqual(sky.group.position.toArray(), [120, 80, -30]);
  assert.ok(!sky.group.children[0].material.fragmentShader.includes('moonDir'));
  for (const value of [
    sky.sunIntensity,
    sky.ambientIntensity,
    sky.fillIntensity,
  ])
    assert.ok(Number.isFinite(value));
  sky.dispose();
  sky.dispose();
  assert.equal(released, 1);
  assert.equal(sky.group.children.length, 0);
});
test('Saffron failed panorama is recoverable and shape remains independent of production assets', async () => {
  await assert.rejects(
    createSaffronBackdrop({
      loadTexture: async () => {
        throw new Error('offline');
      },
    }),
    /sky could not load/,
  );
  const shape = await createSaffronBackdrop({
    shape: true,
    loadTexture: async () => {
      assert.fail('shape loaded panorama');
    },
  });
  shape.dispose();
});
