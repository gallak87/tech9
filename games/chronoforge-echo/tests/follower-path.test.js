import test from 'node:test';
import assert from 'node:assert/strict';
import {
  followerPosition,
  FOLLOW_PATH_STEP,
  FOLLOW_DISTANCE,
} from '../src/follower-path.js';

test('walking and running followers advance continuously, including between breadcrumb samples', () => {
  for (const speed of [330, 490])
    for (const distance of [FOLLOW_DISTANCE, 2 * FOLLOW_DISTANCE]) {
      let previous = null;
      for (let frame = 0; frame < 180; frame++) {
        const x = 500 + (frame * speed) / 60,
          head = Math.floor(x / FOLLOW_PATH_STEP) * FOLLOW_PATH_STEP;
        const path = Array.from({ length: 180 }, (_, i) => ({
          x: head - i * FOLLOW_PATH_STEP,
          y: 600,
          facing: 'right',
        }));
        const position = followerPosition(
          path,
          { x, y: 600, facing: 'right' },
          distance,
        );
        assert.ok(
          Math.abs(position.x - (x - distance)) < 1e-9,
          'Maintains the exact trailing distance',
        );
        assert.equal(position.y, 600);
        if (previous)
          assert.ok(
            Math.abs(position.x - previous.x - speed / 60) < 1e-9,
            'No 3/6-unit jumping at breadcrumb boundaries',
          );
        previous = position;
      }
    }
});

test('followers stay on the recorded route around corners instead of cutting across obstacles', () => {
  const path = [
    { x: 6, y: 0, facing: 'right' },
    { x: 3, y: 0, facing: 'right' },
    { x: 0, y: 0, facing: 'up' },
    { x: 0, y: 3, facing: 'up' },
    { x: 0, y: 6, facing: 'up' },
    { x: 0, y: 9, facing: 'up' },
  ];
  const leader = { x: 7.5, y: 0, facing: 'right' },
    before = structuredClone(path);
  assert.deepEqual(followerPosition(path, leader, 3), {
    x: 4.5,
    y: 0,
    facing: 'right',
  });
  assert.deepEqual(followerPosition(path, leader, 9), {
    x: 0,
    y: 1.5,
    facing: 'up',
  });
  assert.deepEqual(path, before, 'Sampling never changes the route');
});

test('short or initially blocked histories hold their last safe point', () => {
  const leader = { x: 100, y: 200, facing: 'left' };
  assert.deepEqual(followerPosition([], leader, 72), leader);
  const path = [
    { x: 102, y: 200, facing: 'left' },
    { x: 105, y: 200, facing: 'left' },
  ];
  assert.deepEqual(followerPosition(path, leader, 144), path[1]);
  const blocked = Array.from({ length: 160 }, () => ({ ...leader }));
  assert.deepEqual(followerPosition(blocked, leader, 72), leader);
});
