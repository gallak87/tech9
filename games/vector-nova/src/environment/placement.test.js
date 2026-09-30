import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createRouteClearance, groundFrame } from './placement.js';

function route(roll = 0) {
  const quaternion = new T.Quaternion().setFromAxisAngle(
    new T.Vector3(0, 0, 1),
    roll,
  );
  return {
    length: 83,
    width: 10,
    sample(distance) {
      return {
        position: new T.Vector3(0, 100, distance),
        right: new T.Vector3(1, 0, 0).applyQuaternion(quaternion),
        up: new T.Vector3(0, 1, 0).applyQuaternion(quaternion),
        tangent: new T.Vector3(0, 0, 1),
      };
    },
  };
}

test('clearance accepts real object elevations without a flat terrain contract', () => {
  const clearance = createRouteClearance(route(), {
    sidePadding: 0,
    localVertical: [-2, 3],
    spacing: 3,
    longitudinalHalfLength: 4,
  });
  assert.equal(clearance.clears(0, 40, 2, 2, 95, 0, 90), true);
  assert.equal(clearance.clears(0, 40, 2, 2, 101, 0, 99), false);
  assert.equal(clearance.clears(0, 40, 2, 2, 120, 0, 110), true);
  assert.equal(clearance.clears(9, 40, 2, 2, 101, 0, 99), true);
  assert.equal(clearance.clears(0, 82, 2, 2, 101, 0, 99), false);
  assert.throws(() => clearance.clears(0, 40, 2, 2, 101), /supply bottom/);
  assert.equal(clearance.sampleCount, 28);
});

test('custom clearance envelopes follow sideways and inverted road frames', () => {
  const options = { sidePadding: 0, localVertical: [-2, 12] };
  const inverted = createRouteClearance(route(Math.PI), options);
  assert.equal(inverted.clears(0, 40, 2, 2, 91, 0, 90), false);
  assert.equal(inverted.clears(0, 40, 2, 2, 110, 0, 109), true);
  const sideways = createRouteClearance(route(Math.PI / 2), options);
  assert.equal(sideways.clears(-10, 40, 2, 2, 101, 0, 99), false);
  assert.equal(sideways.clears(10, 40, 2, 2, 101, 0, 99), true);
});

test('clearance rejects invalid sampling, support bounds and object dimensions', () => {
  for (const options of [
    { spacing: 0 },
    { spacing: 1e-12 },
    { sidePadding: -1 },
    { localVertical: [2, 1] },
    { localVertical: [0, NaN] },
    { longitudinalHalfLength: 0 },
  ])
    assert.throws(() => createRouteClearance(route(), options));
  assert.throws(
    () =>
      createRouteClearance({
        ...route(),
        supportFootprints: [
          { x: 0, z: 0, halfX: 1, halfZ: 1, minY: 5, maxY: 2 },
        ],
      }),
    /support footprint/,
  );
  const clearance = createRouteClearance(route());
  assert.throws(
    () => clearance.clears(0, 0, 0, 2, 110, 0, 90),
    /object clearance/,
  );
  assert.throws(
    () => clearance.clears(0, 0, 2, 2, 90, 0, 110),
    /object clearance/,
  );
  assert.throws(() => clearance.clears(0, 0, 2, 2, 110, NaN, 90), /finite/);
});

test('ground-frame fallback stays finite at a vertical tangent with a reused sampler', () => {
  const frame = { position: new T.Vector3(), tangent: new T.Vector3(0, 1, 0) };
  const track = {
    sample(distance) {
      frame.position.set(0, distance, distance * distance);
      return frame;
    },
  };
  const site = groundFrame(track, 10);
  assert.deepEqual(site.position.toArray(), [0, 10, 100]);
  assert.equal(site.tangent.y, 0);
  assert.ok(Math.abs(site.tangent.length() - 1) < 1e-10);
});

test('transformed part bounds include the actual rotated and mirrored geometry without owning it', async () => {
  const { transformedPartBounds } = await import('./bounds.js');
  const geometry = new T.BoxGeometry(2, 4, 6);
  const parent = new T.Matrix4().makeTranslation(10, 20, 30);
  const local = new T.Matrix4().compose(
    new T.Vector3(),
    new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 2),
    new T.Vector3(-2, 1, 1),
  );
  const [bounds] = transformedPartBounds([{ geometry, matrix: local }], parent);
  assert.ok(bounds.min.distanceTo(new T.Vector3(7, 18, 28)) < 1e-8);
  assert.ok(bounds.max.distanceTo(new T.Vector3(13, 22, 32)) < 1e-8);
  assert.deepEqual(geometry.boundingBox.min.toArray(), [-1, -2, -3]);
  assert.throws(
    () => transformedPartBounds([{ geometry, matrix: null }]),
    /Invalid geometry or matrix/,
  );
  const invalid = new T.Matrix4();
  invalid.elements[0] = NaN;
  assert.throws(() => transformedPartBounds([], invalid), /finite parent/);
  geometry.dispose();
});

test('unbounded parcel queries retain approved Halcyon clearance semantics', () => {
  const clearance = createRouteClearance(route());
  assert.equal(clearance.clears(0, 40, 2, 2, Infinity, 0, -Infinity), false);
  assert.equal(clearance.clears(100, 40, 2, 2, Infinity, 0, -Infinity), true);
  assert.throws(() => clearance.clears(0, 40, 2, 2, NaN, 0, 0), /height/);
  assert.throws(
    () => clearance.clears(0, 40, 2, 2, Infinity, 0, Infinity),
    /height/,
  );
});
