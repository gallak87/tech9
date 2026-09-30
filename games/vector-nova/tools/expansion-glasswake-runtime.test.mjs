import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlasswakeTrack } from '../src/levels/glasswake/track/model.js';
import { createGlasswakeRuntime } from '../src/levels/glasswake/runtime.js';
import { surfaceAt } from '../src/levels/glasswake/surface.js';
import { createVehicleState, stepVehicle } from '../src/physics/index.js';
import { createRace } from '../src/race/index.js';

const track = createGlasswakeTrack();
const input = {
  throttle: 1,
  brake: 0,
  steer: 0,
  boost: false,
  airbrake: false,
};
const fresh = (fields) => Object.assign(createVehicleState(), fields);
function runJump(index, speed, heading = 0) {
  const jump = track.jumps[index];
  const runtime = createGlasswakeRuntime({ track });
  const state = fresh({ distance: jump.takeoff - 0.25, speed, heading });
  const events = [];
  let peakHeight = -Infinity;
  for (let i = 0; i < 1200; i++) {
    events.push(...runtime.advance(state, { ...input, throttle: 0 }, 1 / 120));
    const pose = runtime.pose();
    if (pose && runtime.snapshot().mode === 'flight')
      peakHeight = Math.max(peakHeight, pose.position.y);
    if (events.some((e) => e.type === 'jump-transfer')) break;
  }
  const transfer = events.find((e) => e.type === 'jump-transfer');
  runtime.dispose();
  return { state, events, transfer, peakHeight };
}

test('Glasswake declared frost boundaries wrap and preserve clear lane response', () => {
  assert.ok(track.gripZones.length >= 4);
  for (const zone of track.gripZones) {
    const s = (zone.start + zone.end) / 2;
    const lateral = (zone.lateralMin + zone.lateralMax) / 2;
    assert.equal(surfaceAt(track, s, lateral).id, zone.id);
    assert.equal(surfaceAt(track, s + track.length, lateral).id, zone.id);
    assert.equal(surfaceAt(track, s - track.length, lateral).id, zone.id);
    assert.ok(surfaceAt(track, s, lateral).grip < 1);
    assert.equal(surfaceAt(track, s, lateral > 0 ? -10 : 10).grip, 1);
  }
});

test('Glasswake ordinary magnetic state exactly matches baseline outside zones', () => {
  const runtime = createGlasswakeRuntime({ track });
  const state = fresh({ distance: 40, speed: 35 });
  const baseline = { ...state };
  for (let i = 0; i < 60; i++) {
    const controls = { ...input, throttle: 0.4, steer: 0.1 };
    runtime.advance(state, controls, 1 / 120);
    stepVehicle(baseline, controls, track, 1 / 120);
  }
  assert.deepEqual(state, baseline);
  runtime.dispose();
});

test('Glasswake frost changes drift at matched speed without changing commanded brake', () => {
  const zone = track.gripZones[0];
  const distance = (zone.start + zone.end) / 2;
  const frost = fresh({
    distance,
    lateral: (zone.lateralMin + zone.lateralMax) / 2,
    speed: 55,
    lateralSpeed: 5,
  });
  const clear = { ...frost };
  const control = { ...input, throttle: 0, brake: 0.6 };
  stepVehicle(frost, control, track, 0.1, { surface: { grip: zone.grip } });
  stepVehicle(clear, control, track, 0.1);
  assert.ok(Math.abs(frost.lateralSpeed - clear.lateralSpeed) > 0.1);
  assert.ok(Math.abs(frost.speed - clear.speed) < 0.1);
});

test('Glasswake both fracture gaps have valid real flight and deliberately slow misses', () => {
  for (let index = 0; index < track.jumps.length; index++) {
    const result = runJump(index, 112);
    assert.ok(result.events.some((e) => e.type === 'jump-launch'));
    assert.equal(
      result.transfer?.payload.outcome,
      'landed',
      JSON.stringify({ index, events: result.events }),
    );
    assert.ok(result.state.distance >= track.jumps[index].landingStart);
    const slow = runJump(index, 18);
    assert.equal(slow.transfer?.payload.outcome, 'recovered');
    assert.equal(slow.state.distance, track.jumps[index].recovery);
    assert.equal(slow.state.speed, 0);
  }
});

test('Glasswake airborne snapshot restores exact deterministic continuation', () => {
  const runtime = createGlasswakeRuntime({ track });
  const state = fresh({ distance: track.jumps[0].takeoff - 1, speed: 112 });
  for (let i = 0; i < 30; i++) runtime.advance(state, input, 1 / 120);
  assert.equal(runtime.snapshot().mode, 'flight');
  const saved = structuredClone(runtime.snapshot());
  const copy = { ...state };
  const second = createGlasswakeRuntime({ track });
  second.restore(saved);
  for (let i = 0; i < 240; i++) {
    assert.deepEqual(
      runtime.advance(state, input, 1 / 120),
      second.advance(copy, input, 1 / 120),
    );
  }
  assert.deepEqual(state, copy);
  assert.deepEqual(runtime.snapshot(), second.snapshot());
  runtime.reset({ seed: 14 });
  assert.equal(runtime.snapshot().mode, 'magnetic');
  assert.equal(runtime.pose(), null);
  runtime.dispose();
  second.dispose();
});

test('Glasswake transfer checkpoint intervals admit exactly one ordered credit', () => {
  const race = createRace(track);
  assert.ok(race);
  for (const jump of track.jumps) {
    const interval = track.checkpoints.filter(
      (c) =>
        (c.distance ?? c.s) > jump.takeoff &&
        (c.distance ?? c.s) <= Math.max(jump.landingEnd, jump.recovery),
    );
    assert.equal(interval.length, 1);
    assert.equal(interval[0].distance ?? interval[0].s, jump.landingStart);
  }
});
