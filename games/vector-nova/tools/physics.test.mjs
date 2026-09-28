import test from 'node:test';
import assert from 'node:assert/strict';
import { createVehicleState, stepVehicle } from '../src/physics/index.js';
import { createRace } from '../src/race/index.js';

const track = {
  length: 3600,
  width: 24,
  sample: () => ({ curvature: 0, bank: 0 }),
};
const idle = { throttle: 0, brake: 0, steer: 0, airbrake: false, boost: false };
const dt = 1 / 120;
function advance(state, controls, seconds, road = track) {
  const events = [];
  for (let i = 0; i < Math.round(seconds / dt); i++)
    events.push(...stepVehicle(state, { ...idle, ...controls }, road, dt));
  return events;
}

test('throttle, braking and boost have distinct physical consequences', () => {
  const cruise = createVehicleState();
  advance(cruise, { throttle: 1 }, 4);
  assert.ok(
    cruise.distance > 100 && cruise.speed > 70,
    'throttle must accelerate and move',
  );
  const coasting = { ...cruise },
    braking = { ...cruise },
    boosted = { ...cruise };
  advance(coasting, {}, 0.5);
  advance(braking, { brake: 1 }, 0.5);
  advance(boosted, { throttle: 1, boost: true }, 0.5);
  assert.ok(
    braking.speed < coasting.speed - 20,
    'braking must materially exceed passive drag',
  );
  assert.ok(boosted.speed > cruise.speed, 'boost must gain speed');
  assert.ok(
    boosted.energy < cruise.energy,
    'boost must spend the shared energy reserve',
  );
});

test('left and right steering are symmetric on a flat straight', () => {
  const left = { ...createVehicleState(), speed: 80 };
  const right = { ...left };
  advance(left, { throttle: 1, steer: -1 }, 0.3);
  advance(right, { throttle: 1, steer: 1 }, 0.3);
  assert.ok(left.lateral > 0.1 && right.lateral < -0.1);
  assert.ok(Math.abs(left.lateral + right.lateral) < 1e-9);
  assert.ok(Math.abs(left.heading + right.heading) < 1e-9);
});

test('high lateral velocity cannot tunnel through a barrier or repeat damage every tick', () => {
  const state = {
    ...createVehicleState(),
    speed: 100,
    lateral: 9,
    lateralSpeed: 120,
    heading: 0.2,
  };
  const first = stepVehicle(state, { ...idle, steer: 1 }, track, dt);
  assert.ok(first.some((e) => e.type === 'impact'));
  assert.ok(
    state.lateral < track.width / 2,
    'body must remain within road boundary',
  );
  assert.ok(
    state.speed < 90 && state.energy < 100,
    'wall contact must cost speed and energy',
  );
  const repeated = advance(state, { throttle: 1, steer: 1 }, 0.05);
  assert.equal(
    repeated.filter((e) => e.type === 'impact').length,
    0,
    'contact cooldown must prevent per-frame damage',
  );
});

test('reverse seam crossings do not award laps; ordered forward progress does', () => {
  const race = createRace(track);
  race.step(10, -10, 0.1);
  assert.equal(race.lap, 1);
  assert.equal(race.history.length, 0);
  for (let s = 0; s < track.length; s += 50) race.step(s, s + 50, 0.5);
  assert.equal(race.lap, 2);
  assert.equal(race.history.length, 1);
  assert.equal(race.history[0].valid, true);
});

test('recovery invalidates the current lap record', () => {
  const race = createRace(track);
  for (let s = 0; s < 1800; s += 50) race.step(s, s + 50, 0.5);
  race.recover();
  for (let s = 1800; s < track.length; s += 50) race.step(s, s + 50, 0.5);
  assert.equal(race.history[0].valid, false);
  assert.equal(race.best, null, 'an invalid lap cannot set the best time');
});
