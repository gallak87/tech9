import test from 'node:test';
import assert from 'node:assert/strict';
import { BoatInput } from '../src/game/BoatInput.js';
import { LapRules } from '../src/game/LapRules.js';

test('held-key repeat cannot reengage the throttle after pause, blur or pointer loss', () => {
  const savedWindow = globalThis.window,
    savedDocument = globalThis.document;
  const win = new EventTarget(),
    doc = new EventTarget();
  globalThis.window = win;
  globalThis.document = doc;
  const rules = new LapRules();
  rules.start();
  const input = new BoatInput(
    rules,
    () => {},
    () => {},
  );
  const key = (type, code, repeat = false) => {
    const e = new Event(type);
    Object.assign(e, { code, repeat });
    win.dispatchEvent(e);
  };
  try {
    key('keydown', 'KeyW');
    assert.equal(input.sample().throttle, 1);
    key('keydown', 'KeyP');
    assert.equal(rules.state, 'paused');
    assert.equal(input.sample().throttle, 0);
    key('keyup', 'KeyP');
    key('keydown', 'KeyP');
    assert.equal(rules.state, 'running');
    key('keydown', 'KeyW', true);
    assert.equal(
      input.sample().throttle,
      0,
      'OS repeat needs a new physical press',
    );
    key('keyup', 'KeyW');
    key('keydown', 'KeyW');
    assert.equal(input.sample().throttle, 1);
    win.dispatchEvent(new Event('blur'));
    assert.equal(rules.state, 'paused');
    assert.equal(input.sample().throttle, 0);
    rules.resume();
    key('keydown', 'KeyW', true);
    assert.equal(input.sample().throttle, 0);
    key('keyup', 'KeyW');
    key('keydown', 'KeyW');
    doc.pointerLockElement = null;
    doc.dispatchEvent(new Event('pointerlockchange'));
    assert.equal(rules.state, 'paused');
    assert.equal(input.sample().throttle, 0);
  } finally {
    input.dispose();
    globalThis.window = savedWindow;
    globalThis.document = savedDocument;
  }
});
