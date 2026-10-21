import test from 'node:test';
import assert from 'node:assert/strict';
import { VehicleInput } from '../src/driving/VehicleInput.js';

function fixture() {
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
