import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCornerSegments } from './corner-metrics.js';

const road = (coordinates, courseType = 'circuit') => ({
  courseType,
  points: coordinates.map(([x, y, z], i) => ({
    id: `point-${i}`,
    x,
    y,
    z,
    bank: 0,
    roll: 0,
  })),
});
const loop = () =>
  road([
    [0, 52, 0],
    [400, 52, 0],
    [800, 52, 200],
    [900, 52, 600],
    [700, 52, 1000],
    [200, 52, 1100],
    [-200, 52, 800],
    [-300, 52, 300],
  ]);
const byStart = (segments, id) =>
  segments.find((segment) => segment.startPointId === id);

test('unchanged controls have exact measurements after remote editing or point insertion', () => {
  const source = loop(),
    original = structuredClone(source);
  const measured = analyzeCornerSegments(source);
  const changed = structuredClone(source);
  changed.points[5].x += 350;
  changed.points[5].y += 150;
  const remote = analyzeCornerSegments(changed);
  assert.deepEqual(remote[1], measured[1]);
  assert.notEqual(remote[4].signature, measured[4].signature);
  const inserted = structuredClone(source);
  inserted.points.splice(6, 0, {
    id: 'inserted',
    x: 0,
    y: 90,
    z: 1000,
    bank: 0,
    roll: 0,
  });
  const expanded = analyzeCornerSegments(inserted);
  assert.deepEqual(byStart(expanded, 'point-1'), measured[1]);
  assert.deepEqual(byStart(expanded, 'point-7'), measured[7]);
  assert.deepEqual(
    source,
    original,
    'measurement never mutates the authored course',
  );
});

test('measurement results are detached and signatures include endpoint attributes', () => {
  const source = loop();
  const first = analyzeCornerSegments(source);
  first[1].minRadius = 0;
  first[1].signature = 'changed';
  const next = analyzeCornerSegments(source);
  assert(next[1].minRadius > 55);
  assert.notEqual(next[1].signature, first[1].signature);
  source.points[2].bank = 0.02;
  const banked = analyzeCornerSegments(source);
  assert.notEqual(banked[1].signature, next[1].signature);
  source.points[2].roll = Math.PI / 2;
  assert.notEqual(
    analyzeCornerSegments(source)[1].signature,
    banked[1].signature,
  );
});

test('G1 separates a small turn from its independent steep climb', () => {
  const source = road([
    [-1075, 393, 30],
    [-1150, 592, 240],
    [-265, 393, 685],
    [-590, 52, -790],
    [-325, 52, -845],
    [-250, 52, -320],
    [-340, 52, 135],
    [-240, 52, 235],
    [125, 199, 30],
    [-250, 202, -230],
  ]);
  const segments = analyzeCornerSegments(source);
  assert(segments[7].minRadius < 55 || segments[8].minRadius < 55);
  assert(segments[0].maxGrade > 1);
  assert(segments[0].maxGrade > segments[7].maxGrade);
  assert(segments[7].minHorizontalRadius < 55);
  const changed = structuredClone(source);
  changed.points[8].x -= 80;
  assert.deepEqual(
    analyzeCornerSegments(changed)[0],
    segments[0],
    'the distant climb is literally unchanged',
  );
});

test('vertical crests are distinct from a horizontal turn', () => {
  const source = road(
    [
      [-100, 0, 0],
      [0, 100, 0],
      [100, 0, 0],
      [200, 100, 0],
    ],
    'downhill',
  );
  const segments = analyzeCornerSegments(source);
  assert.equal(segments.length, 3);
  assert(segments[1].minRadius < 100);
  assert.equal(segments[1].minHorizontalRadius, Infinity);
  assert(segments[1].maxGrade > 1);
});

test('open endpoints extrapolate rather than creating a fictitious closing bend', () => {
  const source = road(
    [
      [0, 0, 0],
      [200, 50, 0],
      [400, 100, 0],
    ],
    'downhill',
  );
  const segments = analyzeCornerSegments(source);
  assert.equal(segments.length, 2);
  for (const segment of segments) {
    assert.equal(segment.minRadius, Infinity);
    assert.equal(segment.minHorizontalRadius, Infinity);
    assert(Math.abs(segment.maxGrade - 0.25) < 1e-10);
    assert(segment.sampleCount >= 17 && segment.sampleCount <= 4097);
  }
  const closed = analyzeCornerSegments({ ...source, courseType: 'circuit' });
  assert.equal(closed.length, 3);
  assert(
    closed.some((segment) => segment.minRadius === 0),
    'a reversed closed seam is a real cusp',
  );
});

test('closed seam metrics use wrapped controls and reject exact reversals', () => {
  const source = loop();
  const before = analyzeCornerSegments(source);
  source.points.at(-1).x -= 100;
  const after = analyzeCornerSegments(source);
  assert.notEqual(after[0].signature, before[0].signature);
  assert.notEqual(after.at(-1).signature, before.at(-1).signature);
  assert.deepEqual(after[3], before[3]);
  const cusp = road(
    [
      [0, 0, 0],
      [100, 0, 0],
      [0, 0, 0],
      [-100, 0, 0],
    ],
    'downhill',
  );
  assert.equal(analyzeCornerSegments(cusp)[0].minRadius, 0);
  assert.equal(analyzeCornerSegments(cusp)[1].minRadius, 0);
});

test('sample work and malformed input are bounded independently of world scale', () => {
  const huge = road(
    [
      [0, 0, 0],
      [1e12, 0, 0],
    ],
    'downhill',
  );
  assert.equal(analyzeCornerSegments(huge)[0].sampleCount, 4097);
  assert.deepEqual(analyzeCornerSegments({ points: [] }), []);
  assert.deepEqual(analyzeCornerSegments({ points: [{ id: 'one' }] }), []);
  assert.throws(
    () => analyzeCornerSegments({ points: Array(257) }),
    /Too many/,
  );
  assert.throws(
    () =>
      analyzeCornerSegments(
        road([
          [0, 0, 0],
          [NaN, 0, 0],
        ]),
      ),
    /finite/,
  );
});
