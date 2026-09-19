import test from 'node:test';
import assert from 'node:assert/strict';
import { ArtPreview } from '../src/dev-preview.js';
import { createState } from '../src/progression.js';
import { saveState, loadState, exportSave } from '../src/persistence.js';
import {
  TOWN_CENTERS,
  townCenterBounds,
  townCenterPreviewBounds,
} from '../src/town-center-art.js';

test('art previews never change the expedition or its autosave/manual export', () => {
  const state = createState(),
    baseline = structuredClone(state),
    preview = new ArtPreview();
  const slots = new Map(),
    storage = {
      getItem: (key) => slots.get(key) ?? null,
      setItem: (key, value) => slots.set(key, value),
    };
  Object.freeze(state.buildings);
  preview.setOpen(true);
  for (const town of TOWN_CENTERS)
    for (const level of [4, 3, 2, 1]) {
      preview.selectTown(town.region);
      preview.selectTownCenter(level);
      const visual = preview.visualState(state);
      assert.equal(visual.buildings.town_center, level);
      assert.equal(visual.townCenterArtRegion, town.region);
      assert.equal(visual.region, state.region);
      assert.equal(visual.visited, state.visited);
      assert.equal(visual.fog, state.fog);
      assert.equal(visual.flags, state.flags);
      assert.notEqual(visual.buildings, state.buildings);
      assert.deepEqual(state, baseline);
      saveState(state, 'checkpoint', storage);
      saveState(state, 1, storage);
      assert.equal(loadState('checkpoint', storage).buildings.town_center, 1);
      const exported = JSON.parse(exportSave(1, storage)).state;
      assert.deepEqual(exported.buildings, baseline.buildings);
      assert.deepEqual(exported.resources, baseline.resources);
      assert.equal(exported.tier, baseline.tier);
      assert.equal('townCenterLevel' in exported, false);
      assert.equal('townCenterArtRegion' in exported, false);
      assert.deepEqual(exported.visited, baseline.visited);
      assert.deepEqual(exported.flags, baseline.flags);
    }
});

test('closing or resetting the preview restores the actual level and cannot leak into a new session', () => {
  const state = createState(),
    preview = new ArtPreview();
  preview.setOpen(true);
  preview.selectTownCenter(4);
  preview.selectTownCenter(null);
  assert.equal(preview.visualState(state), state);
  preview.selectTownCenter(3);
  preview.setOpen(false);
  assert.equal(preview.townCenterLevel, null);
  assert.equal(preview.visualState(state), state);
  preview.selectTownCenter(4);
  preview.setOpen(true);
  const next = createState();
  next.buildings.town_center = 2;
  assert.equal(preview.visualState(next), next);
  for (const invalid of [0, 5, 1.5, NaN, '4'])
    assert.throws(() => preview.selectTownCenter(invalid));
  for (const invalid of ['forest_veil', '', null])
    assert.throws(() => preview.selectTown(invalid));
  preview.selectTown('last_crown');
  preview.selectTownCenter(4);
  preview.resetSelection();
  assert.equal(preview.visualState(next), next);
  preview.selectTown('emberline');
  preview.setOpen(false);
  assert.equal(preview.townCenterRegion, 'haventide');
  preview.selectTown('last_crown');
  preview.setOpen(true);
  assert.equal(
    preview.townCenterRegion,
    'haventide',
    'Closed previews ignore selections',
  );
});

test('all regional tiers grow in both dimensions while doors remain at the authored entrance', () => {
  for (const town of TOWN_CENTERS) {
    const entrance = { id: town.region + '_entrance', x: 1387.5, y: 1262.5 };
    let previous = { width: 0, height: 0 };
    for (let level = 1; level <= 4; level++) {
      const bounds = townCenterBounds(entrance, {
        buildings: { town_center: level },
      });
      assert.equal(bounds.center.region, town.region);
      assert.ok(
        bounds.width > previous.width && bounds.height > previous.height,
      );
      assert.ok(
        Math.abs(
          bounds.left + bounds.frame.anchorX * bounds.scale - entrance.x,
        ) < 0.001,
      );
      assert.ok(
        Math.abs(
          bounds.top + bounds.frame.anchorY * bounds.scale - entrance.y,
        ) < 0.001,
      );
      assert.ok(
        bounds.width < 400 && bounds.height < 420,
        'Largest tier must fit the 960×540 review view',
      );
      previous = bounds;
    }
  }
  assert.equal(
    townCenterBounds({ id: 'forest_veil_entrance' }, createState()),
    null,
  );
  assert.equal(townCenterBounds({ id: 'haventide' }, createState()), null);
});

test('regional art preview substitutes only Haventide and all sixteen sprites fit the fixed camera frame', () => {
  const state = createState(),
    preview = new ArtPreview();
  preview.setOpen(true);
  const entrance = { id: 'haventide_entrance', x: 1387.5, y: 1262.5 },
    envelope = townCenterPreviewBounds(entrance);
  for (const town of TOWN_CENTERS)
    for (let level = 1; level <= 4; level++) {
      preview.selectTown(town.region);
      preview.selectTownCenter(level);
      const visual = preview.visualState(state),
        bounds = townCenterBounds(entrance, visual);
      assert.equal(bounds.center.region, town.region);
      assert.equal(bounds.frameIndex, level - 1);
      assert.ok(bounds.left >= envelope.left && bounds.top >= envelope.top);
      assert.ok(
        bounds.left + bounds.width <= envelope.left + envelope.width + 0.001,
      );
      assert.ok(
        bounds.top + bounds.height <= envelope.top + envelope.height + 0.001,
      );
      const other = townCenterBounds(
        { id: 'orbital_reach_entrance', x: 20, y: 30 },
        visual,
      );
      assert.equal(
        other.center.region,
        'orbital_reach',
        'Substitution must not affect another map',
      );
    }
  assert.ok(
    envelope.width < 430 && envelope.height + 60 < 540,
    'Entire review family fits the stationary review camera',
  );
});
