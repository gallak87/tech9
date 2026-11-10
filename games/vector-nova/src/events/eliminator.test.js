import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEliminatorEvent,
  qualifiedEliminatorFinishTime,
} from './eliminator.js';
import { createRace } from '../race/index.js';

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

const sprintIds = ['player', 'rook', 'latch'];
const sprintRows = (arrivals = {}) =>
  sprintIds.map((id, index) => ({
    id,
    name: id,
    distance: 900 - index * 100,
    valid: true,
    ...arrivals[id],
  }));
const sprintEvent = (options = {}) =>
  createEliminatorEvent({
    ids: sprintIds,
    finishDistance: 1000,
    ...options,
  });

test('a qualified player sprint finish ends before the next cut and classifies every remaining racer', () => {
  const event = sprintEvent();
  const events = event.step(
    11,
    sprintRows({
      player: { distance: 1010, finishTime: 10.25 },
    }),
  );
  assert.deepEqual(
    events.map(({ type }) => type),
    ['eliminator-complete'],
  );
  const { result } = event.snapshot();
  assert.equal(result.won, true);
  assert.equal(result.winnerId, 'player');
  assert.equal(result.reason, 'finish-line');
  assert.equal(result.elapsed, 10.25);
  assert.equal(result.playerPosition, 1);
  assert.ok(result.standings.every((row) => row.finished && !row.eliminated));
  assert.deepEqual(
    result.standings.map(({ position }) => position),
    [1, 2, 3],
  );
  assert.equal(result.standings[0].distance, 1000);
  const saved = event.snapshot(),
    restored = sprintEvent();
  restored.restore(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(restored.snapshot(), saved);
  assert.deepEqual(restored.step(100, []), []);
});

test('real player and continuous rival sprint races qualify with their exact terminal duration', () => {
  const track = {
    closed: false,
    length: 1200,
    finishDistance: 1000,
    checkpoints: [{ distance: 0 }, { distance: 500 }, { distance: 1000 }],
  };
  for (const [id, continuous] of [
    ['player', false],
    ['rook', true],
  ]) {
    const progress = createRace(track, { continuous });
    progress.step(0, 900, 9);
    assert.equal(qualifiedEliminatorFinishTime(progress), null);
    progress.step(900, 1100, 2, [], { grounded: true });
    assert.equal(progress.complete, true);
    assert.equal(progress.lastLap, 10);
    assert.equal(qualifiedEliminatorFinishTime(progress), 10);
    if (continuous) assert.equal(progress.totalElapsed, 0);
    const event = sprintEvent();
    event.step(
      11,
      sprintRows({
        [id]: {
          distance: 1100,
          finishTime: qualifiedEliminatorFinishTime(progress),
        },
      }),
    );
    assert.equal(event.snapshot().result.winnerId, id);
    assert.equal(event.snapshot().result.elapsed, 10);
    assert.equal(event.snapshot().result.won, id === 'player');
    progress.valid = false;
    assert.equal(qualifiedEliminatorFinishTime(progress), null);
  }
});

test('the earliest qualified rival wins; simultaneous arrivals use grid order independent of row order', () => {
  const event = sprintEvent();
  event.step(
    20,
    sprintRows({
      player: { distance: 1100, finishTime: 18 },
      rook: { distance: 1050, finishTime: 17 },
    }),
  );
  assert.equal(event.snapshot().result.winnerId, 'rook');
  assert.equal(event.snapshot().result.won, false);
  assert.equal(event.snapshot().result.playerPosition, 2);
  assert.equal(event.snapshot().result.standings[1].finished, true);
  const order = ['rook', 'player', 'latch'];
  const a = sprintEvent({ gridOrder: order }),
    b = sprintEvent({ gridOrder: order });
  const rows = sprintRows({
    player: { distance: 1100, finishTime: 18 },
    rook: { distance: 1050, finishTime: 18 },
  });
  assert.deepEqual(a.step(20, rows), b.step(20, rows.reverse()));
  assert.equal(a.snapshot().result.winnerId, 'rook');
});

test('a scheduled cut wins an exact terminal tie, then any active arrival may finish', () => {
  const event = sprintEvent({ firstCut: 2 });
  const events = event.step(
    3,
    sprintRows({
      player: { distance: 1100, finishTime: 2 },
      rook: { distance: 1050, finishTime: 2 },
      latch: { distance: 100 },
    }),
  );
  assert.deepEqual(
    events.map(({ type }) => type),
    ['eliminator-cut', 'eliminator-complete'],
  );
  assert.equal(event.snapshot().eliminated[0].id, 'latch');
  assert.equal(event.snapshot().result.winnerId, 'player');
  assert.equal(event.snapshot().result.elapsed, 2);
  const restored = sprintEvent({ firstCut: 2 });
  restored.restore(event.snapshot());
  assert.deepEqual(restored.snapshot(), event.snapshot());

  const last = createEliminatorEvent({
    ids: ['player', 'rook'],
    firstCut: 2,
    finishDistance: 1000,
  });
  last.step(
    3,
    sprintRows({
      player: { distance: 1100, finishTime: 2 },
      rook: { distance: 1050, finishTime: 2 },
    }).slice(0, 2),
  );
  assert.equal(last.snapshot().result.reason, 'last-survivor');
  const lastRestored = createEliminatorEvent({
    ids: ['player', 'rook'],
    firstCut: 2,
    finishDistance: 1000,
  });
  lastRestored.restore(last.snapshot());
  assert.deepEqual(lastRestored.snapshot(), last.snapshot());
});

test('finish/cut arbitration uses checkpoint crossing time rather than the tick endpoint', () => {
  const before = sprintEvent({ firstCut: 2 });
  before.step(
    3,
    sprintRows({
      player: { distance: 1100, finishTime: 1.9 },
      rook: { distance: 1500, finishTime: 2.1 },
    }),
  );
  assert.equal(before.snapshot().result.reason, 'finish-line');
  assert.equal(before.snapshot().result.elapsed, 1.9);
  const after = sprintEvent({ firstCut: 2 });
  after.step(
    3,
    sprintRows({
      player: { distance: 1100, finishTime: 2.1 },
      rook: { distance: 2000 },
      latch: { distance: 1800 },
    }),
  );
  assert.equal(after.snapshot().result.reason, 'eliminated');
  assert.equal(after.snapshot().result.won, false);
  assert.equal(after.snapshot().result.elapsed, 2);
  const restored = sprintEvent({ firstCut: 2 });
  restored.restore(after.snapshot());
  assert.deepEqual(restored.snapshot(), after.snapshot());
});

test('display-distance crossings, airborne finishes and invalid transfers cannot claim a terminal', () => {
  const event = sprintEvent();
  event.step(1, sprintRows({ player: { distance: 5000 } }));
  assert.equal(event.snapshot().result, null);
  event.reset();
  event.step(
    1,
    sprintRows({ player: { distance: 1100, finishTime: 0.5, valid: false } }),
  );
  assert.equal(event.snapshot().result, null);

  const track = {
    closed: false,
    length: 1200,
    finishDistance: 1000,
    checkpoints: [{ distance: 0 }, { distance: 200 }, { distance: 1000 }],
    jumps: [
      {
        id: 'transfer',
        takeoff: 100,
        landingStart: 200,
        landingEnd: 300,
        recovery: 250,
      },
    ],
  };
  const skipped = createRace(track);
  skipped.step(0, 1100, 1);
  assert.equal(skipped.valid, false);
  const airborne = createRace({ ...track, jumps: [] });
  airborne.step(0, 1100, 1, [], { grounded: false });
  assert.equal(airborne.complete, false);
  for (const progress of [skipped, airborne]) {
    const candidate = sprintEvent();
    candidate.step(
      1,
      sprintRows({
        player: {
          distance: 1100,
          valid: progress.valid,
          finishTime: qualifiedEliminatorFinishTime(progress),
        },
      }),
    );
    assert.equal(candidate.snapshot().result, null);
  }
});

test('sprint snapshots resume cuts and reject malformed terminal/arrival state without mutation', () => {
  for (const finishDistance of [0, -1, NaN, Infinity])
    assert.throws(() => sprintEvent({ finishDistance }));
  const event = sprintEvent();
  const initial = event.snapshot();
  const freshRestored = sprintEvent();
  freshRestored.restore(initial);
  assert.deepEqual(freshRestored.snapshot(), initial);
  for (const finishTime of [0, NaN, Infinity, -1, 2])
    assert.throws(() =>
      event.step(1, sprintRows({ player: { distance: 1100, finishTime } })),
    );
  assert.throws(() =>
    event.step(1, sprintRows({ player: { distance: 900, finishTime: 0.5 } })),
  );
  assert.deepEqual(event.snapshot(), initial);

  event.step(23, sprintRows());
  const resumed = sprintEvent();
  resumed.restore(event.snapshot());
  const next = sprintRows({ player: { distance: 1100, finishTime: 24 } });
  assert.deepEqual(event.step(2, next), resumed.step(2, next));
  const completed = event.snapshot();
  const target = sprintEvent(),
    untouched = target.snapshot();
  const mutate = (change) => {
    const saved = structuredClone(completed);
    change(saved);
    assert.throws(() => target.restore(saved));
    assert.deepEqual(target.snapshot(), untouched);
  };
  mutate((saved) => {
    delete saved.terminal;
  });
  mutate((saved) => {
    saved.terminal.id = 'rook';
  });
  mutate((saved) => {
    saved.terminal.at++;
  });
  mutate((saved) => {
    saved.standings[0].valid = false;
  });
  mutate((saved) => {
    saved.standings[0].finishTime = 25;
  });
  mutate((saved) => {
    saved.standings[0].distance = 900;
  });
  mutate((saved) => {
    saved.elapsed = 32;
    saved.terminal.at = 32;
    saved.standings[0].finishTime = 32;
  });
  target.restore(completed);
  assert.deepEqual(target.snapshot(), completed);
});
