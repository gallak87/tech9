import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createReferenceFrames, framePoint } from './frames.js';
import {
  sweepGeometry,
  boxProfile,
  beamTransform,
  roadSealGeometry,
} from './geometry.js';

function straight(reuse = false) {
  const frame = {
    position: new T.Vector3(),
    right: new T.Vector3(1, 0, 0),
    up: new T.Vector3(0, 1, 0),
    tangent: new T.Vector3(0, 0, 1),
  };
  return {
    length: 20,
    width: 8,
    sample(distance) {
      frame.position.z = distance;
      return reuse
        ? frame
        : Object.fromEntries(
            Object.entries(frame).map(([key, value]) => [key, value.clone()]),
          );
    },
  };
}

test('shared frame transport is continuous through vertical directions and a closed seam', () => {
  const count = 800;
  const tangents = Array.from(
    { length: count + 1 },
    (_, i) =>
      new T.Vector3(
        0,
        Math.sin((i * Math.PI * 2) / count),
        Math.cos((i * Math.PI * 2) / count),
      ),
  );
  const originals = tangents.map((t) => t.clone());
  const frames = createReferenceFrames(tangents, 0.5);
  assert.ok(frames[0].angleTo(frames.at(-1)) < 1e-6);
  frames.forEach((q, i) => {
    assert.ok(Math.abs(q.length() - 1) < 1e-8);
    assert.ok(
      new T.Vector3(0, 0, 1).applyQuaternion(q).distanceTo(tangents[i]) < 1e-8,
    );
    if (i) assert.ok(q.angleTo(frames[i - 1]) < 0.03);
    assert.deepEqual(tangents[i], originals[i]);
  });
  assert.equal(
    createReferenceFrames(
      [new T.Vector3(0, 1, 0), new T.Vector3(0, 1, 0)],
      1,
      false,
    ).length,
    2,
  );
});

test('reference frames reject undersampling and malformed inputs before producing invalid quaternions', () => {
  const forward = new T.Vector3(0, 0, 1);
  for (const step of [0, -1, Infinity, NaN])
    assert.throws(
      () => createReferenceFrames([forward, forward], step),
      /step/,
    );
  assert.throws(() => createReferenceFrames([forward], 1), /at least two/);
  assert.throws(
    () => createReferenceFrames([forward, new T.Vector3()], 1),
    /unit tangent/,
  );
  assert.throws(
    () => createReferenceFrames([forward, forward.clone().negate()], 1, false),
    /antiparallel/,
  );
  assert.throws(
    () => createReferenceFrames([forward, new T.Vector3(1, 0, 0)], 1),
    /seam tangent/,
  );
});

test('sweeps preserve scratch sampler results, hard profile edges and caller range', () => {
  const options = { start: -4, end: 25, step: 6, uvScale: 2 };
  const profile = boxProfile(0, -1, 8, 2);
  const a = sweepGeometry(straight(), profile, options);
  const b = sweepGeometry(straight(true), profile, options);
  try {
    assert.deepEqual(
      a.getAttribute('position').array,
      b.getAttribute('position').array,
    );
    assert.equal(a.getAttribute('position').count, 4 * 6 * 2);
    assert.equal(a.index.count, 4 * 5 * 6);
    assert.deepEqual(
      Array.from(a.getAttribute('uv').array.slice(0, 4)),
      [0, -2, 1, -2],
    );
    for (const name of ['position', 'normal', 'uv'])
      assert.ok(Array.from(a.getAttribute(name).array).every(Number.isFinite));
    const frame = straight().sample(3);
    assert.deepEqual(framePoint(frame, 2, 4, 5).toArray(), [2, 4, 8]);
    assert.deepEqual(frame.position.toArray(), [0, 0, 3]);
  } finally {
    a.dispose();
    b.dispose();
  }
});

test('sweeps handle shorter-than-step spans and reject bad ranges, profiles and runaway allocations', () => {
  const track = straight();
  const profile = [
    [-4, 0],
    [4, 0],
  ];
  const geometry = sweepGeometry(track, profile, {
    start: 1,
    end: 1.01,
    step: 6,
  });
  assert.equal(geometry.getAttribute('position').count, 4);
  geometry.dispose();
  for (const options of [
    { step: 0 },
    { step: Infinity },
    { uvScale: 0 },
    { end: 0 },
    { start: NaN },
    { end: -1 },
    { step: 1e-10 },
  ])
    assert.throws(() => sweepGeometry(track, profile, options));
  for (const invalid of [
    [],
    [[0, 0]],
    [
      [0, 0],
      [0, NaN],
    ],
    [
      [0, 0],
      [0, 0],
    ],
    [
      [0, 0, 1],
      [2, 0],
    ],
  ])
    assert.throws(() => sweepGeometry(track, invalid));
  assert.throws(
    () => sweepGeometry({ ...track, sample: () => ({}) }, profile),
    /Sweep position/,
  );
  assert.throws(
    () => beamTransform(new T.Vector3(), new T.Vector3()),
    /Beam length/,
  );
  assert.throws(() => boxProfile(0, 0, -1, 1), /Box width/);
});

test('road seals reject invalid step and malformed surfaces rather than hanging', () => {
  const track = straight();
  const surface = sweepGeometry(track, [
    [-4, 0],
    [4, 0],
  ]);
  try {
    for (const options of [
      { spacing: 0 },
      { spacing: -1 },
      { spacing: 1e-12 },
      { breadth: 0 },
      { breadth: 21 },
      { offset: NaN },
    ])
      assert.throws(() => roadSealGeometry(track, surface, options));
    const malformed = new T.BufferGeometry();
    assert.throws(() => roadSealGeometry(track, malformed), /two-point sweep/);
    malformed.dispose();
  } finally {
    surface.dispose();
  }
});
