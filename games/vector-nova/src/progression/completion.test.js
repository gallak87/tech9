import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_REWARDS } from './catalog.js';
import { createMemoryStorage } from './careers.js';
import {
  createProfileStore,
  freshProfile,
  validateProfile,
  PROFILE_KEY,
} from './profile.js';
import { isCareerComplete, remainingModeUnlocks } from './completion.js';

function completedStore(storage) {
  const store = createProfileStore(() => storage);
  for (let i = 0; i < 24; i++) store.recordRace({ id: `race-${i}`, won: true });
  for (const cup of ['founders', 'frontier', 'horizon', 'apex'])
    store.recordCup(cup);
  store.recordTrial('halcyon', true);
  store.recordTrial('orbital', true);
  return store;
}

test('career completion requires every original reward and has no bonus-cup prerequisite', () => {
  const profile = freshProfile();
  assert.equal(ALL_REWARDS.length, 28);
  assert.equal(isCareerComplete(profile), false);
  profile.claims = ALL_REWARDS.map(({ id }) => id);
  assert.equal(isCareerComplete(profile), true);
  for (const reward of ALL_REWARDS) {
    assert.equal(
      isCareerComplete({
        ...profile,
        claims: profile.claims.filter((id) => id !== reward.id),
      }),
      false,
      reward.id,
    );
  }
  profile.claims = Array(28).fill('speed-1');
  assert.equal(isCareerComplete(profile), false);
});

test('mode unlock counts keep Time Trials discoverable after every cup is won', () => {
  const storage = createMemoryStorage();
  const store = completedStore(storage);
  const profile = store.snapshot().state;
  profile.claims = profile.claims.filter(
    (id) => !['boost-2', 'boost-3'].includes(id),
  );
  assert.deepEqual(remainingModeUnlocks(profile), {
    race: 0,
    cup: 0,
    'time-trial': 2,
    practice: 0,
  });
  assert.deepEqual(remainingModeUnlocks(store.snapshot().state), {
    race: 0,
    cup: 0,
    'time-trial': 0,
    practice: 0,
  });
  assert.ok(remainingModeUnlocks(freshProfile()).race > 0);
});

test('completion retains the last racer, resumes interrupted playback and acknowledges once per career', () => {
  const storage = createMemoryStorage();
  const store = completedStore(storage);
  assert.equal(store.queueCompletion('rival'), false);
  assert.equal(store.queueCompletion('needle'), true);
  assert.equal(store.queueCompletion('shrike'), false);
  const restored = createProfileStore(() => storage);
  assert.deepEqual(restored.snapshot().state.completion, {
    shipId: 'needle',
    acknowledged: false,
  });
  assert.equal(restored.acknowledgeCompletion(), true);
  assert.equal(restored.acknowledgeCompletion(), false);
  assert.equal(restored.queueCompletion('kestrel'), false);
  assert.equal(
    createProfileStore(() => storage).snapshot().state.completion.acknowledged,
    true,
  );
  assert.ok(validateProfile(JSON.parse(storage.getItem(PROFILE_KEY))));
});

test('older career saves remain valid and incomplete careers cannot queue or forge completion', () => {
  const old = freshProfile();
  delete old.completion;
  assert.equal(validateProfile(old).completion, null);
  assert.equal(
    validateProfile({
      ...old,
      completion: { shipId: 'shrike', acknowledged: true },
    }),
    null,
  );
  const store = createProfileStore(() => createMemoryStorage());
  assert.equal(store.queueCompletion('shrike'), false);
  assert.equal(store.acknowledgeCompletion(), false);
});
