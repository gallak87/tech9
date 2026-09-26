import test from 'node:test';
import assert from 'node:assert/strict';
import { SceneApp } from '../src/core/SceneApp.js';

// Exercise the real lifecycle methods without constructing a browser/GPU renderer.
function lifecycleHost() {
  const released = [];
  const resource = (name) => ({ dispose: () => released.push(name) });
  const host = Object.assign(Object.create(SceneApp.prototype), {
    layers: [],
    pendingLayers: new Map(),
    disposed: false,
    settings: { quality: 'high' },
    assets: new Map(),
    renderer: { ...resource('renderer'), shadowMap: {}, setAnimationLoop() {} },
    controls: resource('controls'),
    atmosphere: resource('atmosphere'),
    sky: {
      geometry: resource('sky geometry'),
      material: resource('sky material'),
    },
    sun: { shadow: { map: resource('shadow map') } },
    abort: new AbortController(),
  });
  return { host, released };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('concurrent layer registration reserves the id before asynchronous initialization', async () => {
  const { host } = lifecycleHost();
  const loading = deferred();
  const layer = { id: 'forest', init: () => loading.promise };
  const first = host.register(layer);
  let duplicateStarted = false;
  await assert.rejects(
    host.register({
      id: 'forest',
      init() {
        duplicateStarted = true;
      },
    }),
    /unique id/,
  );
  assert.equal(duplicateStarted, false);
  loading.resolve();
  assert.equal(await first, layer);
  assert.deepEqual(host.layers, [layer]);
});

test('failed initialization or configuration releases resources and allows retry', async () => {
  for (const phase of ['init', 'configure']) {
    const { host } = lifecycleHost();
    const failure = new Error(`${phase} failed`);
    let disposed = 0;
    const layer = {
      id: 'optional-layer',
      async init() {
        if (phase === 'init') throw failure;
      },
      configure() {
        if (phase === 'configure') throw failure;
      },
      dispose() {
        disposed++;
      },
    };
    await assert.rejects(host.register(layer), (error) => error === failure);
    assert.equal(disposed, 1);
    assert.equal(host.layers.length, 0);
    const replacement = { id: layer.id, async init() {} };
    assert.equal(await host.register(replacement), replacement);
    assert.deepEqual(host.layers, [replacement]);
  }
});

test('unregistering a loading layer cancels activation and releases its eventual resources', async () => {
  const { host } = lifecycleHost();
  const loading = deferred();
  let configured = false;
  let disposed = 0;
  const registration = host.register({
    id: 'slow-layer',
    init: () => loading.promise,
    configure() {
      configured = true;
    },
    dispose() {
      disposed++;
    },
  });
  const cancelled = assert.rejects(registration, /cancelled/);
  host.unregister('slow-layer');
  loading.resolve();
  await cancelled;
  assert.equal(configured, false);
  assert.equal(disposed, 1);
  assert.equal(host.layers.length, 0);
});

test('disposing during layer initialization prevents late activation and is idempotent', async () => {
  const { host, released } = lifecycleHost();
  const loading = deferred();
  let layerDisposed = 0;
  const registration = host.register({
    id: 'loading-on-shutdown',
    init: () => loading.promise,
    dispose() {
      layerDisposed++;
    },
  });
  const cancelled = assert.rejects(registration, /cancelled/);
  host.dispose();
  host.dispose();
  loading.resolve();
  await cancelled;
  assert.equal(layerDisposed, 1);
  assert.equal(host.layers.length, 0);
  assert.equal(released.filter((name) => name === 'renderer').length, 1);
  await assert.rejects(
    host.register({ id: 'too-late', init() {} }),
    /disposed app/,
  );
});

test('cleanup errors preserve the original registration failure', async (context) => {
  const { host } = lifecycleHost();
  const primary = new Error('asset request failed');
  const errorLog = context.mock.method(console, 'error', () => {});
  await assert.rejects(
    host.register({
      id: 'broken-layer',
      async init() {
        throw primary;
      },
      dispose() {
        throw new Error('cleanup also failed');
      },
    }),
    (error) => error === primary,
  );
  assert.equal(errorLog.mock.callCount(), 1);
  assert.equal(host.layers.length, 0);
});

test('one faulty layer cannot prevent other layers and renderer from releasing', async (context) => {
  const { host, released } = lifecycleHost();
  const errorLog = context.mock.method(console, 'error', () => {});
  await host.register({
    id: 'faulty',
    async init() {},
    dispose() {
      throw new Error('faulty teardown');
    },
  });
  await host.register({
    id: 'healthy',
    async init() {},
    dispose() {
      released.push('healthy layer');
    },
  });
  host.dispose();
  assert.equal(errorLog.mock.callCount(), 1);
  assert.ok(released.includes('healthy layer'));
  assert.ok(released.includes('renderer'));
  assert.equal(host.layers.length, 0);
});

test('stopped or disposed scenes cannot report ready or restart a disposed renderer', () => {
  const { host } = lifecycleHost();
  host.ready = true;
  host.stop();
  assert.equal(host.ready, false);
  host.ready = true;
  host.dispose();
  assert.equal(host.ready, false);
  assert.throws(() => host.start(), /disposed app/);
  assert.equal(host.ready, false);
});
