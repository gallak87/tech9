import test from 'node:test';
import assert from 'node:assert/strict';
import { createInterceptorEvent } from './interceptor.js';

const create = (options) =>
  createInterceptorEvent({ escapeDistance: 8600, ...options });
const progress = (targetDistance = 300, playerDistance = 0) => ({
  targetDistance,
  playerDistance,
});
const lance = (source = 'player', key = '1') => ({
  source,
  target: 'goliath',
  kind: 'repulsor',
  equipment: 'lance',
  key,
});

test('real unblocked hits determine damage, distinguish player/allies, and deduplicate combat delivery', () => {
  const mission = create();
  assert.equal(mission.hit(lance())[0].payload.damage, 18);
  assert.deepEqual(mission.hit(lance()), []);
  assert.equal(mission.hit(lance('rook'))[0].payload.damage, 3);
  assert.equal(
    mission.hit({
      ...lance('player', '2'),
      kind: 'arc',
      equipment: undefined,
    })[0].payload.damage,
    5,
  );
  assert.equal(
    mission.hit({
      ...lance('manta', '2'),
      kind: 'arc',
      equipment: undefined,
    })[0].payload.damage,
    1,
  );
  for (const payload of [
    { ...lance('enemy'), key: 'x' },
    { ...lance(), target: 'rook' },
    { ...lance(), shielded: true },
    { ...lance(), kind: 'ion' },
    { ...lance(), equipment: 'injector' },
    { ...lance(), equipment: undefined },
    { ...lance(), key: undefined },
  ])
    assert.deepEqual(mission.hit(payload), []);
  const snapshot = mission.snapshot();
  assert.equal(snapshot.health, 213);
  assert.equal(snapshot.playerDamage, 23);
  assert.equal(snapshot.alliedDamage, 4);
  assert.equal(snapshot.hits, 4);
});

test('the shared Lance repulsor contact shape damages hull while an ordinary Repulsor pulse does not', () => {
  const mission = create();
  const hit = mission.hit({
    source: 'player',
    target: 'goliath',
    kind: 'repulsor',
    equipment: 'lance',
    shielded: false,
    key: 'real-hit-id:17',
  });
  assert.equal(hit.length, 1);
  assert.equal(hit[0].payload.kind, 'repulsor');
  assert.equal(hit[0].payload.damage, 18);
  assert.deepEqual(
    mission.hit({
      source: 'player',
      target: 'goliath',
      kind: 'repulsor',
      shielded: false,
      key: 'real-hit-id:18',
    }),
    [],
  );
  assert.equal(mission.snapshot().health, 222);
});

test('time alone never damages the target, while staggered commands retain their cadence and pause', () => {
  const mission = create();
  assert.deepEqual(mission.step(2.9, progress()), []);
  const frozen = mission.snapshot();
  assert.deepEqual(mission.step(0, {}), []);
  assert.deepEqual(mission.snapshot(), frozen);
  const events = mission.step(4.1, progress());
  assert.deepEqual(
    events.map((event) => [
      event.payload.source,
      event.payload.kind,
      event.payload.elapsed,
    ]),
    [
      ['rook', 'lance', 3],
      ['kite', 'lance', 4.5],
      ['manta', 'lance', 6],
      ['goliath', 'ion', 7],
    ],
  );
  mission.step(100, progress());
  assert.equal(mission.snapshot().health, 240);
  assert.equal(mission.snapshot().hits, 0);
});

test('lethal real hits complete once, clamp damage to remaining hull and take priority at the escape line', () => {
  const mission = create({ health: 20 });
  mission.hit(lance());
  assert.equal(mission.hit(lance('player', '2'))[0].payload.damage, 2);
  assert.equal(mission.snapshot().result, null);
  const events = mission.step(1 / 120, progress(8600, 8500));
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'interceptor-complete');
  const result = mission.snapshot().result;
  assert.equal(result.won, true);
  assert.equal(result.reason, 'disabled');
  assert.equal(result.playerDamage, 20);
  assert.equal(result.health, 0);
  assert.equal(result.hits, 2);
  const ended = mission.snapshot();
  assert.deepEqual(mission.step(1, progress()), []);
  assert.deepEqual(mission.hit(lance('player', '3')), []);
  assert.deepEqual(mission.snapshot(), ended);
});

test('escape follows physical target distance, independent of time, player gap and firing commands', () => {
  const mission = create();
  mission.step(300, progress(8599, 100));
  assert.equal(mission.snapshot().result, null);
  const events = mission.step(1 / 120, progress(8600, 100));
  assert.equal(events.at(-1).payload.reason, 'escaped');
  assert.equal(events.at(-1).payload.won, false);
  assert.equal(mission.snapshot().result.health, 240);
  assert.equal(mission.snapshot().escapeProgress, 1);
});

test('manual recovery or invalid progress keeps the mission playable but cannot restore ranked credit', () => {
  const mission = create({ health: 18 });
  mission.invalidate();
  mission.step(1, { ...progress(), playerValid: true });
  mission.hit(lance());
  mission.step(1, progress());
  assert.equal(mission.snapshot().result.won, true);
  assert.equal(mission.snapshot().result.playerValid, false);
  mission.reset();
  mission.step(1, { ...progress(), playerValid: false });
  mission.step(1, progress());
  assert.equal(mission.snapshot().playerValid, false);
  mission.reset();
  assert.equal(mission.snapshot().playerValid, true);
  assert.equal(mission.snapshot().health, 18);
});

test('snapshots resume health, deduplication, command schedules and terminal results deterministically', () => {
  const a = create(),
    b = create();
  a.step(11, progress(1100, 900));
  a.hit(lance());
  const snapshot = JSON.parse(JSON.stringify(a.snapshot()));
  b.invalidate();
  b.restore(snapshot);
  assert.deepEqual(a.snapshot(), b.snapshot());
  assert.deepEqual(b.hit(lance()), []);
  assert.deepEqual(
    a.step(20, progress(3000, 2800)),
    b.step(20, progress(3000, 2800)),
  );
  assert.deepEqual(a.snapshot(), b.snapshot());
  a.step(1, progress(8600, 8000));
  b.restore(a.snapshot());
  assert.deepEqual(a.snapshot(), b.snapshot());
  snapshot.nextAllyFire[0] = 999;
  assert.notEqual(a.snapshot().nextAllyFire[0], 999);
});

test('invalid progress/configuration/snapshots fail without corrupting the active mission', () => {
  assert.throws(() => create({ health: 0 }));
  assert.throws(() => create({ allies: ['rook', 'rook'] }));
  assert.throws(() => create({ escapeDistance: Infinity }));
  const mission = create(),
    saved = mission.snapshot();
  assert.throws(() => mission.step(NaN, progress()));
  assert.throws(() => mission.step(1, progress(Infinity)));
  assert.deepEqual(mission.snapshot(), saved);
  assert.throws(() => mission.restore({ ...saved, health: 0 }));
  assert.throws(() => mission.restore({ ...saved, rulesId: 'other' }));
  assert.throws(() => mission.restore({ ...saved, nextAllyFire: [0, 4.5, 6] }));
  assert.throws(() => mission.restore({ ...saved, targetDistance: 8600 }));
  assert.deepEqual(mission.snapshot(), saved);
});
