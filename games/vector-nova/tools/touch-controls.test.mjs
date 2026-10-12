import test from 'node:test';
import assert from 'node:assert/strict';
import { createTouchControls } from '../src/input/touch.js';

const neutral = {
  throttle: 0,
  brake: 0,
  steer: 0,
  boost: false,
  airbrake: false,
};

class Pad extends EventTarget {
  constructor(kind) {
    super();
    this.dataset = { touchControl: kind };
    this.properties = new Map();
    this.style = {
      setProperty: (key, value) => this.properties.set(key, value),
      removeProperty: (key) => this.properties.delete(key),
    };
    this.captured = new Set();
  }
  getBoundingClientRect() {
    return { left: 10, top: 20, width: 160, height: 160 };
  }
  setPointerCapture(id) {
    this.captured.add(id);
  }
  hasPointerCapture(id) {
    return this.captured.has(id);
  }
  releasePointerCapture(id) {
    this.captured.delete(id);
    this.pointer('lostpointercapture', id);
  }
  pointer(type, pointerId, x = 0.5, y = 0.5) {
    this.dispatchEvent(
      Object.assign(new Event(type, { cancelable: true }), {
        pointerId,
        button: 0,
        clientX: 10 + x * 160,
        clientY: 20 + y * 160,
      }),
    );
  }
}

function fixture(t) {
  const abort = new AbortController();
  const steer = new Pad('steer');
  const power = new Pad('power');
  let enabled = true;
  const controls = createTouchControls(abort.signal, () => enabled);
  controls.bind({ querySelectorAll: () => [steer, power] });
  t.after(() => {
    controls.clear();
    abort.abort();
  });
  return {
    controls,
    steer,
    power,
    disable: () => {
      enabled = false;
      controls.clear();
    },
  };
}

test('two thumbs can steer and boost with throttle; releasing one keeps the other active', (t) => {
  const { controls, steer, power } = fixture(t);
  steer.pointer('pointerdown', 11, 0.85, 0.42);
  power.pointer('pointerdown', 22, 0.5, 0.125);
  const input = controls.sample();
  assert.ok(input.steer > 0.9);
  assert.equal(input.throttle, 1);
  assert.equal(input.boost, true);
  power.pointer('pointerup', 22);
  assert.deepEqual(controls.sample(), { ...neutral, steer: input.steer });
  steer.pointer('pointerup', 11);
  assert.deepEqual(controls.sample(), neutral);
});

test('one continuous power drag selects go, boost, coast and brake without conflicting pedals', (t) => {
  const { controls, power } = fixture(t);
  power.pointer('pointerdown', 1, 0.5, 0.375);
  assert.deepEqual(controls.sample(), { ...neutral, throttle: 1 });
  power.pointer('pointermove', 1, 0.5, -0.5);
  assert.deepEqual(controls.sample(), { ...neutral, throttle: 1, boost: true });
  power.pointer('pointermove', 1, 0.5, 0.625);
  assert.deepEqual(controls.sample(), neutral);
  power.pointer('pointermove', 1, 0.5, 1.5);
  assert.deepEqual(controls.sample(), { ...neutral, brake: 1 });
});

test('steering has a center dead zone, proportional travel and combined airbrake', (t) => {
  const { controls, steer } = fixture(t);
  steer.pointer('pointerdown', 1, 0.52, 0.42);
  assert.deepEqual(controls.sample(), neutral);
  steer.pointer('pointermove', 1, 0.48, 0.42);
  assert.deepEqual(controls.sample(), neutral);
  steer.pointer('pointermove', 1, 0.68, 0.42);
  const partial = controls.sample().steer;
  assert.ok(partial > 0.25 && partial < 0.75);
  steer.pointer('pointermove', 1, 0.68, 0.9);
  assert.deepEqual(controls.sample(), {
    ...neutral,
    steer: partial,
    airbrake: true,
  });
  steer.pointer('pointermove', 1, -0.5, 0.42);
  assert.deepEqual(controls.sample(), { ...neutral, steer: -1 });
  steer.pointer('pointermove', 1, 1.5, 0.42);
  assert.deepEqual(controls.sample(), { ...neutral, steer: 1 });
});

test('an extra finger cannot take over or release a held pad', (t) => {
  const { controls, power } = fixture(t);
  power.pointer('pointerdown', 1, 0.5, 0.125);
  power.pointer('pointerdown', 2, 0.5, 0.875);
  power.pointer('pointermove', 2, 0.5, 0.875);
  power.pointer('pointerup', 2);
  assert.deepEqual(controls.sample(), { ...neutral, throttle: 1, boost: true });
  assert.deepEqual([...power.captured], [1]);
});

for (const event of ['pointercancel', 'lostpointercapture']) {
  test(`${event} clears only its pad and restores its neutral indicator`, (t) => {
    const { controls, power, steer } = fixture(t);
    steer.pointer('pointerdown', 1, 0, 0.42);
    power.pointer('pointerdown', 2, 0.5, 0.125);
    power.pointer(event, 2);
    assert.deepEqual(controls.sample(), { ...neutral, steer: -1 });
    assert.equal(power.dataset.power, 'neutral');
    assert.equal(power.dataset.active, 'false');
    assert.equal(power.properties.size, 0);
    assert.equal(power.captured.size, 0);
  });
}

test('session cleanup releases both pointers; a held finger cannot restart input after clear', (t) => {
  const { controls, steer, power, disable } = fixture(t);
  steer.pointer('pointerdown', 1, 0, 1);
  power.pointer('pointerdown', 2, 0.5, 0.125);
  controls.clear();
  steer.pointer('pointermove', 1, 1, 1);
  power.pointer('pointermove', 2, 0.5, 0.125);
  assert.deepEqual(controls.sample(), neutral);
  for (const pad of [steer, power]) {
    assert.equal(pad.captured.size, 0);
    assert.equal(pad.properties.size, 0);
    assert.equal(pad.dataset.active, 'false');
  }
  disable();
  power.pointer('pointerdown', 3, 0.5, 0.125);
  assert.deepEqual(controls.sample(), neutral);
});
