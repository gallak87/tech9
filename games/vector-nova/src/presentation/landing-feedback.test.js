import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLandingFeedback,
  withLandingFeedback,
} from './landing-feedback.js';

const land = (owner, time, outcome = 'landed') =>
  owner.event({
    type: 'jump-transfer',
    time,
    payload: { id: 'jump-1', from: 100, to: 300, outcome },
  });
const sample = (owner, clock, grounded = true, recovering = false) =>
  owner.sample({ clock, grounded, recovering });
const feedback = {
  hullHeave: 0,
  hullPitch: 0,
  fov: 0,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
};

test('only confirmed supported landings pulse once; repeated jump IDs work each lap', () => {
  const owner = createLandingFeedback();
  sample(owner, 1, false);
  land(owner, 2);
  assert.equal(owner.read().contact, null);
  const cue = sample(owner, 2);
  assert.equal(cue.type, 'landing-catch');
  assert.equal(cue.payload.id, 'jump-1');
  land(owner, 2);
  assert.equal(sample(owner, 2), null);
  assert.equal(sample(owner, 2.11), null);
  assert.equal(owner.read().supported, true);
  const before = structuredClone(feedback);
  const result = withLandingFeedback(feedback, owner.read());
  assert.ok(result.hullHeave < -0.15 && result.hullHeave >= -0.24);
  assert.deepEqual(feedback, before);
  assert.deepEqual(withLandingFeedback(feedback, owner.read()), result);
  sample(owner, 3);
  assert.equal(owner.read().burst, null);
  sample(owner, 4, false);
  land(owner, 5);
  assert.equal(sample(owner, 5).type, 'landing-catch');
});

test('Jump Drive does not require a jump-launch event and strength follows actual airtime', () => {
  const strengths = [0.3, 1, 3].map((duration) => {
    const owner = createLandingFeedback();
    sample(owner, 1, false);
    land(owner, 1 + duration);
    return sample(owner, 1 + duration).payload.strength;
  });
  assert.ok(strengths[0] < strengths[1] && strengths[1] < strengths[2]);
  assert.equal(strengths[2], 1);
});

test('recovery, hover chatter and unsupported or stale transfer events stay quiet', () => {
  for (const recovery of ['recovered', 'road-recovery', 'recovering']) {
    const owner = createLandingFeedback();
    sample(owner, 1, false);
    if (recovery === 'road-recovery') owner.event({ type: recovery, time: 2 });
    else land(owner, 2, recovery === 'recovering' ? 'landed' : recovery);
    assert.equal(
      sample(owner, 2, recovery !== 'recovering', recovery === 'recovering'),
      null,
    );
    assert.equal(sample(owner, 2.01), null);
    assert.equal(owner.read().contact, null);
  }
  for (const duration of [0, 0.05, 0.17]) {
    const owner = createLandingFeedback();
    sample(owner, 1, false);
    land(owner, 1 + duration);
    assert.equal(sample(owner, 1 + duration), null);
  }
  const owner = createLandingFeedback();
  sample(owner, 1, false);
  land(owner, 2);
  assert.equal(sample(owner, 2, false), null);
  assert.equal(sample(owner, 2.2), null);
  assert.equal(owner.read().burst, null);
  // Returning to support alone never manufactures a successful touchdown.
  sample(owner, 3, false);
  assert.equal(sample(owner, 5), null);
});

test('pause freezes envelopes; reduced motion and non-racing views have no camera impulse', () => {
  const owner = createLandingFeedback();
  sample(owner, 1, false);
  land(owner, 2);
  sample(owner, 2);
  sample(owner, 2.11);
  assert.deepEqual(
    withLandingFeedback(feedback, owner.read(), { mode: 'paused' }),
    withLandingFeedback(feedback, owner.read()),
  );
  for (const options of [
    { reducedMotion: true },
    { mode: 'fly' },
    { mode: 'results' },
  ])
    assert.equal(
      withLandingFeedback(feedback, owner.read(), options),
      feedback,
    );
  sample(owner, 2.12, false);
  assert.equal(withLandingFeedback(feedback, owner.read()), feedback);
});

test('reset and rewind discard presentation without persisting anything to simulation state', () => {
  const owner = createLandingFeedback();
  sample(owner, 1, false);
  land(owner, 2);
  sample(owner, 2);
  sample(owner, 0);
  assert.equal(owner.read().contact, null);
  assert.equal(sample(owner, 2), null);
  land(owner, 3);
  assert.equal(sample(owner, 3).type, 'landing-catch');
  owner.reset();
  assert.deepEqual(owner.read(), {
    clock: 0,
    contact: null,
    burst: null,
    supported: false,
  });
});
