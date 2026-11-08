import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CINDERCOIL_AI_RULES,
  createCindercoilHazardPlanner,
} from './avoidance.js';

const trackAt = (curvature = 0) => ({
  length: 5000,
  jumps: [{ takeoff: 3000, landingStart: 3100 }],
  surgeZones: [
    { id: 'surge', start: 1000, end: 1100, side: -1, phaseOffset: 0 },
    { id: 'spill', kind: 'spill', start: 2000, end: 2135, side: 1 },
  ],
  sample: () => ({ curvature }),
});
const stateAt = (overrides = {}) => ({
  distance: 800,
  lateral: -6,
  speed: 100,
  time: 1,
  ...overrides,
});

test('surges are anticipated from arrival time and available lane-change time', () => {
  const plan = createCindercoilHazardPlanner(trackAt());
  assert.equal(plan(stateAt()).lane, CINDERCOIL_AI_RULES.protectedLane);
  assert.equal(plan(stateAt({ speed: 20 })), null);
  assert.equal(plan(stateAt({ time: 9 })), null);
  assert.equal(plan(stateAt({ time: -12 })).lane, plan(stateAt()).lane);
  assert.equal(plan(stateAt({ distance: 5800 })).lane, plan(stateAt()).lane);
});

test('the spill keeps one downstream clear line and mandatory vent alignment wins', () => {
  const plan = createCindercoilHazardPlanner(trackAt());
  for (const distance of [1810, 2000, 2060, 2138])
    assert.equal(
      plan(stateAt({ distance })).lane,
      -CINDERCOIL_AI_RULES.spillLane,
    );
  assert.equal(plan(stateAt({ distance: 2140 })), null);
  for (const distance of [2740, 2999, 3050, 3104])
    assert.equal(plan(stateAt({ distance })), null);
});

test('tight outside hazard lines brake from cached curvature and actual turn strength', () => {
  const plan = createCindercoilHazardPlanner(trackAt(0.025));
  const state = stateAt({ distance: 960, time: 3 });
  const weak = plan(state, { turn: 0.78, braking: 77 });
  const strong = plan(state, { turn: 1.24, braking: 85 });
  assert.ok(weak.speedLimit < strong.speedLimit);
  assert.ok(weak.speedLimit > 30 && weak.speedLimit < 50);
});

test('planning is stateless and performs no route/native queries per tick', () => {
  const track = trackAt();
  let samples = 0;
  track.sample = () => {
    samples++;
    return { curvature: 0.004 };
  };
  const plan = createCindercoilHazardPlanner(track);
  const initialSamples = samples;
  const state = stateAt();
  const before = structuredClone(state);
  const expected = plan(state);
  for (let index = 0; index < 1000; index++)
    assert.deepEqual(plan(state), expected);
  assert.deepEqual(createCindercoilHazardPlanner(track)(state), expected);
  assert.equal(samples, initialSamples);
  assert.deepEqual(state, before);
});
