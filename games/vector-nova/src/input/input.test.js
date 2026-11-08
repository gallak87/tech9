import test from 'node:test';
import assert from 'node:assert/strict';
import { createInput } from './index.js';
import { EQUIPMENT_CONTROLS } from '../equipment/controls.js';

function harness(t, options = {}, settings = {}) {
  let pad = null;
  const commands = [];
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
    navigator: { getGamepads: () => (pad ? [pad] : []) },
  }))
    Object.defineProperty(globalThis, key, { configurable: true, value });
  const input = createInput(
    (command) => commands.push(command),
    () => {},
    () => settings,
    options,
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
  return {
    input,
    window,
    key,
    commands,
    setPad: (value) => {
      pad = value;
    },
  };
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

test('Freestyle paired keys rotate directly, compose and never arm equipment or steal boost', (t) => {
  const { input, key, commands } = harness(t, { freestyle: true });
  for (const code of ['KeyQ', 'KeyZ', 'KeyC', 'ShiftLeft'])
    key('keydown', code);
  let sample = input.sample();
  assert.equal(sample.aerialRoll, 1);
  assert.equal(sample.aerialPitch, -1);
  assert.equal(sample.aerialYaw, 1);
  assert.equal(sample.boost, true);
  assert.deepEqual(commands, []);
  for (let i = 1; i <= 4; i++) assert.equal(sample[`equipment${i}`], false);
  for (const code of ['KeyQ', 'KeyZ', 'KeyC', 'ShiftLeft']) key('keyup', code);
  input.activateEquipment(0);
  sample = input.sample();
  assert.equal(sample.aerialRoll, 0, 'rotation stops when its key is released');
  assert.equal(
    sample.equipment1,
    false,
    'touch/programmatic activation also stays disabled',
  );
  for (const code of ['KeyE', 'KeyX', 'KeyV']) key('keydown', code);
  sample = input.sample();
  assert.equal(sample.aerialRoll, -1);
  assert.equal(sample.aerialPitch, 1);
  assert.equal(sample.aerialYaw, -1);
  key('keydown', 'Space');
  assert.equal(input.sample().airbrake, true);
  key('keydown', 'Escape');
  assert.deepEqual(commands, ['pause']);
});

test('Freestyle keeps optional Ctrl directions while ordinary races retain C camera and equipment', (t) => {
  const { input, key } = harness(t, { freestyle: true });
  for (const code of ['ControlLeft', 'KeyW', 'KeyA']) key('keydown', code);
  assert.equal(input.sample().aerialPitch, -1);
  assert.equal(input.sample().aerialRoll, 1);
  key('keydown', 'KeyQ');
  assert.equal(input.sample().aerialYaw, 1);
  input.setEnabled(false);
  assert.equal(input.sample().aerialPitch, 0);
  assert.equal(input.sample().aerialRoll, 0);
  assert.equal(input.sample().aerialYaw, 0);
});

test('ordinary C camera remains separate from equipment and Freestyle axes are absent', (t) => {
  const { input, key, commands } = harness(t);
  key('keydown', 'KeyC');
  key('keydown', 'KeyQ');
  assert.deepEqual(commands, ['camera']);
  assert.equal(input.sample().equipment1, true);
  assert.equal('aerialRoll' in input.sample(), false);
});

test('controller camera commands never latch Freestyle yaw and respect suspension', (t) => {
  const { input, window, commands } = harness(t, { freestyle: true });
  window.dispatchEvent(new Event('vn-camera-toggle'));
  assert.deepEqual(commands, ['camera']);
  assert.equal(input.sample().aerialYaw, 0);
  input.setEnabled(false);
  window.dispatchEvent(new Event('vn-camera-toggle'));
  assert.deepEqual(commands, ['camera']);
  input.setEnabled(true);
  window.dispatchEvent(new Event('vn-camera-toggle'));
  assert.deepEqual(commands, ['camera', 'camera']);
  assert.equal(input.sample().aerialYaw, 0);
});

test('Freestyle right stick and X/Y rotate independently of driving across all presets', (t) => {
  const settings = { controllerPreset: 'classic', steeringDeadZone: 0.15 };
  const { input, setPad } = harness(t, { freestyle: true }, settings);
  const pad = {
    id: 'freestyle-input',
    index: 0,
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })),
  };
  setPad(pad);
  input.sample();
  for (const preset of ['classic', 'shoulders', 'arcade']) {
    settings.controllerPreset = preset;
    pad.axes = [0.4, 0.8, 0.6, -0.9];
    pad.buttons[2] = { value: 1, pressed: true };
    const sample = input.sample();
    assert.ok(sample.aerialPitch < -0.8, 'right vertical axis supplies pitch');
    assert.ok(sample.aerialYaw > 0.5, 'right stick right turns the nose right');
    assert.equal(sample.aerialRoll, 1);
    assert.ok(sample.steer > 0.2, 'left stick still steers');
    assert.equal(sample.throttle, 0, preset);
    assert.equal(sample.boost, false, preset);
    assert.equal(sample.airbrake, false, preset);
    for (let i = 1; i <= 4; i++) assert.equal(sample[`equipment${i}`], false);
    pad.buttons[3] = { value: 1, pressed: true };
    assert.equal(input.sample().aerialRoll, 0, 'opposing roll inputs cancel');
    pad.buttons[2] = pad.buttons[3] = { value: 0, pressed: false };
    input.sample();
  }
  input.setEnabled(false);
  assert.equal(input.sample().aerialPitch, 0);
  assert.equal(input.sample().aerialYaw, 0);
});
