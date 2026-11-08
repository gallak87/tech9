import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createVesperSurfaceSampler } from './surface.js';
import { createVesperTrack } from './model.js';

function fixture(offset = 0) {
  let calls = 0;
  const sample = (distance) => {
    calls++;
    const s = T.MathUtils.euclideanModulo(distance, 8192);
    const tangent = new T.Vector3(Math.sin(s / 200), 0, Math.cos(s / 200));
    const right = new T.Vector3(tangent.z, 0, -tangent.x);
    const up = tangent.clone().cross(right);
    return {
      position: new T.Vector3(
        200 * (1 - Math.cos(s / 200)) + offset,
        0,
        200 * Math.sin(s / 200),
      ),
      right,
      up,
      tangent,
      quaternion: new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(right, up, tangent),
      ),
      curvature: 1 / 200,
      bank: 0,
      roll: 0,
    };
  };
  return {
    surface: createVesperSurfaceSampler(sample, {
      start: 1024,
      end: 2048,
      length: 8192,
    }),
    calls: () => calls,
  };
}

test('Vesper repeated and periodic surface reads reuse derived data while returning independent poses', () => {
  const { surface, calls } = fixture();
  const expected = surface(1536, 8);
  const sampled = calls();
  assert.ok(sampled > 0);
  assert.deepEqual(surface(1536, 8), expected);
  assert.deepEqual(surface(1536 + 8192, 8), expected);
  assert.deepEqual(surface(1536 - 8192, 8), expected);
  assert.equal(
    calls(),
    sampled,
    'same wrapped coordinates avoid road sampling',
  );
  const changed = surface(1536, 8);
  for (const key of ['position', 'right', 'up', 'tangent'])
    changed[key].set(900, 800, 700);
  changed.quaternion.set(1, 2, 3, 4);
  changed.bounds.min = -900;
  changed.curvature = 900;
  assert.deepEqual(surface(1536, 8), expected);
  assert.equal(calls(), sampled, 'defensive copies protect cached values');
  assert.equal(surface(100, 8), undefined);
  assert.equal(calls(), sampled, 'ordinary shelves do not populate the memo');
});

test('Vesper surface memos are bounded and independent between routes and lane coordinates', () => {
  const first = fixture();
  const second = fixture(1000);
  const expected = first.surface(1060, 8);
  const other = second.surface(1060, 8);
  assert.ok(Math.abs(other.position.x - expected.position.x - 1000) < 1e-10);
  const lane = first.surface(1060, -8);
  assert.ok(lane.position.distanceTo(expected.position) > 15.9);
  assert.notEqual(lane.longitudinalMetric, expected.longitudinalMetric);
  for (let i = 0; i < 2000; i++) first.surface(1100 + i / 4, 8);
  const before = first.calls();
  assert.deepEqual(first.surface(1060, 8), expected);
  assert.ok(first.calls() > before, 'old derived entries are evicted');
  assert.deepEqual(second.surface(1060, 8), other);
});

test('Vesper lane curvature matches a known offset circle and the finite lane-tangent derivative', () => {
  const { surface } = fixture();
  for (const lateral of [-8, 0, 8])
    assert.ok(
      Math.abs(surface(1536, lateral).curvature - 1 / (200 - lateral)) < 1e-11,
    );
  const track = createVesperTrack();
  const roll = track.inversions[0];
  for (let distance = roll.start + 2; distance < roll.end - 2; distance += 7.3)
    for (const lateral of [-8, 0, 8]) {
      const frame = track.sampleSurface(distance, lateral);
      // The old metre-wide stencil smooths cached-curve corners more than
      // the ribbon's quarter-metre stencil. Check both approximations.
      for (const [delta, tolerance] of [
        [1, 0.0006],
        [0.25, 0.00005],
      ]) {
        const before = track.sampleSurface(distance - delta, lateral);
        const after = track.sampleSurface(distance + delta, lateral);
        const estimate = after.tangent
          .sub(before.tangent)
          .divideScalar(2 * delta * frame.longitudinalMetric)
          .dot(frame.right);
        assert.ok(
          Math.abs(estimate - frame.curvature) < tolerance,
          `${distance}m/${lateral}: finite derivative ${estimate} vs ${frame.curvature}`,
        );
      }
    }
});
