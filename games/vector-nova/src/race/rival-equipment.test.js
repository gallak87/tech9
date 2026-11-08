import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRivalEquipmentInput,
  RIVAL_EQUIPMENT_RULES,
} from './rival-equipment.js';

const frame = (distance) => ({
  position: { x: 0, y: 0, z: distance },
  up: { x: 0, y: 1, z: 0 },
  tangent: { x: 0, y: 0, z: 1 },
  curvature: 0,
  bounds: { min: -20, max: 20 },
});
const track = {
  length: 2000,
  closed: false,
  finishDistance: 1900,
  jumps: [],
  sample: frame,
};
const state = {
  distance: 100,
  lateral: 0,
  speed: 100,
  energy: 40,
  heading: 0,
  lateralSpeed: 0,
  equipment: ['injector', 'slipstream', 'deflector', 'lance'],
};
const input = { throttle: 1, brake: 0, boost: true };
const target = { distance: 150, lateral: 0, speed: 90, chassisId: 'latch' };
const world = {
  shots: [
    { source: 'latch', target: 'rook', distance: 80, lateral: 0, speed: 400 },
  ],
  wakes: [],
  emitters: {},
};
function context(overrides = {}) {
  return {
    actorId: 'rook',
    state,
    input,
    track,
    nearby: [target],
    combat: world,
    pose: { grounded: true },
    status: { time: 0, readyMask: 15, heldMask: 0, shield: false },
    ...overrides,
  };
}
function decisions(options) {
  const results = [];
  for (let tick = 0; tick < RIVAL_EQUIPMENT_RULES.decisionTicks; tick++) {
    const result = getRivalEquipmentInput({
      ...options,
      status: { ...options.status, time: tick / 120 },
    });
    if (result) results.push(result);
  }
  return results;
}

test('ready equipment chooses actual reserve, draft, incoming-hit and aimed-shot opportunities once per decision period', () => {
  const options = context();
  const before = JSON.stringify(options);
  assert.deepEqual(decisions(options), [
    { equipment1: true, equipment2: true, equipment3: true, equipment4: true },
  ]);
  assert.equal(
    JSON.stringify(options),
    before,
    'the policy neither changes actor data nor owns gameplay state',
  );
  assert.deepEqual(
    decisions(
      context({ state: { ...state, energy: 100 }, nearby: [], combat: null }),
    ),
    [],
  );
});

test('cooldown masks and held edges remain owned by the equipment system', () => {
  assert.deepEqual(
    decisions(context({ status: { time: 0, readyMask: 3, heldMask: 1 } })),
    [{ equipment2: true }],
  );
  assert.deepEqual(
    decisions(context({ status: { time: 0, readyMask: 0, heldMask: 0 } })),
    [],
  );
  assert.deepEqual(decisions(context({ aegisRemaining: 4 })), [
    { equipment1: true, equipment2: true, equipment4: true },
  ]);
});

test('an empty reserve can use Injector even after ordinary boost has disengaged', () => {
  assert.deepEqual(
    decisions(
      context({
        state: { ...state, equipment: ['injector'], energy: 0 },
        input: { ...input, boost: false },
      }),
    ),
    [{ equipment1: true }],
  );
});

test('Deflector recognizes a nearby player Repulsor without a rival chassis identity', () => {
  assert.deepEqual(
    decisions(
      context({
        state: { ...state, equipment: ['deflector'] },
        nearby: [{ distance: 150, lateral: 0, speed: 100 }],
        combat: {
          shots: [],
          wakes: [],
          emitters: { player: { kind: 'repulsor', elapsed: 0.2 } },
        },
      }),
    ),
    [{ equipment1: true }],
  );
});

test('Jump uses a real passing or wake opportunity only on a supported quiet receiving path', () => {
  const options = context({
    state: { ...state, equipment: ['jump'] },
    nearby: [{ ...target, distance: 125 }],
  });
  assert.deepEqual(decisions(options), [{ equipment1: true }]);
  for (const unsafe of [
    { ...track, sample: (s) => ({ ...frame(s), curvature: 0.01 }) },
    { ...track, jumps: [{ takeoff: 180, recovery: 600 }] },
    { ...track, tubeAt: () => ({}) },
    { ...track, surfaceCoverage: () => 0 },
  ])
    assert.deepEqual(decisions({ ...options, track: unsafe }), []);
});

test('an optional local Jump guard is lazy, receives the actor and reach, and defaults to allowing the generic path', () => {
  const options = context({
    state: { ...state, equipment: ['jump'] },
    nearby: [{ ...target, distance: 125 }],
  });
  let calls = 0;
  assert.deepEqual(
    decisions({
      ...options,
      jumpSafe(actualState, actualOptions) {
        calls++;
        assert.equal(actualState, options.state);
        assert.deepEqual(actualOptions, { reach: 450 });
        return false;
      },
    }),
    [],
  );
  assert.equal(calls, 1);
  assert.deepEqual(decisions({ ...options, jumpSafe: () => true }), [
    { equipment1: true },
  ]);
  assert.deepEqual(
    decisions(
      context({
        state: { ...state, equipment: ['injector'] },
        jumpSafe() {
          throw new Error('unused Jump policy');
        },
      }),
    ),
    [{ equipment1: true }],
  );
});

test('moving road Jump decisions use the actor clock rather than rendered presentation time', () => {
  const times = [];
  assert.deepEqual(
    decisions(
      context({
        state: { ...state, time: 2.5, equipment: ['jump'] },
        nearby: [{ ...target, distance: 125 }],
        track: {
          ...track,
          sampleSurface() {
            throw new Error('presentation time must not affect simulation');
          },
          surfaceAtTime(distance, lateral, time) {
            times.push(time);
            return frame(distance);
          },
        },
      }),
    ),
    [{ equipment1: true }],
  );
  assert.deepEqual(times, [2.5, 2.5, 2.5]);
});

test('Stabilizer reacts to airborne drift while grounded offensive abilities stay quiet', () => {
  assert.deepEqual(
    decisions(
      context({
        state: {
          ...state,
          equipment: ['stabilizer', 'lance', 'slipstream', 'deflector'],
          lateralSpeed: 3,
        },
        pose: { grounded: false },
      }),
    ),
    [{ equipment1: true }],
  );
  assert.deepEqual(
    decisions(context({ state: { ...state, equipment: ['stabilizer'] } })),
    [],
  );
});

test('recovery, braking and stationary staging cannot grant free equipment actions', () => {
  for (const overrides of [
    { pose: { grounded: false, recovering: true } },
    { input: { ...input, throttle: 0 } },
    { state: { ...state, speed: 0 } },
    { state: { ...state, equipment: [] } },
  ])
    assert.deepEqual(decisions(context(overrides)), []);
  assert.deepEqual(
    decisions(context({ input: { ...input, brake: 1 }, combat: null })),
    [],
  );
});

test('rival identity staggers fixed decisions without a random generator or extra checkpoint', () => {
  const phases = [];
  for (const actorId of ['rook', 'latch', 'mule', 'pike']) {
    const fired = [];
    for (let tick = 0; tick < RIVAL_EQUIPMENT_RULES.decisionTicks; tick++)
      if (
        getRivalEquipmentInput(
          context({
            actorId,
            status: { time: tick / 120, readyMask: 1, heldMask: 0 },
          }),
        )
      )
        fired.push(tick);
    assert.equal(fired.length, 1);
    phases.push(fired[0]);
  }
  assert.ok(new Set(phases).size > 1);
});
