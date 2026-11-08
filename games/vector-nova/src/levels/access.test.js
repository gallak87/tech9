import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BONUS_LEVEL_IDS,
  ENDGAME_EVENT_LEVEL_IDS,
  filterAvailableLevels,
  levelAvailable,
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
  assert.equal(levelAvailable('shatterline'), true);
});

test('endgame event routes require the completed career and closed credits together', () => {
  const catalog = [
    { id: 'halcyon' },
    ...ENDGAME_EVENT_LEVEL_IDS.map((id) => ({ id })),
  ];
  for (const access of [
    {},
    { complete: true },
    { postCareer: true },
    { complete: true, postCareer: false },
  ])
    assert.deepEqual(filterAvailableLevels(catalog, access), [catalog[0]]);
  for (const access of [
    { complete: true, postCareer: true },
    { developer: true },
  ])
    assert.deepEqual(filterAvailableLevels(catalog, access), catalog);
});
