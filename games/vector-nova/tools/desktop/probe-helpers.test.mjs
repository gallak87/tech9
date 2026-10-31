import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeCareerKey,
  CAREER_SLOTS_KEY,
  unlockedCareerSave,
} from './probe-helpers.mjs';
import {
  createCareerSlots,
  createMemoryStorage,
} from '../../src/progression/careers.js';
import {
  createProfileStore,
  shipUnlocked,
} from '../../src/progression/profile.js';
import { createCupStore } from '../../src/race/cup.js';
import { createSaveTransfer } from '../../src/progression/save-transfer.js';

test('desktop probe keys follow the active real career and reject missing selections', () => {
  const storage = createMemoryStorage();
  const careers = createCareerSlots({ storage: () => storage });
  for (const id of [1, 2, 3]) {
    careers.create(id);
    const registry = JSON.parse(storage.getItem(CAREER_SLOTS_KEY));
    const key = activeCareerKey(registry, 'vector-nova.ship');
    storage.setItem(key, `ship-${id}`);
    assert.equal(
      careers.storageFor(id).getItem('vector-nova.ship'),
      `ship-${id}`,
    );
  }
  for (const registry of [
    null,
    { version: 1, active: null, slots: [] },
    { version: 1, active: 1, slots: [] },
  ])
    assert.throws(
      () => activeCareerKey(registry, 'vector-nova.ship'),
      /selected career/,
    );
  assert.equal(storage.getItem('vector-nova.ship'), null);
});

test('desktop full-fleet fixture imports as a complete current career with earned hulls', () => {
  const storage = createMemoryStorage();
  const profileStore = createProfileStore(() => storage);
  const cupStore = createCupStore(() => storage);
  const transfer = createSaveTransfer({
    profileStore,
    cupStore,
    storage: () => storage,
  });
  const save = transfer.parse(unlockedCareerSave());
  transfer.replace(save);
  for (const id of ['shrike', 'bastion', 'needle', 'kestrel'])
    assert.equal(shipUnlocked(profileStore.snapshot().state, id), true, id);
  assert.deepEqual(Object.keys(save.trophies.cups), [
    'founders',
    'frontier',
    'horizon',
  ]);
  assert.equal(save.cup, null);
  assert.deepEqual(save.trials, []);
});
