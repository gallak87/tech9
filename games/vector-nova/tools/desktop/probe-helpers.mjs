import {
  CAREER_SLOTS_KEY,
  createMemoryStorage,
} from '../../src/progression/careers.js';
import { createProfileStore } from '../../src/progression/profile.js';
import {
  createCupStore,
  cupStandings,
  cupComplete,
} from '../../src/race/cup.js';
import { createCupCollection } from '../../src/progression/cup-collection.js';
import { createSaveTransfer } from '../../src/progression/save-transfer.js';

export { CAREER_SLOTS_KEY };

// The external verifier observes public storage; release code has no test hooks.
export function activeCareerKey(registry, key) {
  if (
    registry?.version !== 1 ||
    ![1, 2, 3].includes(registry.active) ||
    !registry.slots?.[registry.active - 1]
  )
    throw new Error('Desktop verification requires a selected career.');
  return `${CAREER_SLOTS_KEY}.slot.${registry.active}.${key}`;
}

// Earn the three hull rewards through normal CPU stores, then export a complete
// current save for the public import flow. No developer flags or raw unlock keys.
export function unlockedCareerSave() {
  const storage = createMemoryStorage();
  const profileStore = createProfileStore(() => storage);
  const cupStore = createCupStore(() => storage);
  const cupCollection = createCupCollection(() => storage);
  for (const id of ['founders', 'frontier', 'horizon']) {
    cupStore.start(id, 'shrike', 'easy');
    const field = cupStandings(cupStore.snapshot().state).map((row) => row.id);
    while (!cupComplete(cupStore.snapshot().state)) {
      cupStore.finish({
        standings: field.map((racer, index) => ({
          id: racer,
          finished: true,
          valid: true,
          totalTime: racer === 'player' ? 60 : 70 + index,
        })),
      });
      if (!cupComplete(cupStore.snapshot().state)) cupStore.next();
    }
    cupCollection.award(cupStore.snapshot().state);
    profileStore.recordCup(id);
    cupStore.abandon();
  }
  return createSaveTransfer({
    profileStore,
    cupStore,
    cupCollection,
    storage: () => storage,
  }).export();
}
