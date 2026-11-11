import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BONUS_LEVEL_IDS,
  COURSE_IDS,
  MODE_UNLOCKS,
  courseAvailable,
  courseCollection,
  courseUnlockRequirement,
  filterAvailableLevels,
  levelAvailable,
  levelUnlockRequirement,
  lockedLevelMessage,
  modeAvailable,
  modeUnlockRequirement,
  previewSelectable,
} from './access.js';

test('bonus tracks unlock together only for complete careers or developer sessions', () => {
  const catalog = [{ id: 'halcyon' }, ...BONUS_LEVEL_IDS.map((id) => ({ id }))];
  assert.deepEqual(filterAvailableLevels(catalog), [catalog[0]]);
  assert.deepEqual(filterAvailableLevels(catalog, { complete: true }), catalog);
  assert.deepEqual(
    filterAvailableLevels(catalog, { developer: true }),
    catalog,
  );
  for (const id of BONUS_LEVEL_IDS) assert.equal(levelAvailable(id), false);
  for (const id of BONUS_LEVEL_IDS)
    assert.equal(
      levelAvailable(id, { cupWins: ['founders', 'frontier', 'horizon'] }),
      false,
    );
  assert.equal(levelAvailable('shatterline'), true);
});

test('each championship victory unlocks its own mode and only its starter course', () => {
  const expected = [
    [
      'founders',
      'freestyle',
      ['zephyr-skywell', 'freestyle-oriel', 'freestyle-ravel'],
    ],
    [
      'frontier',
      'eliminator',
      ['eliminator-glasswake', 'eliminator-saffron', 'eliminator-nomad'],
    ],
    [
      'horizon',
      'interceptor',
      ['interceptor', 'interceptor-helion', 'interceptor-nightweir'],
    ],
  ];
  for (const [cupId, mode, levelIds] of expected) {
    const access = { cupWins: [cupId] };
    assert.equal(modeAvailable(mode, access), true);
    assert.equal(levelAvailable(levelIds[0], access), true);
    for (const id of levelIds.slice(1))
      assert.equal(levelAvailable(id, access), false);
    for (const other of expected.filter(([otherCup]) => otherCup !== cupId)) {
      assert.equal(modeAvailable(other[1], access), false);
      for (const id of other[2])
        assert.equal(levelAvailable(id, access), false);
    }
  }
});

test('career completion does not substitute for a mode cup win or add another mode prerequisite', () => {
  const catalog = [
    { id: 'halcyon' },
    ...MODE_UNLOCKS.flatMap(({ levelIds }) => levelIds.map((id) => ({ id }))),
  ];
  for (const access of [
    {},
    { complete: true },
    { cupWins: ['demo', 'apex', 'encore'] },
    { cupWins: null },
  ])
    assert.deepEqual(filterAvailableLevels(catalog, access), [catalog[0]]);
  for (const access of [
    {
      cupWins: ['founders', 'frontier', 'horizon'],
      finishedCourses: COURSE_IDS,
    },
    { developer: true },
  ])
    assert.deepEqual(filterAvailableLevels(catalog, access), catalog);
  for (const mode of ['race', 'cup', 'practice', 'time-trial'])
    assert.equal(modeAvailable(mode), true);
});

test('each course requires all earlier finishes and cannot skip its cup or another discipline', () => {
  const access = {
    cupWins: ['founders'],
    finishedCourses: ['zephyr-skywell'],
  };
  assert.equal(courseAvailable('freestyle-oriel', access), true);
  assert.equal(courseAvailable('freestyle-ravel', access), false);
  assert.equal(courseAvailable('eliminator-glasswake', access), false);
  assert.equal(
    courseAvailable('freestyle-oriel', {
      ...access,
      cupWins: [],
      complete: true,
    }),
    false,
  );
  assert.equal(
    courseAvailable('freestyle-ravel', {
      ...access,
      finishedCourses: ['freestyle-oriel'],
    }),
    false,
    'an imported middle-course claim cannot skip the starter',
  );
  assert.deepEqual(
    courseUnlockRequirement('freestyle-oriel', {
      cupWins: ['founders'],
    }),
    {
      type: 'course',
      mode: 'freestyle',
      label: 'Freestyle',
      courseId: 'zephyr-skywell',
      winRequired: false,
    },
  );
  assert.equal(
    courseUnlockRequirement('interceptor-helion', {
      cupWins: ['horizon'],
    }).winRequired,
    true,
  );
  assert.equal(courseAvailable('oriel', access), false);
  assert.equal(levelAvailable('oriel', access), false);
  assert.equal(levelAvailable('freestyle-oriel', access), true);
});

test('locked mode courses remain selectable previews without permission to launch', () => {
  for (const id of COURSE_IDS) {
    assert.equal(previewSelectable(id), true);
    assert.equal(levelAvailable(id), false);
  }
  assert.equal(previewSelectable('oriel'), false);
  assert.equal(previewSelectable('oriel', { complete: true }), true);
  assert.equal(previewSelectable('crucible'), false);
  assert.equal(levelAvailable('crucible'), false);
  assert.equal(previewSelectable('crucible', { developer: true }), true);
  assert.equal(levelAvailable('crucible', { developer: true }), true);
});

test('the nine-course collection distinguishes availability from completion and remains separate from rewards', () => {
  const fresh = courseCollection({ cups: [], claims: [], finishedCourses: [] });
  assert.equal(fresh.total, 9);
  assert.equal(fresh.unlocked, 0);
  assert.equal(fresh.completed, 0);
  assert.ok(fresh.courses.every((course) => course.status === 'locked'));
  const started = courseCollection({
    cups: ['founders'],
    finishedCourses: ['zephyr-skywell'],
    claims: [],
  });
  assert.equal(started.unlocked, 2);
  assert.equal(started.completed, 1);
  assert.equal(started.courses[0].status, 'completed');
  assert.equal(started.courses[1].status, 'available');
  assert.equal(started.courses[2].status, 'locked');
  assert.equal(started.courses[1].previousId, 'zephyr-skywell');
  const completed = courseCollection({
    cups: ['founders', 'frontier', 'horizon'],
    finishedCourses: COURSE_IDS,
    claims: [],
  });
  assert.equal(completed.unlocked, 9);
  assert.equal(completed.completed, 9);
});

test('locked-route messages identify the same cup used by mode and direct-route gates', () => {
  for (const unlock of MODE_UNLOCKS) {
    assert.equal(modeUnlockRequirement(unlock.mode), unlock);
    for (const id of unlock.levelIds) {
      assert.equal(levelUnlockRequirement(id), unlock);
      assert.equal(
        lockedLevelMessage(id),
        `Win ${unlock.cupName} to unlock ${unlock.label}.`,
      );
    }
  }
  assert.equal(modeUnlockRequirement('race'), null);
  assert.equal(levelUnlockRequirement('halcyon'), null);
  assert.match(lockedLevelMessage('oriel'), /37 career unlocks/);
});

test('old encounter links use the canonical course gate before boot', () => {
  for (const [alias, id] of [
    ['interceptor-orbital', 'interceptor-helion'],
    ['interceptor-halcyon', 'interceptor-nightweir'],
  ]) {
    assert.equal(levelAvailable(alias), false);
    assert.equal(previewSelectable(alias), true);
    const access = { cupWins: ['horizon'], finishedCourses: ['interceptor'] };
    assert.equal(levelAvailable(alias, access), levelAvailable(id, access));
    assert.equal(
      lockedLevelMessage(alias, access),
      lockedLevelMessage(id, access),
    );
  }
});
