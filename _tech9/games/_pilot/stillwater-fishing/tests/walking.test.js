import { BANK_ROCKS, isWalkable } from '../src/world/pondDefinition.js';
import { getForestColliders } from '../src/world/ForestWorld.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { WalkingController } from '../src/game/WalkingController.js';

// Unit-only DOM substitutes. These exercise registered event handlers, not a
// browser's pointer-lock permission, focus, or visibility implementation.
function setup(context, options = {}) {
  const previous = new Map(
    ['window', 'document'].map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget();
  documentTarget.pointerLockElement = null;
  documentTarget.hidden = false;
  let lockExits = 0;
  documentTarget.exitPointerLock = () => {
    lockExits += 1;
    documentTarget.pointerLockElement = null;
    documentTarget.dispatchEvent(new Event('pointerlockchange'));
  };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: windowTarget,
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: documentTarget,
  });
  const canvas = new EventTarget();
  const camera = new PerspectiveCamera();
  const groundHeight = options.groundHeight ?? (() => 2);
  camera.position.set(0, groundHeight(0, 0) + 1.68, 0);
  const pauses = [];
  let controller;
  context.after(() => {
    controller?.dispose();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  controller = new WalkingController(
    {
      camera,
      canvas,
      bounds: options.bounds ?? {
        minX: -10,
        maxX: 10,
        minZ: -10,
        maxZ: 10,
      },
      groundHeight,
      definition: { getColliders: () => options.colliders ?? [] },
    },
    {
      onPause: (reason) => pauses.push(reason),
      canMove: options.canMove,
      canLook: options.canLook,
      isWalkable: options.isWalkable,
    },
  );
  return {
    controller,
    camera,
    canvas,
    windowTarget,
    documentTarget,
    pauses,
    lockExits: () => lockExits,
  };
}

function dispatch(target, type, properties = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, properties);
  target.dispatchEvent(event);
  return event;
}

function holdInput(host) {
  dispatch(host.windowTarget, 'keydown', { code: 'KeyW' });
  dispatch(host.windowTarget, 'keydown', { code: 'KeyJ' });
  dispatch(host.canvas, 'pointerdown', {
    button: 2,
    clientX: 100,
    clientY: 100,
  });
  assert.equal(host.controller.keys.size, 2);
  assert.equal(host.controller.dragging, true);
}

function assertMotionCleared(host) {
  assert.equal(host.controller.keys.size, 0);
  assert.equal(host.controller.dragging, false);
  const position = host.camera.position.clone();
  const quaternion = host.camera.quaternion.toArray();
  host.controller.update(0.1);
  assert.deepEqual(host.camera.position, position);
  assert.deepEqual(host.camera.quaternion.toArray(), quaternion);
}

test('window blur dispatch pauses and clears held movement, aim, and drag', (context) => {
  const host = setup(context);
  holdInput(host);
  dispatch(host.windowTarget, 'blur');
  assert.deepEqual(host.pauses, ['blur']);
  assertMotionCleared(host);
  dispatch(host.windowTarget, 'keydown', { code: 'KeyW' });
  host.controller.update(0.1);
  assert.ok(host.camera.position.z < 0, 'fresh input works after resuming');
});

test('visibilitychange only pauses when hidden and clears all held input', (context) => {
  const host = setup(context);
  holdInput(host);
  dispatch(host.documentTarget, 'visibilitychange');
  assert.deepEqual(host.pauses, []);
  assert.equal(host.controller.keys.size, 2);
  host.documentTarget.hidden = true;
  dispatch(host.documentTarget, 'visibilitychange');
  assert.deepEqual(host.pauses, ['hidden']);
  assertMotionCleared(host);
  host.documentTarget.hidden = false;
  dispatch(host.documentTarget, 'visibilitychange');
  assert.deepEqual(host.pauses, ['hidden']);
  assertMotionCleared(host);
});

test('pointer-lock exit dispatch clears input and pauses only after an owned lock', (context) => {
  const host = setup(context);
  host.documentTarget.pointerLockElement = host.canvas;
  dispatch(host.documentTarget, 'pointerlockchange');
  assert.deepEqual(host.pauses, []);
  assert.equal(host.controller.wasLocked, true);
  holdInput(host);
  host.documentTarget.pointerLockElement = null;
  dispatch(host.documentTarget, 'pointerlockchange');
  assert.deepEqual(host.pauses, ['pointer-lock']);
  assertMotionCleared(host);
  dispatch(host.documentTarget, 'pointerlockchange');
  assert.deepEqual(host.pauses, ['pointer-lock']);
});

test('dispose releases an owned lock once and unregisters input and pause handlers', async (context) => {
  const host = setup(context);
  let requests = 0;
  host.canvas.requestPointerLock = async () => {
    requests += 1;
    host.documentTarget.pointerLockElement = host.canvas;
    dispatch(host.documentTarget, 'pointerlockchange');
  };
  assert.equal(await host.controller.lock(), true);
  holdInput(host);
  host.controller.dispose();
  assert.equal(host.controller.abort.signal.aborted, true);
  assert.equal(host.lockExits(), 1);
  assert.equal(host.documentTarget.pointerLockElement, null);
  assert.deepEqual(host.pauses, [], 'disposal must not emit a pause callback');
  assertMotionCleared(host);
  const quaternion = host.camera.quaternion.toArray();
  const key = dispatch(host.windowTarget, 'keydown', { code: 'KeyW' });
  const pointer = dispatch(host.canvas, 'pointerdown', {
    button: 2,
    clientX: 10,
    clientY: 10,
  });
  dispatch(host.windowTarget, 'pointermove', { clientX: 50, clientY: 50 });
  dispatch(host.windowTarget, 'blur');
  host.documentTarget.hidden = true;
  dispatch(host.documentTarget, 'visibilitychange');
  assert.equal(key.defaultPrevented, false);
  assert.equal(pointer.defaultPrevented, false);
  assertMotionCleared(host);
  assert.deepEqual(host.camera.quaternion.toArray(), quaternion);
  assert.deepEqual(host.pauses, []);
  assert.equal(await host.controller.lock(), false);
  assert.equal(requests, 1);
  host.controller.dispose();
  assert.equal(host.lockExits(), 1);
});

test('dispose leaves another canvas pointer lock untouched', (context) => {
  const host = setup(context);
  const otherCanvas = new EventTarget();
  host.documentTarget.pointerLockElement = otherCanvas;
  host.controller.dispose();
  assert.equal(host.lockExits(), 0);
  assert.equal(host.documentTarget.pointerLockElement, otherCanvas);
});

test('grounded movement follows terrain, normalizes diagonals, and respects bounds', (context) => {
  const groundHeight = (x, z) => 2 + x * 0.2 - z * 0.1;
  const host = setup(context, { groundHeight });
  dispatch(host.windowTarget, 'keydown', { code: 'KeyW' });
  dispatch(host.windowTarget, 'keydown', { code: 'KeyD' });
  host.controller.update(0.1);
  assert.ok(
    Math.abs(
      Math.hypot(host.camera.position.x, host.camera.position.z) - 0.26,
    ) < 1e-10,
  );
  assert.equal(
    host.camera.position.y,
    groundHeight(host.camera.position.x, host.camera.position.z) + 1.68,
  );
  dispatch(host.windowTarget, 'keyup', { code: 'KeyW' });
  for (let frame = 0; frame < 80; frame++) host.controller.update(0.1);
  assert.equal(host.camera.position.x, 9.7);
  assert.equal(
    host.camera.position.y,
    groundHeight(host.camera.position.x, host.camera.position.z) + 1.68,
  );
});

test('shore and authored circle collisions keep the whole player on solid ground', (context) => {
  const host = setup(context, {
    isWalkable: (x, z) => Math.hypot(x, z) >= 3.5,
    colliders: [{ x: 5, z: 0, radius: 0.8 }],
  });
  host.camera.position.set(0, 3.68, 6);
  dispatch(host.windowTarget, 'keydown', { code: 'KeyW' });
  for (let frame = 0; frame < 60; frame++) host.controller.update(0.1);
  assert.ok(host.camera.position.z >= 3.8, 'shore keeps the player radius dry');
  assert.ok(host.camera.position.z < 3.93, 'player reaches the near shore');
  host.camera.position.set(5, 3.68, 3);
  for (let frame = 0; frame < 60; frame++) host.controller.update(0.1);
  assert.ok(
    host.camera.position.z >= 1.1,
    'tree circle includes player radius',
  );
  assert.ok(host.camera.position.z < 1.23, 'player reaches the tree boundary');
});

test('right-button pointermove dragging aims and pointerup or cancellation stops it', (context) => {
  const host = setup(context);
  const down = dispatch(host.canvas, 'pointerdown', {
    button: 2,
    clientX: 100,
    clientY: 100,
  });
  assert.equal(down.defaultPrevented, true);
  dispatch(host.windowTarget, 'pointermove', {
    clientX: 200,
    clientY: 150,
    movementX: 999,
    movementY: 999,
  });
  assert.ok(Math.abs(host.controller.rotation.y + 0.18) < 1e-10);
  assert.ok(Math.abs(host.controller.rotation.x + 0.09) < 1e-10);
  dispatch(host.windowTarget, 'pointerup');
  const quaternion = host.camera.quaternion.toArray();
  dispatch(host.windowTarget, 'pointermove', { clientX: 300, clientY: 300 });
  assert.deepEqual(host.camera.quaternion.toArray(), quaternion);
  dispatch(host.canvas, 'pointerdown', {
    button: 2,
    clientX: 100,
    clientY: 100,
  });
  dispatch(host.windowTarget, 'pointercancel');
  assert.equal(host.controller.dragging, false);
  dispatch(host.canvas, 'pointerdown', { button: 0, clientX: 0, clientY: 0 });
  assert.equal(host.controller.dragging, false);
});

test('owned pointer lock uses relative pointer movement for aiming', (context) => {
  const host = setup(context);
  host.documentTarget.pointerLockElement = host.canvas;
  dispatch(host.documentTarget, 'pointerlockchange');
  dispatch(host.windowTarget, 'pointermove', {
    movementX: 20,
    movementY: -10,
    clientX: 999,
    clientY: 999,
  });
  assert.ok(Math.abs(host.controller.rotation.y + 0.036) < 1e-10);
  assert.ok(Math.abs(host.controller.rotation.x - 0.018) < 1e-10);
});

test('movement and look gates discard stale input before the next active frame', (context) => {
  let enabled = true;
  const host = setup(context, {
    canMove: () => enabled,
    canLook: () => enabled,
  });
  holdInput(host);
  enabled = false;
  host.controller.update(0.1);
  assertMotionCleared(host);
  dispatch(host.windowTarget, 'keydown', { code: 'KeyW' });
  dispatch(host.windowTarget, 'keydown', { code: 'KeyJ' });
  assert.equal(host.controller.keys.size, 0);
  enabled = true;
  assertMotionCleared(host);
});

test('authored bank-rock proxies match rendered placements and reject reachable solid movement', (context) => {
  const colliders = getForestColliders();
  const host = setup(context, {
    colliders,
    isWalkable,
    bounds: { minX: -76, maxX: 76, minZ: -76, maxZ: 76 },
  });
  for (const [index, [x, z, sx, , sz]] of BANK_ROCKS.entries()) {
    const proxy = colliders.find((item) => item.id === `bank-rock-${index}`);
    assert.ok(proxy);
    assert.equal(proxy.x, x);
    assert.equal(proxy.z, z);
    assert.ok(proxy.radius >= Math.max(sx, sz));
    assert.equal(host.controller.canStand(x, z), false);
  }
  const reachable = BANK_ROCKS.find(([x, z]) => isWalkable(x, z));
  assert.ok(
    reachable,
    'A dry-bank boulder must exercise collision independently of pond exclusion',
  );
  const [x, z] = reachable;
  assert.equal(host.controller.isWalkable(x, z), true);
  assert.equal(
    host.controller.canStand(x, z),
    false,
    'Visible dry rock blocks the player',
  );
  host.camera.position.set(x, 3, z + 3);
  for (let step = 0; step < 100; step++) host.controller.move(0, -0.05);
  assert.ok(
    host.camera.position.z > z + 1,
    'Repeated forward movement stops at the boulder',
  );
  assert.equal(
    host.controller.canStand(0, 22),
    true,
    'The cast approach stays open',
  );
});
