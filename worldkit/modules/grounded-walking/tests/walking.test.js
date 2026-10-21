import test from 'node:test';
import assert from 'node:assert/strict';
import { WalkingController } from '../src/WalkingController.js';

function fixture(options = {}, colliders = []) {
  const window = new EventTarget();
  const document = new EventTarget();
  const canvas = new EventTarget();
  document.defaultView = window;
  document.pointerLockElement = null;
  document.activeElement = canvas;
  canvas.ownerDocument = document;
  canvas.focus = () => {
    document.activeElement = canvas;
  };
  let exits = 0;
  document.exitPointerLock = () => {
    exits++;
    document.pointerLockElement = null;
    document.dispatchEvent(new Event('pointerlockchange'));
  };
  canvas.requestPointerLock = async () => {
    document.pointerLockElement = canvas;
    document.dispatchEvent(new Event('pointerlockchange'));
  };
  const camera = {
    position: { x: 0, y: 1.68, z: 0 },
    rotation: { x: 0, y: 0, z: 0, reorder() {} },
  };
  const pauses = [];
  const controller = new WalkingController(
    {
      camera,
      canvas,
      bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
      groundHeight: (x, z) => (x + z) * 0.1,
      definition: { getColliders: () => colliders },
    },
    { onPause: (reason) => pauses.push(reason), ...options },
  );
  function dispatch(target, type, properties = {}) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, properties);
    target.dispatchEvent(event);
    return event;
  }
  const key = (code, type = 'keydown') => dispatch(window, type, { code });
  return {
    controller,
    camera,
    window,
    document,
    canvas,
    pauses,
    key,
    dispatch,
    exits: () => exits,
  };
}

test('disabled/menu controller does not consume navigation or gameplay keys', () => {
  const f = fixture();
  for (const code of ['KeyW', 'ArrowDown', 'KeyJ', 'Tab', 'Escape', 'Space'])
    assert.equal(f.key(code).defaultPrevented, false, code);
  f.controller.update(1);
  assert.deepEqual(f.camera.position, { x: 0, y: 1.68, z: 0 });
  assert.deepEqual(f.pauses, []);
  f.controller.dispose();
});

test('editable fields and focused buttons keep their own keyboard semantics', () => {
  const f = fixture({ enabled: true });
  for (const element of [
    { tagName: 'INPUT' },
    { tagName: 'SELECT' },
    { tagName: 'TEXTAREA' },
    { tagName: 'BUTTON' },
    { isContentEditable: true },
  ]) {
    f.document.activeElement = element;
    assert.equal(f.key('ArrowDown').defaultPrevented, false);
    assert.equal(f.key('KeyP').defaultPrevented, false);
    assert.equal(f.controller.keys.size, 0);
  }
  f.controller.dispose();
});

test('movement normalizes diagonals, clamps dt and follows injected terrain', () => {
  const straight = fixture({ enabled: true });
  const diagonal = fixture({ enabled: true });
  straight.key('KeyW');
  diagonal.key('KeyW');
  diagonal.key('KeyD');
  straight.controller.update(10);
  diagonal.controller.update(0.1);
  const a = straight.camera.position,
    b = diagonal.camera.position;
  assert.ok(Math.abs(Math.hypot(a.x, a.z) - 0.26) < 1e-10);
  assert.ok(Math.abs(Math.hypot(b.x, b.z) - 0.26) < 1e-10);
  assert.equal(a.y, (a.x + a.z) * 0.1 + 1.68);
  const before = { ...a };
  straight.controller.update(NaN);
  assert.deepEqual(a, before);
  straight.controller.dispose();
  diagonal.controller.dispose();
});

test('moving focus into a field clears held movement before it can resume', () => {
  const f = fixture({ enabled: true });
  f.key('KeyW');
  f.document.activeElement = { tagName: 'INPUT' };
  f.controller.update(0.1);
  f.document.activeElement = f.canvas;
  f.controller.update(0.1);
  assert.equal(f.controller.keys.size, 0);
  assert.equal(f.camera.position.z, 0);
  f.controller.dispose();
});

test('boost, collision and shore guards are game-neutral', () => {
  const f = fixture({ enabled: true, isWalkable: (x) => x <= 1 }, [
    { x: 0, z: -1, radius: 0.3 },
  ]);
  f.key('ShiftLeft');
  f.key('KeyW');
  for (let i = 0; i < 20; i++) f.controller.update(0.1);
  assert.ok(f.camera.position.z >= -0.4 - 1e-9);
  f.key('KeyW', 'keyup');
  f.key('KeyD');
  for (let i = 0; i < 20; i++) f.controller.update(0.1);
  assert.ok(f.camera.position.x <= 0.7 + 1e-9);
  f.controller.dispose();
});

test('right drag and IJKL look work without native capture, clamped pitch', () => {
  const f = fixture({ enabled: true });
  f.dispatch(f.canvas, 'pointerdown', { button: 0, clientX: 10, clientY: 10 });
  assert.equal(f.controller.dragging, false);
  f.dispatch(f.canvas, 'pointerdown', { button: 2, clientX: 10, clientY: 10 });
  f.dispatch(f.window, 'pointermove', { clientX: 110, clientY: -10000 });
  assert.equal(f.camera.rotation.y, -0.18);
  assert.equal(f.camera.rotation.x, 1.2);
  f.dispatch(f.window, 'pointercancel');
  assert.equal(f.controller.dragging, false);
  f.key('KeyL');
  f.key('KeyK');
  f.controller.update(0.1);
  assert.ok(f.camera.rotation.y < -0.18);
  assert.ok(f.camera.rotation.x < 1.2);
  f.controller.dispose();
});

test('movement and look guards stop input, including held-state on their transition', () => {
  let allowed = true;
  const f = fixture({
    enabled: true,
    canMove: () => allowed,
    canLook: () => allowed,
  });
  f.key('KeyW');
  f.key('KeyJ');
  allowed = false;
  f.controller.update(0.1);
  assert.equal(f.controller.keys.size, 0);
  assert.equal(f.key('KeyW').defaultPrevented, false);
  assert.equal(f.key('KeyJ').defaultPrevented, false);
  allowed = true;
  f.controller.update(0.1);
  assert.equal(f.camera.position.z, 0);
  assert.equal(f.camera.rotation.y, 0);
  f.controller.dispose();
});

test('pause and resume clear held input instead of restarting old movement', () => {
  const f = fixture({ enabled: true });
  f.key('KeyW');
  assert.equal(f.key('KeyP').defaultPrevented, true);
  assert.equal(f.controller.enabled, false);
  assert.equal(f.controller.keys.size, 0);
  assert.deepEqual(f.pauses, ['keyboard']);
  f.controller.setEnabled(true);
  f.controller.update(0.1);
  assert.equal(f.camera.position.z, 0);
  f.controller.dispose();
});

test('OS key repeat cannot restore held movement or look after pause/resume', () => {
  for (const code of ['KeyW', 'KeyJ']) {
    const f = fixture({ enabled: true });
    f.key(code);
    f.controller.update(0.1);
    f.controller.pause('keyboard');
    f.controller.setEnabled(true);
    const position = { ...f.camera.position };
    const yaw = f.camera.rotation.y;
    const repeat = f.dispatch(f.window, 'keydown', { code, repeat: true });
    f.controller.update(0.1);
    assert.equal(repeat.defaultPrevented, false);
    assert.equal(f.controller.keys.size, 0);
    assert.deepEqual(f.camera.position, position);
    assert.equal(f.camera.rotation.y, yaw);
    f.key(code, 'keyup');
    f.key(code);
    f.controller.update(0.1);
    if (code === 'KeyW') assert.ok(f.camera.position.z < position.z);
    else assert.ok(f.camera.rotation.y > yaw);
    f.controller.dispose();
  }
});

test('blur and hidden transitions pause once and reset drag/keys', () => {
  const f = fixture({ enabled: true });
  f.key('KeyW');
  f.dispatch(f.canvas, 'pointerdown', { button: 2, clientX: 0, clientY: 0 });
  f.dispatch(f.window, 'blur');
  f.document.hidden = true;
  f.dispatch(f.document, 'visibilitychange');
  assert.deepEqual(f.pauses, ['blur']);
  assert.equal(f.controller.keys.size, 0);
  assert.equal(f.controller.dragging, false);
  f.controller.setEnabled(true);
  f.dispatch(f.document, 'visibilitychange');
  assert.deepEqual(f.pauses, ['blur', 'hidden']);
  f.controller.dispose();
});

test('only release of this canvas pointer lock pauses; other canvas is left alone', async () => {
  const f = fixture({ enabled: true });
  const other = {};
  f.document.pointerLockElement = other;
  f.dispatch(f.document, 'pointerlockchange');
  f.document.pointerLockElement = null;
  f.dispatch(f.document, 'pointerlockchange');
  assert.deepEqual(f.pauses, []);
  assert.equal(await f.controller.lock(), true);
  f.document.pointerLockElement = other;
  f.dispatch(f.document, 'pointerlockchange');
  assert.deepEqual(f.pauses, ['pointer-lock']);
  assert.equal(f.document.pointerLockElement, other);
  assert.equal(f.exits(), 0);
  f.controller.dispose();
});

test('failed capture returns false and leaves keyboard/drag controls enabled', async () => {
  const f = fixture({ enabled: true });
  f.canvas.requestPointerLock = async () => {
    throw new Error('denied');
  };
  assert.equal(await f.controller.lock(), false);
  assert.equal(f.controller.enabled, true);
  f.key('KeyW');
  f.controller.update(0.1);
  assert.ok(f.camera.position.z < 0);
  f.controller.dispose();
});

test('pending capture acquired after disable or disposal is immediately released', async () => {
  for (const action of ['disable', 'dispose']) {
    const f = fixture({ enabled: true });
    let complete;
    f.canvas.requestPointerLock = () =>
      new Promise((resolve) => {
        complete = resolve;
      });
    const pending = f.controller.lock();
    if (action === 'disable') f.controller.setEnabled(false);
    else f.controller.dispose();
    f.document.pointerLockElement = f.canvas;
    complete();
    assert.equal(await pending, false);
    assert.equal(f.document.pointerLockElement, null);
    assert.deepEqual(f.pauses, []);
    f.controller.dispose();
  }
});

test('dispose is idempotent, detaches listeners and releases only its own capture', async () => {
  const f = fixture({ enabled: true });
  await f.controller.lock();
  f.key('KeyW');
  f.controller.dispose();
  f.controller.dispose();
  assert.equal(f.exits(), 1);
  assert.equal(f.controller.keys.size, 0);
  assert.equal(f.key('KeyW').defaultPrevented, false);
  f.dispatch(f.window, 'blur');
  assert.deepEqual(f.pauses, []);
  f.controller.setEnabled(true);
  assert.equal(f.controller.enabled, false);
  assert.equal(await f.controller.lock(), false);
});
