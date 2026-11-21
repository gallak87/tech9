import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzePracticeDocument, createDocument } from './document.js';
import { createRollRatePreview } from './roll-rate.js';

function loop() {
  const doc = createDocument({ blank: true });
  doc.points = [
    [0, 0],
    [80, 15],
    [400, 220],
    [350, 680],
    [-100, 740],
    [-420, 480],
    [-340, 140],
    [-80, 20],
  ].map(([x, z], index) => ({
    id: `point-${index}`,
    x,
    y: 80,
    z,
    bank: index / 80,
    roll: 0,
  }));
  return doc;
}

function moved(source, indices, delta) {
  const points = structuredClone(source.points);
  for (const index of indices) points[index].roll += delta;
  return points;
}

test('live rates match a fresh finished analysis across the seam, and clear when the edit is eased back', () => {
  const source = loop();
  const indices = [0];
  const preview = createRollRatePreview(source, indices);
  assert.deepEqual(preview(source.points), []);
  const points = moved(source, indices, 4.5);
  const live = preview(points);
  assert(live.some(({ start }) => start < 0.04));
  assert(live.some(({ end }) => end > 0.98));
  assert.deepEqual(
    live,
    analyzePracticeDocument({ ...source, points }).rollRateSections,
  );
  assert.deepEqual(preview(moved(source, indices, 0.1)), []);
  assert.deepEqual(preview(source.points), []);
});

test('live rates use the same gaps, authored corkscrews and changing automatic circuit return as finished validation', () => {
  const source = loop();
  source.autoCloseRoll = true;
  source.jumps = [{ id: 'test-jump', start: 0.25, end: 0.39, receiving: 150 }];
  source.rolls = [{ id: 'test-corkscrew', start: 0.48, end: 0.5, turns: 1 }];
  const indices = [0, 3, 7];
  const preview = createRollRatePreview(source, indices);
  for (const delta of [0, 1.1, 3.6, -3.6, Math.PI * 2, 0.2, 0]) {
    const points = moved(source, indices, delta);
    const live = preview(points);
    assert.deepEqual(
      live,
      analyzePracticeDocument({ ...source, points }).rollRateSections,
    );
    assert(
      !live.some(
        ({ start }) =>
          start > source.jumps[0].start && start < source.jumps[0].end,
      ),
    );
  }
});

test('downhill live rates stop at the open end and preserve unedited advisories', () => {
  const source = { ...loop(), courseType: 'downhill' };
  source.points[6].roll = 18;
  const indices = [1];
  const preview = createRollRatePreview(source, indices);
  const baseline = preview(source.points);
  assert(baseline.length);
  const points = moved(source, indices, -4);
  const live = preview(points);
  assert.deepEqual(
    live,
    analyzePracticeDocument({ ...source, points }).rollRateSections,
  );
  assert(
    live.some(({ end }) => baseline.some((interval) => interval.end === end)),
  );
  assert(live.every(({ end }) => end < 1));
});
