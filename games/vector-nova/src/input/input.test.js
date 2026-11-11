import test from 'node:test';
import assert from 'node:assert/strict';
import { createInput } from './index.js';
import { EQUIPMENT_CONTROLS } from '../equipment/controls.js';
import * as T from 'three';
import { createFreestyleController } from '../freestyle/controller.js';

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
    document,
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

test('Freestyle two-hand keys compose attitude independently of driving and never arm equipment', (t) => {
  const { input, key, commands } = harness(t, { freestyle: true });
  for (const code of [
    'KeyW',
    'KeyD',
    'ArrowUp',
    'ArrowLeft',
    'KeyE',
    'ShiftLeft',
  ])
    key('keydown', code);
  let sample = input.sample();
  assert.equal(
    sample.aerialRoll,
    -1,
    'left arrow rolls left in the chase view',
  );
  assert.equal(sample.aerialPitch, 1, 'up arrow pitches the nose forward');
  assert.equal(sample.aerialYaw, 1, 'E spins right');
  assert.equal(sample.throttle, 1);
  assert.equal(sample.steer, 1, 'D steering is independent of left-roll input');
  assert.equal(sample.brake, 0);
  assert.equal(sample.boost, true);
  assert.deepEqual(commands, []);
  for (let i = 1; i <= 4; i++) assert.equal(sample[`equipment${i}`], false);
  for (const code of ['KeyD', 'ArrowUp', 'ArrowLeft', 'KeyE', 'ShiftLeft'])
    key('keyup', code);
  for (const code of ['ArrowDown', 'ArrowRight', 'KeyQ', 'Space'])
    key('keydown', code);
  sample = input.sample();
  assert.equal(sample.aerialRoll, 1);
  assert.equal(sample.aerialPitch, -1, 'down arrow pulls the nose back');
  assert.equal(sample.aerialYaw, -1);
  assert.equal(
    sample.throttle,
    1,
    'settling and reversing rotation do not release held throttle',
  );
  assert.equal(sample.steer, 0, 'a held roll never becomes driving steering');
  assert.equal(sample.airbrake, true);
  input.activateEquipment(0);
  assert.equal(
    input.sample().equipment1,
    false,
    'programmatic activation stays disabled',
  );
  key('keydown', 'Escape');
  assert.deepEqual(commands, ['pause']);
});

test('Freestyle arrows never drive and opposing rotation keys cancel without a modifier', (t) => {
  const { input, key } = harness(t, { freestyle: true });
  for (const code of [
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'KeyQ',
    'KeyE',
  ])
    key('keydown', code);
  let sample = input.sample();
  assert.equal(sample.throttle, 0);
  assert.equal(sample.brake, 0);
  assert.equal(sample.steer, 0);
  assert.equal(sample.aerialPitch, 0);
  assert.equal(sample.aerialRoll, 0);
  assert.equal(sample.aerialYaw, 0);
  for (const code of ['ArrowDown', 'ArrowRight', 'KeyE']) key('keyup', code);
  sample = input.sample();
  assert.equal(sample.aerialPitch, 1);
  assert.equal(sample.aerialRoll, -1);
  assert.equal(sample.aerialYaw, -1);
  assert.equal(sample.throttle, 0);
  assert.equal(sample.brake, 0);
  assert.equal(sample.steer, 0);
});

test('Freestyle removes legacy rotation aliases and restores C camera without changing WASD', (t) => {
  const { input, key, commands } = harness(t, { freestyle: true });
  for (const code of ['ControlLeft', 'KeyW', 'KeyA', 'KeyZ', 'KeyX', 'KeyV'])
    key('keydown', code);
  const sample = input.sample();
  assert.equal(sample.throttle, 1);
  assert.equal(sample.steer, -1);
  assert.equal(sample.aerialPitch, 0);
  assert.equal(sample.aerialRoll, 0);
  assert.equal(sample.aerialYaw, 0);
  key('keydown', 'KeyC');
  assert.deepEqual(commands, ['camera']);
  assert.equal(input.sample().aerialYaw, 0);
});

test('Freestyle rotation clears on blur, hidden documents and suspension; typing never rotates', (t) => {
  const { input, key, window, document } = harness(t, { freestyle: true });
  const rotate = () => {
    for (const code of ['ArrowUp', 'ArrowLeft', 'KeyE']) key('keydown', code);
  };
  const neutral = () => {
    const sample = input.sample();
    for (const axis of ['aerialPitch', 'aerialRoll', 'aerialYaw'])
      assert.equal(sample[axis], 0);
  };
  rotate();
  window.dispatchEvent(new Event('blur'));
  neutral();
  rotate();
  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  neutral();
  document.hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  neutral();
  rotate();
  input.setEnabled(false);
  neutral();
  rotate();
  input.setEnabled(true);
  neutral();
  for (const code of ['ArrowUp', 'ArrowLeft', 'KeyE'])
    key('keydown', code, { editing: true });
  neutral();
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

test('Freestyle right stick pitches and rolls while X/Y spin independently across all presets', (t) => {
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
    let sample = input.sample();
    assert.ok(
      sample.aerialPitch > 0.8,
      'right stick up pitches the nose forward',
    );
    assert.ok(sample.aerialRoll > 0.5, 'right stick right rolls right');
    assert.equal(sample.aerialYaw, -1, 'X spins left');
    assert.ok(sample.steer > 0.2, 'left stick still steers');
    assert.equal(sample.throttle, 0, preset);
    assert.equal(sample.brake, 0, preset);
    assert.equal(sample.boost, false, preset);
    assert.equal(sample.airbrake, false, preset);
    for (let i = 1; i <= 4; i++) assert.equal(sample[`equipment${i}`], false);
    pad.buttons[3] = { value: 1, pressed: true };
    assert.equal(
      input.sample().aerialYaw,
      0,
      'opposing flat-spin buttons cancel',
    );
    pad.buttons[2] = { value: 0, pressed: false };
    pad.axes = [0.4, -0.8, -0.6, 0.9];
    sample = input.sample();
    assert.equal(sample.aerialYaw, 1, 'Y spins right');
    assert.ok(sample.aerialRoll < -0.5, 'right stick left rolls left');
    assert.ok(
      sample.aerialPitch < -0.8,
      'right stick down pulls the nose back',
    );
    pad.buttons[3] = { value: 0, pressed: false };
    input.sample();
  }
  input.setEnabled(false);
  assert.equal(input.sample().aerialPitch, 0);
  assert.equal(input.sample().aerialYaw, 0);
  assert.equal(input.sample().aerialRoll, 0);
});

test('Freestyle pulling down raises the actual nose for a backflip with keyboard or stick', (t) => {
  const { input, key, setPad } = harness(t, { freestyle: true });
  const pad = {
    id: 'freestyle-pitch-direction',
    index: 0,
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })),
  };
  setPad(pad);
  input.sample();
  for (const [code, stickY, backflip] of [
    ['ArrowDown', 0, true],
    ['ArrowUp', 0, false],
    [null, 0.9, true],
    [null, -0.9, false],
  ]) {
    if (code) key('keydown', code);
    pad.axes[3] = stickY;
    const controller = createFreestyleController({ jumps: [] });
    controller.launch('pitch-direction');
    for (let tick = 0; tick < 30; tick++)
      controller.step(input.sample(), 1 / 120);
    const orientation = new T.Quaternion();
    controller.attitude(orientation);
    const nose = new T.Vector3(0, 0, 1).applyQuaternion(orientation);
    assert.ok(
      backflip ? nose.y > 0.05 : nose.y < -0.05,
      `${code ?? `stick Y ${stickY}`}: ${backflip ? 'backflip raises' : 'frontflip lowers'} the actual forward axis`,
    );
    if (code) key('keyup', code);
    pad.axes[3] = 0;
  }
});

test('Freestyle left and right bank the actual hull toward that side of the rear chase view', (t) => {
  const { input, key, setPad } = harness(t, { freestyle: true });
  const pad = {
    id: 'freestyle-roll-direction',
    index: 0,
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })),
  };
  setPad(pad);
  input.sample();
  const chase = new T.PerspectiveCamera();
  chase.position.set(0, 6, -18);
  chase.lookAt(0, 0, 12);
  const screenRight = new T.Vector3(1, 0, 0).applyQuaternion(chase.quaternion);
  const screenUp = new T.Vector3(0, 1, 0).applyQuaternion(chase.quaternion);
  for (const [code, stickX, left] of [
    ['ArrowLeft', 0, true],
    ['ArrowRight', 0, false],
    [null, -0.9, true],
    [null, 0.9, false],
  ]) {
    if (code) key('keydown', code);
    pad.axes[2] = stickX;
    const controller = createFreestyleController({ jumps: [] });
    controller.launch('roll-direction');
    for (let tick = 0; tick < 30; tick++)
      controller.step(input.sample(), 1 / 120);
    const orientation = new T.Quaternion();
    controller.attitude(orientation);
    const hullUp = new T.Vector3(0, 1, 0).applyQuaternion(orientation);
    const wing = screenRight
      .clone()
      .multiplyScalar(left ? -1 : 1)
      .applyQuaternion(orientation);
    assert.ok(
      left ? hullUp.dot(screenRight) < -0.05 : hullUp.dot(screenRight) > 0.05,
      `${code ?? `stick X ${stickX}`}: the hull visibly banks ${left ? 'left' : 'right'}`,
    );
    assert.ok(
      wing.dot(screenUp) < -0.05,
      'the commanded side wing drops in the chase view',
    );
    if (code) key('keyup', code);
    pad.axes[2] = 0;
  }
});

test('ordinary races retain WASD and arrow driving while controller right-stick movement stays unused', (t) => {
  const { input, key, setPad } = harness(t);
  for (const keys of [
    ['KeyW', 'KeyD'],
    ['ArrowUp', 'ArrowRight'],
  ]) {
    for (const code of keys) key('keydown', code);
    assert.equal(input.sample().throttle, 1);
    assert.equal(input.sample().steer, 1);
    for (const code of keys) key('keyup', code);
  }
  for (const keys of [
    ['KeyS', 'KeyA'],
    ['ArrowDown', 'ArrowLeft'],
  ]) {
    for (const code of keys) key('keydown', code);
    assert.equal(input.sample().brake, 1);
    assert.equal(input.sample().steer, -1);
    for (const code of keys) key('keyup', code);
  }
  const pad = {
    id: 'ordinary-input',
    index: 0,
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })),
  };
  setPad(pad);
  input.sample();
  pad.axes = [0.4, 1, -1, 1];
  pad.buttons[2] = { value: 1, pressed: true };
  const sample = input.sample();
  assert.ok(sample.steer > 0.2);
  assert.equal(sample.throttle, 0);
  assert.equal(sample.brake, 0);
  assert.equal(
    sample.equipment1,
    true,
    'X still fires the first equipped item',
  );
  for (const axis of ['aerialPitch', 'aerialRoll', 'aerialYaw'])
    assert.equal(axis in sample, false);
});
