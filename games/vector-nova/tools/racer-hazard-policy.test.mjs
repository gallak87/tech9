import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { createVehicleState } from '../src/physics/index.js';
import { getRacerControl, createRacers } from '../src/race/racers.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import { runtimeIdentity } from '../src/core/session-runtime.js';

const track = {
  length: 4000,
  width: 72,
  closed: true,
  jumps: [],
  sample: (distance) => ({
    position: new Vector3(0, 0, distance),
    tangent: new Vector3(0, 0, 1),
    right: new Vector3(1, 0, 0),
    up: new Vector3(0, 1, 0),
    curvature: 0,
  }),
};
const grounded = () => ({ grounded: true });
const state = {
  ...createVehicleState(),
  distance: 100,
  lateral: -16,
  speed: 130,
};

test('absent or unusable hazard plans preserve legacy controls on every difficulty', () => {
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const options = {
      difficulty,
      lane: 4,
      runtime: { pose: grounded, avoidance: () => -8 },
    };
    const expected = getRacerControl(state, track, options);
    for (const value of [
      undefined,
      null,
      {},
      { lane: NaN },
      { lane: Infinity },
    ]) {
      assert.deepEqual(
        getRacerControl(state, track, {
          ...options,
          runtime: { ...options.runtime, aiHazardPlan: () => value },
        }),
        expected,
      );
    }
  }
});

test('the device wrapper forwards opted-in plans independently of combat avoidance', () => {
  const plan = { lane: -16, speedLimit: 90 };
  const options = { laneSpeedLimit: 9, braking: 83 };
  let calls = 0,
    disposals = 0;
  const motion = {
    id: 'hazard-policy-test',
    version: 1,
    rulesId: 'unchanged-player-physics',
    aiRulesId: 'hazard-policy-v1',
    pose: grounded,
    aiHazardPlan(actualState, actualOptions) {
      assert.equal(actualState, state);
      assert.equal(actualOptions, options);
      calls++;
      return plan;
    },
    dispose() {
      disposals++;
    },
  };
  const wrapper = createDeviceRuntime({
    track,
    devices: [],
    motion,
    combatId: 'rook',
    combat: { avoidance: () => 24, resetActor() {}, unbind() {} },
  });
  try {
    assert.equal(wrapper.avoidance(), 24);
    assert.equal(wrapper.aiHazardPlan(state, options), plan);
    assert.equal(calls, 1);
    assert.equal(wrapper.aiRulesId, motion.aiRulesId);
    assert.equal(
      runtimeIdentity(wrapper).rulesId.includes(motion.aiRulesId),
      false,
    );
  } finally {
    wrapper.dispose();
  }
  assert.equal(disposals, 1);
});

test('machine-safe steering wins over traffic lane changes while ordinary traffic braking remains', () => {
  const runtime = {
    pose: grounded,
    avoidance: () => 24,
    aiHazardPlan: () => ({ lane: state.lateral }),
  };
  const options = { runtime, difficulty: 'hard', lane: 4 };
  const alone = getRacerControl(state, track, options);
  const traffic = getRacerControl(state, track, {
    ...options,
    nearby: [state, { ...state, distance: state.distance + 10, speed: 60 }],
  });
  assert.equal(
    traffic.steer,
    alone.steer,
    'keep the selected quiet machine lane',
  );
  assert.ok(
    traffic.brake > alone.brake,
    'a slower racer ahead still requires braking',
  );
  assert.ok(traffic.throttle < alone.throttle);
});

test('hazard slowing uses ordinary brake and boost controls, and airborne controls bypass the planner', () => {
  const runtime = {
    pose: grounded,
    aiHazardPlan: () => ({ lane: state.lateral, speedLimit: 90 }),
  };
  const control = getRacerControl(state, track, {
    runtime,
    difficulty: 'hard',
  });
  assert.ok(control.brake > 0);
  assert.equal(control.boost, false);
  let calls = 0;
  const airborne = {
    ...runtime,
    pose: () => ({ grounded: false }),
    aiHazardPlan() {
      calls++;
      throw new Error('ground-only policy');
    },
  };
  getRacerControl(state, track, { runtime: airborne, difficulty: 'hard' });
  assert.equal(calls, 0);
});

test('traffic already in the selected safe lane is respected before a merge, and unusable caps add no braking', () => {
  const merging = { ...state, lateral: 4 };
  const runtime = { pose: grounded, aiHazardPlan: () => ({ lane: -16 }) };
  const options = { runtime, difficulty: 'hard', lane: 4 };
  const alone = getRacerControl(merging, track, options);
  const blocked = getRacerControl(merging, track, {
    ...options,
    nearby: [
      { ...merging, lateral: -16, distance: merging.distance + 10, speed: 60 },
    ],
  });
  assert.equal(blocked.steer, alone.steer);
  assert.ok(blocked.brake > alone.brake);
  for (const speedLimit of [NaN, Infinity, 0, -50])
    assert.deepEqual(
      getRacerControl(merging, track, {
        ...options,
        runtime: {
          ...runtime,
          aiHazardPlan: () => ({ lane: -16, speedLimit }),
        },
      }),
      alone,
    );
});

test('AI policy changes invalidate competitive field checkpoints without changing player runtime identity', () => {
  const runtime = (aiRulesId) => ({
    id: 'same-runtime',
    version: 1,
    rulesId: 'same-player-physics',
    ...(aiRulesId === undefined ? {} : { aiRulesId }),
    reset() {},
    snapshot: () => null,
    dispose() {},
  });
  const first = createRacers({
    track,
    createRuntime: () => runtime('policy-1'),
  });
  const second = createRacers({
    track,
    createRuntime: () => runtime('policy-2'),
  });
  const legacy = createRacers({ track, createRuntime: () => runtime() });
  try {
    assert.deepEqual(
      runtimeIdentity(runtime('policy-1')),
      runtimeIdentity(runtime('policy-2')),
    );
    assert.notDeepEqual(first.identity, second.identity);
    assert.ok(
      first.identity.opponents.every(
        (opponent) => opponent.runtime.aiRulesId === 'policy-1',
      ),
    );
    assert.ok(
      legacy.identity.opponents.every(
        (opponent) => !Object.hasOwn(opponent.runtime, 'aiRulesId'),
      ),
    );
    assert.throws(() => second.restore(first.serialize()), /field|racer/i);
  } finally {
    first.dispose();
    second.dispose();
    legacy.dispose();
  }
});
