import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPLETION_DURATION,
  COMPLETION_FINISH,
  COMPLETION_CUES,
  COMPLETION_SHOTS,
  sampleCompletionTimeline,
} from './completion-timeline.js';

test('the overtake puts the player above a real rival at their crossing', () => {
  const before = sampleCompletionTimeline(8.2);
  const after = sampleCompletionTimeline(11.2);
  assert.ok(before.hero.z < before.rook.z);
  assert.ok(after.hero.z > after.rook.z);
  let crossing;
  for (let time = 8.2; time <= 11.2; time += 0.005) {
    const sample = sampleCompletionTimeline(time);
    if (Math.abs(sample.hero.z - sample.rook.z) < 0.2) {
      crossing = sample;
      break;
    }
  }
  assert.ok(crossing);
  assert.ok(crossing.hero.y - crossing.rook.y > 8);
  assert.equal(crossing.shot, 'overtake');
});

test('checker crossing precedes a continuous controlled stop', () => {
  assert.equal(sampleCompletionTimeline(16.6).hero.z, COMPLETION_FINISH);
  let previous = sampleCompletionTimeline(16.6).hero;
  for (let time = 16.61; time <= 21; time += 0.01) {
    const { hero } = sampleCompletionTimeline(time);
    assert.ok(hero.z >= previous.z);
    assert.ok(Math.hypot(hero.x - previous.x, hero.z - previous.z) < 1);
    assert.ok(hero.speed >= 0);
    previous = hero;
  }
  assert.equal(sampleCompletionTimeline(21).hero.speed, 0);
  assert.equal(sampleCompletionTimeline(COMPLETION_DURATION).finished, true);
});

test('all camera shots and authored audio cues fit the film', () => {
  assert.equal(COMPLETION_SHOTS[0].start, 0);
  assert.equal(COMPLETION_SHOTS.at(-1).end, COMPLETION_DURATION);
  for (let index = 1; index < COMPLETION_SHOTS.length; index++)
    assert.equal(
      COMPLETION_SHOTS[index].start,
      COMPLETION_SHOTS[index - 1].end,
    );
  assert.ok(
    COMPLETION_CUES.every(({ time }) => time > 0 && time < COMPLETION_DURATION),
  );
  for (let time = 0; time < COMPLETION_DURATION; time += 0.1) {
    const sample = sampleCompletionTimeline(time);
    assert.ok(sample.camera.position.every(Number.isFinite));
    assert.ok(sample.camera.target.every(Number.isFinite));
    assert.ok(sample.hero.y >= 0.6);
  }
  assert.deepEqual(
    sampleCompletionTimeline(Infinity),
    sampleCompletionTimeline(0),
  );
});
