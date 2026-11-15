import test from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as T from 'three';
import { EDITOR_BIOMES } from './biomes.js';
import { createEditorBackdrop } from './biome-backdrop.js';

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
