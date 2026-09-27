import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TrialRules,
  crossesGate,
  loadRecords,
  saveResult,
} from '../src/game/TrialRules.js';
const gate = { x: 0, z: 0, heading: 0, width: 10 };
const route = {
  gates: [gate, { ...gate, z: -20 }],
  medals: { jeep: [10, 20, 30] },
};
test('directional gates reject reverse and lateral misses, accept swept crossing', () => {
  assert.ok(crossesGate({ x: 0, z: 2 }, { x: 0, z: -2 }, gate));
  assert.ok(!crossesGate({ x: 0, z: -2 }, { x: 0, z: 2 }, gate));
  assert.ok(!crossesGate({ x: 6, z: 2 }, { x: 6, z: -2 }, gate));
});
test('ordered finish, recovery penalty and reset preserve strict eligibility', () => {
  const r = new TrialRules(route, 'jeep');
  r.update(2, { x: 0, z: -18 }, { x: 0, z: -22 });
  assert.equal(r.nextGate, 0);
  r.update(3, { x: 0, z: 2 }, { x: 0, z: -2 });
  assert.equal(r.finished, false);
  r.recover();
  assert.equal(r.nextGate, 1);
  r.update(4, { x: 0, z: -18 }, { x: 0, z: -22 });
  assert.equal(r.finished, true);
  assert.equal(r.result().time, 14);
  assert.equal(r.result().medal, 'silver');
  r.reset();
  assert.deepEqual(r.snapshot(), {
    nextGate: 0,
    totalGates: 2,
    elapsed: 0,
    penalties: 0,
    finished: false,
  });
});
test('personal records persist only improvements and tolerate unavailable/corrupt storage', () => {
  const data = new Map();
  const storage = {
    getItem: (k) => data.get(k),
    setItem: (k, v) => data.set(k, v),
  };
  const records = {};
  assert.equal(
    saveResult(
      records,
      'jeep',
      'rock-climb',
      { time: 10, medal: 'gold' },
      storage,
    ).best,
    true,
  );
  assert.equal(
    saveResult(
      records,
      'jeep',
      'rock-climb',
      { time: 12, medal: 'silver' },
      storage,
    ).best,
    false,
  );
  assert.equal(loadRecords(storage)['jeep:rock-climb'].time, 10);
  assert.deepEqual(loadRecords({ getItem: () => '{bad' }), {});
  assert.equal(
    saveResult(
      records,
      'atv',
      'rock-climb',
      { time: 12, medal: 'gold' },
      {
        setItem: () => {
          throw Error();
        },
      },
    ).saved,
    false,
  );
});
