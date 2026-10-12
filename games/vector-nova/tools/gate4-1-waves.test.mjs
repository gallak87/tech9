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
  NACRE_WAVE_HORIZONTAL_BOUND,
  NACRE_WAVE_HORIZONTAL_GRADIENT_BOUND,
  NACRE_OCEAN_PROFILE,
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

test('Gerstner tangents and finite upward normals match displaced geometry, including varying shelter', () => {
  const maskAt = (x, z) => [
    0.5 + 0.18 * Math.sin(x * 0.015) + 0.14 * Math.cos(z * 0.021),
    0.18 * 0.015 * Math.cos(x * 0.015),
    -0.14 * 0.021 * Math.sin(z * 0.021),
  ];
  const detailAt = (x, z) => [35 + x * 0.004 + z * 0.003, 0.004, 0.003];
  const positionAt = (x, z, time) =>
    sampleNacreSwell(x, z, time, maskAt(x, z), detailAt(x, z)).displacement.add(
      new T.Vector3(x, 0, z),
    );
  const eps = 0.0001;
  for (const time of [0, 7.3, 91.1])
    for (let x = -800; x < 800; x += 59)
      for (let z = -800; z < 800; z += 71) {
        const wave = sampleNacreSwell(x, z, time, maskAt(x, z), detailAt(x, z));
        const tangentX = positionAt(x + eps, z, time)
          .sub(positionAt(x - eps, z, time))
          .multiplyScalar(0.5 / eps);
        const tangentZ = positionAt(x, z + eps, time)
          .sub(positionAt(x, z - eps, time))
          .multiplyScalar(0.5 / eps);
        assert.ok(tangentX.distanceTo(wave.tangentX) < 1e-6);
        assert.ok(tangentZ.distanceTo(wave.tangentZ) < 1e-6);
        const normal = new T.Vector3()
          .crossVectors(tangentZ, tangentX)
          .normalize();
        assert.ok(normal.distanceTo(wave.normal) < 1e-6);
        assert.ok(wave.normal.y > 0 && Number.isFinite(wave.normal.length()));
        assert.ok(wave.jacobian > 0, 'Horizontal displacement does not fold');
        assert.ok(
          Math.hypot(wave.displacement.x, wave.displacement.z) <=
            NACRE_WAVE_HORIZONTAL_BOUND,
        );
      }

  // Clearance masks compose with min(), so their largest gradient is bounded
  // by the steepest individual transition rather than the sum of every road.
  const protection = NACRE_OCEAN_PROFILE.roadShelter;
  const shelterGradientBound = Math.max(
    1.5 / protection.recoveryWidth,
    1.5 / (protection.contactFullRadius - protection.contactFlatRadius),
  );
  assert.ok(
    NACRE_WAVE_HORIZONTAL_GRADIENT_BOUND +
      NACRE_WAVE_HORIZONTAL_BOUND * shelterGradientBound <
      0.8,
    'Narrow crossing transitions retain a positive horizontal Jacobian',
  );
});

test('both sides of the entire surface route retain substantial storm relief', () => {
  const shelter = createNacreWaveShelter(track);
  for (const side of [-1, 1])
    for (const offset of [60, 110, 180]) {
      let samples = 0,
        fullStrength = 0,
        totalRelief = 0;
      for (let distance = 0; distance < track.length; distance += 24) {
        const frame = track.sample(distance);
        if (frame.position.y < track.waterY) continue;
        const point = frame.position
          .clone()
          .addScaledVector(
            frame.right.clone().setY(0).normalize(),
            side * offset,
          );
        const strength = shelter(point.x, point.z);
        if (strength > 0.95) fullStrength++;
        samples++;
        let low = Infinity,
          high = -Infinity;
        for (let time = 0; time <= 30; time += 1.7) {
          const height = sampleNacreSwell(
            point.x,
            point.z,
            time,
            strength,
          ).height;
          low = Math.min(low, height);
          high = Math.max(high, height);
        }
        totalRelief += high - low;
        assert.ok(
          high - low > 16,
          `Storm relief at s=${distance}, side=${side}, offset=${offset}`,
        );
      }
      assert.ok(
        fullStrength / samples >= 0.95,
        'Almost all near-road water is at full storm strength',
      );
      assert.ok(
        totalRelief / samples > 40,
        'Large rolling relief throughout each side of the circuit',
      );
    }
});

test('clearance protection is local to decks and exact water contacts', () => {
  const shelter = createNacreWaveShelter(track);
  const margin = NACRE_OCEAN_PROFILE.roadShelter.deckMargin;
  let unrestrictedHigh = 0,
    unrestrictedDeep = 0;
  for (let distance = 0; distance < track.length; distance += 3) {
    if (track.isGap(distance)) continue;
    const frame = track.sample(distance);
    const edgeHeight = (Math.abs(frame.right.y) * track.width) / 2;
    const clearance = Math.max(
      0,
      Math.abs(frame.position.y - track.waterY) - edgeHeight,
    );
    const strength = shelter(frame.position.x, frame.position.z);
    assert.ok(strength * NACRE_WAVE_HEIGHT_BOUND <= clearance + 1e-6);
    if (clearance > NACRE_WAVE_HEIGHT_BOUND + margin + 2 && strength === 1) {
      if (frame.position.y > track.waterY) unrestrictedHigh++;
      else unrestrictedDeep++;
    }
  }
  assert.ok(unrestrictedHigh > 0, 'High bridges have actual swells below them');
  assert.ok(
    unrestrictedDeep > 0,
    'Deep submerged road leaves the sea above it moving',
  );
  for (const distance of track.surfaceCrossings) {
    const point = track.sample(distance).position;
    assert.equal(shelter(point.x, point.z), 0);
  }
  for (const contact of createLeviathanPath(track).contacts) {
    const point = contact.position;
    assert.equal(shelter(point.x, point.z), 0);
    for (const time of [0, 13.7, 91.1])
      assert.equal(
        sampleNacreSwell(
          point.x,
          point.z,
          time,
          shelter(point.x, point.z),
        ).displacement.length(),
        0,
      );
  }
  assert.equal(shelter(-2400, 1900), 1);
});

test('quality meshes protect deck clearance, preserve localized contacts and retain a moving horizon', () => {
  const water = createNacreWater(14000, 0, { track });
  const center = track.bounds.getCenter(new T.Vector3());
  for (const quality of ['high', 'low']) {
    water.userData.setQuality(quality);
    const geometry = water.geometry,
      p = geometry.attributes.position,
      masks = geometry.attributes.waveShelter,
      detail = geometry.attributes.waveResolution;
    assert.ok(geometry.index.count / 3 < (quality === 'low' ? 310000 : 460000));
    assert.ok(
      Math.min(...NACRE_OCEAN_PROFILE.waves.map((wave) => wave.wavelength)) /
        NACRE_OCEAN_PROFILE.mesh[
          quality === 'low' ? 'lowSpacing' : 'highSpacing'
        ] >=
        5,
      'At least five intervals across the shortest geometric wave',
    );
    assert.ok(geometry.boundingBox.max.y >= NACRE_WAVE_HEIGHT_BOUND);
    for (let i = 0; i < p.count; i += 41) {
      assert.ok(masks.getX(i) >= 0 && masks.getX(i) <= 1);
      const wave = sampleNacreSwell(
        p.getX(i) + center.x,
        p.getZ(i) + center.z,
        19,
        [masks.getX(i), masks.getY(i), masks.getZ(i)],
        [detail.getX(i), detail.getY(i), detail.getZ(i)],
      );
      assert.ok(wave.jacobian > 0);
      assert.ok(wave.normal.y > 0);
      assert.ok(
        geometry.boundingBox.containsPoint(
          new T.Vector3(p.getX(i), 0, p.getZ(i)).add(wave.displacement),
        ),
      );
    }
    // Check actual rendered triangle vertices, not just the analytic mask: the
    // coarse preset must not interpolate offshore wave height onto the road.
    let columns = 1;
    while (columns < p.count && p.getZ(columns) === p.getZ(0)) columns++;
    const rows = p.count / columns;
    const quad = (x, z) => {
      let col = 0,
        row = 0;
      while (col < columns - 2 && p.getX(col + 1) < x - center.x) col++;
      while (row < rows - 2 && p.getZ((row + 1) * columns) < z - center.z)
        row++;
      const a = row * columns + col;
      return [a, a + 1, a + columns, a + columns + 1];
    };
    for (let s = 0; s < track.length; s += 17) {
      if (track.isGap(s)) continue;
      const frame = track.sample(s);
      for (const side of [-track.width / 2, 0, track.width / 2]) {
        const point = frame.position.clone().addScaledVector(frame.right, side);
        // Also enclose all possible preimages under bounded horizontal
        // displacement, not just the vertical graph above the undeformed quad.
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
          const x = point.x + Math.cos(angle) * NACRE_WAVE_HORIZONTAL_BOUND;
          const z = point.z + Math.sin(angle) * NACRE_WAVE_HORIZONTAL_BOUND;
          for (const index of quad(x, z))
            assert.ok(
              masks.getX(index) * NACRE_WAVE_HEIGHT_BOUND <=
                Math.abs(point.y - track.waterY) + 0.5,
              `Rendered ${quality} ocean clears banked road at ${s}`,
            );
        }
      }
    }
    const contacts = [
      ...track.surfaceCrossings.map((s) => track.sample(s).position),
      ...createLeviathanPath(track).contacts.map((contact) => contact.position),
    ];
    for (const point of contacts)
      for (const index of quad(point.x, point.z))
        assert.equal(masks.getX(index), 0, `Exact ${quality} water contact`);
    let horizonRelief = 0;
    const farIndex = Math.floor(columns / 2);
    assert.equal(masks.getX(farIndex), 1, 'No offshore calm mask');
    for (const time of [0, 7, 19, 31])
      horizonRelief = Math.max(
        horizonRelief,
        Math.abs(
          sampleNacreSwell(
            p.getX(farIndex) + center.x,
            p.getZ(farIndex) + center.z,
            time,
            1,
            [
              detail.getX(farIndex),
              detail.getY(farIndex),
              detail.getZ(farIndex),
            ],
          ).height,
        ),
      );
    assert.ok(
      horizonRelief > 3,
      'Resolved long swells continue to the ocean horizon',
    );
    const presentation = water.userData.getPresentation();
    assert.equal(presentation.quality, quality);
    assert.equal(presentation.draws, 1);
    assert.equal(presentation.newTextures, 1);
    assert.ok(presentation.lowTriangles < presentation.highTriangles * 0.7);
  }
  water.userData.dispose?.();
  water.userData.geometries.forEach((g) => g.dispose());
  water.material.dispose();
});
