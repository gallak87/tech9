import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { fitBossPropulsion } from './boss-propulsion.js';

function fixture(quality, pressure, count) {
  return {
    group: {
      userData: { quality, pressure },
      children: Array.from({ length: count }, () => ({
        scale: new Vector3(),
        material: { opacity: 0.85 },
      })),
    },
  };
}

test('boss High scaling preserves the exact existing multiplier and all material/uniform state', () => {
  const propulsion = fixture('high', 0.7, 3);
  const scale = new Vector3(3.8, 3.8, 2.4);
  const before = propulsion.group.children.map((plume, index) => {
    plume.scale.set(1.15 + index / 10, 1.25, 4.4);
    plume.material.uniforms = { strength: { value: 1.2 } };
    return plume.scale.clone().multiply(scale).toArray();
  });
  fitBossPropulsion(propulsion, { speed: 120, boost: true }, scale, []);
  assert.deepEqual(
    propulsion.group.children.map((plume) => plume.scale.toArray()),
    before,
  );
  assert.deepEqual(scale.toArray(), [3.8, 3.8, 2.4]);
  for (const plume of propulsion.group.children) {
    assert.equal(plume.material.opacity, 0.85);
    assert.equal(plume.material.uniforms.strength.value, 1.2);
  }
});

for (const [id, radii, length] of [
  ['goliath', [1.85, 1.85, 1.16], 2.4],
  ['wraith', [0.61, 0.61], 1.45],
  ['bulwark', [0.83, 0.83, 0.72], 1.6],
]) {
  test(
    id +
      ' Low uses explicit mouth radii and leaves clearance at idle, driving and full boost',
    () => {
      const scale = new Vector3(9, 9, length);
      const opacities = [];
      for (const [speed, pressure, response, expectedOpacity] of [
        [0, 0, [1, 1, 0.3], 0.18],
        [120, 0, [1.15, 1.15, 4.4], 0.475],
        [120, 1, [1.47, 1.47, 7.5], 0.695],
      ]) {
        const propulsion = fixture('low', pressure, radii.length);
        const resetSharedResponse = () => {
          for (const plume of propulsion.group.children)
            plume.scale.set(...response);
        };
        resetSharedResponse();
        fitBossPropulsion(propulsion, { speed }, scale, radii);
        const result = propulsion.group.children.map((plume) =>
          plume.scale.toArray(),
        );
        opacities.push(propulsion.group.children[0].material.opacity);
        for (let index = 0; index < radii.length; index++) {
          const plume = propulsion.group.children[index];
          assert.ok(plume.scale.x * 0.28 < radii[index] * 0.65);
          assert.equal(plume.scale.x, plume.scale.y);
          assert.equal(plume.scale.z, response[2] * length);
          assert.ok(Math.abs(plume.material.opacity - expectedOpacity) < 1e-12);
          assert.ok(
            plume.material.opacity <= 0.7,
            'Low remains translucent even under full boost',
          );
        }
        resetSharedResponse();
        fitBossPropulsion(propulsion, { speed }, scale, radii);
        assert.deepEqual(
          propulsion.group.children.map((plume) => plume.scale.toArray()),
          result,
        );
      }
      assert.ok(
        opacities[0] >= 0.15 && opacities[0] < 0.25,
        'idle retains a faint visible powered core',
      );
      assert.ok(
        opacities[1] > opacities[0] + 0.2,
        'forward thrust strengthens the idle cue',
      );
      assert.ok(
        opacities[2] > opacities[1],
        'boost adds a distinct stronger cue',
      );
    },
  );
}

test('Low rejects a missing nozzle radius rather than creating an unbounded/NaN plume', () => {
  assert.throws(
    () =>
      fitBossPropulsion(
        fixture('low', 0, 2),
        { speed: 0 },
        new Vector3(2, 2, 2),
        [0.6],
      ),
    /positive radius for every exhaust mouth/,
  );
});
