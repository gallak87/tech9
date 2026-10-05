import test from 'node:test';
import assert from 'node:assert/strict';
import { createVehicleState, stepVehicle } from '../src/physics/index.js';
import { createRace } from '../src/race/index.js';
import { createUmbraTrack } from '../src/levels/umbra/track/model.js';
import { createUmbraRuntime } from '../src/levels/umbra/track/runtime.js';
import {
  tidalResponse,
  airborneGravity,
} from '../src/levels/umbra/track/forces.js';

const track = createUmbraTrack();
const dt = 1 / 120;
const input = {
  throttle: 1,
  brake: 0,
  steer: 0,
  boost: false,
  airbrake: false,
};
const runtime = () =>
  createUmbraRuntime({ track, settings: { steeringAssist: 0.3 } });

function runJump(index, kind = 'success', controls = input) {
  const state = {
    ...createVehicleState(),
    ...track.scenarios[`jump${index + 1}-${kind}`],
  };
  const adapter = runtime();
  adapter.reset({ state, seed: 147 });
  const race = createRace(track, { rulesId: adapter.rulesId });
  race.placeScenario(state.distance);
  race.valid = true;
  const events = [];
  let airborne = false;
  for (let tick = 0; tick < 1600; tick++) {
    const previous = state.distance;
    const batch = adapter.advance(state, controls, dt);
    events.push(...batch);
    race.step(previous, state.distance, dt, batch);
    airborne ||= adapter.snapshot().mode === 'flight';
    if (batch.some((event) => event.type === 'jump-transfer')) break;
  }
  return { adapter, state, race, events, airborne };
}

test('Umbra preserves ordinary magnetic handling outside declared tidal intervals', () => {
  const baseline = { ...createVehicleState(), distance: 30, speed: 52 };
  const actual = { ...baseline };
  const adapter = runtime();
  for (let tick = 0; tick < 120; tick++) {
    const keys = { ...input, steer: tick > 40 && tick < 80 ? 0.1 : 0 };
    stepVehicle(baseline, keys, track, dt);
    adapter.advance(actual, keys, dt);
  }
  assert.deepEqual(actual, baseline);
  adapter.dispose();
});

test('tidal intervals have continuous bounded ramps and no global force', () => {
  assert.equal(tidalResponse(track, 0).strength, 0);
  for (const zone of track.tidalZones) {
    assert.equal(tidalResponse(track, zone.start - 0.01).strength, 0);
    assert.equal(tidalResponse(track, zone.end + 0.01).strength, 0);
    assert.ok(tidalResponse(track, zone.start + 0.01).strength < 1e-5);
    assert.ok(tidalResponse(track, zone.end - 0.01).strength < 1e-5);
    const center = tidalResponse(track, (zone.start + zone.end) / 2);
    assert.ok(center.strength > zone.strength * 0.98);
    assert.ok(Math.abs(center.lateralAcceleration) <= zone.strength);
    assert.ok(Math.abs(center.forwardAcceleration) <= zone.strength * 0.25);
    assert.deepEqual(
      center,
      tidalResponse(track, (zone.start + zone.end) / 2 + track.length),
    );
  }
});

test('crossing fields are finite world accelerations independent of target error', () => {
  for (const jump of track.jumps) {
    const position = track.sample(jump.takeoff).position;
    const force = airborneGravity({ jump, position });
    assert.ok(force.toArray().every(Number.isFinite));
    assert.ok(force.length() > 1);
    assert.equal(force.y, 0);
  }
});

for (const index of [0, 1]) {
  test(`curved leap ${index + 1} has actual airborne landing and ordered credit`, () => {
    const result = runJump(index);
    assert.ok(result.airborne);
    const transfer = result.events.find(
      (event) => event.type === 'jump-transfer',
    );
    assert.equal(transfer?.payload.outcome, 'landed');
    assert.equal(result.race.valid, true);
    assert.ok(result.state.distance >= track.jumps[index].landingStart);
    assert.ok(result.state.distance <= track.jumps[index].landingEnd);
    result.adapter.dispose();
  });
  test(`curved leap ${index + 1} imperfect approach lands; short approach recovers`, () => {
    const imperfect = runJump(index, 'imperfect');
    assert.equal(
      imperfect.events.find((event) => event.type === 'jump-transfer')?.payload
        .outcome,
      'landed',
    );
    imperfect.adapter.dispose();
    const missed = runJump(index, 'short', { ...input, throttle: 0, brake: 1 });
    assert.equal(
      missed.events.find((event) => event.type === 'jump-transfer')?.payload
        .outcome,
      'recovered',
    );
    assert.equal(missed.race.valid, true);
    assert.ok(missed.state.time >= 1.5);
    missed.adapter.dispose();
  });
}

test('flight snapshot continuation and reset are deterministic; zero dt cannot advance', () => {
  const a = runtime(),
    b = runtime();
  const first = {
    ...createVehicleState(),
    ...track.scenarios['jump1-success'],
  };
  a.reset({ state: first, seed: 21 });
  for (let tick = 0; tick < 65; tick++) a.advance(first, input, dt);
  assert.equal(a.snapshot().mode, 'flight');
  const second = { ...first };
  b.restore(JSON.parse(JSON.stringify(a.snapshot())));
  const before = JSON.stringify({ first, runtime: a.snapshot() });
  a.advance(first, input, 0);
  assert.equal(JSON.stringify({ first, runtime: a.snapshot() }), before);
  for (let tick = 0; tick < 360; tick++) {
    const keys = { ...input, steer: tick < 12 ? -0.1 : 0 };
    assert.deepEqual(a.advance(first, keys, dt), b.advance(second, keys, dt));
  }
  assert.deepEqual(first, second);
  assert.deepEqual(a.snapshot(), b.snapshot());
  a.reset({ seed: 21 });
  assert.equal(a.snapshot().mode, 'magnetic');
  assert.equal(a.pose(), null);
  a.dispose();
  b.dispose();
});

test('a numerical steering/braking/boost traversal completes ordered lap with both real landings', () => {
  const adapter = runtime();
  const state = createVehicleState();
  const race = createRace(track, { rulesId: adapter.rulesId });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const transfers = [];
  let impacts = 0;
  for (let tick = 0; tick < 15000 && race.lap < 2; tick++) {
    const frame = track.sample(state.distance);
    const local = state.distance % track.length;
    const near = track.jumps.find(
      (jump) => local > jump.takeoff - 180 && local < jump.takeoff,
    );
    const flight = adapter.snapshot().mode !== 'magnetic';
    const wantedSpeed = near
      ? near.targetSpeed
      : clamp(1 / (Math.abs(frame.curvature) + 0.001), 55, 108);
    const desiredHeading =
      near && local > near.takeoff - 40
        ? 0
        : clamp(
            (0.75 * frame.curvature * state.speed) / 7.2 +
              (9.81 * frame.right.y) / (7.2 * Math.max(10, state.speed)) -
              state.lateral * 0.025,
            -0.25,
            0.25,
          );
    const steer = flight
      ? 0
      : clamp(
          (-frame.curvature * state.speed) / 1.5 -
            ((desiredHeading - state.heading) * 2.6) / 1.05,
          -1,
          1,
        );
    const keys = {
      throttle: state.speed < wantedSpeed ? 1 : 0,
      brake: state.speed > wantedSpeed + 6 ? 0.2 : 0,
      steer,
      boost: !!near && state.speed < wantedSpeed - 5,
      airbrake: false,
    };
    const before = state.distance;
    const events = adapter.advance(state, keys, dt);
    race.step(before, state.distance, dt, events);
    transfers.push(...events.filter((event) => event.type === 'jump-transfer'));
    impacts += events.filter((event) => event.type === 'impact').length;
  }
  assert.equal(race.lap, 2);
  assert.equal(race.history[0].valid, true);
  assert.deepEqual(
    transfers.map((event) => [event.payload.id, event.payload.outcome]),
    track.jumps.map((jump) => [jump.id, 'landed']),
  );
  assert.equal(impacts, 0);
  adapter.dispose();
});
