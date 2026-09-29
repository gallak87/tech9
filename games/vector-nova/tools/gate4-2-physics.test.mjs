import test from 'node:test';
import assert from 'node:assert/strict';
import { createVehicleState, stepVehicle } from '../src/physics/index.js';

const track = {
  width: 28,
  sample: () => ({
    curvature: 0,
    bank: 0,
    tangent: { x: 0, y: 0, z: 1 },
    right: { x: 1, y: 0, z: 0 },
  }),
};
const impulse = { propulsion: { cruiseSpeed: 142, thrust: 50 } };
const step = 1 / 120;
const initial = (overrides = {}) => ({
  ...createVehicleState(),
  speed: 100,
  energy: 65,
  ...overrides,
});
function run(options, input = { throttle: 1 }, ticks = 120) {
  const state = initial();
  for (let i = 0; i < ticks; i++)
    stepVehicle(state, input, track, step, options);
  return state;
}

test('Vector profile changes distance and speed continuously without reserve drain', () => {
  const base = run({});
  const pad = run(impulse);
  assert.ok(pad.distance > base.distance + 4);
  assert.ok(pad.speed > base.speed + 8);
  assert.equal(pad.energy, base.energy);
  const state = initial();
  stepVehicle(state, { throttle: 1 }, track, step, impulse);
  assert.ok(state.speed > 100 && state.speed < 100.5);
  const before = state.speed;
  stepVehicle(state, { throttle: 1 }, track, step);
  assert.ok(Math.abs(state.speed - before) < 0.5);
});

test('free impulse propels without held throttle; brake suppresses it', () => {
  assert.ok(run(impulse, {}).speed > 100);
  const brake = { throttle: 1, brake: 1 };
  assert.deepEqual(run(impulse, brake), run({}, brake));
  assert.ok(run(impulse, brake).speed < 40);
});

test('manual boost selects its stronger profile and still spends reserve', () => {
  const input = { throttle: 1, boost: true };
  assert.deepEqual(run(impulse, input), run({}, input));
  assert.ok(run(impulse, input).energy < 65);
  assert.ok(run(impulse, input).speed > run(impulse).speed);
});

test('disabled options preserve baseline state and event shape', () => {
  const a = initial({ lateral: 11, lateralSpeed: 22, heading: 0.15 });
  const b = structuredClone(a);
  assert.deepEqual(
    stepVehicle(a, { throttle: 1 }, track, step),
    stepVehicle(b, { throttle: 1 }, track, step, {
      propulsion: null,
      shield: false,
    }),
  );
  assert.deepEqual(a, b);
});

test('shield absorbs reserve loss inside rail resolution, preserving every motion consequence', () => {
  const a = initial({ lateral: 11.6, lateralSpeed: 25, heading: 0.1 });
  const b = structuredClone(a);
  const plain = stepVehicle(a, { throttle: 1 }, track, step);
  const protectedEvents = stepVehicle(b, { throttle: 1 }, track, step, {
    shield: true,
  });
  const hit = plain.find((event) => event.type === 'impact');
  const protectedHit = protectedEvents.find((event) => event.type === 'impact');
  assert.ok(hit && protectedHit?.payload.shielded);
  assert.ok(
    Math.abs(b.energy - a.energy - (6 + hit.payload.severity * 9)) < 1e-10,
  );
  assert.deepEqual({ ...a, energy: b.energy }, b);
  assert.ok(b.speed < 85 && b.lateral <= 11.75 && b.lateralSpeed < 0);
});

test('shield does not absorb manual spending, and cooldown contact is not qualifying', () => {
  const a = initial({
    lateral: 11.6,
    lateralSpeed: 25,
    heading: 0.1,
    impact: 0.5,
  });
  const b = structuredClone(a);
  const events = stepVehicle(b, { throttle: 1, boost: true }, track, step, {
    shield: true,
  });
  stepVehicle(a, { throttle: 1, boost: true }, track, step);
  assert.ok(!events.some((event) => event.type === 'impact'));
  assert.deepEqual(a, b);
  assert.ok(b.energy < 65);
});

test('invalid propulsion options cannot contaminate baseline finite physics', () => {
  const a = run({ propulsion: { cruiseSpeed: NaN, thrust: Infinity } });
  assert.deepEqual(a, run({}));
});
