import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelativeTiming } from './relative-timing.js';

test('relative gaps measure passage at the same unwrapped course point, independent of current speed and lap clocks', () => {
  const timing = createRelativeTiming(['leader', 'follower']);
  timing.reset({ leader: 0, follower: 0 });
  timing.update('leader', 10, 1);
  timing.update('leader', 20, 2);
  timing.update('follower', 10, 1.4);
  timing.update('follower', 15, 2.3);
  assert.ok(Math.abs(timing.gap('leader', 'follower', 2.3) - 0.8) < 1e-10);
  timing.update('leader', 20, 3);
  timing.update('follower', 15, 3);
  assert.equal(timing.gap('leader', 'follower', 3), 1.5);
  timing.reset({ leader: 4990, follower: 4980 });
  timing.update('leader', 5010, 2);
  timing.update('follower', 5000, 3);
  assert.equal(timing.gap('leader', 'follower', 3), 2);
  assert.equal(timing.gap('follower', 'leader', 3), null);
});

test('recovery clears invalid passage history; pause and rollback preserve timing; storage stays bounded', () => {
  const timing = createRelativeTiming(['leader', 'follower'], {
    interval: 0.1,
    window: 2,
  });
  timing.reset({ leader: 0, follower: -12 });
  for (let tick = 1; tick <= 1200; tick++) {
    timing.update('leader', tick, tick / 120);
    timing.update('follower', tick - 12, tick / 120);
  }
  const saved = timing.serialize();
  assert.ok(saved.leader.samples.length <= 22);
  assert.ok(Math.abs(timing.gap('leader', 'follower', 10) - 0.1) < 1e-10);
  assert.deepEqual(timing.serialize(), saved);
  timing.update('leader', 100, 11);
  assert.equal(timing.gap('leader', 'follower', 11), null);
  timing.restore(saved);
  assert.deepEqual(timing.serialize(), saved);
  const invalid = structuredClone(saved);
  invalid.leader.samples[0][1] = NaN;
  assert.throws(() => timing.restore(invalid), /mismatch/);
  assert.deepEqual(timing.serialize(), saved);
});
