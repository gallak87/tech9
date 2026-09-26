import test from 'node:test';
import assert from 'node:assert/strict';
import { VehicleInput } from '../src/VehicleInput.js';

function fixture(options = {}) {
  const target = new EventTarget();
  const document = new EventTarget();
  document.activeElement = null;
  document.hidden = false;
  target.document = document;
  const actions = [],
    pauses = [];
  const input = new VehicleInput({
    target,
    onAction: (action) => actions.push(action),
    onPause: (reason) => pauses.push(reason),
    ...options,
  });
  const key = (type, code, repeat = false) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { code, repeat });
    target.dispatchEvent(event);
    return event;
  };
  return { target, document, input, actions, pauses, key };
}

test('keyboard maps aliases without double throttle and suppresses repeated actions', () => {
  const { input, actions, key } = fixture();
  input.enabled = true;
  key('keydown', 'KeyW');
  key('keydown', 'ArrowUp');
  key('keydown', 'KeyD');
  assert.deepEqual(input.sample(), { throttle: 1, steer: 1, brake: 0 });
  key('keydown', 'KeyC');
  key('keydown', 'KeyC', true);
  key('keydown', 'Space');
  assert.equal(input.sample().brake, 1);
  assert.deepEqual(actions, ['camera']);
  input.dispose();
});

test('focus loss clears held input and requires a fresh press after resume', () => {
  const { input, target, pauses, key } = fixture();
  input.setEnabled(true);
  key('keydown', 'KeyW');
  target.dispatchEvent(new Event('blur'));
  assert.equal(input.enabled, false);
  assert.deepEqual(pauses, ['blur']);
  input.enabled = true;
  key('keydown', 'KeyW', true);
  assert.equal(input.sample().throttle, 0);
  key('keydown', 'KeyW');
  assert.equal(input.sample().throttle, 1);
  input.clear();
  key('keydown', 'KeyW', true);
  assert.equal(input.sample().throttle, 0);
  input.dispose();
});

test('menu focus, hidden document and pause keys clear and pause once', () => {
  const { input, document, pauses, key } = fixture();
  input.enabled = true;
  key('keydown', 'KeyW');
  document.activeElement = { tagName: 'BUTTON' };
  assert.equal(input.sample().throttle, 0);
  assert.deepEqual(pauses, ['menu']);
  document.activeElement = null;
  input.enabled = true;
  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(pauses, ['menu', 'hidden']);
  input.enabled = true;
  key('keydown', 'Escape');
  key('keydown', 'KeyP');
  assert.deepEqual(pauses, ['menu', 'hidden', 'keyboard']);
  input.dispose();
});

test('disposal releases callbacks and makes later presses inert', () => {
  const { input, target, pauses, actions, key } = fixture();
  input.enabled = true;
  input.dispose();
  input.dispose();
  input.enabled = true;
  key('keydown', 'KeyW');
  key('keydown', 'KeyC');
  target.dispatchEvent(new Event('blur'));
  assert.deepEqual(input.sample(), { throttle: 0, steer: 0, brake: 0 });
  assert.deepEqual(actions, []);
  assert.deepEqual(pauses, []);
});

test('recovery and restart clear held movement before their action callback', () => {
  const { input, actions, key } = fixture();
  input.enabled = true;
  key('keydown', 'KeyW');
  key('keydown', 'KeyR');
  assert.equal(input.sample().throttle, 0);
  key('keydown', 'KeyW', true);
  assert.equal(input.sample().throttle, 0);
  key('keydown', 'KeyW');
  key('keydown', 'KeyT');
  assert.equal(input.sample().throttle, 0);
  assert.deepEqual(actions, ['recover', 'restart']);
  input.dispose();
});

test('custom bindings and actions are copied and preserve key ownership', () => {
  const bindings = {
    forward: ['KeyI'],
    reverse: ['KeyK'],
    left: ['KeyJ'],
    right: ['KeyL'],
    brake: ['KeyB'],
  };
  const actions = { KeyV: 'view', KeyY: 'teleport' };
  const {
    input,
    key,
    actions: received,
    pauses,
  } = fixture({
    bindings,
    actions,
    clearActions: ['teleport'],
    pauseKeys: ['Escape'],
  });
  bindings.forward.push('KeyQ');
  actions.KeyQ = 'teleport';
  input.enabled = true;
  assert.equal(key('keydown', 'KeyQ').defaultPrevented, false);
  assert.equal(key('keydown', 'KeyW').defaultPrevented, false);
  assert.equal(input.sample().throttle, 0);
  assert.equal(key('keydown', 'KeyI').defaultPrevented, true);
  key('keydown', 'KeyV');
  assert.equal(input.sample().throttle, 1);
  key('keydown', 'KeyB');
  assert.equal(input.sample().brake, 1);
  key('keydown', 'KeyY');
  assert.deepEqual(input.sample(), { throttle: 0, steer: 0, brake: 0 });
  assert.deepEqual(received, ['view', 'teleport']);
  key('keydown', 'Escape');
  assert.deepEqual(pauses, ['keyboard']);
  assert.ok(Object.isFrozen(input.bindings.forward));
  input.dispose();
});

test('focusin pauses immediately and leaves menu input native', () => {
  const { input, key, document, pauses } = fixture();
  input.enabled = true;
  key('keydown', 'KeyW');
  const event = new Event('focusin');
  Object.defineProperty(event, 'target', { value: { tagName: 'INPUT' } });
  document.dispatchEvent(event);
  assert.equal(input.enabled, false);
  assert.deepEqual(pauses, ['menu']);
  assert.equal(key('keydown', 'Space').defaultPrevented, false);
  assert.equal(input.sample().throttle, 0);
  input.dispose();
});

test('conflicting or malformed binding data fails before registering listeners', () => {
  for (const options of [
    { bindings: { forward: ['KeyC'] } },
    { pauseKeys: ['Space'] },
    { bindings: { brake: ['Space', 'Space'] } },
    { bindings: { forward: 'KeyW' } },
    { actions: { KeyV: '' } },
    { actions: null },
    { onAction: 1 },
    { bindings: { accelerate: ['KeyI'] } },
  ]) {
    const target = new EventTarget();
    let additions = 0;
    const add = target.addEventListener.bind(target);
    target.addEventListener = (...args) => {
      additions++;
      add(...args);
    };
    assert.throws(() => new VehicleInput({ target, ...options }), TypeError);
    assert.equal(additions, 0);
  }
});

test('unmapped inherited object names do not fire actions', () => {
  const { input, key, actions } = fixture();
  input.enabled = true;
  assert.equal(key('keydown', 'constructor').defaultPrevented, false);
  assert.deepEqual(actions, []);
  input.dispose();
});

test('disposal removes all registered listeners on both owners', () => {
  const target = new EventTarget(),
    document = new EventTarget();
  target.document = document;
  const counts = [];
  for (const owner of [target, document]) {
    const count = { added: 0, removed: 0 };
    counts.push(count);
    const add = owner.addEventListener.bind(owner),
      remove = owner.removeEventListener.bind(owner);
    owner.addEventListener = (...args) => {
      count.added++;
      add(...args);
    };
    owner.removeEventListener = (...args) => {
      count.removed++;
      remove(...args);
    };
  }
  const input = new VehicleInput({ target });
  input.dispose();
  input.dispose();
  for (const count of counts) assert.equal(count.added, count.removed);
});
