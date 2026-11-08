import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createRacers, getRacerControl } from './racers.js';
import { createRivalFieldBuild, rivalBuildState } from './rival-build.js';
import { createVehicleState } from '../physics/index.js';
import { ENHANCEMENTS, AVAILABLE_EQUIPMENT } from '../progression/catalog.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const track = {
  id: 'rival-field-fixture',
  length: 4000,
  width: 72,
  closed: true,
  checkpoints: [0, 1000, 2000, 3000].map((distance) => ({ distance })),
  sample: (distance) => ({
    position: new Vector3(0, 0, distance),
    tangent: new Vector3(0, 0, 1),
    right: new Vector3(1, 0, 0),
    up: new Vector3(0, 1, 0),
    curvature: 0,
  }),
};
const build = (seed = 13, difficulty = 'hard') =>
  createRivalFieldBuild({
    enhancements: Object.fromEntries(ENHANCEMENTS.map(({ id }) => [id, 3])),
    equipmentPool: AVAILABLE_EQUIPMENT.map(({ id }) => id),
    slots: 4,
    seed,
    difficulty,
  });
function createField() {
  const validations = [];
  const inputs = [];
  const disposals = [];
  const field = createRacers({
    track,
    createRuntime(specification, { validation = false } = {}) {
      let saved = { time: 0 };
      return {
        id: 'field-fixture',
        version: 1,
        rulesId: 'same-player-rules',
        aiEquipmentRulesId: 'actual-equipment-policy',
        reset({ state }) {
          saved = { time: state.time };
        },
        pose: () => ({ grounded: true }),
        rivalEquipmentInput: () => ({ equipment1: true }),
        advance(state, input, dt) {
          inputs.push({ id: specification.id, input });
          state.time += dt;
          state.distance += 2;
          saved.time = state.time;
          return [];
        },
        update() {},
        snapshot: () => ({ ...saved }),
        restore(value, options) {
          if (validation) validations.push(options);
          saved = { ...value };
        },
        dispose() {
          disposals.push({ id: specification.id, validation });
        },
      };
    },
  });
  return { field, validations, inputs, disposals };
}

test('configured field applies all nine builds and preserves deterministic loadouts for retries', () => {
  const { field } = createField();
  try {
    const legacy = field.serialize();
    assert.equal(Object.hasOwn(legacy.field, 'rivalBuild'), false);
    assert.ok(
      legacy.field.opponents.every(
        ({ runtime }) => !Object.hasOwn(runtime, 'aiEquipmentRulesId'),
      ),
    );
    const configuration = build();
    field.reset({ fieldBuild: configuration });
    assert.deepEqual(field.identity.rivalBuild, configuration);
    assert.ok(
      field.identity.opponents.every(
        ({ runtime }) =>
          runtime.aiEquipmentRulesId === 'actual-equipment-policy',
      ),
    );
    for (const { state, prev, specification } of field.opponents) {
      const expected = rivalBuildState(configuration, specification.id);
      for (const key of Object.keys(expected)) {
        assert.deepEqual(state[key], expected[key]);
        assert.deepEqual(prev[key], expected[key]);
      }
      assert.equal(state.shipId, specification.shipId);
      assert.equal(state.chassisId, specification.id);
    }
    const initial = field.serialize();
    field.advance(1 / 120);
    field.reset();
    assert.deepEqual(
      field.serialize(),
      initial,
      'bare reset retains the chosen difficulty, seed and loadouts',
    );
    field.reset({ fieldBuild: undefined });
    assert.deepEqual(
      field.serialize(),
      initial,
      'an omitted optional configuration does not reroll',
    );
    field.reset({ fieldBuild: null });
    assert.deepEqual(
      field.serialize(),
      { ...legacy, enabled: true },
      'explicit null returns to the exact legacy stock identity/state',
    );
    field.reset({ fieldBuild: build(14) });
    assert.notDeepEqual(
      field.identity.rivalBuild.opponents,
      configuration.opponents,
    );
  } finally {
    field.dispose();
  }
});

test('invalid reset configuration cannot mutate the current field or silently rescale a run', () => {
  const { field } = createField();
  try {
    field.reset({ fieldBuild: build() });
    const initial = field.serialize();
    for (const options of [
      { fieldBuild: { ...build(), bonusScale: 0.5 } },
      { difficulty: 'easy' },
      { fieldBuild: build(), difficulty: 'medium' },
      { fieldBuild: build(), gridOrder: [] },
    ]) {
      assert.throws(() => field.reset(options), /mismatch|every racer/);
      assert.deepEqual(field.serialize(), initial);
    }
  } finally {
    field.dispose();
  }
});

test('identity projection validates proposed builds without resetting or mutating the live field', () => {
  const { field } = createField();
  try {
    const stock = field.identity;
    field.reset({ fieldBuild: build() });
    field.advance(1 / 120);
    const running = field.serialize();
    const projected = field.identityForBuild(build(51, 'medium'));
    assert.deepEqual(field.serialize(), running);
    assert.deepEqual(field.identityForBuild(), field.identity);
    assert.deepEqual(field.identityForBuild(null), stock);
    assert.throws(
      () => field.identityForBuild({ ...build(), bonusScale: 0.3 }),
      /mismatch/,
    );
    assert.deepEqual(field.serialize(), running);
    projected.opponents[0].runtime.rulesId = 'mutated';
    assert.notEqual(field.identity.opponents[0].runtime.rulesId, 'mutated');
    field.reset({ fieldBuild: build(51, 'medium') });
    projected.opponents[0].runtime.rulesId =
      field.identity.opponents[0].runtime.rulesId;
    assert.deepEqual(
      field.identity,
      projected,
      'projection exactly matches actual post-reset identity',
    );
  } finally {
    field.dispose();
  }
});

test('public field restores validate exact state and previous build against the selected run', () => {
  const { field, validations } = createField();
  try {
    field.reset({ fieldBuild: build() });
    field.advance(1 / 120);
    const saved = field.serialize();
    field.advance(1 / 120);
    field.restore(saved);
    assert.deepEqual(field.serialize(), saved);
    assert.equal(validations.length, 9);
    assert.ok(
      validations.every(
        ({ state, presentation }) =>
          state.equipment.length === 4 && presentation === false,
      ),
    );
    for (const member of ['state', 'prev']) {
      for (const mutate of [
        (state) => {
          state.enhancements.speed = 0;
        },
        (state) => {
          state.enhancements.unknown = 3;
        },
        (state) => {
          state.enhancementScale = 0.75;
        },
        (state) => {
          state.equipment.reverse();
        },
        (state) => {
          delete state.equipment;
        },
      ]) {
        const bad = clone(saved);
        mutate(bad.opponents[0][member]);
        assert.throws(() => field.restore(bad), /vehicle state mismatch/);
        assert.deepEqual(
          field.serialize(),
          saved,
          'failed validation leaves the live field unchanged',
        );
      }
    }
    field.reset({ fieldBuild: build(999) });
    assert.throws(() => field.restore(saved), /state mismatch/);
    field.reset({ fieldBuild: null });
    const stock = field.serialize();
    stock.opponents[0].state.equipment = [];
    assert.throws(
      () => field.restore(stock),
      /vehicle state mismatch/,
      'legacy fields cannot inject build data',
    );
  } finally {
    field.dispose();
  }
});

test('equipment policy sees final controls once on ground and in flight without changing ordinary control fallback', () => {
  const state = { ...createVehicleState(), distance: 100, speed: 130 };
  for (const grounded of [true, false]) {
    const baseRuntime = { pose: () => ({ grounded }) };
    const options = { difficulty: 'hard', lane: 4, runtime: baseRuntime };
    const ordinary = getRacerControl(state, track, options);
    const nearby = [state, { ...state, distance: 150 }];
    let calls = 0;
    const input = getRacerControl(state, track, {
      ...options,
      nearby,
      runtime: {
        ...baseRuntime,
        rivalEquipmentInput(actualState, finalControl, fieldView) {
          calls++;
          assert.equal(actualState, state);
          assert.equal(fieldView, nearby);
          assert.deepEqual(finalControl, ordinary);
          return { equipment1: true, equipment2: false };
        },
      },
    });
    assert.equal(calls, 1);
    assert.deepEqual(input, {
      ...ordinary,
      equipment1: true,
      equipment2: false,
    });
  }
});

test('finished rivals keep driving without firing equipment again', () => {
  const { field, inputs } = createField();
  try {
    field.reset({ fieldBuild: build() });
    field.opponents[0].finish = {
      lapTimes: [10, 10],
      lapValidity: [true, true],
      totalTime: 20,
      valid: true,
    };
    field.advance(1 / 120);
    assert.equal(inputs[0].input.equipment1, undefined);
    assert.ok(inputs.slice(1).every(({ input }) => input.equipment1 === true));
  } finally {
    field.dispose();
  }
});
