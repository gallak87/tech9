import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { SceneApp } from '../src/core/SceneApp.js';
import { FlyCamera } from '../src/core/FlyCamera.js';
import { validateDefinition } from '../src/core/sceneDefinition.js';
import { forestDefinition } from '../src/world/forestDefinition.js';
import { getForestColliders } from '../src/world/ForestWorld.js';

const bounds = { minX: -2, maxX: 12, minZ: -4, maxZ: 9, minY: 0, maxY: 14 };
const flatDefinition = {
  ...forestDefinition,
  id: 'flat-test',
  title: 'Flat test',
  bounds,
  groundHeight: () => 3.5,
  views: { start: { position: [1, 5, 2], target: [1, 5, -3] } },
  initialView: 'start',
  createWorld: () => ({ id: 'flat-world', init() {} }),
};

test('an alternate scene supplies its own bounds, ground and camera views', () => {
  assert.equal(validateDefinition(flatDefinition), flatDefinition);
  const camera = new PerspectiveCamera();
  let resets = 0;
  const events = new EventTarget();
  let selected;
  events.addEventListener('viewchange', (event) => {
    selected = event.detail;
  });
  const host = Object.assign(Object.create(SceneApp.prototype), {
    definition: flatDefinition,
    camera,
    controls: {
      resetMotion() {
        resets++;
      },
    },
    events,
  });
  host.setView();
  assert.deepEqual(camera.position.toArray(), [1, 5, 2]);
  assert.equal(selected, 'start');
  assert.equal(resets, 1);
  host.setView('missing');
  assert.equal(selected, 'start');
  assert.deepEqual(camera.position.toArray(), [1, 5, 2]);
  assert.throws(
    () =>
      validateDefinition({
        ...flatDefinition,
        bounds: { ...bounds, maxX: -3 },
      }),
    /bounds/,
  );
  assert.throws(
    () => validateDefinition({ ...flatDefinition, initialView: 'missing' }),
    /initial scene view/,
  );
  assert.throws(() => validateDefinition(), /scene definition/);
});

test('fly camera clamps to injected non-square bounds and an alternate ground surface', (context) => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    'document',
  );
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: new EventTarget(),
  });
  context.after(() => {
    if (previousWindow)
      Object.defineProperty(globalThis, 'window', previousWindow);
    else delete globalThis.window;
    if (previousDocument)
      Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
  });
  const document = new EventTarget();
  document.pointerLockElement = null;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: document,
  });
  const camera = new PerspectiveCamera();
  const canvas = new EventTarget();
  const samples = [];
  const controls = new FlyCamera(camera, canvas, bounds, (x, z) => {
    samples.push([x, z]);
    return 3.5;
  });
  camera.position.set(200, -20, -200);
  controls.update(0);
  assert.deepEqual(camera.position.toArray(), [12, 4.35, -4]);
  assert.deepEqual(samples, [[12, -4]]);
  camera.position.set(-200, 200, 200);
  controls.update(0);
  assert.deepEqual(camera.position.toArray(), [-2, 14, 9]);
  controls.dispose();
  assert.equal(controls.abort.signal.aborted, true);
});

test('controller replacement gives the new owner context and disposes the old owner once', () => {
  let released = 0;
  const original = {
    update() {},
    dispose() {
      released++;
    },
  };
  const host = Object.assign(Object.create(SceneApp.prototype), {
    controls: original,
    disposed: false,
    camera: new PerspectiveCamera(),
    canvas: {},
    definition: flatDefinition,
    bounds,
    groundHeight: flatDefinition.groundHeight,
    events: new EventTarget(),
  });
  const next = { update() {}, dispose() {} };
  let supplied;
  assert.equal(
    host.setController((context) => {
      supplied = context;
      return next;
    }),
    next,
  );
  assert.equal(released, 1);
  assert.equal(supplied.groundHeight(100, 100), 3.5);
  assert.equal(supplied.definition, flatDefinition);
  assert.equal(supplied.camera, host.camera);
  assert.equal(host.controls, next);
  host.setController(next);
  assert.equal(released, 1);
  assert.throws(
    () =>
      host.setController(() => {
        throw new Error('factory failed');
      }),
    /factory failed/,
  );
  assert.equal(host.controls, next);
  assert.throws(() => host.setController({}), /Camera controllers require/);
  assert.equal(host.controls, next);
  host.disposed = true;
  assert.throws(() => host.setController(original), /disposed app/);
});

test('layers receive the selected scene contract and ground query', async () => {
  const host = Object.assign(Object.create(SceneApp.prototype), {
    disposed: false,
    layers: [],
    pendingLayers: new Map(),
    settings: {},
    renderer: { shadowMap: {} },
    definition: flatDefinition,
    groundHeight: flatDefinition.groundHeight,
    bounds,
  });
  let supplied;
  await host.register({
    id: 'gameplay',
    init(context) {
      supplied = context;
    },
  });
  assert.equal(supplied.definition, flatDefinition);
  assert.equal(supplied.groundHeight(-10, 12), 3.5);
  assert.equal(supplied.bounds, bounds);
});

test('forest collision circles are stable finite authored proxies available without loading graphics', () => {
  const circles = getForestColliders();
  assert.equal(forestDefinition.getColliders(), circles);
  assert.ok(Object.isFrozen(circles));
  assert.equal(
    new Set(circles.map((circle) => circle.id)).size,
    circles.length,
  );
  assert.ok(circles.some((circle) => circle.kind === 'tree'));
  assert.ok(circles.some((circle) => circle.kind === 'rock'));
  assert.ok(
    circles.every(
      (circle) =>
        Object.isFrozen(circle) &&
        [circle.x, circle.z, circle.radius].every(Number.isFinite) &&
        circle.radius > 0,
    ),
  );
  assert.ok(
    circles.some(
      (circle) =>
        circle.kind === 'tree' && circle.x === -7.5 && circle.z === 15,
    ),
  );
  assert.ok(
    circles.some(
      (circle) =>
        circle.kind === 'rock' && circle.x === -5.8 && circle.z === 10,
    ),
  );
});
