import test from 'node:test';
import assert from 'node:assert/strict';
import {
  completionPlaybackTiming,
  completionShotPlan,
} from './completion-timeline.js';

test('credits begin one second after the actual stop, independently of capture duration', () => {
  const first = completionPlaybackTiming({
    duration: 24,
    landmarks: { finishTime: 14.2, slideStopTime: 17.75 },
  });
  const longerCapture = completionPlaybackTiming({
    duration: 30,
    landmarks: { finishTime: 14.2, slideStopTime: 17.75 },
  });
  assert.deepEqual(first, longerCapture);
  assert.equal(first.stopTime, 17.75);
  assert.equal(first.creditsAt, 18.75);
  assert.equal(first.dialogFadeSeconds, 0.7);
});

test('each racer uses its own stop and preserves the full one-second hold', () => {
  for (const slideStopTime of [16.125, 16.8, 17.075, 18.2]) {
    const timing = completionPlaybackTiming({
      duration: slideStopTime + 1,
      landmarks: { finishTime: 14, slideStopTime },
    });
    assert.equal(timing.creditsAt - slideStopTime, 1);
    assert.ok(slideStopTime + 0.999 < timing.creditsAt);
  }
});

test('the camera plan ends with the held stop instead of a fixed capture-end title', () => {
  const plan = completionShotPlan({
    duration: 24,
    landmarks: {
      launchTime: 6,
      landingTime: 11,
      finishTime: 14.2,
      slideStartTime: 14.7,
      slideStopTime: 17.75,
    },
  });
  assert.equal(plan.duration, 18.75);
  assert.equal(plan.shots.at(-1).id, 'exit');
  assert.equal(plan.shots.at(-1).end, 18.75);
  assert.ok(!Object.hasOwn(plan, 'titleStart'));
});

test('an unfinished stop or insufficient held recording cannot cut directly to credits', () => {
  for (const run of [
    { duration: 20, landmarks: { finishTime: 14 } },
    { duration: 20, landmarks: { finishTime: 14, slideStopTime: 13 } },
    { duration: 18, landmarks: { finishTime: 14, slideStopTime: 17.5 } },
    {
      duration: 20,
      landmarks: { finishTime: 14, slideStopTime: Number.NaN },
    },
  ])
    assert.throws(() => completionPlaybackTiming(run), /one-second hold/);
});
