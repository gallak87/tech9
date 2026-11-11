import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cupView, cupWaitingView, cupLaunch } from './cup.js';
import { createCupStore, availableCups, cupDefinition } from '../race/cup.js';
import {
  cupCabinet,
  cupCard,
  cupArt,
  cupHero,
  cupVictoryView,
} from './cup-art.js';
import { RACE_OPPONENTS } from '../race/roster.js';

function stateAt(
  position,
  { complete = false, valid = true, cupId = 'founders' } = {},
) {
  const ids = RACE_OPPONENTS.map((row) => row.id);
  ids.splice(position - 1, 0, 'player');
  const store = createCupStore(() => ({ getItem: () => null, setItem() {} }));
  store.start(cupId, 'kestrel', 'easy');
  const events = complete ? cupDefinition(cupId).tracks.length : 1;
  for (let event = 0; event < events; event++) {
    store.finish({
      standings: ids.map((id, i) => ({
        id,
        finished: true,
        valid: id !== 'player' || valid,
        totalTime: 100 + i,
      })),
    });
    if (event < events - 1) store.next();
  }
  return store.snapshot().state;
}
function resultAt(position, options = {}) {
  return cupView({
    state: stateAt(position, options),
    notice: options.notice ?? '',
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
test('the bonus cup only enters the picker and trophy cabinet after career completion', () => {
  const options = { catalog: [], routes: [], collection: {} };
  assert.doesNotMatch(cupView(options), /data-cup="encore"/);
  assert.doesNotMatch(cupCabinet(), /Encore/);
  const unlocked = availableCups({ complete: true });
  const html = cupView({ ...options, cups: unlocked });
  assert.match(html, /class="cup-card is-bonus[^>]*data-cup="encore"/);
  assert.equal((html.match(/class="cup-bonus-badge"/g) ?? []).length, 1);
  assert.match(cupCabinet({}, unlocked), /Encore Cup: not yet won/);
  assert.match(cupArt('encore').trophy, /^data:image\/svg\+xml,/);
  assert.notEqual(cupArt('encore').accent, cupArt('apex').accent);
  const won = { encore: { earnedAt: 1, points: 75, difficulty: 'hard' } };
  const encore = unlocked.at(-1);
  assert.doesNotMatch(cupCard(encore, encore.id, won), /cup-bonus-badge/);
  assert.match(
    cupCabinet({ cups: won }, unlocked),
    /Encore Cup: trophy earned/,
  );
});

for (const [cupId, mode] of [
  ['founders', 'Freestyle'],
  ['frontier', 'Eliminator'],
  ['horizon', 'Interceptor'],
]) {
  test(`${cupId} setup and championship award explain the ${mode} unlock`, () => {
    const cup = cupDefinition(cupId);
    const card = cupCard(cup, cupId, {});
    assert.match(card, new RegExp(`class="cup-card-unlock">Unlocks ${mode}`));
    assert.match(card, new RegExp(`aria-label="[^"]*, Unlocks ${mode}"`));
    assert.match(card, /<button[^>]*data-cup=/);
    const setup = cupView({ cupId, catalog: [], routes: [] });
    assert.match(setup, new RegExp(`class="cup-mode-unlock">Unlocks ${mode}`));
    const collection = { [cupId]: { earnedAt: 1 } };
    assert.match(
      cupHero(cup, cup.name, collection),
      new RegExp(`class="cup-mode-unlock">${mode} unlocked`),
    );
    const state = stateAt(1, { cupId, complete: true });
    for (const fresh of [true, false]) {
      const victory = cupVictoryView(state, { fresh });
      assert.match(
        victory,
        new RegExp(`class="cup-victory-unlock">${mode} unlocked`),
      );
      assert.match(victory, /data-action="cup-standings"/);
      assert.match(victory, /data-action="cup-hub"/);
    }
  });
}

test('Apex and Encore presentation does not promise another event mode', () => {
  for (const cupId of ['apex', 'encore']) {
    const cup = cupDefinition(cupId);
    assert.doesNotMatch(cupCard(cup, cupId, {}), /cup-card-unlock/);
    assert.doesNotMatch(cupHero(cup, cup.name, {}), /cup-mode-unlock/);
  }
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
test('cup results keep the next race primary until the championship is complete', () => {
  for (const { id: cupId } of availableCups({ complete: true })) {
    for (const complete of [false, true]) {
      for (const valid of [false, true]) {
        const state = stateAt(5, { cupId, complete, valid });
        const html = cupView({ state, catalog: [], routes: [] });
        const action = complete ? 'cup-hub' : 'cup-next';
        assert.deepEqual(
          [
            ...html.matchAll(/<button data-action="([^"]+)" class="primary">/g),
          ].map((match) => match[1]),
          [action],
          `${cupId}: ${complete ? 'completed' : 'intermediate'} results`,
        );
        assert.equal(cupLaunch(state, cupId).action, action);
        if (!complete) {
          assert.match(html, /data-action="cup-retry" class="">Retry race/);
          assert.ok(
            html.indexOf('data-action="cup-next"') <
              html.indexOf('data-action="cup-retry"'),
          );
        }
      }
    }
  }
});
test('waiting for cup classification offers the cup hub before a secondary retry', () => {
  for (const playerValid of [false, true]) {
    const html = cupWaitingView({
      playerValid,
      playerTotalTime: 120,
      courseFormat: 'circuit',
      remaining: 9,
      standings: [
        {
          id: 'player',
          position: 1,
          finished: true,
          valid: playerValid,
          totalTime: 120,
        },
      ],
    });
    assert.match(
      html,
      /<div class="front-actions"><button data-action="cup-hub" class="primary">/,
    );
    assert.match(html, /data-action="cup-retry" class="">Retry this race/);
    assert.doesNotMatch(html, /data-action="cup-next"/);
  }
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
