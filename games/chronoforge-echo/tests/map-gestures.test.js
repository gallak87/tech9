import test from 'node:test';
import assert from 'node:assert/strict';
import { MapGesture } from '../src/map-gestures.js';

test('a map tap activates only once and a drag cannot turn into travel', () => {
  const gesture = new MapGesture();
  gesture.start(1, 10, 10);
  assert.equal(gesture.move(1, 12, 11), null);
  assert.equal(gesture.end(1), true);
  assert.equal(gesture.end(1), false);
  gesture.start(1, 10, 10);
  assert.equal(gesture.move(1, 20, 10).dx, 10);
  assert.equal(gesture.move(1, 25, 10).dx, 5);
  assert.equal(gesture.end(1), false);
});

test('pinching then lifting either finger never becomes a selection', () => {
  const gesture = new MapGesture();
  gesture.start(3, 0, 0);
  gesture.start(4, 100, 0);
  const movement = gesture.move(4, 150, 0);
  assert.equal(movement.factor, 1.5);
  assert.equal(movement.dx, 25);
  assert.equal(movement.x, 75);
  assert.equal(gesture.end(3), false);
  assert.equal(gesture.end(4), false);
});

test('third touches and cancellation cannot select a destination', () => {
  const gesture = new MapGesture();
  gesture.start(1, 0, 0);
  gesture.start(2, 100, 0);
  assert.equal(gesture.start(3, 50, 0), false);
  assert.equal(gesture.move(3, 150, 0), null);
  assert.equal(gesture.end(3), false);
  assert.equal(gesture.end(2, true), false);
  assert.equal(gesture.end(1), false);
  gesture.start(1, 0, 0);
  gesture.clear();
  assert.equal(gesture.end(1), false);
  gesture.start(1, 0, 0);
  assert.equal(gesture.end(1, true), false);
});
