import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BONUS_LEVEL_IDS,
  MODE_UNLOCKS,
  filterAvailableLevels,
  levelAvailable,
  levelUnlockRequirement,
  lockedLevelMessage,
  modeAvailable,
  modeUnlockRequirement,
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

test('each championship victory unlocks its own mode and every corresponding route', () => {
  const expected = [
    ['founders', 'freestyle', ['launchworks']],
    ['frontier', 'eliminator', ['crucible']],
    [
      'horizon',
      'interceptor',
      ['interceptor', 'interceptor-helion', 'interceptor-nightweir'],
    ],
  ];
  for (const [cupId, mode, levelIds] of expected) {
    const access = { cupWins: [cupId] };
    assert.equal(modeAvailable(mode, access), true);
    for (const id of levelIds) assert.equal(levelAvailable(id, access), true);
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
    { cupWins: ['founders', 'frontier', 'horizon'] },
    { developer: true },
  ])
    assert.deepEqual(filterAvailableLevels(catalog, access), catalog);
  for (const mode of ['race', 'cup', 'practice', 'time-trial'])
    assert.equal(modeAvailable(mode), true);
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
  assert.match(lockedLevelMessage('oriel'), /28 career unlocks/);
});
