import test from 'node:test';
import assert from 'node:assert/strict';
import { createColossusHazardPlanner } from './avoidance.js';
import { EJECTOR_RULES } from './mechanics.js';

const course = (fields) => ({
  length: 10000,
  presses: [],
  ejectors: [],
  belts: [],
  jumps: [],
  ...fields,
});
const vehicle = (fields = {}) => ({
  shipId: 'kestrel',
  distance: 1600,
  lateral: 4,
  speed: 170,
  time: 0,
  ...fields,
});
const belts = [
  { id: 'first', start: 2000, end: 2150, side: 1 },
  { id: 'second', start: 2310, end: 2460, side: -1 },
];

test('hazard anticipation grows with the real lane transition time and approach speed', () => {
  const plan = createColossusHazardPlanner(course({ belts }));
  assert.equal(
    plan(vehicle()).lane,
    -19,
    'fast approach starts before the old 130m warning',
  );
  assert.equal(
    plan(vehicle({ speed: 40 })),
    null,
    'a distant slow approach retains the ordinary racing line',
  );
  assert.equal(
    plan(vehicle({ distance: 500 })),
    null,
    'distant hazards do not trigger planning',
  );
  assert.ok(
    plan(vehicle({ distance: 1900 })).speedLimit < 170,
    'a late transition uses ordinary braking',
  );
});

test('the earliest physical interval owns the lane until the actual hull tail clears', () => {
  const plan = createColossusHazardPlanner(course({ belts }));
  assert.equal(plan(vehicle({ distance: 2150, lateral: -19 })).lane, -19);
  assert.equal(plan(vehicle({ distance: 2160, lateral: -19 })).lane, 19);
  assert.ok(
    plan(vehicle({ distance: 2100, lateral: -19 })).speedLimit < 100,
    'opposing belts leave time to change lanes after the first tail clears',
  );
});

test('planning cannot cross a jump or override its critical takeoff alignment', () => {
  const jumps = [{ takeoff: 1900, landingStart: 2200, launchAlignment: 140 }];
  const plan = createColossusHazardPlanner(course({ belts, jumps }));
  assert.equal(
    plan(vehicle()),
    null,
    'a belt beyond the takeoff is outside the current supported segment',
  );
  assert.equal(
    plan(vehicle({ distance: 1800 })),
    null,
    'the authored takeoff alignment retains control',
  );
  assert.equal(
    plan(vehicle({ distance: 2000 })),
    null,
    'no grounded plan is synthesized inside a real gap',
  );
});

test('a raised press does not force a lane change merely because the craft is beneath it', () => {
  const presses = [
    {
      id: 'press',
      distance: 1000,
      depth: 28,
      width: 45,
      lateral: 12,
      phaseOffset: 0,
    },
  ];
  const plan = createColossusHazardPlanner(course({ presses }));
  assert.equal(plan(vehicle({ distance: 1000, time: 0 })), null);
  assert.equal(plan(vehicle({ distance: 1000, time: 3 })).lane, -16);
});

test('a fast ejector stroke cannot pass between forecast samples unnoticed', () => {
  const ejectors = [
    {
      id: 'head',
      distance: 1000,
      depth: 30,
      width: 12,
      phaseOffset: 0,
      side: 1,
    },
  ];
  const plan = createColossusHazardPlanner(course({ ejectors }));
  // The hull's crossing window spans the complete 0.38s stroke. No lane on the
  // bed clears it: the plan must keep its line and request a later arrival.
  const state = vehicle({
    distance: 900,
    speed: 60,
    time: EJECTOR_RULES.period + EJECTOR_RULES.warning - 100 / 60 - 0.05,
  });
  const result = plan(state);
  assert.equal(result.lane, state.lateral);
  assert.ok(result.speedLimit < state.speed);
});

test('plans derive entirely from the supplied state and leave route and replay data untouched', () => {
  const track = course({ belts });
  const plan = createColossusHazardPlanner(track);
  const state = Object.freeze(vehicle());
  const route = structuredClone(track);
  const expected = plan(state);
  plan(
    vehicle({
      chassisId: 'manta',
      shipId: 'bastion',
      time: 12,
      distance: 2300,
      lateral: -19,
    }),
  );
  assert.deepEqual(plan(state), expected);
  assert.deepEqual(track, route);
});
