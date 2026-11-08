import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createVehicleState } from '../physics/index.js';
import { createMagneticRuntime } from '../core/session-runtime.js';
import { createRapierWorld } from '../physics/rapier-world.js';
import { withMagneticBoundaries } from '../physics/magnetic-boundaries.js';
import { createDeviceRuntime } from '../pickups/runtime.js';
import { createCombatSimulation } from '../pickups/combat.js';

const dt = 1 / 120;
const track = {
  id: 'rival-equipment-road',
  length: 2000,
  width: 40,
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
async function fixture(t, equipment, overrides = {}) {
  const collisionWorld = withMagneticBoundaries(track);
  const dynamics = await createRapierWorld({ collisionWorld });
  const combat = createCombatSimulation({ track, dynamics });
  const state = {
    ...createVehicleState(),
    distance: 100,
    speed: 100,
    equipment,
    ...overrides,
  };
  const motion = createMagneticRuntime({
    track,
    collisionWorld,
    dynamics,
    equipment: true,
  });
  const runtime = createDeviceRuntime({
    track,
    devices: [],
    motion,
    combat,
    combatId: 'rook',
  });
  runtime.reset({ state });
  t.after(() => {
    runtime.dispose();
    dynamics.dispose();
  });
  const events = [];
  const targets = [];
  runtime.observePresentation({
    events: (batch) => events.push(...batch),
    reset() {},
  });
  function tick(nearby = [], control = {}) {
    for (const [id, binding] of targets) combat.bind(id, binding);
    const base = { throttle: 1, brake: 0, boost: false, steer: 0, ...control };
    const input = {
      ...base,
      ...runtime.rivalEquipmentInput(state, base, nearby),
    };
    runtime.advance(state, input, dt);
    combat.step(dt);
    runtime.update({});
  }
  function actor(id, distance) {
    const target = {
      ...createVehicleState(),
      distance,
      lateral: 0,
      speed: 100,
      chassisId: id,
    };
    const hits = [];
    const binding = {
      state: target,
      pose: () => ({
        grounded: true,
        position: track
          .sample(target.distance)
          .position.clone()
          .add(new T.Vector3(0, 0.72, 0)),
        quaternion: new T.Quaternion(),
      }),
      notify() {},
      hit: (event) => {
        hits.push(event);
        return false;
      },
    };
    targets.push([id, binding]);
    combat.bind(id, binding);
    return { state: target, hits };
  }
  return { state, runtime, combat, motion, tick, actor, events };
}

test('rival Injector uses the real cooldown and restores active gear without resetting motion', async (t) => {
  const f = await fixture(t, ['injector'], { energy: 0 });
  for (let tick = 0; tick < 40; tick++) f.tick();
  assert.ok(f.state.energy > 40);
  assert.equal(
    f.events.filter((event) => event.type === 'equipment-activate').length,
    1,
  );
  const saved = f.runtime.snapshot();
  assert.ok(saved.equipment.slots[0].remaining > 13);
  for (let tick = 0; tick < 120; tick++) f.tick();
  assert.equal(
    f.events.filter((event) => event.type === 'equipment-activate').length,
    1,
  );
  f.runtime.restore(saved, { equipment: ['injector'] });
  assert.deepEqual(f.runtime.snapshot(), saved);
  assert.throws(
    () => f.runtime.restore(saved, { equipment: ['lance'] }),
    /loadout/,
  );
  assert.throws(
    () =>
      f.runtime.restore(
        { ...saved, equipment: { slots: {} } },
        { equipment: ['injector'] },
      ),
    /equipment/,
  );
  const stock = await fixture(t, []);
  assert.equal(Object.hasOwn(stock.runtime.snapshot(), 'equipment'), false);
  stock.runtime.restore(saved, { equipment: ['injector'] });
  assert.deepEqual(
    stock.runtime.snapshot().equipment,
    saved.equipment,
    'cold restore acquires gear from its snapshot',
  );
});

test('rival Slipstream requires the same real target and produces the same sustained propulsion', async (t) => {
  const f = await fixture(t, ['slipstream']);
  const target = f.actor('latch', 180);
  for (let tick = 0; tick < 30; tick++) f.tick([target.state]);
  const gear = f.runtime.snapshot().equipment;
  assert.ok(gear.slots[0].active > 3);
  assert.ok(gear.slots[0].remaining > 17);
  assert.ok(f.runtime.readFrame().equipment.slipstreamRemaining > 3);
  const stock = await fixture(t, []);
  for (let tick = 0; tick < 30; tick++) stock.tick();
  assert.ok(
    f.state.speed > stock.state.speed + 3,
    'the actual physics receives Slipstream propulsion',
  );
});

test('rival Lance fires the actual combat projectile and Deflector blocks one real incoming shot', async (t) => {
  const source = await fixture(t, ['lance']);
  const target = source.actor('latch', 170);
  for (let tick = 0; tick < 30; tick++) source.tick([target.state]);
  assert.equal(
    source.events.filter((event) => event.type === 'equipment-activate').length,
    1,
  );
  assert.ok(target.hits.length > 0);
  assert.ok(source.runtime.snapshot().equipment.slots[0].remaining > 25);

  const shield = await fixture(t, ['deflector']);
  shield.actor('latch', -80);
  assert.equal(shield.combat.fireLance('latch'), true);
  for (let tick = 0; tick < 50; tick++) shield.tick();
  assert.ok(shield.events.some((event) => event.type === 'equipment-block'));
  assert.equal(shield.runtime.snapshot().equipment.shield, false);
  assert.ok(shield.runtime.snapshot().equipment.slots[0].remaining > 15);
});

test('rival Jump leaves and lands through native motion and airborne Stabilizer keeps its real cooldown', async (t) => {
  const f = await fixture(t, ['jump', 'stabilizer'], { lateralSpeed: 3 });
  const target = {
    ...createVehicleState(),
    distance: 130,
    lateral: 0,
    speed: 100,
  };
  let airborne = false,
    landed = false;
  for (let tick = 0; tick < 480; tick++) {
    f.tick([target]);
    const grounded = f.motion.pose(1).grounded !== false;
    airborne ||= !grounded;
    if (airborne && grounded) {
      landed = true;
      break;
    }
  }
  assert.ok(airborne);
  assert.ok(landed);
  assert.ok(f.state.distance > 180);
  const kinds = f.events
    .filter((event) => event.type === 'equipment-activate')
    .map((event) => event.payload.kind);
  assert.ok(kinds.includes('jump'));
  assert.ok(kinds.includes('stabilizer'));
  assert.ok(
    f.runtime.snapshot().equipment.slots.every((slot) => slot.remaining > 0),
  );
});
