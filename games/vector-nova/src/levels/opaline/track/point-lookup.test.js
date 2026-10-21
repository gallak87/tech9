import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createClosedPointLookup } from './point-lookup.js';
import { createOpalineTrack } from './model.js';

test('periodic cubic lookup retains baked points and a smooth closed seam', () => {
  const count = 256,
    period = 200,
    points = new Float64Array(count * 3);
  const exact = (s) =>
    new Vector3(
      30 * Math.cos((s / period) * Math.PI * 2),
      2 * Math.sin((s / period) * Math.PI * 4),
      30 * Math.sin((s / period) * Math.PI * 2),
    );
  for (let i = 0; i < count; i++)
    exact((i * period) / count).toArray(points, i * 3);
  const sample = createClosedPointLookup(points, period);
  for (let i = 0; i < count; i++) {
    const s = (i * period) / count;
    assert.ok(sample(s).distanceTo(exact(s)) < 1e-12);
    assert.ok(sample(s + 0.27).distanceTo(exact(s + 0.27)) < 0.00001);
    assert.ok(sample(s - period).distanceTo(sample(s)) < 1e-12);
  }
  assert.deepEqual(sample(0), sample(period));
  const before = sample(-0.0001).sub(sample(-0.0011)).normalize();
  const after = sample(0.0011).sub(sample(0.0001)).normalize();
  assert.ok(before.angleTo(after) < 0.0001);
  const target = new Vector3();
  assert.equal(sample(25, target), target);
});

// Exact pre-lookup evaluator samples: both jump lips, grade joins, the lap seam,
// and the dense audit's largest position/orientation differences. Millimetre
// tolerance protects the approved route while permitting its baked lookup.
const REFERENCE = [
  [
    0,
    [0, 100, -564.6402054422701],
    [0.9999999452233778, 0.00033098828040518366, 0],
  ],
  [
    197.5,
    [195.94061350804915, 123.98403463164897, -564.6402054422701],
    [0.9925809929248498, 0.12158524780712247, 0],
  ],
  [
    197.63098098279357,
    [196.0706486628569, 124, -564.6402054422701],
    [0.9926915538192068, 0.12067924003741677, 0],
  ],
  [
    288.09688019848113,
    [284.0706484595733, 106, -564.6402054422701],
    [0.9999994551472908, -0.0010438894200728995, 0],
  ],
  [
    1819,
    [499.07525666543853, 36.277749595943824, 244.45462026179035],
    [0.8293119109029825, 0.09270036307695131, 0.5510430084120884],
  ],
  [
    3404.0773797372285,
    [-236.28521452240034, 154, 544.7117276031312],
    [-0.9904299173475887, 0.1380165889407821, 0],
  ],
  [
    3507.3410250288794,
    [-336.28521418643066, 132, 544.7117276031312],
    [-0.999999501139158, -0.0009988600677043372, 0],
  ],
  [
    4681.125,
    [-348.5894648729685, 54.67846158803374, 27.505295862774183],
    [-0.04870913239130518, -0.06428180029815404, -0.9967423290761331],
  ],
];

test('optimized Opaline sampling preserves approved route poses, distance and jump ownership', () => {
  const track = createOpalineTrack();
  assert.equal(track.length, 5956.096507648348);
  assert.deepEqual(
    track.jumps.map(({ takeoff, landingStart }) => [takeoff, landingStart]),
    [
      [197.63098098279357, 288.09688019848113],
      [3404.0773797372285, 3507.3410250288794],
    ],
  );
  for (const [s, position, tangent] of REFERENCE) {
    const frame = track.sample(s);
    assert.ok(
      frame.position.distanceTo(new Vector3(...position)) < 0.0012,
      `position at ${s}`,
    );
    assert.ok(
      frame.tangent.angleTo(new Vector3(...tangent)) < 0.00065,
      `tangent at ${s}`,
    );
    assert.ok(
      frame.position.distanceTo(track.sample(s + track.length).position) < 1e-8,
    );
  }
  assert.ok(track.sample(-0.001).up.angleTo(track.sample(0.001).up) < 0.00001);
});
