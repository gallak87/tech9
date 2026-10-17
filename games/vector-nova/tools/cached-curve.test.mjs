import test from 'node:test';
import assert from 'node:assert/strict';
import { CatmullRomCurve3, Vector3 } from 'three';
import { cacheClosedCatmullRom } from '../src/track/cached-curve.js';

test('compiled closed splines preserve arc positions, knots and the closing seam', () => {
  for (const kind of ['centripetal', 'chordal', 'catmullrom']) {
    const curve = new CatmullRomCurve3(
      [
        new Vector3(-280, 25, -300),
        new Vector3(-40, 90, 320),
        new Vector3(10, 207, 420),
        new Vector3(1000, 180, 330),
        new Vector3(330, 25, -220),
        new Vector3(360, 0, -450),
      ],
      true,
      kind,
    );
    curve.arcLengthDivisions = 48000;
    curve.updateArcLengths();
    const sample = cacheClosedCatmullRom(curve);
    for (let i = 0; i <= 10000; i++) {
      const u = i / 10000;
      assert.ok(
        sample(u).distanceTo(curve.getPointAt(u)) < 1e-8,
        `${kind} at ${u}`,
      );
    }
    assert.ok(sample(0).distanceTo(sample(1)) < 1e-10);
  }
});
