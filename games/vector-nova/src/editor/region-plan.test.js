import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { generateDocument } from './document.js';
import { createEditorTrack } from './track.js';
import { createRegionPlan, REGION_LIMITS } from './region-plan.js';
import { buildRegionEnvironment } from './region-environment.js';
import { createRouteClearance } from '../environment/placement.js';
import { NACRE_WAVE_HEIGHT_BOUND } from '../levels/nacre/environment/ocean-waves.js';
const fixture = generateDocument({ seed: 42, length: 20000, crossovers: 1 });
fixture.environment = { version: 1, seed: 42, layoutVersion: 1 };
const track = createEditorTrack(fixture);
const plan = createRegionPlan(fixture, track);

test('Nacre ocean and seabed share a safe datum without exposing rectangular survey edges', () => {
  const doc = generateDocument({
    biome: 'nacre',
    seed: 42017,
    length: 4000,
    environmentSeed: 90210,
  });
  const ocean = createRegionPlan(doc, createEditorTrack(doc));
  const { nx, nz, heights, waterHeights } = ocean.terrain;
  assert(Number.isFinite(ocean.oceanWaterY));
  assert(
    ocean.oceanWaterY + NACRE_WAVE_HEIGHT_BOUND <=
      Math.min(...ocean.roadSamples.map((p) => p.minY)) - 11.99,
  );
  for (let z = 0; z <= nz; z++)
    for (let x = 0; x <= nx; x++) {
      const i = z * (nx + 1) + x;
      assert(Math.abs(waterHeights[i] - ocean.oceanWaterY) < 1e-4);
      if (x === 0 || z === 0 || x === nx || z === nz)
        assert(
          heights[i] <= ocean.oceanWaterY - NACRE_WAVE_HEIGHT_BOUND - 39.99,
          'the survey edge stays below every wave trough',
        );
    }
  assert(
    Math.max(...heights) - Math.min(...heights) > 60,
    'sparse underwater ridges retain relief',
  );
  const historical = createRegionPlan(
    { ...doc, environment: { ...doc.environment, layoutVersion: 3 } },
    createEditorTrack(doc),
  );
  assert.equal(
    historical.oceanWaterY,
    undefined,
    'earlier saved Nacre worlds retain their watershed survey',
  );
});

test('regional seed resolves a deterministic whole-course plan without editing road data', () => {
  const before = JSON.stringify(fixture),
    again = createRegionPlan(fixture, track);
  assert.deepEqual(plan.terrain.heights, again.terrain.heights);
  assert.deepEqual(plan.parcels, again.parcels);
  assert.deepEqual(plan.basins, again.basins);
  const changed = createRegionPlan(
    { ...fixture, environment: { ...fixture.environment, seed: 43 } },
    track,
  );
  assert.notDeepEqual(plan.terrain.heights, changed.terrain.heights);
  assert.notDeepEqual(plan.parcels, changed.parcels);
  assert.equal(JSON.stringify(fixture), before);
  assert(plan.districts.length > 12);
  assert(plan.parcels.length > 100);
  assert(plan.basins.length > 1);
  assert(plan.canals.length > 1);
  assert(
    plan.stats.far > 0,
    'the occupied region extends beyond roadside detailing',
  );
  assert(plan.stats.landArea > plan.stats.waterArea * 0.15);
});
test('terrain, water and founded parcels reserve rotated road and flight corridors', () => {
  const { clears } = createRouteClearance(track, {
    spacing: 8,
    sidePadding: 18,
    localVertical: [-9, 25],
  });
  for (const p of plan.roadSamples) {
    assert(plan.surfaceHeight(p.x, p.z) <= p.minY - 4.99);
    assert(plan.waterHeight(p.x, p.z) <= p.minY - 8.99);
  }
  for (const p of plan.parcels) {
    const h = p.type === 'building' ? 72 : p.type === 'trees' ? 38 : 34;
    assert(
      clears(
        p.x,
        p.z,
        80 * p.scale,
        70 * p.scale,
        p.y + h * p.scale,
        p.yaw,
        p.y - 12,
      ),
      p.id,
    );
  }
});
test('all lengths and regional presets keep geometry and detail budgets bounded', () => {
  for (const courseType of ['circuit', 'downhill'])
    for (const length of [3000, 20000]) {
      const d = generateDocument({ seed: 7, length, courseType });
      for (const sceneryPreset of ['waterfront', 'industrial', 'reclaimed']) {
        const p = createRegionPlan(
          { ...d, settings: { ...d.settings, sceneryPreset } },
          createEditorTrack(d),
        );
        assert(
          p.terrain.nx <= REGION_LIMITS.axisCells &&
            p.terrain.nz <= REGION_LIMITS.axisCells,
        );
        assert(
          p.parcels.length <= REGION_LIMITS.parcels &&
            p.landmarks.length <= REGION_LIMITS.landmarks,
        );
        assert(p.stats.near <= 72 && p.stats.mid <= 160);
        assert(p.chunks.length <= 25);
      }
    }
});
test('renderer and collision collect the same regional terrain triangles and native heights', () => {
  const group = new T.Group(),
    solids = [],
    geometries = [],
    blocks = [];
  const owner = {
    group,
    solid(name, geometry, material, info, collect) {
      geometries.push(geometry);
      const mesh = new T.Mesh(geometry, material);
      mesh.name = name;
      group.add(mesh);
      if (collect && info) collect({ name, geometry, ...info });
      return mesh;
    },
    block(...args) {
      blocks.push(args);
    },
  };
  const material = new T.MeshBasicMaterial(),
    materials = {
      soil: material,
      concrete: material,
      paving: material,
      roof: material,
      occupied: material,
      water: material,
    };
  const result = buildRegionEnvironment(plan, {
    owner,
    materials,
    collectSolid: (s) => solids.push(s),
  });
  const terrain = group.children.filter((m) => m.userData.regionChunk);
  assert.equal(terrain.length, plan.chunks.length);
  assert.deepEqual(
    solids.filter((s) => s.kind === 'terrain').map((s) => s.geometry),
    terrain.map((m) => m.geometry),
  );
  const ray = new T.Raycaster();
  for (const d of plan.districts.slice(0, 8)) {
    ray.set(new T.Vector3(d.x, 10000, d.z), new T.Vector3(0, -1, 0));
    const hit = ray.intersectObjects(terrain, false)[0];
    assert(hit);
    assert(Math.abs(hit.point.y - plan.surfaceHeight(d.x, d.z)) < 0.01);
  }
  assert(result.stats.actualNear <= 72 && result.stats.actualMid <= 160);
  assert(
    blocks.length > 20,
    'founded streets and basin edges join the districts',
  );
  geometries.forEach((g) => g.dispose());
  material.dispose();
});
