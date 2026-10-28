import test from 'node:test';
import assert from 'node:assert/strict';
import { createEliminatorEvent } from './eliminator.js';

const ids = [
  'player',
  'rook',
  'latch',
  'mule',
  'pike',
  'tern',
  'manta',
  'vise',
  'kite',
  'gannet',
];
const field = (distances = {}) =>
  ids.map((id, i) => ({
    id,
    name: id === 'player' ? 'You' : id,
    distance: distances[id] ?? 1000 - i * 20,
    valid: true,
  }));

test('first-cut grace and successive cuts use simulation time, with no pause or lap-count advancement', () => {
  const event = createEliminatorEvent({ ids });
  assert.deepEqual(event.step(21.9, field()), []);
  const frozen = event.snapshot();
  assert.deepEqual(event.step(0, []), []);
  assert.deepEqual(event.snapshot(), frozen);
  const first = event.step(0.1, field());
  assert.deepEqual(first, [
    {
      type: 'eliminator-cut',
      payload: {
        id: 'gannet',
        name: 'gannet',
        position: 10,
        remaining: 9,
        elapsed: 22,
        time: 22,
      },
    },
  ]);
  assert.equal(event.snapshot().nextCut, 32);
  assert.equal(event.isActive('gannet'), false);
  assert.equal(event.isActive('player'), true);
  event.step(10, field());
  assert.equal(event.snapshot().eliminated[1].id, 'kite');
  assert.equal(event.snapshot().eliminated[1].position, 9);
  assert.equal(event.snapshot().remaining, 8);
});

test('cuts compare unwrapped physical distance and break exact ties by grid order regardless of row order', () => {
  const order = ['gannet', ...ids.filter((id) => id !== 'gannet')];
  const a = createEliminatorEvent({ ids, gridOrder: order }),
    b = createEliminatorEvent({ ids, gridOrder: order });
  const rows = field(Object.fromEntries(ids.map((id) => [id, 12500])));
  rows.find((row) => row.id === 'player').distance = 12501;
  assert.deepEqual(a.step(22, rows), b.step(22, [...rows].reverse()));
  assert.equal(a.snapshot().eliminated[0].id, 'kite');
  assert.equal(a.snapshot().standings[0].id, 'player');
  assert.equal(a.snapshot().standings[0].distance, 12501);
});

test('a player cut ends immediately with a stable classified position and cannot later turn into a win', () => {
  const event = createEliminatorEvent({ ids });
  const events = event.step(80, field({ player: 0 }));
  assert.equal(events.length, 2);
  assert.equal(events[1].type, 'eliminator-complete');
  const { result } = event.snapshot();
  assert.equal(result.playerPosition, 10);
  assert.equal(result.won, false);
  assert.equal(result.playerValid, true);
  assert.equal(result.elapsed, 22);
  assert.equal(result.reason, 'eliminated');
  assert.equal(result.standings.at(-1).status, 'eliminated');
  assert.equal(result.standings.at(-1).eliminated, true);
  assert.equal(result.standings.at(-1).finished, true);
  assert.equal(result.standings[0].status, 'survived');
  assert.equal(result.standings[0].finished, false);
  assert.equal(result.standings.at(-1).eliminationOrder, 1);
  const ended = event.snapshot();
  assert.deepEqual(event.step(100, field()), []);
  assert.deepEqual(event.snapshot(), ended);
});

test('all nine cuts yield one winner, preserve cut order and freeze eliminated racers at the cut', () => {
  const event = createEliminatorEvent({ ids });
  const events = event.step(200, field());
  assert.equal(
    events.filter((entry) => entry.type === 'eliminator-cut').length,
    9,
  );
  assert.equal(events.at(-1).type, 'eliminator-complete');
  const { result } = event.snapshot();
  assert.equal(result.playerPosition, 1);
  assert.equal(result.won, true);
  assert.equal(result.elapsed, 102);
  assert.equal(result.standings[0].status, 'winner');
  assert.deepEqual(
    result.standings.map((row) => row.position),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
  assert.deepEqual(
    result.standings.slice(1).map((row) => row.eliminatedAt),
    [102, 92, 82, 72, 62, 52, 42, 32, 22],
  );
  assert.equal(result.standings.at(-1).distance, (820 * 22) / 200);
  assert.equal(event.isActive('gannet'), false);
});

test('invalid route credit and manual recovery latch unranked status while allowing the contest to continue', () => {
  const event = createEliminatorEvent({ ids });
  const rows = field();
  rows[0].valid = false;
  event.step(1, rows);
  event.step(200, field());
  assert.equal(event.snapshot().result.won, true);
  assert.equal(event.snapshot().result.playerValid, false);
  event.reset();
  event.invalidate();
  event.step(200, field());
  assert.equal(event.snapshot().result.playerValid, false);
  event.reset();
  event.step(200, field());
  assert.equal(event.snapshot().result.playerValid, true);
});

test('a detached snapshot resumes the same remaining cuts and restores its own validity', () => {
  const a = createEliminatorEvent({ ids }),
    b = createEliminatorEvent({ ids });
  a.step(35, field());
  const saved = JSON.parse(JSON.stringify(a.snapshot()));
  b.invalidate();
  b.restore(saved);
  assert.deepEqual(a.snapshot(), b.snapshot());
  saved.eliminated[0].name = 'Mutated';
  assert.notEqual(a.snapshot().eliminated[0].name, 'Mutated');
  assert.deepEqual(a.step(100, field()), b.step(100, [...field()].reverse()));
  assert.deepEqual(a.snapshot(), b.snapshot());
  const c = createEliminatorEvent({ ids });
  c.restore(a.snapshot());
  assert.deepEqual(c.snapshot(), a.snapshot());
});

test('boundary interpolation prevents the endpoint after a cut from choosing its victim', () => {
  const event = createEliminatorEvent({
    ids: ['player', 'rook'],
    firstCut: 2,
    interval: 1,
  });
  event.step(1, [
    { id: 'player', distance: 10 },
    { id: 'rook', distance: 0 },
  ]);
  event.step(2, [
    { id: 'player', distance: 10 },
    { id: 'rook', distance: 12 },
  ]);
  assert.equal(event.snapshot().result.won, true);
  assert.equal(event.snapshot().eliminated[0].distance, 6);
});

test('invalid fields, missing physical states and incompatible snapshots fail without corrupting the contest', () => {
  assert.throws(() => createEliminatorEvent({ ids: ['player', 'player'] }));
  assert.throws(() => createEliminatorEvent({ ids, interval: 0 }));
  const event = createEliminatorEvent({ ids }),
    saved = event.snapshot();
  assert.throws(() => event.step(NaN, field()));
  assert.throws(() => event.step(1, field().slice(1)));
  assert.throws(() => event.step(1, field({ rook: Infinity })));
  assert.deepEqual(event.snapshot(), saved);
  assert.throws(() => event.restore({ ...saved, rulesId: 'different' }));
  assert.throws(() => event.restore({ ...saved, elapsed: 1000 }));
  assert.deepEqual(event.snapshot(), saved);
});
