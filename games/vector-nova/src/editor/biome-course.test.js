import test from 'node:test';
import assert from 'node:assert/strict';
import { mockBundledEditorAssets } from './test-assets.js';
import { EDITOR_BIOMES } from './biomes.js';
import { generateDocument, analyzeDocument } from './document.js';
import { loadEditorCourse } from './course.js';
import { generatePickupLayout } from './pickups.js';
import { createMagneticRuntime } from '../core/session-runtime.js';
import { createVehicleState } from '../physics/index.js';
import { createRapierWorld } from '../physics/rapier-world.js';
import { withMagneticBoundaries } from '../physics/magnetic-boundaries.js';
import { getRacerControl } from '../race/racers.js';

// Exercise complete generated collision in the real dynamics backend, rather
// than assuming a differently shaped road kit still seats magnetic vehicles.
test('every whole-course biome drives on its rendered road and full regional collision', async (t) => {
  const bases = Object.fromEntries(
    ['circuit', 'downhill'].map((courseType) => [
      courseType,
      generateDocument({
        generatorVersion: 3,
        seed: 42017,
        length: 3000,
        courseType,
        jumpFrequency: 'none',
        bendiness: 0.45,
        elevation: 0.35,
      }),
    ]),
  );
  for (const [index, biome] of EDITOR_BIOMES.entries())
    await t.test(biome.id, async (subtest) => {
      mockBundledEditorAssets(subtest);
      const doc = structuredClone(bases[index % 2 ? 'downhill' : 'circuit']);
      doc.biome = biome.id;
      // Cover the deepest bed, transparent deck and two suspended road kits
      // through a complete authored road rotation as well as ordinary routes.
      if (['colossus', 'glasswake', 'ravel', 'zephyr'].includes(biome.id))
        doc.points.forEach((point, i) => {
          point.roll = (i / doc.points.length) * Math.PI * 2;
        });
      const preset = biome.presets[0];
      doc.settings = {
        sceneryPreset: preset.id,
        density: preset.density,
        waterLevel: preset.waterLevel,
      };
      assert.equal(analyzeDocument(doc).valid, true);
      const { definition, metadata } = loadEditorCourse(doc);
      assert(metadata.ui.subtitle.includes(biome.label));
      const track = definition.createTrack();
      const road = definition.createRoad({ track });
      const environment = definition.createEnvironment({ track });
      let collision, dynamics, runtime;
      try {
        await Promise.all([road.ready, environment.ready]);
        assert.equal(road.group.userData.biome, biome.id);
        assert(road.group.children.some((mesh) => mesh.userData.roadSurface));
        if (biome.id === 'orbital') {
          const coverage = road.group.userData.surfaceCoverage;
          assert.equal(coverage(0, 0), 1);
          const opening = Array.from(
            { length: 30 },
            (_, i) => 180 + 2 * i,
          ).find((station) => coverage(station, 0) === 0);
          assert.notEqual(opening, undefined);
          assert(
            road.group.children.find((mesh) => mesh.userData.roadSurface)
              .customDepthMaterial,
          );
          for (let frame = 0; frame <= 12; frame++)
            road.update({ time: frame / 10, mode: 'racing' });
          assert.equal(coverage(opening, 0), 1);
        } else {
          assert.equal(road.group.userData.surfaceCoverage, undefined);
        }
        assert(
          environment.group.userData.region.assemblies > 0,
          `${biome.id} has a populated full-course world`,
        );
        collision = definition.createCollisionWorld({ track });
        assert(collision.triangles.some((face) => face.kind === 'deck'));
        assert(collision.triangles.some((face) => face.kind === 'structure'));
        dynamics = await createRapierWorld({
          collisionWorld: withMagneticBoundaries(track, collision),
        });
        runtime = createMagneticRuntime({
          track,
          dynamics,
          collisionWorld: collision,
          settings: { steeringAssist: 0.3 },
        });
        for (const fraction of [0.03, 0.47, 0.83]) {
          dynamics.reset();
          const state = {
            ...createVehicleState(),
            distance: track.length * fraction,
            speed: 95,
          };
          const initial = state.distance;
          runtime.reset({ state });
          for (let tick = 0; tick < 120; tick++)
            runtime.advance(
              state,
              getRacerControl(state, track, {
                runtime,
                difficulty: 'hard',
                lane: 0,
              }),
              1 / 120,
            );
          assert(
            state.distance > initial + 60,
            `${biome.id} advances at ${fraction}`,
          );
          assert(
            state.speed > 70,
            `${biome.id} stays clear of generated structures`,
          );
          assert(Math.abs(state.lateral) < track.width / 2);
          assert.equal(
            runtime.pose(1).grounded,
            true,
            `${biome.id} stays seated at ${fraction}`,
          );
        }
      } finally {
        runtime?.dispose();
        dynamics?.dispose();
        collision?.dispose();
        road.dispose();
        environment.dispose();
      }
    });
});

test('Asterion lattice respects Workshop jump gaps, recovery, pickups and downhill runout', (t) => {
  mockBundledEditorAssets(t);
  const doc = generateDocument({
    biome: 'orbital',
    courseType: 'downhill',
    length: 4300,
    width: 56,
    seed: 815,
    seedJumps: true,
    jumpFrequency: 'many',
  });
  doc.pickups = generatePickupLayout(doc);
  const { definition } = loadEditorCourse(doc);
  const track = definition.createTrack();
  const road = definition.createRoad({ track });
  t.after(() => road.dispose());
  const coverage = road.group.userData.surfaceCoverage;
  const devices = definition.racing.createDevices(track);
  assert(track.jumps.length && devices.length);
  for (let frame = 0; frame <= 40; frame++) {
    road.update({ time: frame / 10, mode: 'racing' });
    assert.equal(coverage(track.finishDistance + 100, 0), 1);
    for (const { takeoff, landingStart, recovery } of track.jumps) {
      assert.equal(coverage(takeoff, 0), 1);
      assert.equal(coverage((takeoff + landingStart) / 2, 0), 0);
      assert.equal(coverage(landingStart, 0), 1);
      assert.equal(coverage(recovery, 0), 1);
    }
    for (const { distance, lateral, length } of devices) {
      assert.equal(coverage(distance - length / 2, lateral), 1);
      assert.equal(coverage(distance + length / 2, lateral), 1);
    }
  }
});
