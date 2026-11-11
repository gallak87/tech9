import test from 'node:test';
import assert from 'node:assert/strict';
import { createLaunchworksTrack } from './track/model.js';
import { createLaunchworksRuntime } from './runtime.js';
import { createVehicleState } from '../../physics/index.js';
import { createDeviceRuntime } from '../../pickups/runtime.js';
import { readRuntimeFrame } from '../../core/session-runtime.js';

test('the production lightweight frame reader carries real Freestyle flight and receiver feedback', () => {
  const track = createLaunchworksTrack();
  const motion = createLaunchworksRuntime({ track });
  const runtime = createDeviceRuntime({
    track,
    devices: [],
    motion,
    equipmentEnabled: false,
  });
  const state = createVehicleState('shrike');
  Object.assign(state, {
    distance: track.jumps[0].takeoff - 0.1,
    speed: 155,
    lateral: 0,
    heading: 0,
  });
  runtime.reset({ reason: 'fresh-lap', state, seed: 7 });
  try {
    for (let i = 0; i < 20; i++)
      runtime.advance(state, { throttle: 1, aerialRoll: 1 }, 1 / 120);
    assert.equal(
      runtime.snapshot().motion.freestyle.flight.id,
      track.jumps[0].id,
    );
    motion.snapshot = () => {
      throw new Error('presentation must not acquire a replay checkpoint');
    };
    const frame = readRuntimeFrame(runtime);
    const freestyle = frame.motion.freestyle;
    assert.equal(freestyle.flight.id, track.jumps[0].id);
    assert.ok(freestyle.clock > 0);
    assert.ok(freestyle.angular[2] > 0);
    assert.equal(freestyle.active, 'Barrel roll');
    assert.ok(Number.isFinite(freestyle.receiverReference.tilt));
    assert.ok(Number.isFinite(freestyle.receiverReference.nose));
    assert.equal(
      frame.freestyle.score,
      0,
      'HUD and road feedback share the same score',
    );
    const observed = [...freestyle.angular];
    freestyle.angular[2] = 999;
    assert.deepEqual(
      readRuntimeFrame(runtime).freestyle.angular,
      observed,
      'view arrays own their values',
    );
  } finally {
    runtime.dispose();
  }
});
