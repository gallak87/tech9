import test from 'node:test';
import assert from 'node:assert/strict';
import { createInterceptorEvent } from './interceptor.js';
import { interceptorBoss } from './interceptor-bosses.js';
import { createInterceptorField } from './interceptor-field.js';
import { updateBoostState, createVehicleState } from '../physics/index.js';

const dt = 1 / 120;
const setup = (lane = 0, allies = []) => {
  const options = {
    bossId: 'wraith',
    allies,
    difficulty: 'hard',
    routeLength: 1000,
    escapeDistance: 2000,
  };
  const mission = createInterceptorEvent(options);
  const marker = interceptorBoss('wraith').attack.markers[0] * 1000;
  const progress = {
    targetDistance: marker,
    playerDistance: marker - 32,
    playerLateral: lane,
  };
  const events = mission.step(dt, progress);
  const start = mission.snapshot().counterattack.started;
  const to = (time, input = () => ({})) => {
    while (mission.snapshot().elapsed < start + time - 1e-8) {
      const elapsed = mission.snapshot().elapsed - start;
      events.push(
        ...mission.step(
          Math.min(dt, start + time - mission.snapshot().elapsed),
          {
            ...progress,
            ...input(elapsed),
          },
        ),
      );
    }
    return mission.snapshot();
  };
  return { mission, events, to, options, progress };
};
const boost = (elapsed) => ({
  playerBoost: elapsed >= 1,
  playerBoosting: elapsed >= 1,
});

test('a fresh post-lock accepted ignition earns overload and physically separated frozen fork lanes', () => {
  for (const lane of [-13, 0, 13]) {
    const h = setup(lane);
    h.to(1.31, boost);
    let attack = h.mission.snapshot().counterattack;
    assert.equal(attack.countered, true);
    assert.equal(attack.counterProgress, 1);
    assert.deepEqual(attack.aimLanes, [lane - 10, lane + 10]);
    assert.equal(
      h.events.filter((event) => event.payload.cue === 'counter').length,
      1,
    );
    h.to(3.36, boost);
    attack = h.mission.snapshot().counterattack;
    assert.equal(attack.phase, 'overload');
    assert.equal(attack.core.open, true);
    assert.ok(attack.core.remaining > 2.63);
    assert.deepEqual(
      h.events
        .filter((event) => event.type === 'interceptor-fire')
        .map((event) => [event.payload.aimLane, event.payload.muzzle]),
      [
        [lane - 10, [-2.2, 0.48, 8.75]],
        [lane + 10, [2.2, 0.48, 8.75]],
      ],
    );
  }
});

test('held early boost must be released and reignited after lock; a one-frame reaction still fits', () => {
  const h = setup();
  h.to(1.31, () => ({ playerBoost: true, playerBoosting: true }));
  assert.equal(h.mission.snapshot().counterattack.countered, false);
  assert.equal(h.mission.snapshot().counterattack.boostHeld, true);
  h.to(1.33);
  h.to(1.65, () => ({ playerBoost: true, playerBoosting: true }));
  assert.equal(h.mission.snapshot().counterattack.countered, true);
  const lateFrame = setup();
  lateFrame.to(1.32, (elapsed) => ({
    playerBoost: elapsed >= 1 + dt,
    playerBoosting: elapsed >= 1 + dt,
  }));
  assert.equal(lateFrame.mission.snapshot().counterattack.countered, true);
});

test('empty reserve, braking, rejected propulsion, interruption, late ignition and Injector alone never manufacture a counter', () => {
  const inputs = [
    (elapsed) => ({ playerBoost: elapsed >= 1, playerBoosting: false }),
    (elapsed) => ({
      playerBoost: elapsed >= 1,
      playerBoosting: elapsed >= 1 && elapsed < 1.2,
    }),
    (elapsed) => ({
      playerBoost: elapsed >= 1.5,
      playerBoosting: elapsed >= 1.5,
    }),
    () => ({ injector: true }),
  ];
  for (const input of inputs) {
    const h = setup();
    h.to(3.4, input);
    assert.equal(h.mission.snapshot().counterattack.countered, false);
    assert.equal(h.mission.snapshot().counterattack.phase, 'recovered');
    assert.equal(h.mission.snapshot().counterattack.core.open, false);
    assert.deepEqual(h.mission.snapshot().counterattack.aimLanes, [-2.5, 2.5]);
    assert.equal(
      h.events.some((event) => event.payload.cue === 'expose'),
      false,
    );
  }
  for (const [energy, brake] of [
    [0, 0],
    [100, 1],
  ]) {
    const h = setup(),
      vehicle = { ...createVehicleState(), speed: 300 / 3.6, energy };
    h.to(3.4, (elapsed) => {
      const raw = elapsed >= 1;
      updateBoostState(vehicle, { boost: raw, throttle: 1, brake }, []);
      return { playerBoost: raw, playerBoosting: vehicle.boosting };
    });
    assert.equal(h.mission.snapshot().counterattack.countered, false);
  }
});

test('only the earned geometric capacitor hit receives a bonus and a real weak-point audio event', () => {
  const h = setup();
  h.to(3.4, boost);
  const hit = (key, point) =>
    h.mission.hit({
      source: 'player',
      target: 'wraith',
      kind: 'repulsor',
      equipment: 'lance',
      key,
      hitLocal: point,
    })[0].payload;
  assert.equal(hit('wrong-part', [3, 0.4, -9.3]).damage, 9);
  const critical = hit('capacitor', [0, 0.4, -9.3]);
  assert.equal(critical.damage, 54);
  assert.equal(critical.weakPoint, true);
  assert.equal(critical.bossId, 'wraith');
  assert.equal(critical.target, 'wraith');
  assert.equal(critical.source, 'player');
  h.to(6.01, boost);
  assert.equal(hit('cooled', [0, 0.4, -9.3]).damage, 9);
});

test('Wraith plating reduces player chip while earned capacitor damage and allied base values remain unchanged', () => {
  const h = setup(0, ['rook']);
  const contact = (source, equipment, key) => ({
    source,
    target: 'wraith',
    key,
    kind: equipment === 'lance' ? 'repulsor' : equipment,
    ...(equipment === 'lance' ? { equipment } : {}),
    hitLocal: [0, 0.4, -9.3],
  });
  for (const [equipment, chip, allied] of [
    ['lance', 9, 3],
    ['arc', 2, 1],
    ['repulsor', 6, 2],
  ]) {
    const plate = h.mission.hit(
      contact('player', equipment, `closed-${equipment}`),
    )[0].payload;
    assert.equal(plate.damage, chip);
    assert.equal(plate.armored, true);
    assert.equal(
      h.mission.hit(contact('rook', equipment, `ally-${equipment}`))[0].payload
        .damage,
      allied,
    );
  }
  h.to(3.4, boost);
  for (const [equipment, critical] of [
    ['lance', 54],
    ['arc', 15],
    ['repulsor', 36],
  ]) {
    const open = h.mission.hit(
      contact('player', equipment, `open-${equipment}`),
    )[0].payload;
    assert.equal(open.damage, critical);
    assert.equal(open.weakPoint, true);
    assert.equal(open.armored, undefined);
  }
});

test('resonance replay preserves a partial accepted hold and rejects forged flags, intervals, lanes and input levels atomically', () => {
  const h = setup();
  h.to(1.15, boost);
  const saved = h.mission.snapshot(),
    resumed = createInterceptorEvent(h.options);
  resumed.restore(saved);
  assert.deepEqual(resumed.snapshot(), saved);
  for (let i = 0; i < 20; i++)
    resumed.step(dt, {
      ...h.progress,
      playerBoost: true,
      playerBoosting: true,
    });
  assert.equal(resumed.snapshot().counterattack.countered, true);
  for (const mutate of [
    (value) => {
      value.counterattacks[0].countered = true;
    },
    (value) => {
      value.counterattacks[0].boostPulses[0].started -= 1;
    },
    (value) => {
      value.counterattacks[0].boostPulses[0].acceptedUntil += 2;
    },
    (value) => {
      value.counterattacks[0].aimLanes[0] = 10;
    },
    (value) => {
      value.playerBoost = false;
    },
  ]) {
    const forged = structuredClone(saved);
    mutate(forged);
    const before = resumed.snapshot();
    assert.throws(() => resumed.restore(forged));
    assert.deepEqual(resumed.snapshot(), before);
  }
});

test('Wraith alone stages at 100 metres and fingerprints its lead; the other bosses retain 240 metres', () => {
  for (const id of ['goliath', 'wraith', 'bulwark']) {
    const field = createInterceptorField({ bossId: id });
    assert.equal(field.grid[id].distance, id === 'wraith' ? 100 : 240);
    assert.equal(field.id.includes(':l100c200'), id === 'wraith');
  }
});
