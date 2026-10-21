import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LANDSCAPE_ASSETS } from '@worldkit/environment/forest';
import { createVesperTrack } from '../track/model.js';
import { createVesperEnvironment } from './index.js';
import { loadForestLook } from './forest-look.js';

const kitRequire = createRequire(
  import.meta.resolve('@worldkit/environment/forest'),
);
const { GLTFLoader: KitLoader } = await import(
  kitRequire.resolve('three/addons/loaders/GLTFLoader.js')
);

function browserGlobals(t) {
  for (const [name, value] of Object.entries({
    self: globalThis,
    document: {},
    location: {},
    createImageBitmap: async () => ({ width: 1024, height: 1024, close() {} }),
    ProgressEvent: class {
      constructor(type, values) {
        this.type = type;
        Object.assign(this, values);
      }
    },
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else delete globalThis[name];
    });
  }
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function watchedTexture() {
  const texture = new T.Texture();
  let count = 0;
  texture.addEventListener('dispose', () => count++);
  return { texture, count: () => count };
}
async function actualLibraries() {
  const urls = [
    new URL(
      '../../../../public/assets/levels/vesper/vesper-canopy.glb',
      import.meta.url,
    ),
    new URL(
      '../../../../public/assets/levels/vesper/vesper-connected-forest-v1.glb',
      import.meta.url,
    ),
    new URL(LANDSCAPE_ASSETS['forest-kit.glb']),
  ];
  const loader = new GLTFLoader();
  return Promise.all(
    urls.map(async (url) => {
      const bytes = await readFile(url);
      return loader.parseAsync(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
        '',
      );
    }),
  );
}
function watchLibraries(libraries) {
  const counts = new Map();
  for (const library of libraries)
    library.scene.traverse((object) => {
      const resources = [object.geometry];
      for (const material of [object.material].flat().filter(Boolean)) {
        resources.push(
          material,
          ...Object.values(material).filter((value) => value?.isTexture),
        );
      }
      for (const resource of resources.filter(Boolean))
        if (!counts.has(resource)) {
          counts.set(resource, 0);
          resource.addEventListener('dispose', () =>
            counts.set(resource, counts.get(resource) + 1),
          );
        }
    });
  return counts;
}

test('a texture Event becomes a useful Error and late successful maps are released', async (t) => {
  const first = watchedTexture(),
    last = watchedTexture(),
    pending = deferred();
  const failure = { type: 'error' };
  let calls = 0;
  t.mock.method(T.TextureLoader.prototype, 'loadAsync', () => {
    const index = calls++;
    return index === 0
      ? Promise.resolve(first.texture)
      : index === 1
        ? Promise.reject(failure)
        : pending.promise;
  });
  const loading = loadForestLook();
  pending.resolve(last.texture);
  await assert.rejects(loading, (error) => {
    assert.ok(error instanceof Error);
    assert.match(
      error.message,
      /Worldkit barkNormal: .*bark_brown_02_nor_gl_1k.jpg/,
    );
    assert.equal(error.cause, failure);
    return true;
  });
  assert.equal(first.count(), 1);
  assert.equal(last.count(), 1);
});

test('disposing during canonical texture loading releases late maps and never starts GLB loading', async (t) => {
  browserGlobals(t);
  const textures = [watchedTexture(), watchedTexture(), watchedTexture()];
  const pending = textures.map(deferred),
    started = deferred();
  let index = 0,
    glbCalls = 0;
  t.mock.method(T.TextureLoader.prototype, 'loadAsync', () => {
    const call = index++;
    if (index === 3) started.resolve();
    return pending[call].promise;
  });
  t.mock.method(GLTFLoader.prototype, 'loadAsync', () => {
    glbCalls++;
    throw new Error('Unexpected GLB request');
  });
  const environment = createVesperEnvironment({ track: createVesperTrack() });
  t.after(() => environment.dispose());
  await started.promise;
  environment.dispose();
  pending.forEach((request, i) => request.resolve(textures[i].texture));
  await environment.ready;
  environment.dispose();
  assert.deepEqual(
    textures.map((value) => value.count()),
    [1, 1, 1],
  );
  assert.equal(glbCalls, 0);
  assert.equal(environment.group.children.length, 0);
  assert.equal(environment.group.userData.metrics.loadState, 'disposed');
});

test('a main-library failure leaves canonical look textures owned until caller cleanup', async (t) => {
  browserGlobals(t);
  const textures = [];
  t.mock.method(T.TextureLoader.prototype, 'loadAsync', async () => {
    const value = watchedTexture();
    textures.push(value);
    return value.texture;
  });
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async () => {
    throw new Error('Main library unavailable');
  });
  const environment = createVesperEnvironment({ track: createVesperTrack() });
  t.after(() => environment.dispose());
  await assert.rejects(environment.ready, /Main library unavailable/);
  assert.equal(environment.group.userData.metrics.loadState, 'failed');
  environment.dispose();
  environment.dispose();
  assert.deepEqual(
    textures.map((value) => value.count()),
    [1, 1, 1],
  );
});

test('disposing during the real dressing kit load releases all late assets without false missing-art errors', async (t) => {
  browserGlobals(t);
  const libraries = await actualLibraries();
  const [primary, secondary, kit] = libraries;
  const counts = watchLibraries(libraries);
  const textures = [],
    pending = deferred(),
    started = deferred();
  t.mock.method(T.TextureLoader.prototype, 'loadAsync', async () => {
    const value = watchedTexture();
    textures.push(value);
    return value.texture;
  });
  const load = async (url) => {
    if (url.endsWith('vesper-canopy.glb')) return primary;
    if (url.endsWith('vesper-connected-forest-v1.glb')) return secondary;
    started.resolve();
    return pending.promise;
  };
  t.mock.method(GLTFLoader.prototype, 'loadAsync', load);
  if (KitLoader !== GLTFLoader)
    t.mock.method(KitLoader.prototype, 'loadAsync', load);
  const environment = createVesperEnvironment({ track: createVesperTrack() });
  t.after(() => environment.dispose());
  await started.promise;
  environment.dispose();
  pending.resolve(kit);
  await environment.ready;
  environment.dispose();
  assert.equal(environment.group.children.length, 0);
  assert.equal(environment.group.userData.metrics.loadState, 'disposed');
  assert.deepEqual(
    textures.map((value) => value.count()),
    [1, 1, 1],
  );
  assert.ok(
    counts.size > 100,
    'Actual authored libraries participate in cancellation',
  );
  for (const [resource, count] of counts)
    assert.equal(count, 1, `${resource.type}: ${resource.name}`);
});
