import test from 'node:test';
import assert from 'node:assert/strict';
import { CUPS, createCupStore, cupChampion } from '../race/cup.js';
import { RACE_OPPONENTS } from '../race/roster.js';
import { CUP_COLLECTION_KEY, createCupCollection } from './cup-collection.js';

function memory() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}
function finish(position = 1, valid = true) {
  const ids = RACE_OPPONENTS.map((row) => row.id);
  ids.splice(position - 1, 0, 'player');
  return {
    standings: ids.map((id, i) => ({
      id,
      finished: true,
      valid,
      totalTime: 100 + i,
    })),
  };
}
function run(positions, storage = memory()) {
  const store = createCupStore(() => storage);
  store.start('founders', 'kestrel', 'easy');
  positions.forEach((position, i) => {
    if (i) store.next();
    store.finish(finish(position));
  });
  return store;
}
test('only the final championship first place earns a trophy, not the last race winner', () => {
  const collection = createCupCollection(() => memory());
  assert.equal(collection.award(run([1]).snapshot().state), false);
  assert.equal(collection.award(run([10, 10, 1]).snapshot().state), false);
  assert.equal(collection.award(run([2, 2, 2]).snapshot().state), false);
  assert.equal(collection.award(run([1, 1, 2]).snapshot().state), true);
});
test('earned cups survive reload, retry, restart, abandon and subsequent losses', () => {
  const storage = memory();
  const runStore = run([1, 1, 1], storage);
  let collection = createCupCollection(
    () => storage,
    () => 12345,
  );
  assert.equal(collection.award(runStore.snapshot().state), true);
  assert.equal(collection.award(runStore.snapshot().state), false);
  const earned = collection.snapshot().cups;
  runStore.retry();
  assert.equal(collection.award(runStore.snapshot().state), false);
  runStore.start('founders', 'kestrel', 'hard');
  runStore.abandon();
  collection = createCupCollection(() => storage);
  collection.award(run([10, 10, 10]).snapshot().state);
  assert.deepEqual(collection.snapshot().cups, earned);
  const external = collection.snapshot();
  external.cups.founders.points = 0;
  assert.equal(collection.snapshot().cups.founders.points, 75);
});
test('zero-point ties, invalid finishes and unfinished schedules never earn a cup', () => {
  const store = createCupStore(() => memory());
  store.start('founders', 'kestrel', 'easy');
  for (let i = 0; i < 3; i++) {
    if (i) store.next();
    store.finish(finish(1, false));
  }
  assert.equal(cupChampion(store.snapshot().state), null);
  assert.equal(cupChampion(null), null);
  assert.equal(cupChampion({ cupId: 'unknown' }), null);
});
test('corrupt data is bounded and unavailable storage keeps a visible in-memory award', () => {
  const storage = memory();
  storage.setItem(CUP_COLLECTION_KEY, '{broken');
  const collection = createCupCollection(() => storage);
  assert.ok(collection.snapshot().notice);
  assert.equal(collection.award(run([1, 1, 1]).snapshot().state), true);
  assert.equal(collection.snapshot().notice, '');
  const unavailable = createCupCollection(() => {
    throw Error('denied');
  });
  assert.equal(unavailable.award(run([1, 1, 1]).snapshot().state), true);
  assert.ok(unavailable.snapshot().cups.founders);
  assert.equal(unavailable.snapshot().saved, false);
  assert.match(unavailable.snapshot().notice, /Could not save/);
});

test('awards merge other tabs and preserve trophies from the other edition', () => {
  const storage = memory();
  const collection = createCupCollection(() => storage);
  const other = { earnedAt: 123, difficulty: 'hard', points: 50 };
  storage.setItem(
    CUP_COLLECTION_KEY,
    JSON.stringify({ version: 1, cups: { demo: other, apex: other } }),
  );
  collection.award(run([1, 1, 1]).snapshot().state);
  assert.deepEqual(
    Object.keys(createCupCollection(() => storage).snapshot().cups).sort(),
    ['apex', 'demo', 'founders'],
  );
});

test('all cup schedules can earn their own distinct trophy', () => {
  const storage = memory(),
    collection = createCupCollection(() => storage);
  for (const cup of CUPS) {
    const store = createCupStore(() => storage);
    store.start(cup.id, 'kestrel', 'hard');
    cup.tracks.forEach((_, i) => {
      if (i) store.next();
      store.finish(finish());
    });
    assert.equal(collection.award(store.snapshot().state), true, cup.id);
    assert.equal(
      collection.snapshot().cups[cup.id].points,
      cup.tracks.length * 25,
    );
  }
  assert.equal(Object.keys(collection.snapshot().cups).length, CUPS.length);
});
