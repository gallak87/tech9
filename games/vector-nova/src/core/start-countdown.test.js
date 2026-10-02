import test from 'node:test';
import assert from 'node:assert/strict';
import { createStartCountdown } from './start-countdown.js';

test('start lights count real time, freeze on pause and emit GO once', () => {
  let time = 100;
  const countdown = createStartCountdown({ now: () => time });
  countdown.begin();
  assert.equal(countdown.advance(), 3);
  time += 1000;
  assert.equal(countdown.advance(), 2);
  time += 400;
  countdown.pause();
  const frozen = countdown.snapshot();
  time += 5000;
  assert.equal(countdown.advance(), null);
  assert.deepEqual(countdown.snapshot(), frozen);
  countdown.resume();
  time += 600;
  assert.equal(countdown.advance(), 1);
  time += 1000;
  assert.equal(countdown.advance(), 0);
  assert.equal(countdown.advance(), null);
  countdown.begin();
  countdown.cancel();
  time += 5000;
  assert.equal(countdown.advance(), null);
});
