import test from 'node:test';
import assert from 'node:assert/strict';
import { finishFreestyle } from './records.js';

test('stock freestyle records retain higher scores, isolate hull/rules identities and reject unranked runs', () => {
  const entries = new Map(),
    storage = {
      getItem: (k) => entries.get(k) ?? null,
      setItem: (k, v) => entries.set(k, v),
    };
  assert.equal(
    finishFreestyle(
      { score: 30000, playerValid: true },
      'rules-a:shrike',
      storage,
    ).improved,
    true,
  );
  assert.equal(
    finishFreestyle(
      { score: 10000, playerValid: true },
      'rules-a:shrike',
      storage,
    ).best,
    30000,
  );
  assert.equal(
    finishFreestyle(
      { score: 90000, playerValid: false },
      'rules-a:shrike',
      storage,
    ).best,
    30000,
  );
  assert.equal(
    finishFreestyle(
      { score: 10000, playerValid: true },
      'rules-a:kestrel',
      storage,
    ).best,
    10000,
  );
  assert.equal(
    finishFreestyle(
      { score: 1000, playerValid: true },
      'rules-b:shrike',
      storage,
    ).best,
    1000,
  );
});

test('unavailable storage retains the session record and reports that it was not persisted', () => {
  const storage = {
    getItem() {
      throw Error('Blocked');
    },
    setItem() {
      throw Error('Blocked');
    },
  };
  const first = finishFreestyle(
    { score: 1000, playerValid: true },
    'blocked-record',
    storage,
  );
  assert.equal(first.saved, false);
  assert.equal(first.best, 1000);
  assert.equal(
    finishFreestyle(
      { score: 500, playerValid: true },
      'blocked-record',
      storage,
    ).best,
    1000,
  );
});
