import test from 'node:test';
import assert from 'node:assert/strict';
import { createInput } from './index.js';
import { EQUIPMENT_CONTROLS } from '../equipment/controls.js';

function harness(t) {
  const originals = new Map(
    ['window', 'document', 'navigator'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), { hidden: false });
  for (const [key, value] of Object.entries({
    window,
    document,
    navigator: { getGamepads: () => [] },
  }))
    Object.defineProperty(globalThis, key, { configurable: true, value });
  const input = createInput(
    () => {},
    () => {},
    () => ({}),
  );
  t.after(() => {
    input.dispose();
    for (const [key, descriptor] of originals)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
  });
  function key(type, code, { repeat = false, editing = false } = {}) {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, {
      code: { value: code },
      repeat: { value: repeat },
      target: { value: { closest: () => editing, matches: () => false } },
    });
    window.dispatchEvent(event);
  }
  return { input, window, key };
}

test('brief keyboard equipment taps survive keyup and render sampling until a physics tick consumes them', (t) => {
  const { input, key } = harness(t);
  for (const [slot, { key: code }] of EQUIPMENT_CONTROLS.entries()) {
    key('keydown', code);
    key('keyup', code);
    assert.equal(input.sample()[`equipment${slot + 1}`], true);
    assert.equal(
      input.sample()[`equipment${slot + 1}`],
      true,
      'render observation does not consume a tap',
    );
    input.consumeEquipment();
    assert.equal(input.sample()[`equipment${slot + 1}`], false);
  }
});

test('equipment taps clear on suspension and blur, and typing never arms an item', (t) => {
  const { input, window, key } = harness(t);
  key('keydown', 'KeyQ');
  key('keyup', 'KeyQ');
  input.setEnabled(false);
  assert.equal(input.sample().equipment1, false);
  key('keydown', 'KeyQ');
  key('keyup', 'KeyQ');
  input.setEnabled(true);
  assert.equal(input.sample().equipment1, false);
  key('keydown', 'KeyQ', { editing: true });
  key('keyup', 'KeyQ');
  assert.equal(input.sample().equipment1, false);
  key('keydown', 'KeyQ');
  key('keyup', 'KeyQ');
  window.dispatchEvent(new Event('blur'));
  assert.equal(input.sample().equipment1, false);
});
