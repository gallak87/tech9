import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COURSE_IDS,
  MODE_UNLOCKS,
  courseCollection,
  levelAvailable,
} from '../levels/access.js';
import { createCupStore } from '../race/cup.js';
import { createMemoryStorage } from './careers.js';
import { createCupCollection } from './cup-collection.js';
import { isCareerComplete, careerUnlockProgress } from './completion.js';
import {
  createProfileStore,
  freshProfile,
  PROFILE_KEY,
  validateProfile,
} from './profile.js';
import { settleRaceResult } from './result-coordinator.js';
import { createSaveTransfer } from './save-transfer.js';

function stores(storage = createMemoryStorage()) {
  return {
    storage,
    profileStore: createProfileStore(() => storage),
    cupStore: createCupStore(() => storage),
    cupCollection: createCupCollection(() => storage),
  };
}

function result(mode, { won = true, valid = true, medal = 'Complete' } = {}) {
  if (mode === 'freestyle')
    return {
      mode,
      playerValid: valid,
      medal,
      landed: 0,
      legs: Array.from({ length: 5 }, (_, i) => ({
        id: `transfer-${i + 1}`,
        landed: false,
      })),
    };
  return {
    mode,
    won,
    playerValid: valid,
    standings: [
      { id: 'player', valid, finished: true, position: won ? 1 : 10 },
    ],
  };
}

test('course finishes are unique, known, sequential and independent of reward claims', () => {
  const s = stores();
  assert.equal(s.profileStore.recordCourseFinish('zephyr-skywell'), false);
  s.profileStore.recordCup('founders');
  const before = s.profileStore.snapshot().state;
  assert.equal(s.profileStore.recordCourseFinish('freestyle-oriel'), false);
  assert.equal(s.profileStore.recordCourseFinish('zephyr-skywell'), true);
  assert.equal(s.profileStore.recordCourseFinish('zephyr-skywell'), false);
  assert.equal(s.profileStore.recordCourseFinish('oriel'), false);
  for (const id of ['unknown', null, undefined, { toString: null }])
    assert.equal(s.profileStore.recordCourseFinish(id), false);
  const after = s.profileStore.snapshot().state;
  assert.deepEqual(after.finishedCourses, ['zephyr-skywell']);
  assert.deepEqual(after.claims, before.claims);
  assert.equal(after.points, before.points);
  assert.equal(after.finishes, before.finishes);
  assert.deepEqual(
    stores(s.storage).profileStore.snapshot().state.finishedCourses,
    ['zephyr-skywell'],
  );
  assert.equal(
    levelAvailable('freestyle-oriel', {
      cupWins: after.cups,
      finishedCourses: after.finishedCourses,
    }),
    true,
  );
  assert.equal(
    levelAvailable('oriel', {
      cupWins: after.cups,
      finishedCourses: after.finishedCourses,
    }),
    false,
    'the separate canonical bonus circuit stays reward-gated',
  );
});

test('real course identities advance all three chains with full Freestyle finishes and event wins', () => {
  const s = stores();
  for (const unlock of MODE_UNLOCKS) {
    s.profileStore.recordCup(unlock.cupId);
    for (const id of unlock.levelIds) {
      const data = result(unlock.mode);
      const context = {
        sessionIntent: unlock.mode,
        courseId: id,
        attemptId: `course-${id}`,
        getShipId: () => 'shrike',
      };
      settleRaceResult(s, data, context);
      assert.ok(s.profileStore.snapshot().state.finishedCourses.includes(id));
      const earned = s.profileStore.snapshot().state;
      settleRaceResult(s, data, context);
      assert.deepEqual(s.profileStore.snapshot().state, earned);
    }
  }
  assert.deepEqual(s.profileStore.snapshot().state.finishedCourses, COURSE_IDS);
  const collection = courseCollection(s.profileStore.snapshot().state);
  assert.equal(collection.unlocked, 9);
  assert.equal(collection.completed, 9);
  assert.ok(s.profileStore.snapshot().state.points > 0);
});

test('event losses retain consolation points without advancing, while invalid and practice results do neither', () => {
  for (const [mode, cupId, id] of [
    ['eliminator', 'frontier', 'eliminator-glasswake'],
    ['interceptor', 'horizon', 'interceptor'],
  ]) {
    const s = stores();
    s.profileStore.recordCup(cupId);
    const context = {
      sessionIntent: mode,
      courseId: id,
      attemptId: 'lost-event',
      getShipId: () => 'shrike',
    };
    settleRaceResult(s, result(mode, { won: false }), context);
    assert.equal(s.profileStore.snapshot().state.points, 1);
    assert.deepEqual(s.profileStore.snapshot().state.finishedCourses, []);
    settleRaceResult(s, result(mode, { valid: false }), {
      ...context,
      attemptId: 'invalid-event',
    });
    settleRaceResult(s, result(mode), {
      ...context,
      sessionIntent: 'practice',
      attemptId: 'practice-event',
    });
    assert.equal(s.profileStore.snapshot().state.points, 1);
    assert.deepEqual(s.profileStore.snapshot().state.finishedCourses, []);
  }
  const s = stores();
  s.profileStore.recordCup('founders');
  for (const [data, intent] of [
    [result('freestyle', { valid: false }), 'freestyle'],
    [{ ...result('freestyle'), legs: [] }, 'freestyle'],
    [result('freestyle'), 'practice'],
  ])
    settleRaceResult(s, data, {
      sessionIntent: intent,
      courseId: 'zephyr-skywell',
      attemptId: 'invalid-flight',
    });
  assert.equal(s.profileStore.snapshot().state.points, 0);
  assert.deepEqual(s.profileStore.snapshot().state.finishedCourses, []);
});

test('a mode result cannot award another discipline or an unavailable later course', () => {
  const s = stores();
  for (const id of ['founders', 'frontier', 'horizon'])
    s.profileStore.recordCup(id);
  for (const courseId of ['freestyle-oriel', 'interceptor', 'oriel', undefined])
    settleRaceResult(s, result('freestyle'), {
      sessionIntent: 'freestyle',
      courseId,
      attemptId: `mismatch-${courseId}`,
      getShipId: () => 'shrike',
    });
  assert.deepEqual(s.profileStore.snapshot().state.finishedCourses, []);
  assert.ok(s.profileStore.snapshot().state.points > 0);
});

test('course state is validated and save transfer carries it without changing the career version', () => {
  const old = freshProfile();
  delete old.finishedCourses;
  assert.deepEqual(validateProfile(old).finishedCourses, []);
  for (const finishedCourses of [
    null,
    {},
    ['unknown'],
    [{ toString: null }],
    ['zephyr-skywell', 'zephyr-skywell'],
    Array(10).fill('zephyr-skywell'),
  ])
    assert.equal(validateProfile({ ...freshProfile(), finishedCourses }), null);
  const source = stores();
  source.profileStore.recordCup('founders');
  source.profileStore.recordCourseFinish('zephyr-skywell');
  const transfer = (s) =>
    createSaveTransfer({
      ...s,
      storage: () => s.storage,
    });
  const file = transfer(source).export();
  const target = stores();
  const destination = transfer(target);
  destination.replace(destination.parse(file));
  assert.deepEqual(target.profileStore.snapshot().state.finishedCourses, [
    'zephyr-skywell',
  ]);
  assert.equal(target.profileStore.snapshot().state.version, 3);
});

test('the Skywell rename preserves legacy careers and imported course progress', () => {
  const legacy = freshProfile();
  legacy.cups = ['founders'];
  legacy.finishedCourses = ['launchworks', 'freestyle-oriel'];
  const storage = createMemoryStorage();
  storage.setItem(PROFILE_KEY, JSON.stringify(legacy));
  const source = stores(storage);
  const restored = source.profileStore.snapshot();
  assert.equal(restored.notice, '');
  assert.deepEqual(restored.state.finishedCourses, [
    'zephyr-skywell',
    'freestyle-oriel',
  ]);
  assert.equal(
    levelAvailable('freestyle-ravel', {
      cupWins: restored.state.cups,
      finishedCourses: restored.state.finishedCourses,
    }),
    true,
  );
  assert.equal(source.profileStore.recordCourseFinish('launchworks'), false);
  assert.equal(
    validateProfile({
      ...legacy,
      finishedCourses: ['launchworks', 'zephyr-skywell'],
    }),
    null,
    'a legacy alias cannot duplicate the canonical completion',
  );
  const makeTransfer = (s) =>
    createSaveTransfer({ ...s, storage: () => s.storage });
  const backup = JSON.parse(makeTransfer(source).export());
  backup.profile.finishedCourses = legacy.finishedCourses;
  const target = stores();
  const transfer = makeTransfer(target);
  transfer.replace(transfer.parse(JSON.stringify(backup)));
  assert.deepEqual(
    target.profileStore.snapshot().state.finishedCourses,
    restored.state.finishedCourses,
  );
});

test('storage failure retains completed course state for the session and export', () => {
  const s = stores();
  s.profileStore.recordCup('founders');
  s.storage.setItem = () => {
    throw new Error('storage denied');
  };
  assert.equal(s.profileStore.recordCourseFinish('zephyr-skywell'), true);
  assert.equal(s.profileStore.snapshot().saved, false);
  assert.deepEqual(s.profileStore.snapshot().state.finishedCourses, [
    'zephyr-skywell',
  ]);
  const transfer = createSaveTransfer({ ...s, storage: () => s.storage });
  assert.deepEqual(JSON.parse(transfer.export()).profile.finishedCourses, [
    'zephyr-skywell',
  ]);
});

test('the original twenty-eight rewards remain twenty-eight items while the nine derived courses complete the unified collection', () => {
  const s = stores();
  for (let i = 0; i < 24; i++)
    s.profileStore.recordRace({ id: `race-${i}`, won: true });
  for (const id of ['founders', 'frontier', 'horizon', 'apex'])
    s.profileStore.recordCup(id);
  for (const id of ['halcyon', 'orbital']) s.profileStore.recordTrial(id, true);
  const profile = s.profileStore.snapshot().state;
  assert.equal(profile.claims.length, 28);
  assert.deepEqual(profile.finishedCourses, []);
  assert.equal(isCareerComplete(profile), false);
  assert.equal(careerUnlockProgress(profile).collected, 31);
  assert.equal(courseCollection(profile).unlocked, 3);
  assert.equal(s.profileStore.queueCompletion('shrike'), false);
  assert.equal(
    levelAvailable('oriel', { complete: isCareerComplete(profile) }),
    false,
  );
  assert.equal(
    levelAvailable('freestyle-oriel', {
      complete: true,
      cupWins: profile.cups,
      finishedCourses: [],
    }),
    false,
  );
  for (const mode of MODE_UNLOCKS)
    for (const id of mode.levelIds.slice(0, 2))
      s.profileStore.recordCourseFinish(id);
  const completed = s.profileStore.snapshot().state;
  assert.equal(completed.claims.length, 28);
  assert.equal(careerUnlockProgress(completed).collected, 37);
  assert.equal(isCareerComplete(completed), true);
  assert.equal(s.profileStore.queueCompletion('shrike'), true);
  assert.equal(
    levelAvailable('oriel', { complete: isCareerComplete(completed) }),
    true,
  );
});
