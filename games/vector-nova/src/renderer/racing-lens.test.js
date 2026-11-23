import test from 'node:test';
import assert from 'node:assert/strict';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { racingBlurStrength, racingLens } from './racing-lens.js';
import { SHIPS } from '../ships/catalog.js';
import { getVehiclePace } from '../physics/index.js';

test('foreground blur arrives below 150 km/h at every chassis and course pace', () => {
  for (const ship of SHIPS) {
    for (const pace of [
      undefined,
      { cruiseScale: 0.5 },
      { cruiseScale: 1.4 },
    ]) {
      const cruiseSpeed =
        getVehiclePace(ship.id, pace)?.cruiseSpeed ?? ship.handling.cruiseSpeed;
      const strength = (speed) => racingBlurStrength({ speed, cruiseSpeed });
      assert.equal(strength(0), 0);
      assert.equal(strength(80 / 3.6), 0);
      assert.ok(strength(85 / 3.6) > 0);
      assert.ok(strength(120 / 3.6) > 0.015);
      assert.ok(strength(145 / 3.6) > strength(120 / 3.6));
      assert.ok(strength(cruiseSpeed) > strength(145 / 3.6));
      assert.ok(Math.abs(strength(cruiseSpeed) - 0.09) < 1e-12);
      assert.equal(
        strength(cruiseSpeed * 1.5),
        strength(cruiseSpeed),
        'coasting overspeed stays capped',
      );
    }
  }
});

test('manual boost increases blur beyond cruise and Vector retains the strongest effect', () => {
  const cruiseSpeed = SHIPS[0].handling.cruiseSpeed;
  const strength = (boost, catapulting = false) =>
    racingBlurStrength({ speed: cruiseSpeed, cruiseSpeed, boost, catapulting });
  assert.ok(strength(0.5) > strength(0) && strength(0.5) < strength(1));
  assert.equal(strength(1), 0.2);
  assert.equal(strength(2), strength(1));
  assert.equal(strength(-1), strength(0));
  assert.equal(strength(1, true), 0.24);
});

test('each view can size the craft protection used by the blur mask and sample guard', (t) => {
  const race = new ShaderPass(racingLens);
  const inspector = new ShaderPass(racingLens);
  t.after(() => {
    race.dispose();
    inspector.dispose();
  });
  assert.equal(race.uniforms.craftRadius.value, 0.1);
  inspector.uniforms.craftRadius.value = 0.25;
  assert.equal(race.uniforms.craftRadius.value, 0.1);
  assert.match(
    racingLens.fragmentShader,
    /smoothstep\(craftRadius,craftRadius\+\.13,fromCraft\)/,
  );
  assert.match(racingLens.fragmentShader, /fromCraft-craftRadius/);
});
