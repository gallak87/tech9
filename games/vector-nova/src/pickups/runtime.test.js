import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeviceRuntime } from './runtime.js';
import { createVehicleState } from '../physics/index.js';

function fixture(options = {}) {
  const calls = { motion: 0, presentation: 0, events: [], resets: 0 };
  let tick = 0;
  const runtime = createDeviceRuntime({
    track: { length: 1000, closed: true },
    devices: [],
    motion: {
      id: 'presentation-fixture',
      version: 1,
      rulesId: 'fixture-v1',
      advance(state, _input, dt) {
        state.time += dt;
        state.distance += 1;
        tick++;
        return [{ type: 'impact', payload: { tick } }];
      },
      reset() {
        tick = 0;
      },
      snapshot: () => ({ tick }),
      restore: (data) => {
        tick = data.tick;
      },
      pose: () => ({ grounded: true }),
      update() {
        calls.motion++;
      },
      dispose() {},
    },
    ...options,
    presentation: {
      update() {
        calls.presentation++;
      },
      reset() {
        calls.resets++;
      },
      dispose() {},
    },
  });
  runtime.observePresentation({
    events: (events) => calls.events.push(...events),
    reset() {
      calls.resets++;
    },
  });
  return { runtime, calls, state: createVehicleState() };
}

test('silent device updates drain forecast events without decorative callbacks or later replay', () => {
  const { runtime, calls, state } = fixture();
  try {
    runtime.advance(state, {}, 1 / 120);
    runtime.update({ presentation: false });
    assert.equal(state.time, 1 / 120, 'simulation still advances');
    assert.deepEqual(calls, {
      motion: 0,
      presentation: 0,
      events: [],
      resets: 0,
    });
    runtime.update({});
    assert.equal(calls.motion, 1);
    assert.equal(calls.presentation, 1);
    assert.deepEqual(
      calls.events,
      [],
      'discarded forecast events never leak into the live frame',
    );
    runtime.advance(state, {}, 1 / 120);
    runtime.update({});
    assert.equal(calls.events.length, 1);
    assert.equal(
      calls.events[0].payload.tick,
      2,
      'ordinary feedback still delivers normally',
    );
  } finally {
    runtime.dispose();
  }
});

test('silent device restore restores simulation without resetting visible observers; default restore still resets', () => {
  const { runtime, calls, state } = fixture();
  try {
    const saved = runtime.snapshot();
    runtime.advance(state, {}, 1 / 120);
    runtime.restore(saved, { presentation: false });
    assert.deepEqual(runtime.snapshot(), saved);
    assert.equal(calls.resets, 0);
    runtime.update({});
    assert.deepEqual(
      calls.events,
      [],
      'restore drops pending forecast feedback',
    );
    runtime.restore(saved);
    assert.equal(
      calls.resets,
      2,
      'default restoration resets both owner and observer',
    );
    const invalid = structuredClone(saved);
    invalid.version = -1;
    assert.throws(
      () => runtime.restore(invalid, { presentation: false }),
      /mismatch/,
    );
  } finally {
    runtime.dispose();
  }
});

test('equipment-disabled disciplines ignore equipped saves and injected equipment inputs', () => {
  for (const equipmentEnabled of [false, true]) {
    const { runtime, state } = fixture({ equipmentEnabled });
    try {
      state.equipment = ['injector'];
      state.energy = 0;
      runtime.reset({ reason: 'fresh-lap', state });
      const events = runtime.advance(state, { equipment1: true }, 1 / 120);
      assert.equal(state.energy, equipmentEnabled ? 45 : 0);
      assert.equal(
        events.some((event) => event.type === 'equipment-activate'),
        equipmentEnabled,
      );
      if (equipmentEnabled) assert.ok(runtime.equipment());
      else {
        assert.equal(runtime.equipment(), null);
        assert.equal('equipment' in runtime.snapshot(), false);
        assert.match(runtime.rulesId, /equipmentEnabled.*false/);
      }
    } finally {
      runtime.dispose();
    }
  }
});
