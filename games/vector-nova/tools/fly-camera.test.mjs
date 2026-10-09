import test from 'node:test';
import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import { PerspectiveCamera, Vector3 } from 'three';
import { createFlyCamera } from '../src/core/fly-camera.js';
setMaxListeners(0);
function fixture() {
  globalThis.window = new EventTarget();
  globalThis.document = new EventTarget();
  const canvas = new EventTarget(),
    capture = new Set();
  canvas.classList = { add() {}, remove() {} };
  canvas.hasPointerCapture = (id) => capture.has(id);
  canvas.setPointerCapture = (id) => capture.add(id);
  canvas.releasePointerCapture = (id) => capture.delete(id);
  const camera = new PerspectiveCamera();
  camera.position.set(3, 6, 9);
  let toggles = 0,
    exits = 0;
  const fly = createFlyCamera(camera, canvas, {
    toggle: () => toggles++,
    exit: () => exits++,
  });
  const fire = (target, type, fields = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, fields);
    target.dispatchEvent(event);
  };
  return {
    camera,
    canvas,
    fly,
    fire,
    commands: () => [toggles, exits],
    press: (code) => fire(window, 'keydown', { code }),
    release: (code) => fire(window, 'keyup', { code }),
    dispose() {
      fly.dispose();
      fly.dispose();
      delete globalThis.window;
      delete globalThis.document;
    },
  };
}
test('fly translation stays at 200 m/s across directions, Shift and wheel input', () => {
  const f = fixture();
  try {
    f.fly.enter();
    const start = f.camera.position.clone();
    f.press('KeyW');
    f.press('KeyD');
    for (let i = 0; i < 60; i++) f.fly.update(1 / 60);
    assert.ok(Math.abs(f.camera.position.distanceTo(start) - 200) < 1e-8);
    assert.ok(f.camera.position.x > start.x && f.camera.position.z < start.z);
    f.release('KeyD');
    f.press('ShiftLeft');
    const steady = f.camera.position.clone();
    f.fly.update(0.1);
    assert.ok(Math.abs(f.camera.position.distanceTo(steady) - 20) < 1e-8);
    f.fire(f.canvas, 'wheel', { deltaY: -100 });
    const afterWheel = f.camera.position.clone();
    for (let i = 0; i < 120; i++) f.fly.update(1 / 120);
    assert.ok(Math.abs(f.camera.position.distanceTo(afterWheel) - 200) < 1e-8);
  } finally {
    f.dispose();
  }
});
test('arrow keys match WASD translation and opposite directions cancel', () => {
  const f = fixture();
  try {
    for (const [letter, arrow, opposite] of [
      ['KeyW', 'ArrowUp', 'ArrowDown'],
      ['KeyS', 'ArrowDown', 'ArrowUp'],
      ['KeyA', 'ArrowLeft', 'ArrowRight'],
      ['KeyD', 'ArrowRight', 'ArrowLeft'],
    ]) {
      f.fly.enter();
      f.press(letter);
      f.fly.update(0.1);
      const expected = f.camera.position.clone();
      f.fly.leave();
      f.fly.enter();
      f.press(arrow);
      f.fly.update(0.1);
      assert.deepEqual(f.camera.position, expected);
      f.press(opposite);
      f.fly.update(0.1);
      assert.deepEqual(f.camera.position, expected);
      f.fly.leave();
    }
  } finally {
    f.dispose();
  }
});
test('drag-look supports pointer coordinates, releasing look retains movement, blur clears movement', () => {
  const f = fixture();
  try {
    f.fly.enter();
    f.press('KeyW');
    f.fire(f.canvas, 'pointerdown', {
      button: 0,
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    f.fire(f.canvas, 'pointermove', {
      pointerId: 1,
      clientX: 300,
      clientY: 160,
    });
    const direction = new Vector3();
    f.camera.getWorldDirection(direction);
    assert.ok(Math.abs(direction.x) > 0.1);
    f.fire(f.canvas, 'pointerup', { pointerId: 1 });
    const before = f.camera.position.clone();
    f.fly.update(0.1);
    assert.ok(f.camera.position.distanceTo(before) > 5);
    f.fire(window, 'blur');
    const stopped = f.camera.position.clone();
    f.fly.update(0.1);
    assert.deepEqual(f.camera.position, stopped);
  } finally {
    f.dispose();
  }
});
test('exit restores camera and removes stale keys; disposal removes shortcuts', () => {
  const f = fixture();
  try {
    const before = f.camera.clone();
    f.fly.enter();
    f.press('KeyE');
    f.fly.update(0.1);
    assert.ok(f.camera.position.y > before.position.y);
    f.press('Escape');
    f.press('KeyF');
    assert.deepEqual(f.commands(), [1, 1]);
    f.fly.leave();
    assert.deepEqual(f.camera.position, before.position);
    assert.equal(f.camera.fov, before.fov);
    f.fly.enter();
    f.fly.update(0.1);
    assert.deepEqual(f.camera.position, before.position);
    f.fly.dispose();
    f.press('KeyF');
    assert.deepEqual(f.commands(), [1, 1]);
  } finally {
    f.dispose();
  }
});
