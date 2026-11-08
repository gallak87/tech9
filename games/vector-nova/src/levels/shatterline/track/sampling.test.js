import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { SamplingCache } from './sampling-cache.js';
import { createTubeSurface } from './tube-surface.js';
import { createWeaveAxis, rotationProgress } from './weave-axis.js';
import {
  magneticFrame,
  projectMagneticBody,
} from '../../../physics/magnetic-body.js';

// Independent pre-optimization quadrature: completed intervals are evaluated
// again here so the accelerated curve can be checked against its authoring math.
function originalAxis(zLength, deltaX) {
  const breaks = [0, 0.13, 0.5, 0.87, 1],
    beta = T.MathUtils.degToRad(75);
  const nodes = [
    -0.9602898564975363, -0.7966664774136267, -0.525532409916329,
    -0.1834346424956498, 0.1834346424956498, 0.525532409916329,
    0.7966664774136267, 0.9602898564975363,
  ];
  const weights = [
    0.1012285362903763, 0.2223810344533745, 0.3137066458778873,
    0.362683783378362, 0.362683783378362, 0.3137066458778873,
    0.2223810344533745, 0.1012285362903763,
  ];
  function integral(u, alpha) {
    const angles = [0, alpha, -beta, alpha, 0];
    let x = 0,
      z = 0;
    for (let phase = 0; phase < 4; phase++) {
      const span = breaks[phase + 1] - breaks[phase];
      const cuts = [0, 0.15, 0.85, 1].map((v) => breaks[phase] + v * span);
      for (let part = 0; part < 3; part++) {
        const low = cuts[part],
          high = Math.min(u, cuts[part + 1]);
        if (high <= low) continue;
        const half = (high - low) / 2,
          middle = (high + low) / 2;
        for (let index = 0; index < nodes.length; index++) {
          const q = middle + half * nodes[index];
          const angle = T.MathUtils.lerp(
            angles[phase],
            angles[phase + 1],
            rotationProgress((q - breaks[phase]) / span),
          );
          x += half * weights[index] * Math.sin(angle);
          z += half * weights[index] * Math.cos(angle);
        }
      }
    }
    return { x, z };
  }
  let low = 0,
    high = T.MathUtils.degToRad(85);
  for (let index = 0; index < 44; index++) {
    const middle = (low + high) / 2,
      total = integral(1, middle);
    if (total.x / total.z < deltaX / zLength) low = middle;
    else high = middle;
  }
  const alpha = (low + high) / 2,
    total = integral(1, alpha),
    length = zLength / total.z;
  return {
    length,
    point(u) {
      const p = integral(u, alpha);
      return { x: p.x * length, z: p.z * length };
    },
  };
}

test('weave prefixes preserve the authored quadrature at joins and throughout both bends', () => {
  for (const [zLength, deltaX] of [
    [1650, 210],
    [1500, -80],
    [2500, 0],
  ]) {
    const expected = originalAxis(zLength, deltaX),
      actual = createWeaveAxis(zLength, deltaX);
    assert.equal(actual.length, expected.length);
    const probes = Array.from({ length: 501 }, (_, i) => i / 500);
    for (const low of [0, 0.13, 0.5, 0.87])
      for (const offset of [-1e-10, 0, 1e-10])
        probes.push(T.MathUtils.clamp(low + offset, 0, 1));
    for (const u of probes)
      assert.deepEqual(actual.point(u), expected.point(u));
  }
});

test('weave sampling evaluates one partial interval even at the second tube', (t) => {
  const axis = createWeaveAxis(1650, 210),
    originalSin = Math.sin;
  let calls = 0;
  t.mock.method(Math, 'sin', (angle) => {
    calls++;
    return originalSin(angle);
  });
  for (const u of [0.01, 0.2, 0.55, 0.88, 0.999]) {
    calls = 0;
    axis.point(u);
    assert.equal(calls, 8);
  }
});

test('query sharing stays bounded and overwriting a key does not evict a neighbor', () => {
  const cache = new SamplingCache(3);
  cache.set(1, 'one');
  cache.set(2, 'two');
  cache.set(3, 'three');
  cache.set(2, 'updated');
  cache.set(4, 'four');
  assert.equal(cache.get(1), undefined);
  assert.equal(cache.get(2), 'updated');
  assert.equal(cache.get(3), 'three');
  for (let i = 5; i < 10000; i++) cache.set(i, i);
  assert.equal(cache.values.size, 3);
  assert.equal(cache.keys.length, 3);
});

function flatFrame(distance) {
  return {
    position: new T.Vector3(0, 0, distance),
    tangent: new T.Vector3(0, 0, 1),
    right: new T.Vector3(1, 0, 0),
    up: new T.Vector3(0, 1, 0),
    quaternion: new T.Quaternion(),
    bank: 0,
    roll: 0,
    curvature: 0,
  };
}

test('surface sharing reuses exact queries while public samples remain independent', () => {
  let samples = 0;
  const tube = createTubeSurface({
    sample(distance) {
      samples++;
      return flatFrame(distance);
    },
    start: 100,
    end: 3000,
  });
  const distance = 1200,
    lateral = 3,
    footprint = { heading: 0.13, halfWidth: 2.7, halfLength: 4.2 };
  const expected = tube.sampleSurface(distance, lateral);
  const clearance = expected.hullClearance(footprint);
  const firstSupport = expected.hullSupport(footprint);
  const calls = samples;
  const mutated = tube.sampleSurface(distance, lateral);
  mutated.position.set(900, 800, 700);
  mutated.tangent.set(1, 2, 3);
  mutated.right.set(4, 5, 6);
  mutated.up.set(7, 8, 9);
  mutated.quaternion.set(1, 1, 1, 1);
  mutated.bounds.min = 1234;
  const support = mutated.hullSupport(footprint);
  support.sheet = 999;
  const actual = tube.sampleSurface(distance, lateral);
  assert.equal(samples, calls);
  for (const field of ['position', 'tangent', 'right', 'up', 'quaternion'])
    assert.deepEqual(actual[field], expected[field]);
  assert.deepEqual(actual.bounds, expected.bounds);
  assert.equal(actual.hullClearance(footprint), clearance);
  assert.deepEqual(actual.hullSupport(footprint), firstSupport);
});

test('optional geometry queries retain exact basis and hull support without force derivatives', () => {
  let samples = 0;
  const tube = createTubeSurface({
    sample(distance) {
      samples++;
      return flatFrame(distance);
    },
    start: 100,
    end: 3000,
  });
  const geometry = tube.sampleSurface(1200, 3, { geometryOnly: true });
  assert.equal(geometry.curvature, undefined);
  const geometrySamples = samples;
  const full = tube.sampleSurface(1200, 3);
  assert.ok(
    samples > geometrySamples,
    'ordinary force queries still evaluate curvature',
  );
  assert.equal(typeof full.curvature, 'number');
  const footprint = { heading: -0.17, halfWidth: 2.7, halfLength: 4.2 };
  for (const key of [
    'position',
    'tangent',
    'right',
    'up',
    'quaternion',
    'bounds',
    'longitudinalMetric',
    'longitudinalShear',
    'period',
  ])
    assert.deepEqual(geometry[key], full[key]);
  assert.deepEqual(
    geometry.hullSupport(footprint),
    full.hullSupport(footprint),
  );
  assert.equal(
    geometry.hullClearance(footprint),
    full.hullClearance(footprint),
  );
});

test('Newton geometry queries preserve the solved coordinates and final complete force frame', () => {
  const tube = createTubeSurface({ sample: flatFrame, start: 100, end: 3000 });
  const track = {
    sample: flatFrame,
    sampleSurface: tube.sampleSurface,
    width: 50,
    length: 4000,
    closed: false,
  };
  const fullOnly = {
    ...track,
    sampleSurface: (s, l) => tube.sampleSurface(s, l),
  };
  for (const distance of [150, 480, 1200, 2690, 2950]) {
    for (const lateral of [-15, 0, 13]) {
      const original = tube.sampleSurface(distance, lateral);
      const position = original.position
        .clone()
        .addScaledVector(original.up, 0.6);
      const expected = projectMagneticBody(
        fullOnly,
        position,
        distance + 2,
        lateral - 1,
      );
      const actual = projectMagneticBody(
        track,
        position,
        distance + 2,
        lateral - 1,
      );
      assert.equal(actual.distance, expected.distance);
      assert.equal(actual.lateral, expected.lateral);
      for (const key of [
        'position',
        'tangent',
        'right',
        'up',
        'quaternion',
        'curvature',
        'longitudinalMetric',
        'longitudinalShear',
        'period',
      ])
        assert.deepEqual(actual.frame[key], expected.frame[key]);
      const forceFrame = magneticFrame(track, distance, lateral);
      assert.equal(forceFrame.curvature, original.curvature);
    }
  }
});
