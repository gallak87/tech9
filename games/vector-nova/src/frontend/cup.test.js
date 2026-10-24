import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cupView } from './cup.js';
import { createCupStore } from '../race/cup.js';
import { RACE_OPPONENTS } from '../race/roster.js';

function resultAt(
  position,
  { complete = false, valid = true, notice = '' } = {},
) {
  const ids = RACE_OPPONENTS.map((row) => row.id);
  ids.splice(position - 1, 0, 'player');
  const store = createCupStore(() => ({ getItem: () => null, setItem() {} }));
  store.start('founders', 'kestrel', 'easy');
  for (let event = 0; event < (complete ? 3 : 1); event++) {
    store.finish({
      standings: ids.map((id, i) => ({
        id,
        finished: true,
        valid: id !== 'player' || valid,
        totalTime: 100 + i,
      })),
    });
    if (complete && event < 2) store.next();
  }
  return cupView({
    state: store.snapshot().state,
    notice,
    catalog: [],
    routes: [],
  });
}

function ranks(html) {
  const table = html.match(
    /<table class="cup-table cup-standings">(.*?)<\/table>/s,
  )[1];
  return [...table.matchAll(/<tr class="[^"]*"><td>(\d+)<\/td>/g)].map(
    (match) => Number(match[1]),
  );
}
for (const [position, expected] of [
  [1, [1, 2, 3]],
  [2, [1, 2, 3, 4]],
  [5, [3, 4, 5, 6, 7]],
  [9, [7, 8, 9, 10]],
  [10, [8, 9, 10]],
]) {
  test(`intermediate standings retain real ranks around position ${position}`, () => {
    assert.deepEqual(ranks(resultAt(position)), expected);
  });
}
test('final standings include the complete field', () => {
  const html = resultAt(5, { complete: true });
  assert.deepEqual(ranks(html), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.match(html, /Final cup standings/);
  assert.doesNotMatch(html, /Next grid:/);
});
test('results explain the earned next grid instead of promising pole after a win', () => {
  assert.match(resultAt(1), /Next grid: P03 \/ 10/);
  assert.match(resultAt(5), /Next grid: P10 \/ 10/);
  assert.match(resultAt(1, { valid: false }), /Next grid: P10 \/ 10/);
});
test('invalid finishes stay visible with zero points and storage warnings survive the compact view', () => {
  const html = resultAt(1, {
    valid: false,
    notice: 'Could not save <progress>.',
  });
  assert.deepEqual(ranks(html), [8, 9, 10]);
  assert.match(html, /<dd>Invalid<\/dd>/);
  assert.match(html, /<dd>\+0<\/dd>/);
  assert.match(html, /role="status">Could not save &lt;progress&gt;\.<\/p>/);
});
