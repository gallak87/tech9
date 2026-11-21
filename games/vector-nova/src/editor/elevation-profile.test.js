import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDocument,
  DOWNHILL_RUNOUT,
  pointRouteFractions,
} from './document.js';
import { sampleElevationProfile } from './elevation-profile.js';

const points = [
  { x: 0, y: 360, z: 0 },
  { x: 180, y: 470, z: 850 },
  { x: 610, y: 40, z: 1500 },
  { x: 1200, y: 110, z: 1300 },
];

function profile(courseType, jumps = []) {
  const doc = {
    ...createDocument({ courseType, blank: true }),
    points: points.map((point, index) => ({
      ...point,
      id: `point-${index}`,
      bank: 0,
    })),
    jumps,
  };
  return sampleElevationProfile(doc, pointRouteFractions(doc));
}

test('elevation profile follows arc-length stations and closes a circuit', () => {
  const result = profile('circuit');
  assert.equal(result.runs.length, 1);
  assert.deepEqual(result.runs[0][0], { fraction: 0, elevation: 360 });
  assert.deepEqual(result.runs[0].at(-1), { fraction: 1, elevation: 360 });
  assert.equal(result.points.length, points.length);
  assert.notEqual(result.points[1].fraction, 0.25);
  assert.equal(result.points[1].elevation, 470);
  assert(result.runs[0].includes(result.points[1]));
  assert.equal(result.finish, null);
});

test('downhill profile marks finish and leaves the jump gap unconnected', () => {
  const result = profile('downhill', [
    { id: 'air', start: 0.2, end: 0.3, receiving: 250 },
  ]);
  assert.equal(result.runs.length, 2);
  assert.equal(result.runs[0].at(-1).fraction, 0.2);
  assert.equal(result.runs[1][0].fraction, 0.3);
  assert.equal(result.runs[1].at(-1).elevation, 110);
  assert.equal(result.points.at(-1).fraction, 1);
  assert(
    Math.abs((1 - result.finish) * result.length - DOWNHILL_RUNOUT) < 1e-7,
  );
});

test('an incomplete draft does not produce a profile', () => {
  assert.equal(
    sampleElevationProfile({ points: points.slice(0, 3) }, []),
    null,
  );
});
