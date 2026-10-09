import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  createCatalog,
  circuitURL,
  validateTrack,
} from '../src/levels/contract.js';
import { createLevelPresentation } from '../src/levels/presentation.js';
import { createLifetime } from '../src/core/lifecycle.js';
import { createCameraRig } from '../src/camera/index.js';
import halcyon from '../src/levels/halcyon/metadata.js';
import orbital from '../src/levels/orbital/metadata.js';
import nacre from '../src/levels/nacre/metadata.js';
import createHalcyon from '../src/levels/halcyon/index.js';
import createOrbital from '../src/levels/orbital/index.js';
import createNacre from '../src/levels/nacre/index.js';

const metadata = Object.fromEntries(
  [halcyon, orbital, nacre].map((meta) => [`./${meta.id}/metadata.js`, meta]),
);
const factories = {
  halcyon: createHalcyon,
  orbital: createOrbital,
  nacre: createNacre,
};
const modules = Object.fromEntries(
  Object.entries(factories).map(([id, factory]) => [
    `./${id}/index.js`,
    async () => ({ default: factory }),
  ]),
);

test('catalog lists metadata eagerly but loads only the selected implementation', async () => {
  const calls = [];
  const loaders = Object.fromEntries(
    Object.entries(modules).map(([path, load]) => [
      path,
      () => {
        calls.push(path);
        return load();
      },
    ]),
  );
  const catalog = createCatalog(metadata, loaders);
  assert.deepEqual(
    catalog.list.map((meta) => meta.id),
    ['halcyon', 'orbital', 'nacre'],
  );
  assert.deepEqual(calls, []);
  const selected = await catalog.load('nacre');
  assert.equal(selected.metadata.name, 'Nacre Tempest');
  assert.deepEqual(calls, ['./nacre/index.js']);
  await assert.rejects(catalog.load('../../core/main'), /Unknown circuit/);
  assert.equal(calls.length, 1);
});

test('unknown, incomplete and malformed circuit entries fail deliberately', async () => {
  assert.throws(
    () =>
      createCatalog(
        { ...metadata, './fake/metadata.js': { ...nacre, id: 'nacre' } },
        modules,
      ),
    /Invalid circuit metadata/,
  );
  assert.throws(
    () =>
      createCatalog(metadata, {
        ...modules,
        './orphan/index.js': async () => ({}),
      }),
    /Missing circuit metadata/,
  );
  const { './nacre/index.js': ignored, ...missing } = modules;
  assert.equal(typeof ignored, 'function');
  assert.throws(
    () => createCatalog(metadata, missing),
    /Missing circuit implementation/,
  );
  const broken = createCatalog(metadata, {
    ...modules,
    './nacre/index.js': async () => ({ default: () => ({ version: '1' }) }),
  });
  await assert.rejects(broken.load('nacre'), /missing createTrack/);
  await assert.rejects(
    createCatalog(metadata, modules).load('halcyon', { review: 'shape' }),
    /no shape preview/,
  );
});

test('all approved adapters preserve production/shape tracks and runtime identities', async () => {
  const catalog = createCatalog(metadata, modules);
  for (const id of ['halcyon', 'orbital', 'nacre']) {
    const level = await catalog.load(id);
    const track = validateTrack(level.definition.createTrack());
    assert.equal(track.name, level.metadata.name);
    if (id === 'halcyon') assert.equal(track.id, 'halcyon-viaduct-4-compact');
    if (id === 'orbital') assert.equal(track.id, 'asterion-orbital-1');
    if (id !== 'halcyon') {
      const shape = await catalog.load(id, { review: 'shape' });
      const bare = validateTrack(shape.definition.createTrack());
      assert.equal(bare.length, track.length);
      for (const distance of [0, 1234, track.length - 1])
        assert.ok(
          bare
            .sample(distance)
            .position.distanceTo(track.sample(distance).position) < 1e-8,
        );
    }
  }
});

test('track contract rejects malformed dimensions and non-finite frames before world construction', () => {
  const track = createHalcyon({}).createTrack();
  assert.throws(
    () => validateTrack({ ...track, width: Infinity }),
    /Invalid circuit track/,
  );
  assert.throws(
    () => validateTrack({ ...track, sample: () => ({ position: { x: NaN } }) }),
    /Invalid circuit frame/,
  );
});

test('circuit navigation retains deployment path and clears level-specific flags', () => {
  assert.equal(
    circuitURL(
      'https://example.test/game/?features=halcyon-pickups&review=signature#old',
      'nacre',
    ).href,
    'https://example.test/game/?level=nacre',
  );
  assert.equal(
    circuitURL('https://example.test/game/?level=nacre', 'halcyon').href,
    'https://example.test/game/',
  );
  assert.equal(
    circuitURL('https://example.test/game/?music=1&review=shape', 'nacre').href,
    'https://example.test/game/?music=1&level=nacre',
  );
  assert.equal(
    circuitURL('https://example.test/game/?level=nacre&music=1', 'halcyon')
      .href,
    'https://example.test/game/?music=1',
  );
  assert.throws(
    () => circuitURL('https://example.test/', '../private'),
    /Invalid circuit id/,
  );
});

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
function component(name, log, ready) {
  return {
    group: new T.Group(),
    ready,
    update: (frame) =>
      log.push([name, frame.dt, frame.time, frame.reset, frame.mode]),
    dispose: () => log.push(`${name}:dispose`),
  };
}

test('world readiness includes asynchronous components; failure releases acquired owners', async () => {
  const log = [],
    roadReady = deferred(),
    envReady = deferred(),
    scene = new T.Scene();
  const road = component('road', log, roadReady.promise),
    environment = component('environment', log, envReady.promise);
  let settled = false;
  const pending = createLevelPresentation(
    { createRoad: () => road, createEnvironment: () => environment },
    { view: { scene } },
  );
  pending.then(
    () => {
      settled = true;
    },
    () => {},
  );
  await Promise.resolve();
  assert.equal(settled, false);
  roadReady.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  envReady.reject(new Error('asset missing'));
  await assert.rejects(pending, /asset missing/);
  assert.deepEqual(log, ['environment:dispose', 'road:dispose']);
  assert.equal(scene.children.length, 0);
});

test('one frame updates each owner once, freezes non-racing dt, resets and disposes exactly once', async () => {
  const log = [],
    scene = new T.Scene(),
    borrowed = new T.Texture();
  let released = 0;
  borrowed.addEventListener('dispose', () => released++);
  const parts = [component('road', log), component('environment', log)];
  parts[1].setReflection = (texture) => {
    parts[1].texture = texture;
  };
  const world = await createLevelPresentation(
    { createRoad: () => parts[0], createEnvironment: () => parts[1] },
    {
      view: {
        scene,
        updatePresentation: (frame) =>
          log.push(['backdrop', frame.dt, frame.time, frame.reset, frame.mode]),
      },
    },
  );
  world.setReflection(borrowed);
  const frame = { dt: 0.01, time: 2, mode: 'racing' };
  world.update(frame);
  world.update({ ...frame, mode: 'paused' });
  world.reset();
  world.update({ ...frame, mode: 'inspection' });
  for (const [index, mode] of ['racing', 'paused', 'inspection'].entries()) {
    assert.deepEqual(
      log.slice(index * 3, index * 3 + 3).map((entry) => entry[0]),
      ['road', 'environment', 'backdrop'],
    );
    for (const entry of log.slice(index * 3, index * 3 + 3))
      assert.deepEqual(entry.slice(1), [
        index ? 0 : 0.01,
        2,
        index !== 1,
        mode,
      ]);
  }
  world.dispose();
  world.dispose();
  world.update(frame);
  assert.deepEqual(log.slice(9), ['environment:dispose', 'road:dispose']);
  assert.equal(scene.children.length, 0);
  assert.equal(released, 0);
  borrowed.dispose();
  assert.equal(released, 1);
});

test('lifetime cleanup continues after a failed owner and remains idempotent', () => {
  const lifetime = createLifetime(),
    log = [];
  lifetime.defer(() => log.push('first'));
  lifetime.defer(() => {
    throw new Error('broken disposal');
  });
  lifetime.defer(() => log.push('last'));
  assert.throws(() => lifetime.dispose(), AggregateError);
  lifetime.dispose();
  assert.deepEqual(log, ['last', 'first']);
});

test('Nacre adapter invokes its scene update once per frame', async () => {
  const definition = createNacre({ shape: false });
  const track = definition.createTrack(),
    scene = new T.Scene();
  const environment = definition.createEnvironment({
    track,
    view: { scene, assets: {} },
  });
  try {
    await environment.ready;
    let updates = 0;
    const update = environment.group.userData.update;
    environment.group.userData.update = (...args) => {
      updates++;
      update(...args);
    };
    environment.update({
      state: { speed: 0, distance: 0 },
      time: 0,
      mode: 'title',
      camera: new T.PerspectiveCamera(),
      settings: { quality: 'low', reducedMotion: true },
      ship: { group: new T.Group() },
      reviewing: false,
      reset: true,
    });
    assert.equal(updates, 1);
  } finally {
    environment.dispose();
  }
});

test('camera composition opts in through options rather than a circuit name', () => {
  const definition = createNacre({ shape: false }),
    track = definition.createTrack();
  const state = { ...track.scenarios['storm-showcase'], lateral: 0, speed: 0 };
  const cameras = [
    new T.PerspectiveCamera(64, 390 / 844),
    new T.PerspectiveCamera(64, 390 / 844),
  ];
  createCameraRig(cameras[0], definition.camera).update(track, state, 1 / 60);
  createCameraRig(cameras[1], definition.camera).update(
    { ...track, id: 'unrelated-custom-track' },
    state,
    1 / 60,
  );
  assert.equal(cameras[0].fov, cameras[1].fov);
  assert.ok(cameras[0].position.distanceTo(cameras[1].position) < 1e-8);
  const baseline = new T.PerspectiveCamera(64, 390 / 844);
  createCameraRig(baseline).update(track, state, 1 / 60);
  assert.ok(cameras[0].fov > baseline.fov);
});
