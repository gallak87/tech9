import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { createDeviceRuntime } from './runtime.js';
import { createCombatSimulation } from './combat.js';
import { createVehicleState } from '../physics/index.js';

const DT = 1 / 120;
const track = {
  id: 'runtime-config',
  length: 3000,
  width: 80,
  closed: false,
  sample: (distance) => ({
    position: new Vector3(0, 0, distance),
    right: new Vector3(1, 0, 0),
    up: new Vector3(0, 1, 0),
    tangent: new Vector3(0, 0, 1),
    quaternion: new Quaternion(),
    curvature: 0,
  }),
};
const coast = {
  throttle: 0,
  brake: 0,
  steer: 0,
  boost: false,
  airbrake: false,
};
function motion() {
  let state;
  return {
    id: 'configuration-motion',
    version: 1,
    rulesId: 'configuration-motion-v1',
    scenarios: {},
    reset(context) {
      state = context.state;
    },
    advance(current, _input, dt) {
      state = current;
      current.time += dt;
      current.distance += current.speed * dt;
      return [];
    },
    pose() {
      return state
        ? {
            position: new Vector3(state.lateral, 1.2, state.distance),
            quaternion: new Quaternion(),
            grounded: true,
          }
        : null;
    },
    snapshot: () => null,
    restore() {},
    update() {},
    dispose() {},
  };
}

test('issued equipment tuning reaches the real equipment system and changes only opted-in runtime identities', () => {
  function run(equipmentTuning) {
    const combat = createCombatSimulation({ track });
    const runtime = createDeviceRuntime({
      track,
      devices: [],
      motion: motion(),
      combat,
      equipmentTuning,
    });
    const state = { ...createVehicleState(), equipment: ['lance'] },
      events = [];
    runtime.observePresentation({
      events: (batch) => events.push(...batch),
      reset() {},
    });
    runtime.reset({ state });
    for (let i = 0; i < 300; i++) {
      runtime.advance(state, { ...coast, equipment1: true }, DT);
      runtime.advanceInteractions(DT);
      runtime.update({});
    }
    const result = {
      rulesId: runtime.rulesId,
      shots: events.filter((event) => event.type === 'combat-fire').length,
    };
    runtime.dispose();
    return result;
  }
  const normal = run(undefined),
    empty = run({}),
    issued = run({ lance: { cooldown: 1.2, autoRepeat: true } });
  assert.equal(normal.rulesId, empty.rulesId);
  assert.equal(normal.shots, 1);
  assert.equal(issued.shots, 3);
  assert.notEqual(issued.rulesId, normal.rulesId);
  assert.match(issued.rulesId, /equipmentTuning/);
});

test('beforeCombat runs after all actor binds and launches a truthful allied hit against the configured large target', () => {
  const resolved = [],
    combat = createCombatSimulation({
      track,
      onHit: (payload) => resolved.push(payload),
    });
  let prepared = 0,
    fired = false;
  const player = createDeviceRuntime({
    track,
    devices: [],
    motion: motion(),
    combat,
    team: 'hunters',
    beforeCombat(dt) {
      assert.equal(dt, DT);
      prepared++;
      if (!fired) {
        assert.equal(combat.fireLance('rook'), true);
        fired = true;
      }
    },
  });
  const ally = createDeviceRuntime({
    track,
    devices: [],
    motion: motion(),
    combat,
    combatId: 'rook',
    team: 'hunters',
  });
  const bounds = { half: [8, 3, 20], center: [0, 0, 0] };
  const target = createDeviceRuntime({
    track,
    devices: [],
    motion: motion(),
    combat,
    combatId: 'goliath',
    team: 'quarry',
    hitBounds: bounds,
  });
  const states = [
    { ...createVehicleState(), distance: 0, lateral: 0 },
    { ...createVehicleState(), distance: 10, lateral: 0 },
    { ...createVehicleState(), distance: 100, lateral: 6 },
  ];
  try {
    [player, ally, target].forEach((runtime, index) =>
      runtime.reset({ state: states[index] }),
    );
    bounds.half[0] = 0.01;
    for (let i = 0; i < 60; i++) {
      [player, ally, target].forEach((runtime, index) =>
        runtime.advance(states[index], coast, DT),
      );
      player.advanceInteractions(DT);
      [player, ally, target].forEach((runtime) => runtime.update({}));
    }
    assert.equal(prepared, 60);
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].source, 'rook');
    assert.equal(resolved[0].target, 'goliath');
    assert.equal(resolved[0].equipment, 'lance');
    assert.equal(resolved[0].shielded, false);
    assert.match(
      target.rulesId,
      /"x":8/,
      'owned configuration cannot be changed by mutating the supplied bounds',
    );
  } finally {
    [player, ally, target].forEach((runtime) => runtime.dispose());
  }
});
