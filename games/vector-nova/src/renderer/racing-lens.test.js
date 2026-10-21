import test from 'node:test';
import assert from 'node:assert/strict';
import { racingBlurStrength } from './racing-lens.js';
import { SHIPS } from '../ships/catalog.js';
import { getVehiclePace } from '../physics/index.js';

test('each chassis and course pace ramps cruise blur only over the final 20% of top speed', () => {
  for (const ship of SHIPS) {
    for (const pace of [undefined, { cruiseScale: 1.4 }]) {
      const cruiseSpeed =
        getVehiclePace(ship.id, pace)?.cruiseSpeed ?? ship.handling.cruiseSpeed;
      const strength = (ratio, extra = {}) =>
        racingBlurStrength({
          speed: cruiseSpeed * ratio,
          cruiseSpeed,
          ...extra,
        });
      assert.equal(strength(0), 0);
      assert.equal(strength(0.79), 0);
      assert.ok(strength(0.8) < 1e-12);
      assert.ok(strength(0.81) > 0 && strength(0.81) < strength(0.9));
      assert.ok(strength(0.9) < strength(1));
      assert.ok(Math.abs(strength(1) * 3 - strength(1, { boost: 1 })) < 1e-12);
      assert.equal(
        strength(1.5),
        strength(1),
        'coasting overspeed stays capped',
      );
      assert.ok(strength(1, { boost: 0.5 }) > strength(1));
      assert.ok(strength(1, { boost: 0.5 }) < strength(1, { boost: 1 }));
      assert.ok(strength(1, { catapulting: true }) > strength(1, { boost: 1 }));
    }
  }
});
