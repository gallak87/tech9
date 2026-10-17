import test from 'node:test';
import assert from 'node:assert/strict';
import { createContactFeedback } from './contact-feedback.js';

const contact = (id, incomingSpeed = 20) => ({
  shape: { id, kind: 'racer' },
  incomingSpeed,
});

test('one contact episode is deduplicated independently for each collider and survives restore', () => {
  const feedback = createContactFeedback();
  const first = contact('racer-1');
  const second = contact('racer-2');
  const stronger = contact('racer-1', 40);
  assert.deepEqual(feedback.collect([first, second, stronger], 1), [
    stronger,
    second,
  ]);
  assert.deepEqual(
    feedback.collect([stronger], 1.5),
    [],
    'continuous contact cannot drain reserve repeatedly',
  );
  feedback.collect([], 1.6);
  assert.deepEqual(feedback.collect([first], 1.7), [first]);
  feedback.collect([], 1.71);
  const checkpoint = JSON.parse(JSON.stringify(feedback.snapshot()));
  assert.deepEqual(
    feedback.collect([first, second], 1.8),
    [second],
    'a fresh rival does not share another rival’s cooldown',
  );
  feedback.restore(checkpoint);
  assert.deepEqual(feedback.collect([first, second], 1.8), [second]);
  feedback.collect([], 2);
  assert.deepEqual(feedback.collect([first], 2.101), [first]);
});

test('a harmless support point cannot hide an impact on another face of that collider', () => {
  const feedback = createContactFeedback();
  const support = { ...contact('deck', 90), support: true };
  const edge = contact('deck', 20);
  assert.deepEqual(
    feedback.collect([support, edge], 1, (hit) => !hit.support),
    [edge],
  );
});
