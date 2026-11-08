import test from 'node:test';
import assert from 'node:assert/strict';
import { magneticFrame } from '../src/physics/magnetic-body.js';
import { RACE_GRID } from '../src/race/roster.js';

const EPSILON = 0.001;
const ANGLE_TOLERANCE = 0.001;
const angleDifference = (a, b) =>
  Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

function continuous(before, after, label) {
  assert.ok(
    before.position.distanceTo(after.position) < EPSILON * 4,
    `${label}: position jumps across a ${EPSILON * 2}m interval`,
  );
  for (const axis of ['tangent', 'right', 'up']) {
    const angle = before[axis].angleTo(after[axis]);
    assert.ok(
      angle < ANGLE_TOLERANCE,
      `${label}: ${axis} jumps by ${(angle * 180) / Math.PI} degrees`,
    );
  }
  assert.ok(
    angleDifference(before.bank ?? 0, after.bank ?? 0) < ANGLE_TOLERANCE,
    `${label}: bank jumps across the seam`,
  );
}

for (const slug of [
  'halcyon',
  'orbital',
  'nacre',
  'glasswake',
  'cindercoil',
  'saffron',
  'umbra',
  'helion',
  'zephyr',
  'vesper-forest',
  'shatterline',
  'colossus',
  'worldspire',
  'nightweir',
]) {
  test(`${slug}: the start line and every grid row have continuous road frames`, async () => {
    const level = (await import(`../src/levels/${slug}/index.js`)).default({
      shape: true,
    });
    const track = await level.createTrack();
    const start = track.sample(0);
    // Separate checks against the exact endpoint catch degenerate one-sided
    // banking calculations, even when both neighboring samples agree.
    continuous(track.sample(-EPSILON), start, 'approaching the start line');
    continuous(start, track.sample(EPSILON), 'leaving the start line');
    for (const { distance, lateral } of Object.values(RACE_GRID)) {
      continuous(
        magneticFrame(track, distance - EPSILON, lateral),
        magneticFrame(track, distance + EPSILON, lateral),
        `grid ${distance}m, lateral ${lateral}m`,
      );
    }
    if (track.closed !== false) {
      continuous(
        track.sample(track.length - EPSILON),
        track.sample(track.length + EPSILON),
        'the next lap crosses the start line',
      );
      continuous(track.sample(track.length), start, 'the lap endpoint');
    }
  });
}
