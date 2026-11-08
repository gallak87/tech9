import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createSaffronTrack } from '../track/model.js';
import { createLandformSurvey } from './terrain.js';
import { createDesertEffects } from './effects.js';
import { createResources } from './geometry.js';
import { createSaffronMaterials } from './materials.js';
import { createGrazerPath } from './grazer-path.js';

test('breach powder clears the actual deformed sand triangles and freezes with its event clock', async () => {
  const track = createSaffronTrack();
  const survey = createLandformSurvey(track);
  const resources = createResources();
  const materials = createSaffronMaterials(resources, true);
  await materials.ready;
  const effects = createDesertEffects(
    track,
    survey,
    materials,
    resources,
    new T.Group(),
  );
  const dust = effects.group.getObjectByName(
    'Saffron / sand disturbed by the actual breach',
  );
  const ridge = effects.group.getObjectByName(
    'Saffron / deforming ridge raised by subsurface burrower',
  );
  const geometry = resources.geometry(new T.BufferGeometry());
  geometry.setAttribute(
    'position',
    new T.BufferAttribute(survey.meshData.positions, 3),
  );
  geometry.setIndex(survey.meshData.indices);
  const base = new T.Mesh(
    geometry,
    resources.material(new T.MeshBasicMaterial({ side: T.DoubleSide })),
  );
  base.updateMatrixWorld(true);
  const path = createGrazerPath(track, survey);
  const physicalQueries = [];
  for (let i = 0; i <= 12; i++) {
    for (const cross of [-130, 0, 130]) {
      const p = path.start
        .clone()
        .addScaledVector(path.forward, i * 80)
        .addScaledVector(path.right, cross);
      physicalQueries.push({
        x: p.x,
        z: p.z,
        height: survey.heightAt(p.x, p.z),
      });
    }
  }
  const raycaster = new T.Raycaster();
  const down = new T.Vector3(0, -1, 0);
  const positions = dust.geometry.getAttribute('position');
  assert.equal(positions.count, 320);
  const frame = (time, reducedMotion = false) => ({
    time,
    motion: { saffron: { grazer: { startedAt: 0 } } },
    settings: { quality: 'high', reducedMotion },
  });
  try {
    for (const time of [8, 12, 18]) {
      effects.update(frame(time));
      effects.group.updateMatrixWorld(true);
      assert.equal(dust.visible, true);
      assert.ok(Array.from(positions.array).every(Number.isFinite));
      let ridgeSamples = 0;
      // Forty evenly distributed seeds cover both sides and the trailing
      // powder. Ray geometry, rather than another copy of the height formula,
      // independently checks the surface actually drawn beneath each particle.
      for (let i = 0; i < positions.count; i += 8) {
        const point = new T.Vector3()
          .fromBufferAttribute(positions, i)
          .applyMatrix4(dust.matrixWorld);
        raycaster.set(point.clone().add(new T.Vector3(0, 1000, 0)), down);
        const baseHits = raycaster.intersectObject(base, false);
        const ridgeHits = raycaster.intersectObject(ridge, false);
        assert.ok(baseHits.length > 0);
        if (ridgeHits.length) ridgeSamples++;
        const surface = Math.max(
          baseHits[0].point.y,
          ridgeHits[0]?.point.y ?? -Infinity,
        );
        assert.ok(
          point.y - surface >= 1.5,
          `particle ${i} is buried in rendered sand at age ${time}: clearance ${point.y - surface}`,
        );
      }
      assert.ok(
        ridgeSamples >= 36,
        'the moving ridge must participate in the clearance check',
      );
      const frozen = positions.array.slice();
      const matrix = dust.matrixWorld.toArray();
      effects.update({ ...frame(time), mode: 'paused', dt: 0 });
      effects.group.updateMatrixWorld(true);
      assert.deepEqual(positions.array, frozen);
      assert.deepEqual(dust.matrixWorld.toArray(), matrix);
    }
    effects.update(frame(18, true));
    assert.equal(
      dust.visible,
      false,
      'reduced motion removes travelling powder',
    );
    for (const query of physicalQueries)
      assert.equal(
        survey.heightAt(query.x, query.z),
        query.height,
        'presentation must not change the physical terrain',
      );
  } finally {
    effects.dispose();
    resources.dispose();
  }
});
