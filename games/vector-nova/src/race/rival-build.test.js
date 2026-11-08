import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRivalFieldBuild,
  rivalBuildState,
  RIVAL_BONUS_SCALES,
  validateRivalFieldBuild,
  matchesRivalBuild,
} from './rival-build.js';
import {
  ENHANCEMENTS,
  AVAILABLE_EQUIPMENT,
  enhancementGain,
  toughness,
} from '../progression/catalog.js';
import { SHIPS, vehicleHandling } from '../ships/catalog.js';
import { RACE_OPPONENTS } from './roster.js';

const ranks = Object.fromEntries(ENHANCEMENTS.map(({ id }) => [id, 3]));
const allEquipment = AVAILABLE_EQUIPMENT.map(({ id }) => id);

test('each difficulty gives every rival the same earned-bonus scale without changing ranks or chassis', () => {
  assert.deepEqual(RIVAL_BONUS_SCALES, { easy: 0.5, medium: 0.75, hard: 1 });
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const field = createRivalFieldBuild({ enhancements: ranks, difficulty });
    assert.equal(field.opponents.length, 9);
    assert.deepEqual(
      field.opponents.map(({ id }) => id),
      RACE_OPPONENTS.map(({ id }) => id),
    );
    for (const { id } of field.opponents) {
      const state = rivalBuildState(field, id);
      assert.deepEqual(state.enhancements, ranks);
      assert.equal(state.enhancementScale, RIVAL_BONUS_SCALES[difficulty]);
      assert.deepEqual(Object.keys(state), [
        'enhancements',
        'enhancementScale',
        'equipment',
      ]);
    }
  }
});

test('seeded loadouts are reproducible, canonical and independent of unlock ordering', () => {
  const input = {
    enhancements: ranks,
    equipmentPool: allEquipment,
    slots: 4,
    seed: 317,
    difficulty: 'hard',
  };
  const field = createRivalFieldBuild(input);
  assert.deepEqual(createRivalFieldBuild(input), field);
  assert.deepEqual(
    createRivalFieldBuild({
      ...input,
      equipmentPool: [...allEquipment].reverse().concat(allEquipment[0]),
    }),
    field,
  );
  assert.notDeepEqual(
    createRivalFieldBuild({ ...input, seed: 318 }).opponents,
    field.opponents,
  );
  assert.ok(
    new Set(field.opponents.map(({ equipment }) => JSON.stringify(equipment)))
      .size > 1,
  );
  assert.deepEqual(
    createRivalFieldBuild({ ...input, difficulty: 'easy' }).opponents,
    field.opponents,
    'difficulty changes bonus strength, not the unlocked equipment pool',
  );
  assert.deepEqual(JSON.parse(JSON.stringify(field)), field);
});

test('loadouts use only unlocked items, have no duplicates and obey the same selected capacity for all nine', () => {
  for (const slots of [2, 4]) {
    const field = createRivalFieldBuild({
      equipmentPool: ['jump', 'injector', 'deflector'],
      slots,
      seed: 21,
    });
    for (const { equipment } of field.opponents) {
      assert.equal(equipment.length, Math.min(slots, 3));
      assert.equal(new Set(equipment).size, equipment.length);
      assert.ok(
        equipment.every((id) => ['jump', 'injector', 'deflector'].includes(id)),
      );
    }
  }
  assert.ok(
    createRivalFieldBuild().opponents.every(
      ({ equipment }) => equipment.length === 0,
    ),
  );
});

test('run configuration and mutable actor builds do not alias profile inputs or each other', () => {
  const enhancements = { speed: 3 };
  const equipmentPool = ['jump', 'injector'];
  const field = createRivalFieldBuild({ enhancements, equipmentPool });
  enhancements.speed = 0;
  equipmentPool.length = 0;
  assert.equal(field.enhancements.speed, 3);
  assert.equal(field.equipmentPool.length, 2);
  assert.throws(() => {
    field.enhancements.speed = 1;
  }, TypeError);
  assert.throws(() => {
    field.opponents[0].equipment.push('lance');
  }, TypeError);
  const first = rivalBuildState(field, 'rook');
  const second = rivalBuildState(field, 'rook');
  first.enhancements.speed = 1;
  first.equipment.length = 0;
  assert.equal(second.enhancements.speed, 3);
  assert.equal(second.equipment.length, 2);
  assert.equal(field.enhancements.speed, 3);
  assert.deepEqual(rivalBuildState(null, 'rook'), {});
});

test('invalid field configuration cannot silently create mismatched replay builds', () => {
  for (const difficulty of ['expert', null])
    assert.throws(() => createRivalFieldBuild({ difficulty }), /difficulty/);
  for (const speed of [-1, 4, 0.5, NaN])
    assert.throws(
      () => createRivalFieldBuild({ enhancements: { speed } }),
      /rank/,
    );
  for (const enhancements of [null, []])
    assert.throws(() => createRivalFieldBuild({ enhancements }), /object/);
  for (const equipmentPool of [null, ['unknown']])
    assert.throws(() => createRivalFieldBuild({ equipmentPool }), /pool/);
  for (const slots of [-1, 0, 1, 3, 5, 1.5])
    assert.throws(() => createRivalFieldBuild({ slots }), /capacity/);
  for (const seed of [NaN, Infinity, 0.5])
    assert.throws(() => createRivalFieldBuild({ seed }), /integer/);
  assert.throws(
    () => rivalBuildState(createRivalFieldBuild(), 'unknown'),
    /actor/,
  );
});

test('difficulty scales only earned bonuses on each chassis, including boost endurance and toughness', () => {
  const bonuses = {
    cruiseSpeed: 'speed',
    boostSpeed: 'speed',
    thrust: 'acceleration',
    boostThrust: 'acceleration',
    turn: 'handling',
    response: 'handling',
    braking: 'braking',
  };
  for (const ship of SHIPS) {
    assert.equal(
      vehicleHandling({ shipId: ship.id }),
      ship.handling,
      'stock sessions retain their original chassis',
    );
    for (const rank of [0, 1, 3]) {
      const enhancements = Object.fromEntries(
        ENHANCEMENTS.map(({ id }) => [id, rank]),
      );
      for (const difficulty of ['easy', 'medium', 'hard']) {
        const build = createRivalFieldBuild({ enhancements, difficulty });
        const state = { shipId: ship.id, ...rivalBuildState(build, 'rook') };
        const handling = vehicleHandling(state);
        for (const [property, bonus] of Object.entries(bonuses))
          assert.equal(
            handling[property],
            ship.handling[property] *
              (1 +
                enhancementGain(enhancements, bonus) *
                  RIVAL_BONUS_SCALES[difficulty]),
          );
        assert.equal(
          handling.boostDrain,
          ship.handling.boostDrain /
            (1 +
              enhancementGain(enhancements, 'boost') *
                RIVAL_BONUS_SCALES[difficulty]),
        );
        assert.equal(
          toughness(state),
          enhancementGain(enhancements, 'toughness') *
            RIVAL_BONUS_SCALES[difficulty],
        );
        for (const property of ['grip', 'recharge'])
          assert.equal(handling[property], ship.handling[property]);
        assert.ok(
          handling.cruiseSpeed >= ship.handling.cruiseSpeed,
          'Easy never halves base chassis stats',
        );
        if (difficulty === 'hard')
          assert.deepEqual(
            handling,
            vehicleHandling({ shipId: ship.id, enhancements }),
            'Hard receives the full same upgrade gains as the player',
          );
      }
    }
    assert.equal(
      vehicleHandling({
        shipId: ship.id,
        enhancements: ranks,
        enhancementScale: 0,
      }),
      ship.handling,
    );
  }
});

test('canonical build validation rejects changed assignments, scale, ranks and unknown properties', () => {
  const build = createRivalFieldBuild({
    enhancements: ranks,
    equipmentPool: allEquipment,
    slots: 4,
    seed: 51,
    difficulty: 'hard',
  });
  assert.deepEqual(
    validateRivalFieldBuild(JSON.parse(JSON.stringify(build))),
    build,
  );
  for (const mutate of [
    (value) => {
      value.bonusScale = 0.5;
    },
    (value) => {
      value.opponents[0].equipment[0] = 'unknown';
    },
    (value) => {
      value.opponents.reverse();
    },
    (value) => {
      value.enhancements.extra = 3;
    },
    (value) => {
      value.extra = true;
    },
  ]) {
    const invalid = JSON.parse(JSON.stringify(build));
    mutate(invalid);
    assert.throws(() => validateRivalFieldBuild(invalid), /mismatch/);
  }
  const state = rivalBuildState(build, 'rook');
  assert.equal(matchesRivalBuild(state, build, 'rook'), true);
  for (const key of ['enhancements', 'enhancementScale', 'equipment']) {
    const missing = { ...state };
    delete missing[key];
    assert.equal(matchesRivalBuild(missing, build, 'rook'), false);
  }
  assert.equal(matchesRivalBuild({}, null, 'rook'), true);
  assert.equal(matchesRivalBuild({ equipment: [] }, null, 'rook'), false);
});
