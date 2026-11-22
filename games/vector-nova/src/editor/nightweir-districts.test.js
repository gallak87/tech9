import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDocument } from './document.js';
import { createEditorTrack } from './track.js';
import { createRegionPlan } from './region-plan.js';
import { createProductionEnvironment } from './production-environment.js';
import { nightweirBiomeDescriptor } from './nightweir-biome.js';
import { PLAYABLE_STARTERS } from './playable-starters.js';

test('Nightweir seats inhabited wards above water and gives its seeded shipping canals their own headworks', async () => {
  const options = PLAYABLE_STARTERS.find(
    (starter) => starter.id === 'harbor',
  ).options;
  for (const [sceneryPreset, blank] of [
    ['waterfront', false],
    ['industrial', false],
    ['reclaimed', false],
    ['waterfront', true],
  ]) {
    const doc = generateDocument({ ...options, sceneryPreset });
    const track = blank ? null : createEditorTrack(doc);
    const plan = createRegionPlan(doc, track);
    const owner = createProductionEnvironment(doc, track, {
      plan,
      descriptor: nightweirBiomeDescriptor,
      collectSolid: () => {},
    });
    try {
      await owner.ready;
      const stats = owner.group.userData.region;
      assert(stats.paths > 0 && stats.locks > 0);
      assert(stats.streetfronts > 0 && stats.productionAssets <= 96);
      if (sceneryPreset === 'reclaimed')
        assert(stats.parkGroves > stats.streetfronts);
      if (!blank && sceneryPreset === 'waterfront')
        assert(stats.foundedQuarters > 0);
      for (const record of owner.group.userData.regionalPlacements) {
        const water = plan.waterHeight(record.x, record.z);
        if (record.type === 'sluice') {
          assert(record.bounds.min[1] < water && record.bounds.max[1] > water);
        } else {
          assert(
            record.y >= water,
            record.id + ' should clear the local waterline',
          );
        }
      }
    } finally {
      owner.dispose();
    }
  }
});
