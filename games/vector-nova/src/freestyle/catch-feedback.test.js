import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freestyleCatchImpulse,
  withFreestyleCatchFeedback,
} from './catch-feedback.js';

const feedback = {
  hullHeave: 0,
  hullPitch: 0,
  fov: 0,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
};

test('the seat follows confirmed contact, stays bounded and does not mutate the shared feedback', () => {
  const pending = { clock: 2.11, pendingLanding: { elapsed: 0.11 }, legs: [] };
  assert.equal(
    freestyleCatchImpulse({ ...pending, flight: { id: 'transfer-1' } }).seat,
    0,
  );
  const result = withFreestyleCatchFeedback(feedback, pending);
  assert.equal(result.hullHeave, -0.24);
  assert.deepEqual(feedback, {
    hullHeave: 0,
    hullPitch: 0,
    fov: 0,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
  });
  assert.deepEqual(
    withFreestyleCatchFeedback(feedback, pending),
    result,
    'paused/repeated frames never accumulate a displacement',
  );
  assert.equal(
    freestyleCatchImpulse({ ...pending, pendingLanding: { elapsed: 0.23 } })
      .seat,
    0,
  );
});

test('only a banked landing adds lock emphasis; reduced motion and non-racing screens stay quiet', () => {
  const data = {
    clock: 2.4,
    legs: [{ landed: true, touchdownAt: 2, at: 2.3 }],
  };
  assert.ok(freestyleCatchImpulse(data).lock > 0);
  assert.equal(
    freestyleCatchImpulse({
      ...data,
      legs: [{ ...data.legs[0], landed: false }],
    }).lock,
    0,
  );
  for (const options of [
    { reducedMotion: true },
    { mode: 'fly' },
    { mode: 'results' },
  ])
    assert.equal(withFreestyleCatchFeedback(feedback, data, options), feedback);
  assert.deepEqual(freestyleCatchImpulse({ clock: 0, legs: [] }), {
    seat: 0,
    lock: 0,
  });
  assert.equal(
    freestyleCatchImpulse({
      clock: 1,
      legs: [{ landed: true, touchdownAt: 2, at: 2.3 }],
    }).lock,
    0,
  );
});
