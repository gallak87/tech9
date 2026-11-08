import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cupView, cupWaitingView } from './cup.js';
import { createCupStore, availableCups } from '../race/cup.js';
import {
  cupCabinet,
  cupCard,
  cupArt,
  cupHero,
  cupVictoryView,
} from './cup-art.js';
import { assetURL } from '../assets/url.js';
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
test('new cup difficulty controls describe the selected rival rules without adding a focus stop', () => {
  for (const [difficulty, description] of [
    ['easy', 'Rivals receive 50% of your stat upgrade bonuses.'],
    ['medium', 'Rivals receive 75% of your stat upgrade bonuses.'],
    ['hard', 'Rivals match your stat upgrade bonuses.'],
  ]) {
    const html = cupView({ catalog: [], routes: [], difficulty });
    assert.match(
      html,
      /<fieldset aria-describedby="cup-difficulty-description"><legend>Opponent difficulty<\/legend>/,
    );
    assert.ok(html.includes(description));
    assert.match(html, /id="cup-difficulty-description"/);
    assert.equal((html.match(/data-difficulty=/g) ?? []).length, 3);
    assert.doesNotMatch(
      html.match(/<p class="rival-difficulty-note".*?<\/p>/s)[0],
      /tabindex=|<button/,
    );
  }
  assert.doesNotMatch(resultAt(1), /rival-difficulty-note|data-difficulty=/);
});
test('the bonus cup only enters the picker and trophy cabinet after career completion', () => {
  const options = { catalog: [], routes: [], collection: {} };
  assert.doesNotMatch(cupView(options), /data-cup="encore"/);
  assert.doesNotMatch(cupCabinet(), /Encore/);
  const unlocked = availableCups({ complete: true });
  const html = cupView({ ...options, cups: unlocked });
  assert.match(html, /class="cup-card is-bonus[^>]*data-cup="encore"/);
  assert.equal((html.match(/class="cup-bonus-badge"/g) ?? []).length, 1);
  assert.match(cupCabinet({}, unlocked), /Encore Cup: not yet won/);
  assert.equal(
    cupArt('encore').trophy,
    assetURL('/assets/menu/cups/encore-trophy.webp'),
  );
  assert.notEqual(cupArt('encore').accent, cupArt('apex').accent);
  const won = { encore: { earnedAt: 1, points: 75, difficulty: 'hard' } };
  const encore = unlocked.at(-1);
  assert.doesNotMatch(cupCard(encore, encore.id, won), /cup-bonus-badge/);
  assert.match(
    cupCabinet({ cups: won }, unlocked),
    /Encore Cup: trophy earned/,
  );
});
test('Encore uses the same runtime trophy export in cards, cabinet, hero and victory', () => {
  const encore = availableCups({ complete: true }).find(
    ({ id }) => id === 'encore',
  );
  const trophy = assetURL('/assets/menu/cups/encore-trophy.webp');
  const store = createCupStore(() => ({ getItem: () => null, setItem() {} }));
  store.start('encore', 'kestrel', 'easy');
  for (let event = 0; event < encore.tracks.length; event++) {
    store.finish({
      standings: ['player', ...RACE_OPPONENTS.map(({ id }) => id)].map(
        (id, index) => ({
          id,
          finished: true,
          valid: true,
          totalTime: 100 + index,
        }),
      ),
    });
    if (event < encore.tracks.length - 1) store.next();
  }
  for (const [surface, html] of [
    ['card', cupCard(encore, encore.id, {})],
    ['unearned cabinet', cupCabinet({}, [encore])],
    [
      'earned cabinet',
      cupCabinet({ cups: { encore: { earnedAt: 1 } } }, [encore]),
    ],
    ['hero', cupHero(encore, encore.name, {})],
    ['victory', cupVictoryView(store.snapshot().state)],
  ])
    assert.ok(
      html.includes(`src="${trophy}"`),
      `${surface} uses the canonical raster icon`,
    );
  assert.match(cupArt('encore').background, /^data:image\/svg\+xml,/);
});
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
  assert.match(html, /data-action="cup-hub"[^>]*>Choose another cup/);
  assert.doesNotMatch(
    html,
    /data-action="cup-(?:abandon|retry|restart|confirm)"/,
  );
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
test('waiting classification keeps rival names as text', () => {
  const html = cupWaitingView({
    playerValid: true,
    playerTotalTime: 120,
    courseFormat: 'circuit',
    remaining: 9,
    standings: [
      {
        id: 'player',
        position: 1,
        finished: true,
        valid: true,
        totalTime: 120,
      },
      { id: 'rook', name: `Rook & <"Nova"> 'II'`, finished: false },
    ],
  });
  assert.ok(
    html.includes('<b>Rook &amp; &lt;&quot;Nova&quot;&gt; &#39;II&#39;</b>'),
  );
  assert.doesNotMatch(html, /<"Nova">/);
  assert.match(html, /ON TRACK/);
});
