import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createEquipmentSystem } from './runtime.js';
import { createMagneticRuntime } from '../core/session-runtime.js';
import { createRapierWorld } from '../physics/rapier-world.js';
import { withMagneticBoundaries } from '../physics/magnetic-boundaries.js';
import { createVehicleState } from '../physics/index.js';
import { createCombatSimulation } from '../pickups/combat.js';
import {
  sampleHazardSurface,
  mitigateHazardSurface,
} from '../physics/hazard-surface.js';
import {
  mitigateHazardImpact,
  racerImpact,
} from '../physics/contact-feedback.js';
import {
  combatDisruption,
  sampleCombatDisruption,
} from '../pickups/combat-consequences.js';
const track = {
  id: 'equipment-road',
  length: 2000,
  width: 28,
  closed: false,
  finishDistance: 1900,
  jumps: [],
  sample: (distance) => ({
    position: new T.Vector3(0, 0, distance),
    quaternion: new T.Quaternion(),
    tangent: new T.Vector3(0, 0, 1),
    right: new T.Vector3(1, 0, 0),
    up: new T.Vector3(0, 1, 0),
    curvature: 0,
  }),
};
test('independent equipment slots, cooldown edge, snapshot and one-hit shield', () => {
  const state = {
    ...createVehicleState(),
    equipment: [null, 'injector'],
    energy: 10,
  };
  const gear = createEquipmentSystem({ motion: {} });
  gear.reset({ state });
  gear.beforeStep(state, { equipment1: true }, 0.01);
  assert.equal(state.energy, 10);
  gear.beforeStep(state, { equipment2: true }, 0.01);
  assert.equal(state.energy, 55);
  for (let i = 0; i < 1600; i++)
    gear.beforeStep(state, { equipment2: true }, 0.01);
  assert.equal(state.energy, 55, 'holding cannot repeat');
  const saved = gear.snapshot();
  gear.restore(saved);
  assert.deepEqual(gear.snapshot(), saved);
  gear.beforeStep(state, {}, 0.01);
  gear.beforeStep(state, { equipment2: true }, 0.01);
  assert.equal(state.energy, 100);
  state.equipment = ['deflector', 'lance'];
  let shots = 0;
  const twin = createEquipmentSystem({
    motion: {},
    combat: { fireLance: () => ++shots },
  });
  twin.reset({ state });
  twin.beforeStep(state, { equipment1: true, equipment2: true }, 0.01);
  assert.equal(shots, 1);
  assert.ok(twin.absorbHit());
  assert.equal(twin.absorbHit(), false);
  assert.deepEqual(
    twin.snapshot().slots.map((slot) => slot.remaining),
    [16, 26],
  );
});
test('Deflector expiry emits one release cue and a consumed field cannot expire twice', () => {
  const state = { equipment: ['deflector'] };
  const gear = createEquipmentSystem({ motion: {} });
  gear.reset({ state });
  gear.beforeStep(state, { equipment1: true }, 0.01);
  const expired = gear.beforeStep(state, {}, 2.5);
  assert.deepEqual(expired.events, [
    { type: 'equipment-expire', payload: { kind: 'deflector' } },
  ]);
  assert.equal(gear.snapshot().shield, false);
  assert.deepEqual(gear.beforeStep(state, {}, 0.01).events, []);
  gear.reset({ state });
  gear.beforeStep(state, { equipment1: true }, 0.01);
  assert.equal(gear.absorbHit(), true);
  assert.deepEqual(gear.beforeStep(state, {}, 3).events, []);
});

test('Slipstream checks a prior bound rival before its next update, without firing road pickups', () => {
  const combat = createCombatSimulation({ track });
  const make = (distance) => ({
    state: { distance, lateral: 0, speed: 80 },
    pose: () => ({
      grounded: true,
      position: track.sample(distance).position,
      quaternion: new T.Quaternion(),
    }),
    hit: () => false,
    notify() {},
  });
  const player = make(100),
    rival = make(140);
  combat.bind('player', player);
  combat.bind('rival', rival);
  combat.step(0.01);
  combat.bind('player', player);
  assert.equal(combat.draftTarget('player'), 'rival');
  const gear = createEquipmentSystem({ motion: {}, combat });
  const state = { ...createVehicleState(), equipment: ['slipstream'] };
  gear.reset({ state });
  assert.ok(
    gear.beforeStep(state, { equipment1: true }, 0.01).modifiers.propulsion,
  );
  assert.equal(combat.snapshot().shots.length, 0);
});
test('toughness mitigates authored hazards and weapon loss but leaves contact modifiers unchanged', () => {
  const state = { enhancements: { toughness: 3 } },
    hazard = sampleHazardSurface(100, 1);
  const reduced = mitigateHazardSurface(hazard, state);
  assert.equal(reduced.drag, hazard.drag * 0.8);
  assert.equal(reduced.thrustScale, 1 - (1 - hazard.thrustScale) * 0.8);
  const collision = { drag: 100, thrustScale: 0.2 };
  assert.equal(mitigateHazardSurface(collision, state), collision);
  const impact = racerImpact(45);
  assert.equal(mitigateHazardImpact(impact, state, { kind: 'racer' }), impact);
  assert.equal(
    mitigateHazardImpact(impact, state, { kind: 'structure' }),
    impact,
  );
  assert.equal(
    mitigateHazardImpact(impact, state, { hazard: true }).energyCost,
    impact.energyCost * 0.8,
  );
  const hit = sampleCombatDisruption(
    combatDisruption(null, 'repulsor', 0, 100, 0.2),
    0,
  );
  assert.ok(Math.abs(hit.duration - 2.4) < 1e-9);
  assert.equal(hit.speedLimit, 64);
});
test('Jump takes off and physically lands on a baseline road with no deck colliders', async (t) => {
  const dynamics = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(track),
  });
  const motion = createMagneticRuntime({ track, dynamics, equipment: true });
  t.after(() => {
    motion.dispose();
    dynamics.dispose();
  });
  const state = { ...createVehicleState('shrike'), distance: 100, speed: 80 };
  motion.reset({ state });
  motion.advance(state, { throttle: 1 }, 1 / 120);
  const from = state.distance;
  assert.ok(motion.jump(state));
  let airborne = false;
  for (let i = 0; i < 420; i++) {
    motion.advance(state, { throttle: 1 }, 1 / 120);
    airborne ||= motion.pose(1).grounded === false;
    if (airborne && motion.pose(1).grounded) break;
  }
  assert.ok(airborne);
  assert.equal(motion.pose(1).grounded, true);
  assert.ok(
    state.distance > from + 40,
    'landing advances on the receiving road instead of recovery teleport',
  );
  assert.ok(state.speed > 40, 'landing preserves forward momentum');
});

test('equipping no ability preserves the original magnetic ground handling', async (t) => {
  const results = [];
  for (const equipment of [false, true]) {
    const dynamics = await createRapierWorld({
      collisionWorld: withMagneticBoundaries(track),
    });
    const motion = createMagneticRuntime({ track, dynamics, equipment });
    t.after(() => {
      motion.dispose();
      dynamics.dispose();
    });
    const state = { ...createVehicleState('shrike'), distance: 100 };
    motion.reset({ state });
    for (let i = 0; i < 240; i++)
      motion.advance(
        state,
        { throttle: 1, boost: i > 100, steer: i > 120 ? 0.2 : 0 },
        1 / 120,
      );
    results.push(state);
  }
  assert.deepEqual(results[1], results[0]);
});

test('four equipment inputs trigger independently and replay preserves cooldown edges', () => {
  let jumps = 0,
    shots = 0;
  const state = {
    ...createVehicleState(),
    equipment: ['jump', 'injector', 'deflector', 'lance'],
    energy: 0,
  };
  const system = createEquipmentSystem({
    motion: { jump: () => ++jumps },
    combat: { fireLance: () => ++shots },
  });
  system.reset({ state });
  for (let i = 1; i <= 4; i++)
    system.beforeStep(state, { [`equipment${i}`]: true }, 0.01);
  assert.equal(jumps, 1);
  assert.equal(shots, 1);
  assert.equal(state.energy, 45);
  assert.equal(system.snapshot().slots.length, 4);
  assert.ok(system.snapshot().slots.every((slot) => slot.remaining > 0));
  const saved = system.snapshot();
  system.restore(saved);
  assert.deepEqual(system.snapshot(), saved);
  system.beforeStep(state, { equipment4: true }, 0.01);
  assert.equal(shots, 1);
  assert.ok(system.absorbHit());
  assert.equal(system.absorbHit(), false);
  const old = {
    ...saved,
    slots: saved.slots.slice(0, 2),
    held: [false, false],
  };
  system.restore(old);
  assert.deepEqual(system.snapshot().held, [false, false, false, false]);
});
