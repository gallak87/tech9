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
    const override = create({ difficulty, health: 9 });
    assert.equal(override.snapshot().maxHealth, 9);
    assert.notEqual(override.rulesId, mission.rulesId);
    override.hit(lance());
    override.step(1 / 120, progress());
    assert.equal(override.snapshot().result.difficulty, difficulty);
    assert.equal(override.snapshot().result.maxHealth, 9);
  }
  assert.equal(missionProfile().maxHealth, 700);
  assert.throws(() => missionProfile('impossible'));
  assert.throws(() => create({ routeLength: 0 }));
});

test('the pressure marker charges, locks both lanes before discharge, turns and exposes the rear core', () => {
  const attack = interceptorBoss('goliath').attack;
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const mission = create({
      difficulty,
      escapeDistance: 2000,
      routeLength: 1000,
    });
    mission.step(1, progress(149));
    assert.equal(mission.snapshot().counterattack.phase, 'idle');
    const charge = mission.step(1, progress(150));
    assert.equal(bossShots(charge).length, 0);
    assert.equal(
      charge.find((event) => event.type === 'interceptor-cue').payload.cue,
      'charge',
    );
    assert.equal(mission.snapshot().counterattack.started, 2);
    assert.equal(mission.snapshot().counterattack.lap, 1);
    assert.equal(mission.snapshot().counterattack.tracking, true);
    const lock = mission.step(attack.telegraph, progress(175));
    assert.equal(mission.snapshot().counterattack.phase, 'turning-back');
    assert.equal(mission.snapshot().counterattack.locked, true);
    assert.equal(
      mission.snapshot().counterattack.aimLanes.length,
      missionProfile(difficulty).blasts,
    );
    assert.ok(lock.some((event) => event.payload.cue === 'lock'));
    assert.ok(mission.snapshot().counterattack.fireIn >= 0.8 - 1e-8);
    mission.step(attack.turn / 2, progress(200));
    assert.ok(
      Math.abs(mission.snapshot().counterattack.yaw - Math.PI / 2) < 1e-8,
    );
    const first = bossShots(mission.step(attack.turn / 2, progress(225)));
    assert.equal(first.length, 1);
    assert.equal(mission.snapshot().counterattack.phase, 'firing');
    assert.equal(mission.snapshot().counterattack.yaw, Math.PI);
    assert.ok(Math.abs(first[0].payload.elapsed - 4.2) < 1e-8);
    assert.deepEqual(first[0].payload.muzzle, [-4.8, 1, 18.5]);
    const second = bossShots(mission.step(attack.shotInterval, progress(250)));
    assert.equal(second.length, difficulty === 'easy' ? 0 : 1);
    if (second.length)
      assert.notEqual(second[0].payload.aimLane, first[0].payload.aimLane);
    mission.step(attack.hold - attack.shotInterval, progress(275));
    assert.equal(mission.snapshot().counterattack.phase, 'turning-forward');
    mission.step(attack.turn / 2, progress(300));
    assert.ok(
      Math.abs(mission.snapshot().counterattack.yaw - Math.PI / 2) < 1e-8,
    );
    const opening = mission.step(attack.turn / 2, progress(325));
    assert.equal(mission.snapshot().counterattack.phase, 'breach');
    assert.equal(mission.snapshot().counterattack.exposed, true);
    assert.equal(mission.snapshot().counterattack.warning, false);
    assert.ok(opening.some((event) => event.payload.cue === 'expose'));
    mission.step(attack.pressure.breach, progress(350));
    assert.equal(mission.snapshot().counterattack.phase, 'idle');
    assert.equal(mission.snapshot().counterattack.exposed, false);
    assert.equal(mission.snapshot().counterattack.yaw, 0);
    assert.equal(
      mission.snapshot().counterattack.shots,
      missionProfile(difficulty).blasts,
    );
  }
});

test('six pressure beats queue without overlaps, keep true lap identities and suppress Ion during each sequence', () => {
  const mission = create({ escapeDistance: 2000, routeLength: 1000 });
  mission.step(5, progress(149));
  assert.equal(mission.snapshot().counterattack.phase, 'idle');
  mission.step(0.1, progress(150));
  const active = mission.step(2, progress(1900));
  assert.equal(mission.snapshot().counterattacks.length, 1);
  assert.ok(
    !active.some(
      (event) =>
        event.payload.source === 'goliath' && event.payload.kind === 'ion',
    ),
  );
  for (let index = 1; index < 6; index++) {
    mission.step(index === 1 ? 6 : 8, progress(1900));
    const phase = mission.snapshot().counterattack;
    assert.equal(phase.phase, 'telegraph');
    assert.equal(phase.lap, Math.floor(index / 3) + 1);
    assert.equal(phase.beat, (index % 3) + 1);
    assert.equal(phase.attackIndex, index);
    assert.equal(mission.snapshot().counterattacks.length, index + 1);
  }
  mission.step(8, progress(1900));
  const saved = mission.snapshot();
  assert.equal(saved.counterattack.phase, 'idle');
  assert.equal(saved.counterattack.lap, 2);
  assert.equal(saved.counterattack.beat, 3);
  assert.deepEqual(
    saved.counterattacks.map((attack) => attack.shots),
    [2, 2, 2, 2, 2, 2],
  );
  for (let index = 1; index < saved.counterattacks.length; index++)
    assert.ok(
      saved.counterattacks[index].started -
        saved.counterattacks[index - 1].started >=
        8 - 1e-8,
    );
  const replay = create({ escapeDistance: 2000, routeLength: 1000 });
  replay.restore(saved);
  assert.deepEqual(replay.snapshot(), saved);
  replay.step(1, progress(0));
  assert.equal(bossShots(replay.step(1, progress(1950))).length, 0);
  assert.equal(replay.snapshot().counterattacks.length, 6);
});

test('counterattack snapshots resume a partial volley without duplicate fire, and pause/reset preserve exact phase ownership', () => {
  const a = create({ escapeDistance: 2000, routeLength: 1000 });
  a.step(1, progress(150));
  const first = bossShots(a.step(2.2, progress(200)));
  assert.equal(first.length, 1);
  const saved = JSON.parse(JSON.stringify(a.snapshot()));
  const b = create({ escapeDistance: 2000, routeLength: 1000 });
  b.restore(saved);
  assert.deepEqual(b.snapshot(), saved);
  assert.deepEqual(b.step(0, {}), []);
  assert.deepEqual(b.snapshot(), saved);
  const nextA = a.step(1, progress(250));
  const nextB = b.step(1, progress(250));
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

test('pressure aim follows the pilot before lock, then both muzzle lanes stay frozen through a committed dodge', () => {
  const mission = create({
    difficulty: 'hard',
    routeLength: 1000,
    escapeDistance: 2000,
  });
  mission.step(1, { ...progress(150, 118), playerLateral: -14 });
  mission.step(0.5, { ...progress(210, 178), playerLateral: -10 });
  assert.equal(mission.snapshot().counterattack.tracking, true);
  assert.equal(mission.snapshot().counterattack.aimLane, -10);
  const lock = mission.step(0.5, { ...progress(270, 238), playerLateral: -8 });
  assert.deepEqual(mission.snapshot().counterattack.aimLanes, [-8, 0]);
  assert.equal(lock.filter((event) => event.payload.cue === 'lock').length, 1);
  assert.ok(Math.abs(mission.snapshot().counterattack.fireIn - 1.2) < 1e-8);
  const locked = JSON.parse(JSON.stringify(mission.snapshot()));
  const resumed = create({
    difficulty: 'hard',
    routeLength: 1000,
    escapeDistance: 2000,
  });
  resumed.restore(locked);
  const dodge = { ...progress(340, 308), playerLateral: 14 };
  const first = bossShots(mission.step(1.2, dodge));
  const repeated = bossShots(resumed.step(1.2, dodge));
  assert.deepEqual(first, repeated);
  assert.equal(first.length, 1);
  assert.equal(first[0].payload.aimLane, -8);
  assert.equal(first[0].payload.aimDistance, 32);
  assert.equal(first[0].payload.shotIndex, 0);
  const second = bossShots(
    mission.step(1, { ...progress(425, 393), playerLateral: -15 }),
  );
  assert.equal(second.length, 1);
  assert.equal(second[0].payload.aimLane, 0);
  assert.deepEqual(second[0].payload.muzzle, [4.8, 1, 18.5]);
  assert.deepEqual(mission.snapshot().counterattack.aimLanes, [-8, 0]);
});

test('pressure phase cues are deterministic one-shot events across pause, replay and large fixed-step batches', () => {
  const options = { allies: [], routeLength: 1000, escapeDistance: 2000 };
  const mission = create(options);
  const start = mission.step(1, progress(150, 118));
  assert.deepEqual(
    start
      .filter((event) => event.type === 'interceptor-cue')
      .map((event) => event.payload.cue),
    ['charge'],
  );
  const before = mission.snapshot();
  assert.deepEqual(mission.step(0, {}), []);
  assert.deepEqual(mission.snapshot(), before);
  const events = mission.step(8, progress(400, 368));
  assert.deepEqual(
    events
      .filter((event) => event.type === 'interceptor-cue')
      .map((event) => event.payload.cue),
    ['lock', 'turn', 'return', 'expose'],
  );
  assert.ok(
    Math.abs(
      events.find((event) => event.payload.cue === 'return').payload.elapsed -
        5.2,
    ) < 1e-8,
  );
  const saved = mission.snapshot();
  const resumed = create(options);
  resumed.restore(saved);
  assert.deepEqual(resumed.step(0.1, progress(410, 378)), []);
  const bad = structuredClone(saved);
  bad.counterattacks[0].cues = 0;
  assert.throws(() => resumed.restore(bad));
  assert.equal(resumed.snapshot().counterattacks[0].cues, 47);
});

test('edge camping cannot collapse both pressure locks into the same clamped lane', () => {
  for (const playerLateral of [-40, -19.5, -1, 0, 1, 19.5, 40]) {
    const mission = create({
      difficulty: 'hard',
      routeLength: 1000,
      escapeDistance: 2000,
    });
    const progress = {
      targetDistance: 150,
      playerDistance: 118,
      playerLateral,
    };
    mission.step(1, progress);
    mission.step(1.4, progress);
    const [first, second] = mission.snapshot().counterattack.aimLanes;
    assert.ok(Number.isFinite(first) && Number.isFinite(second));
    assert.ok(Math.abs(first) <= 19 && Math.abs(second) <= 19);
    assert.ok(
      Math.abs(first - second) >= 8,
      `two separate danger lanes survive at pilot lane ${playerLateral}`,
    );
    const saved = mission.snapshot();
    const restored = create({
      difficulty: 'hard',
      routeLength: 1000,
      escapeDistance: 2000,
    });
    restored.restore(saved);
    assert.deepEqual(restored.snapshot().counterattack.aimLanes, [
      first,
      second,
    ]);
  }
});

test('only actual rear-core hits and a close recentered Repulsor earn the exposed damage bonus', () => {
  const options = { routeLength: 1000, escapeDistance: 2000 };
  const mission = create(options);
  const at = { ...progress(150, 118), playerLateral: 0, targetLateral: 0 };
  mission.step(1, at);
  const core = { ...lance('player', 'armored-core'), hitLocal: [0, 1, -20] };
  assert.equal(
    mission.hit(core)[0].payload.damage,
    9,
    'closed armor is not vulnerable',
  );
  mission.step(5, { ...at, targetDistance: 570, playerDistance: 538 });
  assert.equal(mission.snapshot().counterattack.phase, 'breach');
  for (const [index, hitLocal] of [
    [2, 1, -20],
    [0, 1, 20],
    [0, 4, -20],
    [0, 1, -30],
  ].entries())
    assert.equal(
      mission.hit({ ...lance('player', `wrong-${index}`), hitLocal })[0].payload
        .damage,
      9,
    );
  const weak = mission.hit({
    ...lance('player', 'open-core'),
    hitLocal: [0, 1, -20],
  });
  assert.equal(weak[0].payload.damage, 54);
  assert.equal(weak[0].payload.weakPoint, true);
  assert.equal(
    mission.hit({ ...lance('rook', 'allied-core'), hitLocal: [1, 1, -20] })[0]
      .payload.damage,
    4,
  );
  const pulse = (key) => ({
    source: 'player',
    target: 'goliath',
    kind: 'repulsor',
    key,
  });
  mission.step(0.1, {
    ...at,
    targetDistance: 580,
    playerDistance: 548,
    playerLateral: 8,
  });
  assert.equal(mission.hit(pulse('wide-pulse'))[0].payload.damage, 6);
  mission.step(0.1, { ...at, targetDistance: 590, playerDistance: 540 });
  assert.equal(mission.hit(pulse('distant-pulse'))[0].payload.damage, 6);
  mission.step(0.1, { ...at, targetDistance: 600, playerDistance: 568 });
  assert.equal(mission.hit(pulse('centred-pulse'))[0].payload.damage, 36);
  const saved = JSON.parse(JSON.stringify(mission.snapshot()));
  const resumed = create(options);
  resumed.restore(saved);
  assert.deepEqual(resumed.snapshot(), saved);
  const forged = structuredClone(saved);
  forged.lastHit.corePulse.lateral = 10;
  assert.throws(() => resumed.restore(forged));
  assert.deepEqual(resumed.snapshot(), saved);
  mission.step(3, { ...at, targetDistance: 850, playerDistance: 818 });
  assert.equal(
    mission.hit({ ...lance('player', 'cooled-core'), hitLocal: [0, 1, -20] })[0]
      .payload.damage,
    9,
  );
});

test('an actual unshielded pressure hit on the pilot recovers charge once and keeps the rear core sealed', () => {
  const options = {
    difficulty: 'hard',
    routeLength: 1000,
    escapeDistance: 2000,
  };
  const mission = create(options);
  const progress = { targetDistance: 150, playerDistance: 118 };
  mission.step(1, progress);
  mission.step(2.2, progress);
  const hostile = {
    source: 'goliath',
    target: 'player',
    kind: 'repulsor',
    equipment: 'lance',
    signature: 'goliath-pressure',
    key: 'pressure:1',
    shielded: false,
  };
  const charge = mission.hit(hostile);
  assert.equal(charge.length, 1);
  assert.equal(charge[0].type, 'interceptor-cue');
  assert.equal(charge[0].payload.cue, 'recover');
  assert.equal(
    mission.snapshot().health,
    950,
    'incoming pressure is not damage to the boss',
  );
  assert.equal(mission.snapshot().hits, 0);
  assert.equal(mission.snapshot().counterattack.pressureHits, 1);
  assert.deepEqual(mission.hit(hostile), [], 'delivery cannot recharge twice');
  const saved = JSON.parse(JSON.stringify(mission.snapshot()));
  const resumed = create(options);
  resumed.restore(saved);
  assert.deepEqual(resumed.snapshot(), saved);
  const opening = resumed.step(2.8, progress);
  assert.equal(resumed.snapshot().counterattack.phase, 'recovered');
  assert.equal(resumed.snapshot().counterattack.recovered, true);
  assert.equal(resumed.snapshot().counterattack.core.open, false);
  assert.equal(resumed.snapshot().counterattack.exposed, false);
  assert.ok(
    !opening.some(
      (event) =>
        event.payload.cue === 'recover' || event.payload.cue === 'expose',
    ),
  );
  assert.equal(
    resumed.hit({ ...lance('player', 'sealed-core'), hitLocal: [0, 1, -20] })[0]
      .payload.damage,
    9,
    'failed dodge still permits honest chip damage',
  );
  assert.deepEqual(
    resumed.hit({ ...hostile, key: 'late' }),
    [],
    'a late hit cannot rewrite a completed attack',
  );
  const before = resumed.snapshot();
  const forged = structuredClone(before);
  forged.counterattack.recovered = false;
  assert.throws(() => resumed.restore(forged));
  assert.deepEqual(resumed.snapshot(), before);
  const fakeContact = structuredClone(before);
  fakeContact.counterattacks[0].incomingHits[0].signature = 'ordinary-lance';
  assert.throws(() => resumed.restore(fakeContact));
  assert.deepEqual(resumed.snapshot(), before);
});

test('dodging or an Aegis block earns overload while allied hits and ordinary hazards cannot steal the opening', () => {
  for (const incoming of [
    null,
    {
      source: 'goliath',
      target: 'player',
      signature: 'goliath-pressure',
      shielded: true,
    },
    {
      source: 'goliath',
      target: 'rook',
      signature: 'goliath-pressure',
      shielded: false,
    },
    {
      source: 'goliath',
      target: 'player',
      signature: undefined,
      shielded: false,
    },
    {
      source: 'rook',
      target: 'player',
      signature: 'goliath-pressure',
      shielded: false,
    },
  ]) {
    const mission = create({
      difficulty: 'hard',
      routeLength: 1000,
      escapeDistance: 2000,
    });
    const progress = { targetDistance: 150, playerDistance: 118 };
    mission.step(1, progress);
    mission.step(2.2, progress);
    if (incoming)
      assert.deepEqual(mission.hit({ ...incoming, key: 'incoming:1' }), []);
    const opening = mission.step(2.8, progress);
    assert.equal(mission.snapshot().counterattack.phase, 'breach');
    assert.equal(mission.snapshot().counterattack.pressureHits, 0);
    assert.equal(mission.snapshot().counterattack.core.open, true);
    assert.equal(
      opening.filter((event) => event.payload.cue === 'expose').length,
      1,
    );
    const critical = mission.hit({
      ...lance('player', 'clean-core'),
      hitLocal: [0, 0.3, -20.7],
    });
    assert.equal(critical[0].payload.damage, 54);
    assert.equal(critical[0].payload.bossId, 'goliath');
    assert.equal(critical[0].payload.weakPoint, true);
    const saved = mission.snapshot();
    const resumed = create({
      difficulty: 'hard',
      routeLength: 1000,
      escapeDistance: 2000,
    });
    resumed.restore(saved);
    assert.deepEqual(resumed.snapshot(), saved);
  }
});

test('physical marker timing is independent of fixed-step subdivision and terminal counterattack state restores exactly', () => {
  const options = { escapeDistance: 2000, routeLength: 1000, health: 9 };
  const single = create(options),
    fixed = create(options);
  const one = bossShots(single.step(3.8, progress(380)));
  const many = [];
  for (let tick = 1; tick <= 380; tick++)
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
  single.step(0.01, progress(381));
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
      const marker = 1000 * (attack.markers ?? [attack.marker])[0];
      assert.deepEqual(mission.step(1, progress(marker - 1)), []);
      assert.equal(mission.snapshot().counterattack.phase, 'idle');
      assert.equal(
        mission
          .step(1, progress(marker))
          .filter((event) => event.type === 'interceptor-fire').length,
        0,
      );
      assert.equal(mission.snapshot().counterattack.phase, 'telegraph');
      assert.equal(mission.snapshot().counterattack.started, 2);
      const first = mission
        .step(
          attack.telegraph + attack.turn + (attack.fireDelay ?? 0),
          progress(marker + 10),
        )
        .filter((event) => event.type === 'interceptor-fire');
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
        shots += mission
          .step(rest * attack.shotInterval, progress(marker + 20))
          .filter((event) => event.type === 'interceptor-fire').length;
      assert.equal(shots, attack.blasts[difficulty]);
      assert.equal(mission.snapshot().counterattack.shots, shots);
      const remaining =
        attack.hold +
        attack.turn +
        (attack.pressure?.breach ?? attack.resonance?.breach ?? 0) -
        rest * attack.shotInterval -
        (attack.fireDelay ?? 0);
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
        assert.ok(
          idleShots
            .filter((event) => event.type === 'interceptor-fire')
            .every((event) => event.payload.kind === 'ion'),
        );
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
    const marker = 1000 * (attack.markers ?? [attack.marker])[0];
    a.step(1, progress(marker));
    a.step(
      attack.telegraph + attack.turn + (attack.fireDelay ?? 0),
      progress(marker + 10),
    );
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
    const remaining =
      attack.hold +
      attack.turn +
      (attack.resonance?.breach ?? 0) -
      attack.shotInterval -
      (attack.fireDelay ?? 0);
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
    assert.equal(
      b
        .step(1, progress(marker))
        .filter((event) => event.type === 'interceptor-fire').length,
      0,
    );
    assert.equal(b.snapshot().counterattack.phase, 'telegraph');
  }
});

test('every authored boss beat warns, fires across both laps and holds its aim through the last shot', () => {
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
      const firing = attack.telegraph + attack.turn + (attack.fireDelay ?? 0),
        lastShot = (attack.blasts[difficulty] - 1) * attack.shotInterval,
        burstTail =
          attack.kind === 'arc' && !attack.resonance
            ? COMBAT_RULES.arcDelay + 2 * COMBAT_RULES.arcInterval
            : 0;
      assert.ok(
        attack.hold - (attack.fireDelay ?? 0) - lastShot - burstTail >=
          (attack.resonance ? 0.3 : 0.6),
        'hold the final projectile before turning forward',
      );
      const markers = attack.markers ?? [attack.marker];
      for (let index = 0; index < markers.length * 2; index++) {
        const lap = Math.floor(index / markers.length);
        const marker = 1000 * (lap + markers[index % markers.length]);
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
          attack.hold +
            attack.turn +
            (attack.pressure?.breach ?? attack.resonance?.breach ?? 0) -
            lastShot -
            (attack.fireDelay ?? 0),
          progress(marker + 30),
        );
        assert.equal(mission.snapshot().counterattack.phase, 'idle');
        assert.equal(mission.snapshot().counterattack.yaw, 0);
        assert.equal(mission.snapshot().counterattacks.length, index + 1);
        assert.equal(mission.snapshot().counterattack.lap, lap + 1);
        assert.equal(
          mission.snapshot().counterattack.beat,
          (index % markers.length) + 1,
        );
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
    const health = bossId === 'bulwark' ? 18 : 9;
    const mission = create({ bossId, health });
    identities.add(mission.rulesId);
    assert.equal(
      mission.hit({ ...lance(), target: bossId })[0].payload.damage,
      health,
    );
    mission.step(1 / 120, progress());
    const saved = mission.snapshot();
    assert.equal(saved.result.targetName, interceptorBoss(bossId).name);
    assert.equal(saved.result.bossKind, interceptorBoss(bossId).kind);
    assert.equal(saved.result.bossId, bossId);
    assert.equal(saved.result.targetId, bossId);
    const restored = create({ bossId, health });
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
    health: 9,
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
  assert.equal(mission.hit(lance())[0].payload.damage, 9);
  assert.deepEqual(mission.hit(lance()), []);
  assert.equal(mission.hit(lance('rook'))[0].payload.damage, 3);
  assert.equal(
    mission.hit({
      ...lance('player', '2'),
      kind: 'arc',
      equipment: undefined,
    })[0].payload.damage,
    2,
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
  assert.equal(snapshot.health, 685);
  assert.equal(snapshot.playerDamage, 11);
  assert.equal(snapshot.alliedDamage, 4);
  assert.equal(snapshot.hits, 4);
});

test('Goliath and Wraith armor chips retain real hit credit and replay identity while Bulwark keeps stock weapon damage', () => {
  for (const bossId of ['goliath', 'wraith', 'bulwark']) {
    const mission = create({ bossId });
    for (const [equipment, stock, chip] of [
      ['lance', 18, 9],
      ['arc', 5, 2],
      ['repulsor', 12, 6],
    ]) {
      const hit = mission.hit({
        source: 'player',
        target: bossId,
        key: `armor-${equipment}`,
        kind: equipment === 'lance' ? 'repulsor' : equipment,
        ...(equipment === 'lance' ? { equipment: 'lance' } : {}),
      });
      assert.equal(hit[0].payload.damage, bossId !== 'bulwark' ? chip : stock);
      assert.equal(
        hit[0].payload.armored,
        bossId !== 'bulwark' ? true : undefined,
      );
      assert.equal(hit[0].payload.weakPoint, undefined);
    }
    const saved = JSON.parse(JSON.stringify(mission.snapshot()));
    const restored = create({ bossId });
    restored.restore(saved);
    assert.deepEqual(restored.snapshot(), saved);
    assert.equal(saved.hits, 3, 'armor does not discard real contacts');
    const forged = structuredClone(saved);
    if (bossId !== 'bulwark') {
      delete forged.lastHit.armored;
      assert.deepEqual(
        JSON.parse(mission.rulesId).counterattack[
          bossId === 'goliath' ? 'pressure' : 'resonance'
        ].armorPlayer,
        { lance: 9, arc: 2, repulsor: 6 },
      );
      assert.equal(saved.version, 9);
    } else forged.lastHit.armored = true;
    assert.throws(() => restored.restore(forged));
    assert.deepEqual(restored.snapshot(), saved);
  }
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
  assert.equal(hit[0].payload.damage, 9);
  const pulse = mission.hit({
    source: 'player',
    target: 'goliath',
    kind: 'repulsor',
    shielded: false,
    key: 'real-hit-id:18',
  });
  assert.equal(pulse.length, 1);
  assert.equal(pulse[0].payload.equipment, 'repulsor');
  assert.equal(pulse[0].payload.damage, 6);
  assert.equal(mission.snapshot().health, 685);
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
  assert.equal(mission.hit(pulse)[0].payload.damage, 6);
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
  assert.equal(saved.health, 692);
  assert.equal(saved.playerDamage, 6);
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
  const mission = create({ health: 10 });
  mission.hit(lance());
  assert.equal(mission.hit(lance('player', '2'))[0].payload.damage, 1);
  assert.equal(mission.snapshot().result, null);
  const events = mission.step(1 / 120, progress(8600, 8500));
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'interceptor-complete');
  const result = mission.snapshot().result;
  assert.equal(result.won, true);
  assert.equal(result.reason, 'disabled');
  assert.equal(result.playerDamage, 10);
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
  const mission = create({ health: 9 });
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
  assert.equal(mission.snapshot().health, 9);
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
