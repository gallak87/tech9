import test from 'node:test';
import assert from 'node:assert/strict';
import { bindMenuGamepad, menuIntent } from './menu-gamepad.js';
import { sampleGamepad } from './gamepad.js';

function harness(t, specifications = [{}]) {
  const originals = new Map(
    [
      'document',
      'navigator',
      'KeyboardEvent',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  let callback;
  const pad = {
    id: 'Menu regression controller',
    index: 0,
    connected: true,
    mapping: 'standard',
    axes: [0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
  let device = pad;
  const document = {
    hidden: false,
    activeElement: null,
    querySelector: (selector) => (selector === '#front-shell' ? root : null),
  };
  const controls = specifications.map(
    ({ skip = false, input = false } = {}) => ({
      disabled: false,
      tabIndex: 0,
      type: input ? 'text' : 'button',
      clicks: 0,
      getClientRects: () => [{}],
      closest: () => null,
      hasAttribute: (name) => skip && name === 'data-controller-skip',
      matches: (selector) => selector === 'button' && !input,
      dispatchEvent: () => true,
      focus() {
        document.activeElement = this;
      },
      click() {
        this.clicks++;
      },
    }),
  );
  const root = {
    id: 'front-shell',
    shown: true,
    getClientRects() {
      return this.shown ? [{}] : [];
    },
    closest: () => null,
    querySelectorAll: () => controls,
    contains: (target) => controls.includes(target),
    dispatchEvent: () => true,
  };
  document.body = root;
  document.activeElement = controls[0];
  for (const [key, value] of Object.entries({
    document,
    navigator: { getGamepads: () => (device ? [device] : []) },
    KeyboardEvent: class extends Event {
      constructor(type, options) {
        super(type, options);
        this.key = options.key;
        this.code = options.code;
      }
    },
    requestAnimationFrame: (next) => {
      callback = next;
      return 1;
    },
    cancelAnimationFrame: () => {
      callback = undefined;
    },
  }))
    Object.defineProperty(globalThis, key, { configurable: true, value });
  const life = new AbortController();
  t.after(() => {
    life.abort();
    for (const [key, descriptor] of originals)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
  });
  return {
    pad,
    root,
    controls,
    document,
    life,
    frame(now) {
      callback(now);
    },
    press(index, pressed) {
      pad.buttons[index] = { pressed, value: Number(pressed) };
    },
    connect(value) {
      device = value ? pad : null;
    },
  };
}

test('Y secondary actions are menu-only edges and require release on reconnect', (t) => {
  const h = harness(t);
  let calls = 0;
  h.press(3, true);
  bindMenuGamepad(h.life.signal, {
    onSecondaryAction(root) {
      assert.equal(root, h.root);
      calls++;
    },
  });
  h.frame(0);
  assert.equal(calls, 0, 'a held connecting Y never activates an action');
  h.press(3, false);
  h.frame(20);
  h.press(3, true);
  h.frame(40);
  h.frame(60);
  assert.equal(calls, 1, 'holding Y does not repeat');
  h.root.shown = false;
  h.press(3, false);
  h.frame(80);
  h.press(3, true);
  h.frame(100);
  assert.equal(calls, 1, 'driving has no menu secondary action');
  assert.equal(menuIntent(h.pad).secondary, true);
  assert.equal(
    sampleGamepad(h.pad).equipment2,
    true,
    'Y keeps its independent driving item',
  );
  h.root.shown = true;
  h.connect(false);
  h.frame(120);
  h.connect(true);
  h.frame(140);
  assert.equal(calls, 1, 'reconnecting with Y held requires release');
  h.press(3, false);
  h.frame(160);
  h.press(3, true);
  h.frame(180);
  assert.equal(calls, 2);
});

test('controller-only skip leaves native Tab eligibility intact and avoids an extra icon stop', (t) => {
  const h = harness(t, [{}, { skip: true }, {}]);
  bindMenuGamepad(h.life.signal);
  h.frame(0);
  h.press(13, true);
  h.frame(20);
  assert.equal(h.document.activeElement, h.controls[2]);
  assert.equal(
    h.controls[1].tabIndex,
    0,
    'the pencil remains keyboard tabbable',
  );
  assert.equal(h.controls[1].disabled, false);
});

test('text editing controls retain D-pad and A access to save and cancel', (t) => {
  const h = harness(t, [{ input: true }, {}, {}]);
  bindMenuGamepad(h.life.signal);
  h.frame(0);
  h.press(15, true);
  h.frame(20);
  assert.equal(h.document.activeElement, h.controls[1]);
  h.press(15, false);
  h.press(0, true);
  h.frame(40);
  assert.equal(h.controls[1].clicks, 1);
  h.press(0, false);
  h.press(15, true);
  h.frame(60);
  assert.equal(h.document.activeElement, h.controls[2]);
  h.press(15, false);
  h.press(0, true);
  h.frame(80);
  assert.equal(h.controls[2].clicks, 1);
});

test('controller Back reaches a focused editor before its page and never a covered control', (t) => {
  const h = harness(t, [{ input: true }]);
  let editorBack = 0;
  let pageBack = 0;
  h.controls[0].dispatchEvent = (event) => {
    if (event.code === 'Escape') editorBack++;
    return false;
  };
  h.root.dispatchEvent = (event) => {
    if (event.code === 'Escape') pageBack++;
    return false;
  };
  bindMenuGamepad(h.life.signal);
  h.frame(0);
  h.press(1, true);
  h.frame(20);
  assert.equal(editorBack, 1);
  assert.equal(pageBack, 0);
  h.press(1, false);
  h.frame(40);
  h.document.activeElement = {
    ...h.controls[0],
    dispatchEvent() {
      throw new Error('covered control received Back');
    },
  };
  h.press(1, true);
  h.frame(60);
  assert.equal(pageBack, 1);
});
