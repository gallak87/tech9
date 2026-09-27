import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { Walker } from '../src/game/Walker.js';

function withWalker(run) {
  const previous = new Map(
    ['window', 'document'].map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  const win = new EventTarget(),
    doc = new EventTarget(),
    canvas = new EventTarget();
  doc.pointerLockElement = null;
  doc.hidden = false;
  doc.exitPointerLock = () => {
    doc.pointerLockElement = null;
    doc.dispatchEvent(new Event('pointerlockchange'));
  };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: win,
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: doc,
  });
  let pauses = 0,
    drawing = true,
    walker;
  const camera = new PerspectiveCamera();
  camera.position.set(0, 1.68, 0);
  walker = new Walker(
    {
      camera,
      canvas,
      bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
      groundHeight: () => 0,
    },
    [],
    {
      pause() {
        pauses++;
        drawing = false;
        walker.enabled = false;
        walker.resetMotion();
      },
      draw() {
        drawing = true;
      },
      release() {},
      retrieve() {},
    },
  );
  const key = (type, code, repeat = false) => {
    const e = new Event(type, { cancelable: true });
    Object.assign(e, { code, repeat });
    win.dispatchEvent(e);
    return e;
  };
  try {
    run({
      walker,
      win,
      doc,
      canvas,
      camera,
      key,
      pauses: () => pauses,
      drawing: () => drawing,
    });
  } finally {
    walker.dispose();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}
test('pointer-lock loss pauses and clears active movement, aim and draw intent', () =>
  withWalker(({ walker, doc, canvas, key, pauses, drawing, camera }) => {
    walker.enabled = true;
    doc.pointerLockElement = canvas;
    key('keydown', 'KeyW');
    key('keydown', 'KeyQ');
    walker.update(0.1);
    assert.equal(walker.aiming, true);
    const p = camera.position.clone();
    doc.exitPointerLock();
    assert.equal(pauses(), 1);
    assert.equal(drawing(), false);
    assert.equal(walker.aiming, false);
    assert.equal(walker.moving, false);
    walker.update(0.5);
    assert.ok(camera.position.equals(p));
  }));
test('focus loss and held-key repeats cannot restart movement on resume', () =>
  withWalker(({ walker, win, key, camera, pauses }) => {
    walker.enabled = true;
    key('keydown', 'KeyW');
    walker.update(0.1);
    win.dispatchEvent(new Event('blur'));
    assert.equal(pauses(), 1);
    const p = camera.position.clone();
    walker.enabled = true;
    key('keydown', 'KeyW', true);
    walker.update(0.5);
    assert.ok(camera.position.equals(p));
    key('keyup', 'KeyW');
    key('keydown', 'KeyW');
    walker.update(0.1);
    assert.ok(camera.position.z < p.z);
  }));
test('menu keyboard defaults and disposal are preserved', () =>
  withWalker(({ walker, key, win, pauses }) => {
    for (const code of ['Tab', 'Space', 'ArrowDown'])
      assert.equal(key('keydown', code).defaultPrevented, false);
    walker.enabled = true;
    assert.equal(key('keydown', 'ArrowDown').defaultPrevented, true);
    walker.dispose();
    win.dispatchEvent(new Event('blur'));
    assert.equal(pauses(), 0);
  }));
