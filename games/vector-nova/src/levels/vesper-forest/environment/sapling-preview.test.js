import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  saplingPreviewRequested,
  placeSaplingPreview,
} from './sapling-preview.js';

test('Sapling comparison requires both developer access and the explicit URL flag', (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', {
    value: { search: '?tree=sapling' },
    configurable: true,
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'location', original);
    else delete globalThis.location;
  });
  assert.equal(saplingPreviewRequested(), false);
  assert.equal(saplingPreviewRequested({ developer: false }), false);
  assert.equal(saplingPreviewRequested({ developer: true }), true);
  globalThis.location.search = '?tree=normal';
  assert.equal(saplingPreviewRequested({ developer: true }), false);
});

function fixture() {
  const position = new T.Vector3(-162.26373, -33.47009, 60.23269),
    rotation = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), 1.2);
  const target = {
    position,
    height: 185,
    matrix: new T.Matrix4().compose(position, rotation, new T.Vector3(2, 2, 2)),
  };
  const sentinel = { id: 'unchanged' };
  return {
    position,
    rotation,
    target,
    sentinel,
    stands: [[sentinel], [sentinel, target], [sentinel]],
    prototype: {
      height: 100,
      treeParts: [{ geometry: {}, kind: 'wood' }, { kind: 'leaf' }],
    },
  };
}

test('one Sapling replacement preserves the original footing, stature and orientation', () => {
  const input = fixture();
  let checked = 0;
  const result = placeSaplingPreview({
    ...input,
    routeClearance: {
      intersectsGeometry(geometry, matrix) {
        checked++;
        assert.equal(geometry, input.prototype.treeParts[0].geometry);
        assert.ok(matrix.isMatrix4);
        return false;
      },
    },
  });
  assert.equal(checked, 1);
  assert.deepEqual(input.stands, [
    [input.sentinel],
    [input.sentinel],
    [input.sentinel],
  ]);
  const position = new T.Vector3(),
    rotation = new T.Quaternion(),
    scale = new T.Vector3();
  result.matrix.decompose(position, rotation, scale);
  assert.ok(position.distanceTo(input.position) < 1e-9);
  assert.ok(rotation.angleTo(input.rotation) < 1e-7);
  assert.ok(scale.distanceTo(new T.Vector3(1.85, 1.85, 1.85)) < 1e-9);
  assert.equal(result.height, 185);
});

test('an obstructing candidate leaves the original forest intact', () => {
  const input = fixture();
  assert.throws(
    () =>
      placeSaplingPreview({
        ...input,
        routeClearance: { intersectsGeometry: () => true },
      }),
    /crosses the road\/camera corridor/,
  );
  assert.equal(input.stands[1][1], input.target);
  assert.equal(input.stands[1].length, 2);
});
