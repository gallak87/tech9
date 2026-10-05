import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMagneticRuntime,
  advanceSession,
  compatibleRuntime,
  runtimeIdentity,
  captureInitial,
  restoreReplayInitial,
  validateReplayInputs,
} from '../src/core/session-runtime.js';
import { createTrack } from '../src/levels/halcyon/track/index.js';
import { createVehicleState, stepVehicle } from '../src/physics/index.js';
import { createRace } from '../src/race/index.js';
const track = createTrack();
const dt = 1 / 120;
const inputs = Array.from({ length: 600 }, (_, i) => ({
  throttle: 1,
  brake: i > 460 ? 1 : 0,
  steer: Math.sin(i / 50) * 0.1,
  boost: i > 180 && i < 400,
  airbrake: i > 430,
}));
test('default adapter preserves magnetic state and event output exactly', () => {
  const direct = createVehicleState(),
    baseline = createVehicleState();
  const a = createMagneticRuntime({ track });
  for (const input of inputs) {
    const expected = stepVehicle(direct, input, track, dt);
    assert.deepEqual(a.advance(baseline, input, dt), expected);
  }
  assert.deepEqual(baseline, direct);
});
test('live and replay share tick event/race order and rules partition', () => {
  function run() {
    const runtime = createMagneticRuntime({ track }),
      state = createVehicleState();
    const race = createRace(track, { rulesId: runtime.rulesId }),
      events = [];
    for (const input of inputs)
      advanceSession({
        state,
        input,
        dt,
        runtime,
        race,
        emit: (e) => events.push(e),
      });
    return { state, elapsed: race.elapsed, rules: race.rulesId, events };
  }
  assert.deepEqual(run(), run());
  const runtime = createMagneticRuntime({ track });
  assert.ok(compatibleRuntime(runtime, runtimeIdentity(runtime)));
  assert.equal(
    compatibleRuntime(runtime, {
      ...runtimeIdentity(runtime),
      rulesId: 'different',
    }),
    false,
  );
  assert.equal(compatibleRuntime(runtime, null), false);
  const race = createRace(track, { rulesId: 'test-rules' });
  for (let d = 0; d < track.length; d += 10)
    race.step(d, Math.min(track.length, d + 10), dt);
  assert.equal(race.history[0].rulesId, 'test-rules');
});

test('replay initial state restores only finite deterministic scenario state', () => {
  let restored;
  const runtime = {
    snapshot: () => ({ cooldown: 12 }),
    restore: (data) => {
      restored = data;
    },
  };
  const state = createVehicleState();
  const initial = captureInitial(state, runtime);
  state.speed = 99;
  restoreReplayInitial(initial, initial, state, runtime);
  assert.equal(state.speed, 0);
  assert.deepEqual(restored, { cooldown: 12 });
  assert.throws(
    () =>
      restoreReplayInitial(
        { ...initial, vehicle: { ...initial.vehicle, speed: NaN } },
        initial,
        state,
        runtime,
      ),
    /initial state mismatch/,
  );
  assert.throws(
    () =>
      restoreReplayInitial(
        { ...initial, runtime: { cooldown: 0 } },
        initial,
        state,
        runtime,
      ),
    /initial state mismatch/,
  );
});

test('replay refuses truncated, discontinuous and malformed logs before playback', () => {
  const input = {
    throttle: 1,
    brake: 0,
    steer: 0,
    airbrake: false,
    boost: false,
  };
  const log = [
    { tick: 0, input },
    { tick: 1, input },
  ];
  assert.equal(validateReplayInputs(log, 2), log);
  assert.throws(() => validateReplayInputs(log, 3), /truncated/);
  assert.throws(
    () => validateReplayInputs([{ tick: 20, input }]),
    /noncontiguous/,
  );
  assert.throws(
    () =>
      validateReplayInputs([
        { tick: 0, input },
        { tick: 2, input },
      ]),
    /noncontiguous/,
  );
  for (const invalid of [
    { ...input, throttle: NaN },
    { ...input, steer: Infinity },
    { ...input, brake: -1 },
    { ...input, boost: 1 },
  ])
    assert.throws(
      () => validateReplayInputs([{ tick: 0, input: invalid }]),
      /malformed/,
    );
});
