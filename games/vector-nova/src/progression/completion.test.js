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
import { careerUnlockProgress } from './completion.js';
import { MODE_UNLOCKS, levelAvailable } from '../levels/access.js';

function completedStore(storage) {
  const store = createProfileStore(() => storage);
  for (let i = 0; i < 24; i++) store.recordRace({ id: `race-${i}`, won: true });
  for (const cup of ['founders', 'frontier', 'horizon', 'apex'])
    store.recordCup(cup);
  store.recordTrial('halcyon', true);
  store.recordTrial('orbital', true);
  for (const mode of MODE_UNLOCKS)
    for (const id of mode.levelIds.slice(0, 2)) store.recordCourseFinish(id);
  return store;
}

test('the one thirty-seven unlock collection requires twenty-eight rewards and nine earned courses without a bonus-course cycle', () => {
  const profile = freshProfile();
  assert.equal(ALL_REWARDS.length, 28);
  assert.equal(isCareerComplete(profile), false);
  profile.claims = ALL_REWARDS.map(({ id }) => id);
  assert.equal(isCareerComplete(profile), false);
  assert.equal(careerUnlockProgress(profile).collected, 28);
  profile.cups = ['founders', 'frontier', 'horizon'];
  profile.finishedCourses = MODE_UNLOCKS.flatMap((mode) =>
    mode.levelIds.slice(0, 2),
  );
  assert.equal(isCareerComplete(profile), true);
  const progress = careerUnlockProgress(profile);
  assert.equal(progress.total, 37);
  assert.equal(progress.collected, 37);
  assert.equal(progress.rewardCount, 28);
  assert.equal(progress.courseCount, 9);
  assert.equal(new Set(progress.items.map((item) => item.id)).size, 37);
  assert.equal(profile.finishedCourses.length, 6);
  assert.ok(!profile.cups.includes('encore'));
  assert.ok(
    profile.finishedCourses.every(
      (id) => !['oriel', 'ravel', 'nomad'].includes(id),
    ),
  );
  for (const id of ['oriel', 'ravel', 'nomad'])
    assert.equal(
      levelAvailable(id, { complete: isCareerComplete(profile) }),
      true,
    );
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
  for (const cup of profile.cups)
    assert.equal(
      isCareerComplete({
        ...profile,
        cups: profile.cups.filter((id) => id !== cup),
      }),
      false,
    );
  for (const course of profile.finishedCourses)
    assert.equal(
      isCareerComplete({
        ...profile,
        finishedCourses: profile.finishedCourses.filter((id) => id !== course),
      }),
      false,
    );
  profile.claims = Array(28).fill('speed-1');
  assert.equal(isCareerComplete(profile), false);
});

test('course unlocks are derived from earned progress and cannot be supplied as fake claims or developer permission', () => {
  const profile = freshProfile();
  profile.claims = ALL_REWARDS.map(({ id }) => id);
  const progress = careerUnlockProgress({ ...profile, developer: true });
  assert.equal(progress.total, 37);
  assert.equal(progress.collected, 28);
  assert.equal(progress.courseCount, 0);
  assert.equal(isCareerComplete({ ...profile, developer: true }), false);
  assert.equal(
    validateProfile({ ...profile, claims: [...profile.claims, 'launchworks'] }),
    null,
  );
  assert.ok(
    progress.items
      .filter((item) => item.kind === 'course')
      .every((item) => !item.collected),
  );
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
    freestyle: 0,
    eliminator: 0,
    interceptor: 0,
    'time-trial': 2,
    practice: 0,
  });
  assert.deepEqual(remainingModeUnlocks(store.snapshot().state), {
    race: 0,
    cup: 0,
    freestyle: 0,
    eliminator: 0,
    interceptor: 0,
    'time-trial': 0,
    practice: 0,
  });
  const fresh = remainingModeUnlocks(freshProfile());
  assert.ok(fresh.race > 0);
  assert.equal(fresh.freestyle, 0);
  assert.equal(fresh.eliminator, 0);
  assert.equal(fresh.interceptor, 0);
  const gearOnly = store.snapshot().state;
  gearOnly.finishedCourses = [];
  assert.deepEqual(remainingModeUnlocks(gearOnly), {
    race: 0,
    cup: 0,
    freestyle: 2,
    eliminator: 2,
    interceptor: 2,
    'time-trial': 0,
    practice: 0,
  });
  gearOnly.cups = [];
  assert.equal(remainingModeUnlocks(gearOnly).cup, 3);
});

test('event mode badges count locked successor courses, not equipment rewards or unfinished open courses', () => {
  for (const { mode, cupId, levelIds } of MODE_UNLOCKS) {
    const storage = createMemoryStorage();
    const store = createProfileStore(() => storage);
    const expectCount = (expected) => {
      const profile = store.snapshot().state;
      for (const claims of [
        profile.claims,
        [],
        ALL_REWARDS.map(({ id }) => id),
      ])
        assert.equal(
          remainingModeUnlocks({ ...profile, claims })[mode],
          expected,
          `${mode}: gear collection cannot change unopened course count`,
        );
    };
    expectCount(0);
    store.recordCup(cupId);
    expectCount(2);
    assert.equal(store.recordCourseFinish(levelIds[0]), true);
    expectCount(1);
    assert.equal(store.recordCourseFinish(levelIds[1]), true);
    assert.equal(
      store.snapshot().state.finishedCourses.includes(levelIds[2]),
      false,
    );
    expectCount(0);
    assert.equal(store.recordCourseFinish(levelIds[2]), true);
    expectCount(0);
  }
});

test('remaining equipment still counts for Race and Championships while event badges show only unopened courses', () => {
  const store = completedStore(createMemoryStorage());
  const profile = store.snapshot().state;
  profile.claims = profile.claims.filter((id) => id !== 'speed-1');
  profile.finishedCourses = ['launchworks'];
  assert.deepEqual(remainingModeUnlocks(profile), {
    race: 1,
    cup: 1,
    freestyle: 1,
    eliminator: 2,
    interceptor: 2,
    'time-trial': 0,
    practice: 0,
  });
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

test('completion acknowledgement is structural presentation metadata and incomplete careers cannot queue playback', () => {
  const old = freshProfile();
  delete old.completion;
  assert.equal(validateProfile(old).completion, null);
  const acknowledged = validateProfile({
    ...old,
    claims: ALL_REWARDS.map(({ id }) => id),
    completion: { shipId: 'shrike', acknowledged: true },
  });
  assert.equal(acknowledged.claims.length, 28);
  assert.deepEqual(acknowledged.completion, {
    shipId: 'shrike',
    acknowledged: true,
  });
  assert.equal(isCareerComplete(acknowledged), false);
  assert.equal(
    validateProfile({
      ...old,
      completion: { shipId: 'rival', acknowledged: true },
    }),
    null,
  );
  assert.equal(
    validateProfile({
      ...old,
      completion: { shipId: 'shrike', acknowledged: 'yes' },
    }),
    null,
  );
  const store = createProfileStore(() => createMemoryStorage());
  assert.equal(store.queueCompletion('shrike'), false);
  assert.equal(store.acknowledgeCompletion(), false);
});
