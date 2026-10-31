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
  cupGridOrder,
  validateCup,
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
test('current cup saves require their own run identity', () => {
  const storage = memory();
  const valid = createCupStore(() => storage).start(
    'founders',
    'shrike',
    'easy',
  );
  assert.equal(validateCup(valid).runId, valid.runId);
  for (const runId of [undefined, '', 'x'.repeat(101)])
    assert.equal(validateCup({ ...valid, runId }), null);
});
for (const cup of CUPS)
  test(`${cup.name}: events persist at every boundary; retry replaces only current scores`, () => {
    const storage = memory();
    let store = createCupStore(() => storage);
    store.start(cup.id, 'shrike', 'hard');
    for (let event = 0; event < cup.tracks.length; event++) {
      store = createCupStore(() => storage);
      const before = store.snapshot().state;
      assert.equal(before.phase, 'racing');
      assert.equal(before.cupId, cup.id);
      assert.equal(before.eventIndex, event);
      assert.equal(before.shipId, 'shrike');
      assert.equal(before.difficulty, 'hard');
      assert.equal(before.results.length, event);
      store.finish(result());
      assert.equal(store.finish(result(ids.toReversed())), false);
      store = createCupStore(() => storage);
      assert.equal(store.snapshot().state.phase, 'results');
      assert.deepEqual(
        store.snapshot().state.results.slice(0, event),
        before.results,
      );
      assert.equal(
        cupComplete(store.snapshot().state),
        event === cup.tracks.length - 1,
      );
      store.retry();
      store = createCupStore(() => storage);
      assert.deepEqual(store.snapshot().state, before);
      assert.equal(cupComplete(store.snapshot().state), false);
      store.finish(result(ids.toReversed()));
      store = createCupStore(() => storage);
      assert.deepEqual(
        store.snapshot().state.results.slice(0, event),
        before.results,
      );
      assert.equal(
        cupStandings(store.snapshot().state).find((r) => r.id === 'player')
          .points,
        CUP_POINTS.at(-1) * (event + 1),
      );
      assert.equal(store.next(), event < cup.tracks.length - 1);
      assert.equal(store.next(), false);
    }
    assert.equal(cupComplete(store.snapshot().state), true);
    store.retry();
    assert.equal(store.snapshot().state.results.length, cup.tracks.length - 1);
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

test('earned cup grids survive retries/reloads and retain rival classification order', () => {
  const storage = memory();
  let store = createCupStore(() => storage);
  store.start('apex', 'shrike', 'hard');
  const opening = [...ids.slice(1), 'player'];
  assert.deepEqual(cupGridOrder(store.snapshot().state), opening);
  store.finish(result());
  assert.deepEqual(cupGridOrder(store.snapshot().state), opening);
  store.next();
  const promoted = ids.filter((id) => id !== 'player');
  promoted.splice(7, 0, 'player');
  assert.deepEqual(cupGridOrder(store.snapshot().state), promoted);
  const second = result(ids.toReversed());
  second.standings.find((r) => r.id === 'rook').valid = false;
  second.standings.find((r) => r.id === 'gannet').finished = false;
  store.finish(second);
  // Retrying this result must retain the first race's grid, not use this finish.
  store = createCupStore(() => storage);
  store.retry();
  assert.deepEqual(cupGridOrder(store.snapshot().state), promoted);
  store.finish(second);
  store.next();
  store = createCupStore(() => storage);
  const expected = ids
    .toReversed()
    .filter((id) => !['player', 'rook', 'gannet'].includes(id));
  expected.push('gannet', 'rook');
  expected.splice(8, 0, 'player');
  assert.deepEqual(cupGridOrder(store.snapshot().state), expected);
  const order = cupGridOrder(store.snapshot().state);
  order.reverse();
  assert.deepEqual(cupGridOrder(store.snapshot().state), expected);
  store.finish(result());
  store.retry();
  assert.deepEqual(cupGridOrder(store.snapshot().state), expected);
  store.start('apex', 'shrike', 'hard');
  assert.deepEqual(cupGridOrder(store.snapshot().state), opening);
});

for (const [cupId, positions] of [
  ['founders', [10, 3, 1]],
  ['frontier', [10, 5, 1]],
  ['horizon', [10, 7, 3]],
  ['apex', [10, 8, 5, 3, 1]],
]) {
  test(`${cupId}: consecutive wins earn progressively harder grid promotion`, () => {
    const storage = memory();
    let store = createCupStore(() => storage);
    store.start(cupId, 'kestrel', 'medium');
    for (let event = 0; event < positions.length; event++) {
      const before = store.snapshot().state;
      const current = cupGridOrder(before);
      assert.equal(current.indexOf('player') + 1, positions[event]);
      assert.equal(new Set(current).size, ids.length);
      store.finish(result());
      assert.deepEqual(cupGridOrder(store.snapshot().state), current);
      if (event < positions.length - 1) {
        const preview = cupGridOrder(store.snapshot().state, { next: true });
        assert.equal(preview.indexOf('player') + 1, positions[event + 1]);
        store.next();
        store = createCupStore(() => storage);
        assert.deepEqual(cupGridOrder(store.snapshot().state), preview);
      }
    }
  });
}

function resultInPlace(position) {
  const order = ids.filter((id) => id !== 'player');
  order.splice(position - 1, 0, 'player');
  return result(order);
}

test('Founders rewards a podium after a win; Apex requires sustained winning results', () => {
  const run = (cupId, places) => {
    const storage = memory();
    const store = createCupStore(() => storage);
    store.start(cupId, 'kestrel', 'hard');
    for (const place of places) {
      store.finish(resultInPlace(place));
      store.next();
    }
    return cupGridOrder(store.snapshot().state).indexOf('player') + 1;
  };
  assert.equal(run('founders', [1, 3]), 1);
  assert.equal(run('apex', [1, 1, 3]), 5);
  assert.equal(run('apex', [1, 1, 1]), 3);
  assert.equal(run('apex', [1, 1, 1, 3]), 2);
});

test('midfield holds grid progress; invalid finishes and DNFs lose earned places', () => {
  for (const status of ['finished', 'invalid', 'dnf']) {
    for (const [cupId, expected] of [
      ['founders', status === 'finished' ? 3 : 5],
      ['apex', status === 'finished' ? 8 : 10],
    ]) {
      const storage = memory();
      let store = createCupStore(() => storage);
      store.start(cupId, 'kestrel', 'easy');
      store.finish(result());
      store.next();
      const race = resultInPlace(5);
      const player = race.standings.find((row) => row.id === 'player');
      player.valid = status !== 'invalid';
      player.finished = status !== 'dnf';
      store.finish(race);
      store.next();
      store = createCupStore(() => storage);
      assert.equal(
        cupGridOrder(store.snapshot().state).indexOf('player') + 1,
        expected,
      );
    }
  }
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

test('Horizon retains circuit scores when its sprint finale is resumed and retried', () => {
  const storage = memory();
  let store = createCupStore(() => storage);
  store.start('horizon', 'needle', 'medium');
  for (let event = 0; event < 2; event++) {
    store.finish({ ...result(), courseFormat: 'circuit', laps: 2 });
    store.next();
  }
  store = createCupStore(() => storage);
  const circuits = store.snapshot().state.results;
  assert.equal(store.snapshot().state.eventIndex, 2);
  assert.equal(store.snapshot().state.phase, 'racing');
  store.finish({ ...result(), courseFormat: 'sprint', laps: 1 });
  assert.deepEqual(
    cupRaceRows(store.snapshot().state.results[2]).map((r) => r.points),
    CUP_POINTS,
  );
  assert.equal(cupComplete(store.snapshot().state), true);
  store = createCupStore(() => storage);
  store.retry();
  assert.deepEqual(store.snapshot().state.results, circuits);
  assert.equal(cupComplete(store.snapshot().state), false);
  const sprint = result(ids.toReversed());
  sprint.standings.find((r) => r.id === 'rook').valid = false;
  store.finish({ ...sprint, courseFormat: 'sprint', laps: 1 });
  assert.deepEqual(store.snapshot().state.results.slice(0, 2), circuits);
  assert.equal(
    cupStandings(store.snapshot().state).find((r) => r.id === 'player').points,
    52,
  );
  assert.equal(
    cupRaceRows(store.snapshot().state.results[2]).find((r) => r.id === 'rook')
      .points,
    0,
  );
  assert.equal(store.finish(result()), false);
  assert.equal(store.next(), false);
});
