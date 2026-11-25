import test from 'node:test';
import assert from 'node:assert/strict';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { preloadLevelModels } from './level-preload.js';

const root = 'https://example.invalid/scenery/';
const models = ['a', 'b', 'c', 'd', 'e'].map((name) => `${root}${name}.glb`);

test(
  'level preload keeps three unique downloads in flight and parses the consumed bytes without refetching',
  { timeout: 1000 },
  async (t) => {
    const gates = new Map(models.map((url) => [url, Promise.withResolvers()]));
    const requested = [];
    let active = 0;
    let peak = 0;
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        asset: { version: '2.0' },
        scene: 0,
        scenes: [{ name: 'Preloaded scenery' }],
      }),
    ).buffer;
    const parse = t.mock.method(GLTFLoader.prototype, 'parseAsync');
    const refetch = t.mock.method(
      GLTFLoader.prototype,
      'loadAsync',
      async () => {
        throw new Error('A preloaded model was fetched again');
      },
    );
    const preload = preloadLevelModels([...models, models[0]], {
      async download(url) {
        requested.push(url);
        peak = Math.max(peak, ++active);
        try {
          return await gates.get(url).promise;
        } finally {
          active--;
        }
      },
    });
    t.after(() => preload.dispose());
    assert.deepEqual(requested, models.slice(0, 3));
    const first = preload.loadAsset(models[1]);
    gates.get(models[1]).resolve(bytes);
    assert.equal((await first).scene.name, 'Preloaded_scenery');
    assert.deepEqual(requested, models.slice(0, 4));

    const remaining = [0, 2, 3, 4].map((index) =>
      preload.loadAsset(models[index]),
    );
    for (const gate of gates.values()) gate.resolve(bytes);
    await Promise.all(remaining);
    assert.deepEqual(requested, models);
    assert.equal(peak, 3);
    assert.equal(refetch.mock.callCount(), 0);
    assert.equal(parse.mock.callCount(), models.length);
    for (const call of parse.mock.calls) {
      assert.deepEqual(call.arguments, [bytes, root]);
    }
  },
);

test('level preload abort releases queued consumers and cancels active downloads', async (t) => {
  const controller = new AbortController();
  const requested = [];
  const aborted = [];
  const preload = preloadLevelModels(models, {
    signal: controller.signal,
    download(url, signal) {
      requested.push(url);
      return new Promise((_, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            aborted.push(url);
            reject(signal.reason);
          },
          { once: true },
        );
      });
    },
  });
  t.after(() => preload.dispose());
  const error = new DOMException('Race loading cancelled', 'AbortError');
  const pending = [models[1], models[4]].map((url) =>
    assert.rejects(preload.loadAsset(url), (failure) => failure === error),
  );
  controller.abort(error);
  await Promise.all(pending);
  assert.deepEqual(requested, models.slice(0, 3));
  assert.deepEqual(aborted, requested);
  await assert.rejects(
    preload.loadAsset(models[0]),
    (failure) => failure === error,
  );
});

test('level preload falls back to the ordinary loader after an unsuccessful download', async (t) => {
  const gltf = { scene: { name: 'Fallback scenery' } };
  const refetch = t.mock.method(
    GLTFLoader.prototype,
    'loadAsync',
    async () => gltf,
  );
  const preload = preloadLevelModels([models[0]], {
    async download() {
      throw new Error('Transient network failure');
    },
  });
  t.after(() => preload.dispose());
  assert.equal(await preload.loadAsset(models[0]), gltf);
  assert.equal(refetch.mock.callCount(), 1);
  assert.deepEqual(refetch.mock.calls[0].arguments, [models[0]]);
});
