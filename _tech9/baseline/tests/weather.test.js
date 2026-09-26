import test from 'node:test';
import assert from 'node:assert/strict';
import { createForestWeatherSurface } from '../src/world/weatherSurface.js';
import { terrainHeight } from '../src/world/terrain.js';

test('forest ground query distinguishes open trail, canopy and thin snow contact', () => {
  const surface = createForestWeatherSurface();
  const exposed = surface.ground(-0.6, 23),
    sheltered = surface.ground(-8.5, 16.8);
  assert.ok(exposed.exposure > 0.9);
  assert.ok(sheltered.exposure < 0.55);
  assert.ok(sheltered.coverHeight > 10);
  assert.equal(surface.snowDepth(0, 23, 0), 0);
  for (let x = -76; x <= 76; x += 4)
    for (let z = -76; z <= 76; z += 4) {
      const depth = surface.snowDepth(x, z, 1);
      assert.ok(depth >= 0 && depth <= 0.065);
      const hit = surface.sampleSurface(x, z);
      assert.ok(hit.position[1] >= terrainHeight(x, z));
    }
});
