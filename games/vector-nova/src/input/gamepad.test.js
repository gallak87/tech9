import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTROLLER_DEFAULTS,
  controllerSettings,
  controllerLayout,
  steeringAxis,
  sampleGamepad,
  createGamepadReader,
  readGamepad,
} from './gamepad.js';
import { menuIntent } from './menu-gamepad.js';
const device = () => ({
  id: 'test pad',
  index: 0,
  connected: true,
  mapping: 'standard',
  axes: [0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
});

test('each preset maps independent analog throttle/brake and boost/airbrake buttons', () => {
  for (const [controllerPreset, throttle, brake, boost, airbrake] of [
    ['classic', 7, 6, 0, 1],
    ['shoulders', 7, 6, 5, 4],
    ['arcade', 0, 6, 7, 1],
  ]) {
    const settings = { controllerPreset };
    for (const [action, index] of Object.entries({
      throttle,
      brake,
      boost,
      airbrake,
    })) {
      const pad = device();
      pad.buttons[index] = {
        value: action === 'throttle' || action === 'brake' ? 0.7 : 1,
        pressed: true,
      };
      assert.deepEqual(
        sampleGamepad(pad, settings),
        {
          throttle: 0,
          brake: 0,
          boost: false,
          airbrake: false,
          steer: 0,
          [action]: action === 'throttle' || action === 'brake' ? 0.7 : true,
        },
        `${controllerPreset} ${action}`,
      );
    }
    const pad = device();
    pad.buttons[2] = { value: 1, pressed: true };
    assert.deepEqual(
      sampleGamepad(pad, settings),
      { throttle: 0, brake: 0, boost: false, airbrake: false, steer: 0 },
      'camera never doubles as driving/recovery',
    );
    assert.equal(menuIntent(pad).camera, true);
    assert.equal(
      controllerLayout(settings).throttle,
      controllerPreset === 'arcade' ? 'A' : 'RT',
    );
  }
});
test('steering dead zone is symmetric, continuous outside its boundary and retains full lock', () => {
  for (const deadZone of [0, 0.15, 0.4]) {
    for (const sign of [-1, 1]) {
      assert.equal(steeringAxis(sign * deadZone, deadZone), 0);
      assert.equal(steeringAxis(sign, deadZone), sign);
      assert.ok(
        Math.abs(
          steeringAxis(sign * (deadZone + (1 - deadZone) / 2), deadZone) -
            sign * 0.5,
        ) < 1e-12,
      );
    }
  }
  assert.equal(steeringAxis(NaN), 0);
  assert.equal(steeringAxis(5), 1);
  assert.deepEqual(
    controllerSettings({
      controllerPreset: '__proto__',
      steeringDeadZone: '0',
    }),
    CONTROLLER_DEFAULTS,
  );
  assert.equal(
    controllerSettings({ steeringDeadZone: -1 }).steeringDeadZone,
    0,
  );
  assert.equal(
    controllerSettings({ steeringDeadZone: 4 }).steeringDeadZone,
    0.4,
  );
  const pad = device();
  pad.axes[0] = 0.5;
  assert.equal(
    menuIntent(pad).x,
    0,
    'driving adjustment does not change menu threshold',
  );
  pad.axes[0] = 1;
  assert.equal(
    menuIntent(pad, { stickNavigation: false }).x,
    0,
    'calibration never navigates with the test stick',
  );
  pad.buttons[15].pressed = true;
  assert.equal(
    menuIntent(pad, { stickNavigation: false }).x,
    1,
    'D-pad still edits during calibration',
  );
  assert.ok(sampleGamepad(pad, { steeringDeadZone: 0 }).steer > 0);
});
test('held buttons require release across resume, preset changes and reconnect', () => {
  let pad = device();
  let settings = { controllerPreset: 'classic' };
  const reader = createGamepadReader(
    () => settings,
    () => pad,
  );
  reader.sample();
  pad.buttons[7] = { value: 1, pressed: true };
  assert.equal(reader.sample().throttle, 1);
  reader.clear();
  assert.equal(reader.sample().throttle, 0);
  settings = { controllerPreset: 'arcade' };
  assert.equal(reader.sample().boost, false);
  pad.buttons[7] = { value: 0, pressed: false };
  reader.sample();
  pad.buttons[7] = { value: 1, pressed: true };
  assert.equal(reader.sample().boost, true);
  pad = null;
  assert.equal(reader.sample().present, false);
  pad = device();
  pad.buttons[0] = { value: 1, pressed: true };
  assert.equal(reader.sample().throttle, 0);
  pad.buttons[0] = { value: 0, pressed: false };
  reader.sample();
  pad.buttons[0] = { value: 1, pressed: true };
  assert.equal(reader.sample().throttle, 1);
});
test('unsupported and missing gamepads are ignored consistently', () => {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'navigator',
  );
  try {
    const unsupported = { ...device(), mapping: '' };
    const supported = device();
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { getGamepads: () => [unsupported, null, supported] },
    });
    assert.equal(readGamepad(), supported);
    globalThis.navigator.getGamepads = () => {
      throw new Error('Unavailable');
    };
    assert.equal(readGamepad(), null);
  } finally {
    if (navigatorDescriptor)
      Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else delete globalThis.navigator;
  }
});

test('a fresh-session clear observes the pad before throttle is held through countdown', () => {
  const pad = device();
  const reader = createGamepadReader(
    () => ({}),
    () => pad,
  );
  reader.clear();
  pad.buttons[7] = { value: 1, pressed: true };
  assert.equal(reader.sample().throttle, 1);
});
