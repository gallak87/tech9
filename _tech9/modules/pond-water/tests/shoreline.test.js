import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createShoreline,
  shoreShape,
  SHORE_HARMONICS,
  SHORE_GLSL,
} from '../src/shoreline.js';

test('shore frame changes preserve radial and terrain agreement across the authored perimeter', () => {
  for (const frame of [
    {},
    { x: 12, z: -8, radiusX: 8, radiusZ: 31, level: 3 },
  ]) {
    const shore = createShoreline(frame);
    assert.ok(Object.isFrozen(shore) && Object.isFrozen(shore.definition));
    for (let i = 0; i < 100; i++) {
      const angle = (i / 100) * Math.PI * 2;
      const edge = shore.point(angle);
      assert.ok(Math.abs(shore.radius(...edge) - 1) < 1e-10);
      assert.ok(
        Math.abs(
          shore.terrainHeight(...edge, () => 8) - shore.definition.level,
        ) < 1e-9,
      );
      assert.equal(shore.isWater(...shore.point(angle, 0.8)), true);
      assert.equal(shore.isWalkable(...shore.point(angle, 1.06)), true);
      assert.equal(shore.isWalkable(...edge), false);
    }
  }
});

test('shore margins and scene exclusion compose instead of overriding one another', () => {
  const shore = createShoreline({
    excludeVegetation: (x, z) => x > 0 && z > 0,
  });
  assert.equal(shore.vegetationAllowed(0, -6), false);
  assert.equal(shore.vegetationAllowed(100, 100), false);
  assert.equal(shore.vegetationAllowed(-100, 100), true);
  const ring = shore.point(Math.PI, 1.15);
  assert.equal(shore.vegetationAllowed(...ring, 1.13), true);
  assert.equal(shore.vegetationAllowed(...ring, 1.24), false);
});

test('harmonics are shared with shader source and invalid frames fail at authoring time', () => {
  assert.ok(Object.isFrozen(SHORE_HARMONICS));
  for (const amplitude of [
    SHORE_HARMONICS.sinAmplitude,
    SHORE_HARMONICS.cosAmplitude,
  ])
    assert.ok(SHORE_GLSL.includes(String(amplitude)));
  for (let a = 0; a < Math.PI * 2; a += 0.03)
    assert.ok(shoreShape(a) > 0.9 && shoreShape(a) < 1.1);
  for (const patch of [
    { x: Infinity },
    { radiusX: 0 },
    { radiusZ: -4 },
    { level: NaN },
    { excludeVegetation: 1 },
  ])
    assert.throws(() => createShoreline(patch), TypeError);
});
