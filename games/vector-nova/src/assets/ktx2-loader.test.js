import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import { FileLoader, LoadingManager, Texture } from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { SharedKTX2Loader } from './ktx2-loader.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));
function fixture(t) {
  const clients = [];
  const decodes = [];
  let starts = 0,
    disposals = 0;
  t.mock.method(KTX2Loader.prototype, 'detectSupport', function () {
    this.workerConfig = { astcSupported: true };
    return this;
  });
  t.mock.method(KTX2Loader.prototype, 'init', function () {
    starts++;
    this.transcoderPending = Promise.resolve();
    return this.transcoderPending;
  });
  t.mock.method(KTX2Loader.prototype, 'parse', (buffer, resolve, reject) => {
    decodes.push({ buffer, resolve, reject });
  });
  t.mock.method(KTX2Loader.prototype, 'dispose', () => disposals++);
  t.after(async () => {
    clients.forEach((client) => client.dispose());
    await flush();
  });
  return {
    client(manager = new LoadingManager()) {
      const client = new SharedKTX2Loader(manager).detectSupport({});
      clients.push(client);
      return client;
    },
    decodes,
    get starts() {
      return starts;
    },
    get disposals() {
      return disposals;
    },
  };
}

test('road and ship clients share one decoder, but cancellation and texture ownership stay independent', async (t) => {
  const f = fixture(t);
  const road = f.client(),
    ship = f.client();
  await Promise.all([road.init(), ship.init()]);
  assert.equal(f.starts, 1);
  const buffer = new Uint8Array([1, 2, 3, 4]).buffer;
  const roadResult = road.decode(buffer);
  const cancelled = assert.rejects(roadResult, { name: 'AbortError' });
  const shipResult = ship.decode(buffer);
  await flush();
  assert.equal(f.decodes.length, 2);
  assert.notEqual(f.decodes[0].buffer, buffer);
  assert.notEqual(f.decodes[0].buffer, f.decodes[1].buffer);
  assert.deepEqual(new Uint8Array(f.decodes[1].buffer), new Uint8Array(buffer));
  road.dispose();
  await cancelled;
  assert.equal(
    f.disposals,
    0,
    'a cancelled road cannot terminate ship workers',
  );
  const late = new Texture(),
    retained = new Texture();
  let lateDisposals = 0,
    retainedDisposals = 0;
  late.addEventListener('dispose', () => lateDisposals++);
  retained.addEventListener('dispose', () => retainedDisposals++);
  f.decodes[0].resolve(late);
  f.decodes[1].resolve(retained);
  assert.equal(await shipResult, retained);
  await flush();
  assert.equal(lateDisposals, 1);
  ship.dispose();
  ship.dispose();
  await flush();
  assert.equal(f.disposals, 1);
  assert.equal(
    retainedDisposals,
    0,
    'decoded textures outlive the worker pool',
  );
  retained.dispose();
});

test('aborting a caller network manager leaves another caller loading successfully', async (t) => {
  const f = fixture(t),
    requests = [];
  t.mock.method(
    FileLoader.prototype,
    'loadAsync',
    () => new Promise((resolve) => requests.push(resolve)),
  );
  const manager = new LoadingManager();
  const a = f.client(manager),
    b = f.client();
  const cancelled = assert.rejects(a.loadAsync('/cancel.ktx2'), {
    name: 'AbortError',
  });
  const loaded = b.loadAsync('/keep.ktx2');
  await flush();
  manager.abort();
  await cancelled;
  requests.forEach((resolve) => resolve(new ArrayBuffer(4)));
  await flush();
  assert.equal(f.decodes.length, 1);
  const texture = new Texture();
  f.decodes[0].resolve(texture);
  assert.equal(await loaded, texture);
  texture.dispose();
});

test('failed initialization rejects every waiting client and the next load retries cleanly', async (t) => {
  const f = fixture(t);
  let attempts = 0;
  t.mock.method(KTX2Loader.prototype, 'init', function () {
    this.transcoderPending =
      ++attempts === 1
        ? Promise.reject(new Error('missing WASM'))
        : Promise.resolve();
    return this.transcoderPending;
  });
  const a = f.client(),
    b = f.client();
  await Promise.all([
    assert.rejects(a.init(), /missing WASM/),
    assert.rejects(b.init(), /missing WASM/),
  ]);
  await flush();
  assert.equal(f.disposals, 1);
  const retry = f.client();
  await retry.init();
  a.dispose();
  b.dispose();
  assert.equal(
    f.disposals,
    1,
    'retired clients cannot dispose the replacement pool',
  );
  retry.dispose();
  await flush();
  assert.equal(attempts, 2);
  assert.equal(f.disposals, 2);
});

test('stalled decoding rejects all affected clients, releases workers and permits retry', async (t) => {
  const f = fixture(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const a = f.client(),
    b = f.client();
  await Promise.all([a.init(), b.init()]);
  const results = [
    a.decode(new ArrayBuffer(4)),
    b.decode(new ArrayBuffer(4)),
  ].map((result) => assert.rejects(result, /timed out/));
  await flush();
  t.mock.timers.tick(30000);
  await Promise.all(results);
  await flush();
  assert.equal(f.disposals, 1);
  const retry = f.client();
  await retry.init();
  const result = retry.decode(new ArrayBuffer(4));
  await flush();
  const texture = new Texture();
  f.decodes.at(-1).resolve(texture);
  assert.equal(await result, texture);
  assert.equal(f.starts, 2);
  texture.dispose();
});
