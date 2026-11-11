import test from 'node:test';
import assert from 'node:assert/strict';
import { createInterceptorEvent } from './interceptor.js';
import { interceptorBoss } from './interceptor-bosses.js';

const dt = 1 / 120;
const setup = () => {
  const options = {
    bossId: 'bulwark',
    allies: ['rook'],
    difficulty: 'hard',
    routeLength: 1000,
    escapeDistance: 2000,
  };
  const mission = createInterceptorEvent(options);
  const progress = (distance) => ({
    targetDistance: distance,
    playerDistance: distance - 32,
    playerLateral: 5,
  });
  const events = mission.step(dt, progress(140));
  let start = mission.snapshot().counterattack.started;
  const to = (time, distance = 140) => {
    while (mission.snapshot().elapsed < start + time - 1e-8)
      events.push(
        ...mission.step(
          Math.min(dt, start + time - mission.snapshot().elapsed),
          progress(distance),
        ),
      );
    return mission.snapshot();
  };
  const next = (distance) => {
    events.push(...mission.step(dt, progress(distance)));
    start = mission.snapshot().counterattack.started;
  };
  return { mission, options, progress, to, next, events };
};
const contact = (key, hitLocal = [4.9, 0.3, -10.7], extra = {}) => ({
  source: 'player',
  target: 'bulwark',
  kind: 'repulsor',
  equipment: 'lance',
  key,
  hitLocal,
  ...extra,
});

test('Breakwater lays one real wake while forward, exposes a fixed shoulder, then stops emission before turning and firing', () => {
  const h = setup();
  assert.equal(h.mission.snapshot().counterattack.breakwater.active, false);
  h.to(0.8);
  let attack = h.mission.snapshot().counterattack;
  assert.equal(attack.breakwater.emitting, true);
  assert.equal(attack.breakwater.active, false);
  h.to(1);
  attack = h.mission.snapshot().counterattack;
  assert.equal(attack.breakwater.active, true);
  assert.equal(attack.breakwater.side, 1);
  assert.deepEqual(attack.breakwater.emitter, [4.2, 1.1, -10]);
  h.to(4.3);
  assert.deepEqual(h.mission.snapshot().counterattack.aimLanes, [5, -3]);
  h.to(5.3);
  attack = h.mission.snapshot().counterattack;
  assert.equal(attack.breakwater.emitting, false);
  assert.equal(attack.breakwater.active, false);
  assert.equal(attack.phase, 'turning-back');
  assert.equal(
    h.events.filter((event) => event.type === 'interceptor-wake-stop').length,
    1,
  );
  h.to(7.2);
  const fire = h.events.filter(
    (event) =>
      event.type === 'interceptor-fire' && event.payload.source === 'bulwark',
  );
  assert.deepEqual(
    fire.map((event) => event.payload.kind),
    ['ion', 'lance', 'lance'],
  );
  assert.deepEqual(
    fire.slice(1).map((event) => event.payload.muzzle),
    [
      [-4.7, 2.25, 8.8],
      [4.7, 2.25, 8.8],
    ],
  );
  h.to(9.1);
  assert.equal(h.mission.snapshot().counterattack.phase, 'idle');
  assert.equal(
    h.mission.snapshot().nextIonFire,
    null,
    'no unrelated passive wake can overwrite the authored cycle',
  );
});

test('only one actual player gun contact on the exposed shoulder ruptures its emitter; centre, wrong side, pulses and allies stay chip', () => {
  const h = setup();
  assert.equal(h.mission.hit(contact('too-early'))[0].payload.damage, 9);
  h.to(1.2);
  for (const payload of [
    contact('centre', [0, 0.3, -10.7]),
    contact('wrong', [-4.9, 0.3, -10.7]),
    contact('too-high', [4.9, 3, -10.7]),
    contact('pulse', [4.9, 0.3, -10.7], { equipment: undefined }),
    contact('ally', [4.9, 0.3, -10.7], { source: 'rook' }),
  ]) {
    const hit = h.mission.hit(payload);
    assert.equal(hit.length, 1);
    assert.equal(hit[0].payload.weakPoint, undefined);
    assert.equal(h.mission.snapshot().counterattack.breakwater.disabled, false);
  }
  assert.deepEqual(
    h.mission.hit(contact('shielded', undefined, { shielded: true })),
    [],
  );
  const rupture = h.mission.hit(contact('real-emitter'));
  assert.deepEqual(
    rupture.map((event) => event.type),
    ['interceptor-hit', 'interceptor-breakwater', 'interceptor-cue'],
  );
  assert.equal(rupture[0].payload.damage, 54);
  assert.equal(rupture[0].payload.weakPoint, true);
  assert.equal(rupture[1].payload.source, 'bulwark');
  assert.equal(rupture[1].payload.attacker, 'player');
  assert.equal(rupture[2].payload.cue, 'counter');
  assert.equal(h.mission.snapshot().counterattack.breakwater.disabled, true);
  assert.equal(h.mission.snapshot().counterattack.breakwater.emitting, false);
  assert.equal(h.mission.snapshot().counterattack.breakwater.active, false);
  assert.deepEqual(h.mission.hit(contact('real-emitter')), []);
  const followup = h.mission.hit(contact('already-cut'));
  assert.equal(followup.length, 1);
  assert.equal(followup[0].payload.damage, 9);
  const arc = setup();
  arc.to(1.2);
  assert.equal(
    arc.mission.hit(
      contact('arc-cut', undefined, { kind: 'arc', equipment: undefined }),
    )[0].payload.damage,
    15,
  );
});

test('Breakwater alternates real shoulders at both stations on both laps without changing its actual course lap', () => {
  const h = setup();
  const markers = interceptorBoss('bulwark').attack.markers;
  const locations = Array.from(
    { length: 4 },
    (_, index) => 1000 * (Math.floor(index / 2) + markers[index % 2]),
  );
  for (const [index, distance] of locations.entries()) {
    if (index) h.next(distance);
    h.to(1.2, distance);
    const attack = h.mission.snapshot().counterattack;
    const side = index % 2 === 0 ? 1 : -1;
    assert.equal(attack.breakwater.side, side);
    assert.equal(attack.breakwater.cycle, index);
    assert.equal(attack.lap, Math.floor(index / 2) + 1);
    assert.equal(attack.beat, (index % 2) + 1);
    const events = h.mission.hit(
      contact(`cut-${index}`, [side * 4.9, 0.3, -10.7]),
    );
    assert.equal(events[0].payload.damage, 54);
    h.to(9.1, distance);
  }
  assert.equal(h.mission.snapshot().counterattacks.length, 4);
  assert.equal(
    h.events.filter((event) => event.type === 'interceptor-wake-stop').length,
    4,
  );
});

test('Breakwater replay validates exact shoulder, hit ledger, timing and stop state before restoring anything', () => {
  const h = setup();
  h.to(1.2);
  h.mission.hit(contact('saved-cut'));
  const saved = h.mission.snapshot(),
    restored = createInterceptorEvent(h.options);
  restored.restore(saved);
  assert.deepEqual(restored.snapshot(), saved);
  for (const mutate of [
    (value) => {
      value.counterattacks[0].side = -1;
    },
    (value) => {
      value.counterattacks[0].breakHit.hitLocal[0] = 0;
    },
    (value) => {
      value.counterattacks[0].breakHit.elapsed =
        value.counterattacks[0].started + 0.5;
    },
    (value) => {
      value.counterattacks[0].breakHit.key = 'never-hit';
    },
    (value) => {
      value.counterattacks[0].wakeStopped = true;
    },
    (value) => {
      value.counterattack.breakwater.disabled = false;
    },
    (value) => {
      value.lastHit.breakwaterCycle = 1;
    },
  ]) {
    const forged = structuredClone(saved);
    mutate(forged);
    assert.throws(() => restored.restore(forged));
    assert.deepEqual(restored.snapshot(), saved);
  }
  h.to(9.1);
  restored.restore(h.mission.snapshot());
  assert.deepEqual(restored.snapshot(), h.mission.snapshot());
});

test('Breakwater extends only Bulwark descriptors and preserves the closed Goliath/Wraith snapshot shape', () => {
  assert.deepEqual(interceptorBoss('bulwark').attack.markers, [0.14, 0.76]);
  for (const bossId of ['goliath', 'wraith']) {
    const mission = createInterceptorEvent({
      bossId,
      routeLength: 1000,
      escapeDistance: 2000,
    });
    mission.step(dt, { targetDistance: 900, playerDistance: 868 });
    assert.equal('breakwater' in mission.snapshot().counterattack, false);
    assert.equal(
      'breakwater' in JSON.parse(mission.rulesId).counterattack,
      false,
    );
  }
});
