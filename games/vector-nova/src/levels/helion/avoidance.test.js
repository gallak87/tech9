import assert from 'node:assert/strict';
import test from 'node:test';
import { HELION_AI_RULES, createHelionHazardPlanner } from './avoidance.js';

const trackAt = () => ({
  length: 5000,
  jumps: [{ optional: true, takeoff: 2000, landingStart: 2080 }],
  thermalZones: [
    { id: 'furnace', kind: 'furnace', start: 400, end: 460, phase: 0 },
    { id: 'sweep', kind: 'flare', start: 1000, end: 1140, phase: 0 },
    { id: 'detour', kind: 'flare', start: 1980, end: 2160, phase: 0 },
  ],
  sample: () => {
    throw new Error('Thermal planning must not query road geometry');
  },
});
const stateAt = (overrides = {}) => ({
  distance: 800,
  lateral: 4,
  speed: 100,
  time: 1,
  ...overrides,
});

test('future active flare crossings select real shelter before the fire reaches them', () => {
  const plan = createHelionHazardPlanner(trackAt());
  assert.deepEqual(plan(stateAt()), { lane: HELION_AI_RULES.shelteredLane });
  assert.equal(plan(stateAt({ speed: 20 })), null);
  assert.equal(plan(stateAt({ time: 10 })), null);
  assert.deepEqual(plan(stateAt({ time: -13 })), plan(stateAt()));
  assert.deepEqual(plan(stateAt({ distance: 5800 })), plan(stateAt()));
});

test('full-width furnace strips have no invented escape lane or speed exception', () => {
  const plan = createHelionHazardPlanner(trackAt());
  assert.equal(plan(stateAt({ distance: 420, speed: 50, time: 4 })), null);
});

test('optional vault choices stay intact while grounded detours use their supported shelter', () => {
  const plan = createHelionHazardPlanner(trackAt());
  for (const distance of [1800, 1999, 2030, 2084]) {
    assert.equal(plan(stateAt({ distance, lateral: 7, time: 4 })), null);
    assert.deepEqual(plan(stateAt({ distance, lateral: -7, time: 4 })), {
      lane: HELION_AI_RULES.shelteredLane,
    });
  }
});

test('a chosen sheltered line stays authoritative through the end of the active strip', () => {
  const plan = createHelionHazardPlanner(trackAt());
  const state = stateAt({ distance: 1139, lateral: -10, time: 5 });
  const before = structuredClone(state);
  assert.deepEqual(plan(state), { lane: HELION_AI_RULES.shelteredLane });
  assert.equal(plan({ ...state, distance: 1145 }), null);
  assert.deepEqual(state, before);
});
