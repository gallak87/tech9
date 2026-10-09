import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngineResponse } from './engine-response.js';

const sample = (response, time, boosting, reducedMotion = false) =>
  response({ time, boosting, reducedMotion });

test('boost pressure has a fast attack, slower cooling tail, and holds during pause', () => {
  const response = createEngineResponse();
  sample(response, 0, false);
  const attack = sample(response, 1 / 60, true);
  assert.ok(attack.pressure > 0 && attack.pressure < 1);
  let full;
  for (let tick = 2; tick <= 30; tick++)
    full = sample(response, tick / 60, true);
  assert.ok(full.pressure > 0.999);
  const tail = sample(response, 31 / 60, false);
  assert.ok(tail.pressure > 0.8 && tail.pressure < 1);
  assert.deepEqual(sample(response, 31 / 60, false), tail);
  let settled;
  for (let tick = 32; tick <= 90; tick++)
    settled = sample(response, tick / 60, false);
  assert.ok(settled.pressure < 0.001);
});

test('pressure integration is independent of render cadence', () => {
  const evolve = (rate) => {
    const response = createEngineResponse();
    sample(response, 0, false);
    let state;
    for (let tick = 1; tick <= rate / 2; tick++)
      state = sample(response, tick / rate, true);
    for (let tick = rate / 2 + 1; tick <= rate; tick++)
      state = sample(response, tick / rate, false);
    return state.pressure;
  };
  assert.ok(Math.abs(evolve(30) - evolve(120)) < 1e-12);
});

test('reset and explicit seek restore the requested state, while reduced motion freezes flow', () => {
  const response = createEngineResponse();
  sample(response, 4, true);
  assert.equal(sample(response, 0, false).pressure, 0);
  assert.equal(sample(response, 2, true).pressure, 1);
  const held = sample(response, 2.1, true, true);
  assert.equal(held.flowTime, 2);
  assert.equal(sample(response, 2.2, false, true).flowTime, held.flowTime);
  assert.equal(sample(response, 2.3, false).flowTime, 2.3);
});
