import test from 'node:test';
import assert from 'node:assert/strict';
import { createInterceptorEvent, missionProfile } from './interceptor.js';
import { interceptorBoss } from './interceptor-bosses.js';
import { COMBAT_RULES } from '../pickups/combat.js';

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

const bossShots = (events) =>
  events.filter(
    (event) =>
      event.type === 'interceptor-fire' &&
      event.payload.source === 'goliath' &&
      event.payload.kind === 'lance',
  );

test('difficulty sets truthful hull and volley profiles, with explicit health overrides isolated in identity', () => {
  for (const [difficulty, maxHealth, blasts] of [
    ['easy', 450, 1],
    ['medium', 700, 2],
    ['hard', 950, 2],
  ]) {
    assert.deepEqual(missionProfile(difficulty), {
      difficulty,
      maxHealth,
      blasts,
    });
    const mission = create({ difficulty });
    assert.equal(mission.snapshot().health, maxHealth);
    assert.equal(mission.snapshot().maxHealth, maxHealth);
    assert.equal(mission.snapshot().difficulty, difficulty);
    assert.equal(mission.snapshot().routeLength, 4300);
    const override = create({ difficulty, health: 18 });
    assert.equal(override.snapshot().maxHealth, 18);
    assert.notEqual(override.rulesId, mission.rulesId);
    override.hit(lance());
    override.step(1 / 120, progress());
    assert.equal(override.snapshot().result.difficulty, difficulty);
    assert.equal(override.snapshot().result.maxHealth, 18);
  }
  assert.equal(missionProfile().maxHealth, 700);
  assert.throws(() => missionProfile('impossible'));
  assert.throws(() => create({ routeLength: 0 }));
});

test('the fifteen-percent marker telegraphs, smoothly turns backward, fires the difficulty volley, and returns forward', () => {
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const mission = create({
      difficulty,
      escapeDistance: 2000,
      routeLength: 1000,
    });
    mission.step(1, progress(149));
    assert.equal(mission.snapshot().counterattack.phase, 'idle');
    assert.equal(bossShots(mission.step(1, progress(150))).length, 0);
    const started = mission.snapshot().counterattack;
    assert.equal(started.phase, 'telegraph');
    assert.equal(started.started, 2);
    assert.equal(started.lap, 1);
    assert.equal(started.warning, true);
    assert.equal(started.yaw, 0);
    assert.equal(bossShots(mission.step(1.2, progress(175))).length, 0);
    assert.equal(mission.snapshot().counterattack.phase, 'turning-back');
    assert.equal(bossShots(mission.step(0.375, progress(200))).length, 0);
    assert.ok(
      Math.abs(mission.snapshot().counterattack.yaw - Math.PI / 2) < 1e-8,
    );
    const first = bossShots(mission.step(0.375, progress(225)));
    assert.equal(first.length, 1);
    assert.equal(mission.snapshot().counterattack.phase, 'firing');
    assert.equal(mission.snapshot().counterattack.yaw, Math.PI);
    assert.ok(Math.abs(first[0].payload.elapsed - 3.95) < 1e-8);
    const second = bossShots(mission.step(0.55, progress(250)));
    assert.equal(second.length, difficulty === 'easy' ? 0 : 1);
    assert.equal(mission.snapshot().counterattack.yaw, Math.PI);
    mission.step(0.65, progress(275));
    assert.equal(mission.snapshot().counterattack.phase, 'turning-forward');
    mission.step(0.375, progress(300));
    assert.ok(
      Math.abs(mission.snapshot().counterattack.yaw - Math.PI / 2) < 1e-8,
    );
    mission.step(0.375, progress(325));
    assert.equal(mission.snapshot().counterattack.phase, 'idle');
    assert.equal(mission.snapshot().counterattack.warning, false);
    assert.equal(mission.snapshot().counterattack.yaw, 0);
    assert.equal(mission.snapshot().targetDistance, 325);
    assert.equal(
      mission.snapshot().counterattack.shots,
      missionProfile(difficulty).blasts,
    );
  }
});

test('counterattacks use distance once per lap, queue no overlapping turns, and suppress Ion during the turn sequence', () => {
  const mission = create({ escapeDistance: 2000, routeLength: 1000 });
  mission.step(5, progress(149));
  assert.equal(mission.snapshot().counterattack.phase, 'idle');
  mission.step(0.1, progress(150));
  const shots = mission.step(2, progress(1200));
  assert.equal(mission.snapshot().counterattack.lap, 1);
  assert.equal(mission.snapshot().counterattacks.length, 1);
  assert.equal(
    shots.some(
      (event) =>
        event.payload.source === 'goliath' && event.payload.kind === 'ion',
    ),
    false,
  );
  mission.step(2, progress(1200));
  assert.equal(mission.snapshot().counterattack.lap, 2);
  assert.equal(mission.snapshot().counterattack.phase, 'telegraph');
  assert.equal(mission.snapshot().counterattacks[1].started, 9);
  mission.step(4, progress(1300));
  const saved = mission.snapshot();
  assert.equal(saved.counterattack.phase, 'idle');
  assert.equal(saved.counterattacks.length, 2);
  mission.step(1, progress(0));
  assert.equal(bossShots(mission.step(1, progress(1150))).length, 0);
  assert.equal(mission.snapshot().counterattacks.length, 2);
});

test('counterattack snapshots resume a partial volley without duplicate fire, and pause/reset preserve exact phase ownership', () => {
  const a = create({ escapeDistance: 2000, routeLength: 1000 });
  a.step(1, progress(150));
  const first = bossShots(a.step(1.95, progress(200)));
  assert.equal(first.length, 1);
  const saved = JSON.parse(JSON.stringify(a.snapshot()));
  const b = create({ escapeDistance: 2000, routeLength: 1000 });
  b.restore(saved);
  assert.deepEqual(b.snapshot(), saved);
  assert.deepEqual(b.step(0, {}), []);
  assert.deepEqual(b.snapshot(), saved);
  const nextA = a.step(0.55, progress(250));
  const nextB = b.step(0.55, progress(250));
  assert.deepEqual(nextA, nextB);
  assert.equal(bossShots(nextB).length, 1);
  assert.ok(bossShots(nextB)[0].payload.elapsed > first[0].payload.elapsed);
  assert.deepEqual(a.snapshot(), b.snapshot());
  const before = b.snapshot();
  assert.throws(() =>
    b.restore({
      ...before,
      counterattacks: [{ started: before.elapsed + 1, shots: 0 }],
    }),
  );
  assert.throws(() =>
    b.restore({
      ...before,
      counterattack: { ...before.counterattack, yaw: 0 },
    }),
  );
  assert.deepEqual(b.snapshot(), before);
  b.reset();
  assert.equal(b.snapshot().counterattack.phase, 'idle');
  assert.deepEqual(b.snapshot().counterattacks, []);
  assert.equal(b.snapshot().elapsed, 0);
  b.step(0.1, progress(150));
  assert.equal(b.snapshot().counterattack.phase, 'telegraph');
});

test('physical marker timing is independent of fixed-step subdivision and terminal counterattack state restores exactly', () => {
  const options = { escapeDistance: 2000, routeLength: 1000, health: 18 };
  const single = create(options),
    fixed = create(options);
  const one = bossShots(single.step(3.6, progress(360)));
  const many = [];
  for (let tick = 1; tick <= 360; tick++)
    many.push(...bossShots(fixed.step(0.01, progress(tick))));
  assert.equal(one.length, 1);
  assert.equal(many.length, 1);
  assert.ok(Math.abs(one[0].payload.elapsed - many[0].payload.elapsed) < 1e-8);
  assert.ok(Math.abs(single.snapshot().counterattack.started - 1.5) < 1e-8);
  assert.equal(
    single.snapshot().counterattack.phase,
    fixed.snapshot().counterattack.phase,
  );
  assert.equal(
    single.snapshot().counterattack.yaw,
    fixed.snapshot().counterattack.yaw,
  );
  single.hit(lance());
  single.step(0.01, progress(361));
  const terminal = single.snapshot();
  fixed.restore(terminal);
  assert.deepEqual(fixed.snapshot(), terminal);
  assert.deepEqual(fixed.step(10, progress(1900)), []);
  assert.deepEqual(fixed.snapshot(), terminal);
});

test('each boss keeps the same difficulty hulls while using its own physical attack marker, kind and volley', () => {
  for (const bossId of ['goliath', 'wraith', 'bulwark']) {
    const boss = interceptorBoss(bossId),
      attack = boss.attack;
    for (const difficulty of ['easy', 'medium', 'hard']) {
      const mission = create({
        bossId,
        difficulty,
        allies: [],
        routeLength: 1000,
        escapeDistance: 2000,
      });
      const initial = mission.snapshot();
      assert.equal(initial.health, missionProfile(difficulty).maxHealth);
      assert.equal(initial.bossId, bossId);
      assert.equal(initial.targetId, bossId);
      assert.equal(initial.targetName, boss.name);
      assert.equal(initial.bossKind, boss.kind);
      assert.equal(initial.counterattack.kind, attack.kind);
      assert.equal(initial.counterattack.blasts, attack.blasts[difficulty]);
      const marker = 1000 * attack.marker;
      assert.deepEqual(mission.step(1, progress(marker - 1)), []);
      assert.equal(mission.snapshot().counterattack.phase, 'idle');
      assert.deepEqual(mission.step(1, progress(marker)), []);
      assert.equal(mission.snapshot().counterattack.phase, 'telegraph');
      assert.equal(mission.snapshot().counterattack.started, 2);
      const first = mission.step(
        attack.telegraph + attack.turn,
        progress(marker + 10),
      );
      assert.equal(first.length, 1);
      assert.equal(first[0].payload.source, bossId);
      assert.equal(first[0].payload.kind, attack.kind);
      assert.equal(mission.snapshot().counterattack.phase, 'firing');
      assert.equal(
        mission.snapshot().counterattack.yaw,
        attack.reverse ? Math.PI : 0,
      );
      let shots = first.length;
      const rest = attack.blasts[difficulty] - 1;
      if (rest)
        shots += mission.step(
          rest * attack.shotInterval,
          progress(marker + 20),
        ).length;
      assert.equal(shots, attack.blasts[difficulty]);
      assert.equal(mission.snapshot().counterattack.shots, shots);
      const remaining = attack.hold + attack.turn - rest * attack.shotInterval;
      mission.step(remaining, progress(marker + 30));
      assert.equal(mission.snapshot().counterattack.phase, 'idle');
      assert.equal(mission.snapshot().counterattack.yaw, 0);
      const idleShots = mission.step(30, progress(marker + 30));
      if (boss.countermeasureInterval === null) {
        assert.deepEqual(
          idleShots,
          [],
          'specialist attacks do not leak passive Goliath Ion wakes',
        );
        assert.equal(mission.snapshot().nextIonFire, null);
      } else {
        assert.ok(idleShots.every((event) => event.payload.kind === 'ion'));
      }
    }
  }
});

test('specialist attack restores retain only the unfinished rear-facing volley', () => {
  for (const bossId of ['wraith', 'bulwark']) {
    const boss = interceptorBoss(bossId),
      attack = boss.attack;
    const options = {
      bossId,
      allies: [],
      routeLength: 1000,
      escapeDistance: 2000,
    };
    const a = create(options),
      b = create(options);
    const marker = 1000 * attack.marker;
    a.step(1, progress(marker));
    a.step(attack.telegraph + attack.turn, progress(marker + 10));
    const saved = JSON.parse(JSON.stringify(a.snapshot()));
    assert.equal(saved.counterattack.shots, 1);
    b.restore(saved);
    assert.deepEqual(b.snapshot(), saved);
    assert.deepEqual(b.step(0, {}), []);
    const first = a.step(attack.shotInterval, progress(marker + 20));
    const replay = b.step(attack.shotInterval, progress(marker + 20));
    assert.deepEqual(replay, first);
    assert.equal(replay.length, 1);
    assert.deepEqual(b.snapshot(), a.snapshot());
    assert.equal(b.snapshot().counterattack.yaw, Math.PI);
    const remaining = attack.hold + attack.turn - attack.shotInterval;
    assert.deepEqual(
      a.step(remaining, progress(marker + 30)),
      b.step(remaining, progress(marker + 30)),
    );
    assert.equal(b.snapshot().counterattack.phase, 'idle');
    assert.deepEqual(b.snapshot(), a.snapshot());
    b.reset();
    assert.equal(b.snapshot().counterattack.phase, 'idle');
    assert.equal(b.snapshot().nextIonFire, boss.countermeasureInterval);
    assert.deepEqual(b.snapshot().counterattacks, []);
    assert.deepEqual(b.step(1, progress(marker)), []);
    assert.equal(b.snapshot().counterattack.phase, 'telegraph');
  }
});

test('every boss warns, completes one backward volley per lap, and holds its aim through the last shot', () => {
  for (const bossId of ['goliath', 'wraith', 'bulwark']) {
    const boss = interceptorBoss(bossId),
      attack = boss.attack;
    assert.equal(attack.reverse, true);
    assert.ok(attack.telegraph >= 1, 'a readable charge precedes the turn');
    assert.ok(attack.turn >= 0.5, 'the physical turn is visible');
    for (const difficulty of ['easy', 'medium', 'hard']) {
      const mission = create({
        bossId,
        difficulty,
        allies: [],
        routeLength: 1000,
        escapeDistance: 2000,
      });
      const firing = attack.telegraph + attack.turn,
        lastShot = (attack.blasts[difficulty] - 1) * attack.shotInterval,
        burstTail =
          attack.kind === 'arc'
            ? COMBAT_RULES.arcDelay + 2 * COMBAT_RULES.arcInterval
            : 0;
      assert.ok(
        attack.hold - lastShot - burstTail >= 0.6,
        'hold the final projectile before turning forward',
      );
      for (let lap = 0; lap < 2; lap++) {
        const marker = 1000 * (lap + attack.marker);
        mission.step(0.1, progress(marker));
        assert.equal(mission.snapshot().counterattack.phase, 'telegraph');
        assert.equal(mission.snapshot().counterattack.warning, true);
        const shots = mission.step(firing, progress(marker + 10));
        assert.equal(mission.snapshot().counterattack.yaw, Math.PI);
        if (lastShot)
          shots.push(...mission.step(lastShot, progress(marker + 20)));
        assert.equal(
          shots.filter((event) => event.payload.kind === attack.kind).length,
          attack.blasts[difficulty],
        );
        assert.equal(mission.snapshot().counterattack.phase, 'firing');
        assert.equal(mission.snapshot().counterattack.yaw, Math.PI);
        mission.step(
          attack.hold + attack.turn - lastShot,
          progress(marker + 30),
        );
        assert.equal(mission.snapshot().counterattack.phase, 'idle');
        assert.equal(mission.snapshot().counterattack.yaw, 0);
        assert.equal(mission.snapshot().counterattacks.length, lap + 1);
        const consumed = mission.snapshot().counterattacks;
        mission.step(0.1, progress(marker - 10));
        mission.step(0.1, progress(marker + 40));
        assert.deepEqual(mission.snapshot().counterattacks, consumed);
      }
    }
  }
});

test('Bulwark keeps separate Ion wakes and suppresses them while its heavy volley turns and fires', () => {
  const mission = create({ bossId: 'bulwark', allies: [] });
  assert.deepEqual(mission.step(8.9, progress(100)), []);
  const wake = mission.step(0.1, progress(100));
  assert.equal(wake.length, 1);
  assert.equal(wake[0].payload.kind, 'ion');
  mission.step(6, progress(645));
  assert.equal(mission.snapshot().counterattack.phase, 'telegraph');
  const events = mission.step(5.2, progress(900));
  assert.equal(
    events.filter((event) => event.payload.kind === 'lance').length,
    2,
  );
  assert.equal(
    events.some((event) => event.payload.kind === 'ion'),
    false,
  );
  mission.step(6.7, progress(1000));
  const next = mission.step(0.1, progress(1000));
  assert.equal(next.length, 1);
  assert.equal(next[0].payload.kind, 'ion');
});

test('boss identity, target aliases, real damage ownership and named terminal results survive replay isolation', () => {
  const identities = new Set();
  for (const bossId of ['goliath', 'wraith', 'bulwark']) {
    const mission = create({ bossId, health: 18 });
    identities.add(mission.rulesId);
    assert.equal(
      mission.hit({ ...lance(), target: bossId })[0].payload.damage,
      18,
    );
    mission.step(1 / 120, progress());
    const saved = mission.snapshot();
    assert.equal(saved.result.targetName, interceptorBoss(bossId).name);
    assert.equal(saved.result.bossKind, interceptorBoss(bossId).kind);
    assert.equal(saved.result.bossId, bossId);
    assert.equal(saved.result.targetId, bossId);
    const restored = create({ bossId, health: 18 });
    restored.restore(saved);
    assert.deepEqual(restored.snapshot(), saved);
    const foreign = create({
      bossId: bossId === 'goliath' ? 'wraith' : 'goliath',
      health: 18,
    });
    const before = foreign.snapshot();
    assert.throws(() => foreign.restore(saved), /Incompatible/);
    assert.deepEqual(foreign.snapshot(), before);
  }
  assert.equal(identities.size, 3);
  assert.throws(
    () => create({ bossId: 'unknown' }),
    /Unknown Interceptor boss/,
  );
  const alias = create({
    bossId: 'wraith',
    targetId: 'custom-target',
    health: 18,
  });
  assert.deepEqual(alias.hit({ ...lance(), target: 'wraith' }), []);
  assert.equal(
    alias.hit({ ...lance(), target: 'custom-target' })[0].payload.target,
    'custom-target',
  );
  alias.step(1 / 120, progress());
  assert.equal(alias.snapshot().result.targetId, 'custom-target');
  assert.equal(alias.snapshot().result.targetName, 'Wraith');
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
    { ...lance(), equipment: 'arc' },
    { ...lance(), kind: 'arc' },
    { ...lance(), key: undefined },
  ])
    assert.deepEqual(mission.hit(payload), []);
  const snapshot = mission.snapshot();
  assert.equal(snapshot.health, 673);
  assert.equal(snapshot.playerDamage, 23);
  assert.equal(snapshot.alliedDamage, 4);
  assert.equal(snapshot.hits, 4);
});

test('Lance contacts and ordinary Repulsor pulses retain their own damage and hit labels', () => {
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
  const pulse = mission.hit({
    source: 'player',
    target: 'goliath',
    kind: 'repulsor',
    shielded: false,
    key: 'real-hit-id:18',
  });
  assert.equal(pulse.length, 1);
  assert.equal(pulse[0].payload.equipment, 'repulsor');
  assert.equal(pulse[0].payload.damage, 12);
  assert.equal(mission.snapshot().health, 670);
});

test('Repulsor damage credits real unshielded allied contacts once and keeps Ion countermeasures out of hull scoring', () => {
  const mission = create();
  const pulse = {
    source: 'player',
    target: 'goliath',
    kind: 'repulsor',
    key: 'pulse:1',
  };
  assert.deepEqual(mission.hit({ ...pulse, shielded: true }), []);
  assert.equal(mission.snapshot().hits, 0);
  assert.equal(mission.hit(pulse)[0].payload.damage, 12);
  assert.deepEqual(mission.hit(pulse), []);
  assert.equal(mission.hit({ ...pulse, source: 'rook' })[0].payload.damage, 2);
  const saved = mission.snapshot();
  for (const invalid of [
    { ...pulse, source: 'enemy', key: 'other' },
    { ...pulse, target: 'rook', key: 'other' },
    { ...pulse, kind: 'ion', key: 'other' },
    { ...pulse, equipment: 'lance', kind: 'arc', key: 'other' },
  ])
    assert.deepEqual(mission.hit(invalid), []);
  assert.deepEqual(mission.snapshot(), saved);
  assert.equal(saved.health, 686);
  assert.equal(saved.playerDamage, 12);
  assert.equal(saved.alliedDamage, 2);
  assert.equal(saved.hits, 2);
  const restored = create();
  restored.restore(saved);
  assert.deepEqual(restored.snapshot(), saved);
  assert.deepEqual(restored.hit(pulse), []);
  assert.throws(() => restored.restore({ ...saved, version: 1 }));
  assert.throws(() =>
    restored.restore({
      ...saved,
      lastHit: { ...saved.lastHit, equipment: 'ion' },
    }),
  );
  assert.throws(() =>
    restored.restore({
      ...saved,
      lastHit: { ...saved.lastHit, damage: 3 },
    }),
  );
  assert.deepEqual(restored.snapshot(), saved);
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
  assert.equal(mission.snapshot().health, 700);
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
  assert.equal(mission.snapshot().result.health, 700);
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
