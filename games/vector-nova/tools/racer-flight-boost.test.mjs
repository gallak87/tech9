import assert from 'node:assert/strict';
import test from 'node:test';
import { createVehicleState } from '../src/physics/index.js';
import { getRacerControl } from '../src/race/racers.js';
import { Vector3 } from 'three';

const state = Object.freeze({
  ...createVehicleState(),
  distance: 100,
  speed: 150,
  energy: 100,
});
const jump = Object.freeze({
  id: 'boost-contract',
  takeoff: 100,
  landingStart: 400,
  landingEnd: 1200,
});
const track = Object.freeze({ closed: false, jumps: [jump] });
const runtime = Object.freeze({ pose: () => ({ grounded: false }) });
const input = (course = track, difficulty = 'hard') =>
  getRacerControl(state, course, { runtime, difficulty });

test('airborne boost defaults remain identical when the optional policy is absent or does not return a boolean', () => {
  const expected = {
    throttle: 1,
    brake: 0,
    steer: 0,
    boost: true,
    airbrake: false,
  };
  assert.deepEqual(input(), expected);
  assert.deepEqual(input(track, 'easy'), { ...expected, boost: false });
  for (const value of [undefined, null, 0, 1, 'true', {}]) {
    assert.deepEqual(input({ ...track, aiFlightBoost: () => value }), expected);
    assert.deepEqual(input({ ...track, aiFlightBoost: () => value }, 'easy'), {
      ...expected,
      boost: false,
    });
  }
});

test('an opted-in boolean policy changes only the ordinary boost button and receives the real driver context', () => {
  let calls = 0;
  const coast = input({
    ...track,
    aiFlightBoost: (actualState, actualJump, context) => {
      calls++;
      assert.equal(actualState, state);
      assert.equal(actualJump, jump);
      assert.equal(context.runtime, runtime);
      assert.equal(context.defaultBoost, true);
      assert.equal(context.allowBoost, true);
      return false;
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(coast, {
    throttle: 1,
    brake: 0,
    steer: 0,
    boost: false,
    airbrake: false,
  });
  const short = { ...track, jumps: [{ ...jump, landingEnd: 800 }] };
  assert.equal(input(short).boost, false);
  assert.deepEqual(input({ ...short, aiFlightBoost: () => true }), {
    ...coast,
    boost: true,
  });
});

test('launch intent context preserves two-argument hooks and absent defaults across difficulties', () => {
  const groundRuntime = { pose: () => ({ grounded: true }) };
  const target = new Vector3(18, 0, 800);
  const course = {
    closed: false,
    width: 50,
    length: 2000,
    jumps: [{ ...jump, takeoff: 250, targetSpeed: 150 }],
    sample: (distance) => ({
      position: new Vector3(0, 0, distance),
      tangent: new Vector3(0, 0, 1),
      right: new Vector3(1, 0, 0),
      up: new Vector3(0, 1, 0),
      curvature: 0,
    }),
  };
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const drive = (track) =>
      getRacerControl(state, track, { difficulty, runtime: groundRuntime });
    const legacy = drive({
      ...course,
      aiLaunchTarget: (actualState, actualJump) => {
        assert.equal(actualState, state);
        assert.equal(actualJump, course.jumps[0]);
        return target;
      },
    });
    let calls = 0;
    const contextual = drive({
      ...course,
      aiLaunchTarget: (actualState, actualJump, context) => {
        calls++;
        assert.equal(actualState, state);
        assert.equal(actualJump, course.jumps[0]);
        assert.equal(context.runtime, groundRuntime);
        assert.equal(context.allowBoost, difficulty === 'hard');
        return target;
      },
    });
    assert.equal(calls, 1);
    assert.deepEqual(contextual, legacy);
    assert.deepEqual(
      drive({ ...course, aiLaunchTarget: () => undefined }),
      drive(course),
    );
  }
});
