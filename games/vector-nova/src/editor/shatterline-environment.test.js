import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  generateDocument,
  validateDocument,
  documentIdentity,
} from './document.js';
import { createEditorTrack } from './track.js';
import { createRegionPlan } from './region-plan.js';
import {
  planShatterlineKit,
  createShatterlineEditorEnvironment,
  SHATTERLINE_KIT_LIMIT,
} from './shatterline-environment.js';
import { createRouteClearance } from '../environment/placement.js';

test('production limestone scenery is seeded, bounded and reserves every road and jump corridor', () => {
  for (const courseType of ['circuit', 'downhill']) {
    const doc = generateDocument({
      biome: 'shatterline',
      seed: 42,
      environmentSeed: 7001,
      courseType,
      length: 10000,
      crossovers: 0.65,
    });
    const before = JSON.stringify(doc);
    const track = createEditorTrack(doc);
    const plan = createRegionPlan(doc, track);
    const placements = planShatterlineKit(doc, track, plan);
    const signature = (records) =>
      records.map((p) => [p.id, p.asset, p.matrix.toArray()]);
    assert.deepEqual(
      signature(placements),
      signature(planShatterlineKit(doc, track, plan)),
    );
    assert(
      placements.length > 20 && placements.length <= SHATTERLINE_KIT_LIMIT,
      placements.length,
    );
    assert(placements.some((p) => p.asset.startsWith('geology-')));
    assert(placements.some((p) => p.asset.startsWith('crown-')));
    assert(placements.some((p) => p.asset === 'service-shelter'));
    const clears = createRouteClearance(track, {
      spacing: 8,
      sidePadding: 30,
      localVertical: [-22, 44],
    }).clears;
    for (const p of placements) {
      const centre = p.bounds.getCenter(new T.Vector3()),
        size = p.bounds.getSize(new T.Vector3());
      assert(
        clears(
          centre.x,
          centre.z,
          size.x,
          size.z,
          p.bounds.max.y,
          0,
          p.bounds.min.y,
        ),
        p.id,
      );
      assert(
        plan.clears(
          centre.x,
          centre.z,
          size.x,
          size.z,
          p.bounds.max.y,
          0,
          p.bounds.min.y,
        ),
        p.id,
      );
    }
    for (const p of plan.roadSamples)
      assert(plan.surfaceHeight(p.x, p.z) <= p.minY - 4.99);
    const changed = structuredClone(doc);
    changed.environment.seed++;
    assert.notDeepEqual(
      signature(placements),
      signature(
        planShatterlineKit(changed, track, createRegionPlan(changed, track)),
      ),
    );
    assert.equal(
      JSON.stringify(doc),
      before,
      'planning leaves authored roads and jumps exact',
    );
    const solids = [];
    const owner = createShatterlineEditorEnvironment(doc, track, {
      plan,
      collectSolid: (s) => solids.push(s),
    });
    assert.equal(
      solids.filter((s) => s.asset).length,
      placements.length,
      'every production placement has synchronous baked contact',
    );
    owner.dispose();
  }
});

test('old scenery stays at its saved layout until an explicit environment upgrade', () => {
  const current = generateDocument({
    biome: 'shatterline',
    seed: 7,
    seedJumps: false,
  });
  const old = structuredClone(current);
  old.environment.layoutVersion = 2;
  const loaded = validateDocument(JSON.parse(JSON.stringify(old)));
  assert.deepEqual(loaded, old);
  assert.match(documentIdentity(loaded), /^custom-shatterline-v6-/);
  assert.match(documentIdentity(current), /^custom-shatterline-v7-/);
  assert.deepEqual(loaded.points, current.points);
  const track = createEditorTrack(current);
  assert.notDeepEqual(
    createRegionPlan(old, track).terrain.heights,
    createRegionPlan(current, track).terrain.heights,
  );
});
