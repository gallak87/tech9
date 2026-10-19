import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CUPS,
  createCupStore,
  CUP_STORAGE_KEY,
  CUP_POINTS,
  classifyCupRace,
  cupRaceRows,
  cupStandings,
  cupComplete,
} from './cup.js';
import { RACE_OPPONENTS } from './roster.js';
const ids = ['player', ...RACE_OPPONENTS.map((r) => r.id)];
const result = (order = ids, base = 100) => ({
  standings: order.map((id, i) => ({
    id,
    finished: true,
    valid: true,
    totalTime: base + i,
  })),
});
function memory() {
  const data = new Map();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
  };
}
for (const cup of CUPS)
  test(`${cup.name}: events persist at every boundary; retry replaces only current scores`, () => {
    const storage = memory();
    let store = createCupStore(() => storage);
    store.start(cup.id, 'shrike', 'hard');
    store.finish(result());
    assert.equal(store.finish(result(ids.toReversed())), false);
    store = createCupStore(() => storage);
    assert.equal(store.snapshot().state.phase, 'results');
    assert.equal(store.snapshot().state.cupId, cup.id);
    assert.equal(store.next(), true);
    assert.equal(store.next(), false);
    store = createCupStore(() => storage);
    assert.equal(store.snapshot().state.eventIndex, 1);
    assert.equal(store.snapshot().state.shipId, 'shrike');
    assert.equal(store.snapshot().state.difficulty, 'hard');
    store.finish(result());
    store.retry();
    assert.equal(store.snapshot().state.results.length, 1);
    store.finish(result(ids.toReversed()));
    store.next();
    store.finish(result());
    assert.equal(cupComplete(store.snapshot().state), true);
    assert.equal(store.next(), false);
    assert.equal(
      cupStandings(store.snapshot().state).find((r) => r.id === 'player')
        .points,
      51,
    );
    store.retry();
    assert.equal(store.snapshot().state.results.length, 2);
    store.abandon();
    assert.equal(createCupStore(() => storage).snapshot().state, null);
    assert.equal(createCupStore(() => storage).snapshot().notice, '');
  });
test('ten places score once; invalid and missing finishes never score', () => {
  assert.deepEqual(
    cupRaceRows(classifyCupRace(result())).map((r) => r.points),
    CUP_POINTS,
  );
  const race = result();
  race.standings[0].valid = false;
  race.standings[1].finished = false;
  const scored = cupRaceRows(classifyCupRace(race));
  assert.equal(scored.find((r) => r.id === 'player').points, 0);
  assert.equal(scored.find((r) => r.id === 'rook').status, 'dnf');
  assert.equal(scored[0].points, 25);
  assert.equal(scored[0].id, 'latch');
});
test('wins break tied points before total time; exact ties share rank', () => {
  // A win plus third ties two seconds: 25+15 versus 18+18 does not tie;
  // three races: 25+12+6 = 18+15+10 = 43.
  const orders = [
    ids,
    [
      'latch',
      'mule',
      'rook',
      'player',
      ...ids.filter((r) => !['latch', 'mule', 'rook', 'player'].includes(r)),
    ],
    [
      'latch',
      'mule',
      'pike',
      'tern',
      'rook',
      'manta',
      'player',
      'vise',
      'kite',
      'gannet',
    ],
  ];
  const state = {
    results: orders.map((order) => classifyCupRace(result(order))),
  };
  const rows = cupStandings(state);
  const player = rows.find((r) => r.id === 'player'),
    rook = rows.find((r) => r.id === 'rook');
  assert.equal(player.points, rook.points);
  assert.ok(player.position < rook.position);
  const tied = cupStandings({
    results: [
      classifyCupRace({
        standings: ids.map((id) => ({
          id,
          finished: false,
          valid: false,
          totalTime: null,
        })),
      }),
    ],
  });
  assert.ok(tied.every((r) => r.position === 1));
  const swap = [ids[1], ids[0], ...ids.slice(2)];
  const totals = cupStandings({
    results: [classifyCupRace(result()), classifyCupRace(result(swap))],
  });
  assert.equal(
    totals.find((r) => r.id === 'player').position,
    totals.find((r) => r.id === 'rook').position,
  );
});
test('total time breaks ties after points and wins', () => {
  const first = classifyCupRace(result());
  const second = classifyCupRace(result(['rook', 'player', ...ids.slice(2)]));
  second.find((r) => r.id === 'player').timeMs += 500;
  const rows = cupStandings({ results: [first, second] });
  const player = rows.find((r) => r.id === 'player'),
    rook = rows.find((r) => r.id === 'rook');
  assert.equal(player.points, rook.points);
  assert.equal(player.wins, rook.wins);
  assert.ok(rook.position < player.position);
  const empty = { results: [] };
  assert.equal(
    cupStandings(empty).every((r) => r.position === 1),
    true,
  );
});
test('storage failure retains current page state and discloses older disk progress', () => {
  const storage = memory();
  const store = createCupStore(() => storage);
  store.start('founders', 'kestrel', 'easy');
  storage.setItem = () => {
    throw Error('quota');
  };
  store.finish(result());
  assert.equal(store.snapshot().state.phase, 'results');
  assert.equal(store.snapshot().saved, false);
  assert.match(store.snapshot().notice, /older progress/);
  store.abandon();
  assert.equal(store.snapshot().state, null);
  assert.equal(store.snapshot().saved, false);
});
test('damaged saves and unknown versions are ignored; impossible results rejected', () => {
  const storage = memory();
  for (const raw of [
    '{',
    '[]',
    '{"version":77}',
    JSON.stringify({
      version: 1,
      cupId: 'founders',
      shipId: 'kestrel',
      difficulty: 'easy',
      eventIndex: 7,
      phase: 'results',
      results: [],
    }),
  ]) {
    storage.setItem(CUP_STORAGE_KEY, raw);
    assert.equal(createCupStore(() => storage).snapshot().state, null);
  }
  const race = result();
  race.standings[0].totalTime = NaN;
  assert.throws(() => classifyCupRace(race));
  race.standings[0] = race.standings[1];
  assert.throws(() => classifyCupRace(race));
});
