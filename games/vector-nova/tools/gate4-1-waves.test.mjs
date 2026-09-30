import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createLevel3Track } from '../src/levels/nacre/track/model.js';
import { createLeviathanPath } from '../src/levels/nacre/environment/leviathan/path.js';
import { createNacreWater } from '../src/levels/nacre/environment/water.js';
import {
  createNacreWaveShelter,
  sampleNacreSwell,
  NACRE_WAVE_HEIGHT_BOUND,
} from '../src/levels/nacre/environment/ocean-waves.js';

const track = createLevel3Track();

test('storm swells have metre-scale relief, exact gradients and bounded deterministic motion', () => {
  let low = Infinity,
    high = -Infinity,
    travel = 0;
  for (let x = -500; x <= 500; x += 17)
    for (let z = -500; z <= 500; z += 23) {
      const wave = sampleNacreSwell(x, z, 7.3),
        eps = 0.0001;
      assert.ok(Math.abs(wave.height) <= NACRE_WAVE_HEIGHT_BOUND);
      low = Math.min(low, wave.height);
      high = Math.max(high, wave.height);
      assert.ok(
        Math.abs(
          wave.dx -
            (sampleNacreSwell(x + eps, z, 7.3).height -
              sampleNacreSwell(x - eps, z, 7.3).height) /
              (2 * eps),
        ) < 1e-6,
      );
      assert.ok(
        Math.abs(
          wave.dz -
            (sampleNacreSwell(x, z + eps, 7.3).height -
              sampleNacreSwell(x, z - eps, 7.3).height) /
              (2 * eps),
        ) < 1e-6,
      );
      assert.deepEqual(wave, sampleNacreSwell(x, z, 7.3));
      travel = Math.max(
        travel,
        Math.abs(wave.height - sampleNacreSwell(x, z, 8.3).height),
      );
    }
  assert.ok(high - low > 32, 'Large physical trough-to-crest relief');
  assert.ok(travel > 4, 'Waves travel through world space');
});

test('road and creature water-contact pools retain mean sea level across all phases', () => {
  const shelter = createNacreWaveShelter(track);
  for (let s = 0; s < track.length; s += 3) {
    const frame = track.sample(s);
    for (const lateral of [-40, -15, 0, 15, 40]) {
      const p = frame.position.clone().addScaledVector(frame.right, lateral);
      assert.equal(shelter(p.x, p.z), 0);
      assert.equal(
        Math.abs(sampleNacreSwell(p.x, p.z, 13.7, shelter(p.x, p.z)).height),
        0,
      );
    }
  }
  for (const [x, z] of createLeviathanPath(track).contacts.map((c) => [
    c.position.x,
    c.position.z,
  ])) {
    assert.equal(shelter(x, z), 0);
    assert.equal(shelter(x + 25, z), 0);
  }
  assert.equal(shelter(-2400, 1900), 1);
});

test('quality meshes enclose all displaced vertices, preserve flat crossing corridor and use one surface draw', () => {
  const water = createNacreWater(14000, 0, { track });
  const center = track.bounds.getCenter(new T.Vector3());
  for (const quality of ['high', 'low']) {
    water.userData.setQuality(quality);
    const geometry = water.geometry,
      p = geometry.attributes.position,
      masks = geometry.attributes.waveShelter;
    assert.ok(geometry.index.count / 3 < 90000);
    assert.ok(geometry.boundingBox.max.y >= NACRE_WAVE_HEIGHT_BOUND);
    for (let i = 0; i < p.count; i += 41) {
      assert.ok(masks.getX(i) >= 0 && masks.getX(i) <= 1);
      const h = sampleNacreSwell(
        p.getX(i) + center.x,
        p.getZ(i) + center.z,
        19,
        masks.getX(i),
      ).height;
      assert.ok(
        geometry.boundingBox.containsPoint(
          new T.Vector3(p.getX(i), h, p.getZ(i)),
        ),
      );
    }
    // Check actual rendered triangle vertices, not just the analytic mask: the
    // coarse preset must not interpolate offshore wave height onto the road.
    let columns = 1;
    while (columns < p.count && p.getZ(columns) === p.getZ(0)) columns++;
    const rows = p.count / columns;
    const flatQuad = (x, z) => {
      let col = 0,
        row = 0;
      while (col < columns - 2 && p.getX(col + 1) < x - center.x) col++;
      while (row < rows - 2 && p.getZ((row + 1) * columns) < z - center.z)
        row++;
      const a = row * columns + col;
      for (const index of [a, a + 1, a + columns, a + columns + 1])
        assert.equal(
          masks.getX(index),
          0,
          `Flat rendered ${quality} water contact quad`,
        );
    };
    for (let s = 0; s < track.length; s += 17) {
      const frame = track.sample(s);
      for (const side of [-40, 40]) {
        const point = frame.position.clone().addScaledVector(frame.right, side);
        flatQuad(point.x, point.z);
      }
    }
    for (const [x, z] of createLeviathanPath(track).contacts.map((c) => [
      c.position.x,
      c.position.z,
    ]))
      for (const offset of [-25, 0, 25]) flatQuad(x + offset, z);
    const presentation = water.userData.getPresentation();
    assert.equal(presentation.quality, quality);
    assert.equal(presentation.draws, 1);
    assert.equal(presentation.newTextures, 0);
    assert.ok(presentation.lowTriangles < presentation.highTriangles * 0.4);
  }
  water.userData.geometries.forEach((g) => g.dispose());
  water.material.dispose();
});
