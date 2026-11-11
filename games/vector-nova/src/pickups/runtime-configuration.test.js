import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { createDeviceRuntime } from './runtime.js';
import { createCombatSimulation } from './combat.js';
import { createVehicleState } from '../physics/index.js';
import { createInterceptorEvent } from '../events/interceptor.js';

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

function resistanceRun(
  combatResistance,
  { shielded = false, toughness = 0, backward = false } = {},
) {
  const mission = createInterceptorEvent({
    health: 240,
    escapeDistance: track.length * 2,
  });
  const contacts = [],
    impulses = [];
  const combat = createCombatSimulation({
    track,
    onHit(payload) {
      contacts.push(payload);
      mission.hit({
        ...payload,
        key: `${payload.hitId}:${payload.source}:${payload.target}`,
      });
    },
  });
  let fired = false;
  const source = createDeviceRuntime({
    track,
    devices: [],
    motion: motion(),
    combat,
    beforeCombat() {
      if (!fired) {
        fired = true;
        assert.equal(combat.fireLance('player'), true);
      }
    },
  });
  const targetMotion = motion();
  const target = createDeviceRuntime({
    track,
    devices: shielded
      ? [
          {
            id: 'shield',
            type: 'aegis',
            distance: 101,
            lateral: 0,
            width: 10,
            length: 8,
          },
        ]
      : [],
    motion: {
      ...targetMotion,
      ...(backward
        ? {
            pose(alpha) {
              const physical = targetMotion.pose(alpha);
              return (
                physical && {
                  ...physical,
                  quaternion: new Quaternion().setFromAxisAngle(
                    new Vector3(0, 1, 0),
                    Math.PI,
                  ),
                  drivingQuaternion: physical.quaternion,
                }
              );
            },
          }
        : {}),
      applyImpulse(state, impulse) {
        impulses.push(impulse.toArray());
        state.speed = Math.max(0, state.speed + impulse.z);
        state.lateralSpeed += impulse.x;
      },
    },
    combat,
    combatId: 'goliath',
    combatResistance,
  });
  const states = [
    { ...createVehicleState(), distance: 0, speed: 80 },
    {
      ...createVehicleState(),
      distance: 100,
      speed: 80,
      enhancements: { toughness },
    },
  ];
  function step(ticks) {
    for (let index = 0; index < ticks; index++) {
      source.advance(states[0], coast, DT);
      target.advance(states[1], coast, DT);
      source.advanceInteractions(DT);
    }
  }
  try {
    source.reset({ state: states[0] });
    target.reset({ state: states[1] });
    for (let index = 0; index < 120 && !contacts.length; index++) step(1);
    assert.equal(
      contacts.length,
      1,
      'a real projectile reaches the moving target',
    );
    const impact = {
      states: structuredClone(states),
      source: source.snapshot(),
      target: target.snapshot(),
      combat: combat.snapshot(),
    };
    const result = {
      contact: contacts[0],
      impulse: impulses[0],
      health: mission.snapshot().health,
      state: { ...states[1] },
      disruption: combat.disruption('goliath'),
      rulesId: target.rulesId,
    };
    if (combatResistance && !shielded) {
      const incompatible = structuredClone(impact.combat);
      delete incompatible.disruptions.goliath.combatResistance;
      assert.throws(
        () => combat.restore(incompatible),
        /Combat replay/,
        'extra mitigation requires explicit resistant actor state',
      );
      assert.deepEqual(combat.snapshot(), impact.combat);
    }
    step(42);
    const after = structuredClone(states),
      replayCombat = combat.snapshot();
    result.afterRecovery = { ...states[1] };
    result.remainingDisruption = combat.disruption('goliath');
    Object.assign(states[0], impact.states[0]);
    Object.assign(states[1], impact.states[1]);
    target.restore(impact.target);
    source.restore(impact.source);
    assert.deepEqual(combat.snapshot(), impact.combat);
    step(42);
    assert.deepEqual(
      states,
      after,
      'restore repeats movement and reduced consequences exactly',
    );
    assert.deepEqual(combat.snapshot(), replayCombat);
    return result;
  } finally {
    source.dispose();
    target.dispose();
  }
}

test('opted combat resistance preserves moving-target Lance damage while reducing physical disruption and replaying exactly', () => {
  const normal = resistanceRun(undefined),
    zero = resistanceRun(0),
    armored = resistanceRun(0.9);
  assert.deepEqual(
    normal,
    zero,
    'zero keeps the ordinary runtime and consequences unchanged',
  );
  assert.equal(normal.health, 231);
  assert.equal(
    armored.health,
    normal.health,
    'physical resistance never changes the boss armor damage profile',
  );
  assert.equal(armored.contact.shielded, false);
  assert.equal(armored.contact.equipment, 'lance');
  assert.equal(normal.state.energy, 82);
  assert.ok(Math.abs(armored.state.energy - 98.2) < 1e-10);
  assert.ok(Math.abs(armored.impulse[0] - normal.impulse[0] * 0.1) < 1e-10);
  assert.ok(Math.abs(armored.impulse[2] - normal.impulse[2] * 0.1) < 1e-10);
  assert.equal(normal.disruption.duration, 3);
  assert.ok(Math.abs(armored.disruption.duration - 0.3) < 1e-10);
  assert.ok(
    normal.state.speed < 45,
    'ordinary Lance keeps its established strong slowdown',
  );
  assert.ok(
    armored.state.speed > 76,
    'the armored target retains over 95% of its pace',
  );
  assert.ok(normal.remainingDisruption);
  assert.equal(armored.remainingDisruption, null);
  assert.notEqual(normal.rulesId, armored.rulesId);
  assert.match(armored.rulesId, /"combatResistance":0.9/);
});

test('resistance combines with toughness and preserves real shielding', () => {
  const armored = resistanceRun(0.9, { toughness: 3 });
  assert.ok(Math.abs(armored.state.energy - 98.56) < 1e-10);
  assert.ok(Math.abs(armored.disruption.mitigation - 0.92) < 1e-10);
  assert.ok(Math.abs(armored.disruption.duration - 0.24) < 1e-10);
  const shielded = resistanceRun(0.9, { shielded: true });
  assert.equal(shielded.contact.shielded, true);
  assert.equal(shielded.health, 240);
  assert.equal(shielded.state.energy, 100);
  assert.equal(shielded.disruption, null);
  assert.equal(shielded.impulse, undefined);
});

test('a backward-facing target applies real weapon slowdown along its independent driving axis', () => {
  const forward = resistanceRun(0.9),
    backward = resistanceRun(0.9, { backward: true });
  assert.equal(backward.health, 231);
  assert.equal(backward.contact.shielded, false);
  assert.ok(Math.abs(backward.state.speed - forward.state.speed) < 1e-10);
  assert.ok(backward.state.speed > 76 && backward.state.speed < 77);
  assert.ok(backward.afterRecovery.speed < 80);
  assert.ok(
    Math.abs(backward.afterRecovery.distance - forward.afterRecovery.distance) <
      1e-10,
    'the rearward hull pose never turns repeated stun corrections into forward acceleration',
  );
});

test('combat resistance rejects invalid configuration and binding values', () => {
  for (const combatResistance of [null, NaN, Infinity, -0.1, 1.1, '0.9']) {
    assert.throws(
      () =>
        createDeviceRuntime({
          track,
          devices: [],
          motion: motion(),
          combatResistance,
        }),
      /resistance/,
    );
    const combat = createCombatSimulation({ track });
    assert.throws(
      () => combat.bind('invalid', { combatResistance }),
      /resistance/,
    );
  }
  const immune = resistanceRun(1);
  assert.equal(immune.health, 231);
  assert.equal(immune.state.energy, 100);
  assert.equal(immune.state.speed, 80);
  assert.equal(immune.disruption, null);
});
