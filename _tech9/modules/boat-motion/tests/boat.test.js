import test from 'node:test';
import assert from 'node:assert/strict';
import { BoatSimulation } from '../src/BoatSimulation.js';
import { BoatInput } from '../src/BoatInput.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const run = (boat, seconds, controls, fps = 60) => {
  for (let i = 0; i < seconds * fps; i++) boat.step(1 / fps, controls);
  return boat.snapshot();
};

test('fixed steps agree across frame rates, spawn orientations and reverse steering', () => {
  const config = {
    spawn: { x: 17, z: -31, heading: Math.PI / 2 },
    handling: { acceleration: 4 },
  };
  const a = run(new BoatSimulation(config), 5, { throttle: 1, steer: 0.4 }, 30);
  const b = run(
    new BoatSimulation(config),
    5,
    { throttle: 1, steer: 0.4 },
    144,
  );
  for (const key of ['x', 'z', 'heading', 'speed']) near(a[key], b[key]);
  const reverse = run(new BoatSimulation(), 4, { throttle: -1, steer: 1 });
  assert.ok(reverse.z > 0 && reverse.heading < 0 && reverse.speed < 0);
  const stationary = run(new BoatSimulation(), 3, { steer: 1 });
  near(stationary.heading, 0);
});

test('footprints, bounded sweeps, sliding and reset respect the injected navigation', () => {
  const navigable = (x, z, radius) => z >= -5 + radius && x < 50;
  const boat = new BoatSimulation({
    footprint: 2,
    canOccupy: navigable,
    handling: { acceleration: 1000, maxForwardSpeed: 1000 },
  });
  run(boat, 3, { throttle: 1 });
  assert.ok(boat.z >= -3 && boat.z < -2.7);
  assert.equal(boat.collisions, 1);
  const blocked = boat.snapshot();
  assert.throws(() => boat.reset({ x: 0, z: -4, heading: 0 }), /Spawn/);
  assert.deepEqual(boat.snapshot(), blocked);
  run(boat, 1, { throttle: -1 });
  assert.ok(boat.z > blocked.z, 'can back away from shore');
  boat.reset({ x: 10, z: 5, heading: Math.PI / 4 });
  run(boat, 2, { throttle: 1 });
  assert.ok(boat.x > 15 && boat.z >= -3, 'slides along wall');
  boat.reset();
  assert.equal(boat.x, 10);
  assert.equal(boat.speed, 0);
  assert.equal(boat.collisions, 0);
});

test('frame stalls and invalid input are bounded; tuning is validated', () => {
  const a = new BoatSimulation(),
    b = new BoatSimulation();
  a.step(90, { throttle: 100 });
  b.step(0.25, { throttle: 1 });
  assert.deepEqual(a.snapshot(), b.snapshot());
  const snapshot = a.snapshot();
  for (const dt of [NaN, Infinity, -1, 0]) a.step(dt);
  assert.deepEqual(a.snapshot(), snapshot);
  assert.throws(
    () => new BoatSimulation({ handling: { turbo: 4 } }),
    /handling/,
  );
  assert.throws(
    () => new BoatSimulation({ handling: { turning: 1e100 } }),
    /handling/,
  );
  assert.throws(() => new BoatSimulation({ footprint: 0 }), /Footprint/);
  assert.throws(() => new BoatSimulation({ maxFrameTime: 5 }), /maxFrameTime/);
});

function inputFixture(options = {}) {
  const window = new EventTarget(),
    document = new EventTarget();
  document.activeElement = null;
  document.hidden = false;
  const pauses = [],
    actions = [];
  const adapter = new BoatInput({
    window,
    document,
    enabled: true,
    onPause: (reason) => pauses.push(reason),
    onAction: (action) => actions.push(action),
    actions: { KeyC: 'camera' },
    ...options,
  });
  const key = (code, type = 'keydown', repeat = false) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { code, repeat });
    window.dispatchEvent(event);
    return event;
  };
  return { window, document, adapter, pauses, actions, key };
}

test('input clears across pause, menu focus and repeats without stealing UI keys', () => {
  const f = inputFixture();
  f.key('KeyW');
  f.key('KeyD');
  assert.deepEqual(f.adapter.sample(), { throttle: 1, steer: 1 });
  f.key('KeyP');
  assert.deepEqual(f.pauses, ['keyboard']);
  assert.equal(f.adapter.sample().throttle, 0);
  f.adapter.setEnabled(true);
  f.key('KeyW', 'keydown', true);
  assert.equal(f.adapter.sample().throttle, 0);
  f.key('KeyW', 'keyup');
  f.key('KeyW');
  assert.equal(f.adapter.sample().throttle, 1);
  for (const tagName of ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON']) {
    f.document.activeElement = { tagName };
    assert.equal(f.key('ArrowUp').defaultPrevented, false);
    assert.equal(f.adapter.sample().throttle, 0);
  }
  f.document.activeElement = null;
  f.key('KeyW');
  f.key('KeyC');
  f.key('KeyC', 'keydown', true);
  assert.deepEqual(f.actions, ['camera']);
  assert.equal(f.adapter.sample().throttle, 0);
  f.adapter.dispose();
  f.adapter.setEnabled(true);
  f.key('KeyW');
  f.window.dispatchEvent(new Event('blur'));
  assert.equal(f.adapter.sample().throttle, 0);
  assert.deepEqual(f.pauses, ['keyboard']);
});

test('blur, visibility and owned pointer-lock loss pause only once', () => {
  const canvas = {},
    f = inputFixture({ canvas });
  f.document.pointerLockElement = {};
  f.document.dispatchEvent(new Event('pointerlockchange'));
  assert.equal(f.pauses.length, 0);
  f.document.pointerLockElement = canvas;
  f.document.dispatchEvent(new Event('pointerlockchange'));
  f.document.pointerLockElement = null;
  f.document.dispatchEvent(new Event('pointerlockchange'));
  assert.deepEqual(f.pauses, ['pointer-lock']);
  f.adapter.setEnabled(true);
  f.key('KeyW');
  f.window.dispatchEvent(new Event('blur'));
  f.window.dispatchEvent(new Event('blur'));
  f.adapter.setEnabled(true);
  f.document.hidden = true;
  f.document.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(f.pauses, ['pointer-lock', 'blur', 'hidden']);
  assert.equal(f.adapter.sample().throttle, 0);
  f.adapter.dispose();
});
