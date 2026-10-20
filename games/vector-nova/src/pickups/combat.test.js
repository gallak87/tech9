import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createCombatSimulation, COMBAT_RULES } from './combat.js';
import { createPickupSimulation } from './simulation.js';
import { createCollisionWorld } from '../physics/collision-world.js';

const track = {
  id: 'combat-test',
  closed: false,
  length: 2000,
  width: 28,
  sample: (distance) => ({
    position: new T.Vector3(0, 0, distance),
    quaternion: new T.Quaternion(),
    up: new T.Vector3(0, 1, 0),
    right: new T.Vector3(1, 0, 0),
    tangent: new T.Vector3(0, 0, 1),
    curvature: 0,
  }),
};
function harness(collisionWorld = null) {
  const combat = createCombatSimulation({ track, collisionWorld });
  const actors = new Map(),
    events = [];
  function add(id, z, x = 0, speed = 0, shield = false) {
    const state = { distance: z, lateral: x, speed };
    const actor = {
      state,
      hits: [],
      grounded: true,
      pose: () => ({
        position: new T.Vector3(state.lateral, 1.2, state.distance),
        quaternion: new T.Quaternion(),
        grounded: actor.grounded,
      }),
      notify: (event) => events.push({ id, ...event }),
      hit: (hit) => {
        actor.hits.push({
          ...hit,
          impulse: hit.impulse.toArray(),
          shielded: shield,
        });
        if (shield) {
          shield = false;
          return true;
        }
        return false;
      },
    };
    actors.set(id, actor);
    return actor;
  }
  function step(count = 1) {
    for (let i = 0; i < count; i++) {
      for (const [id, actor] of actors) {
        actor.state.distance += actor.state.speed / 120;
        combat.bind(id, actor);
      }
      combat.step(1 / 120);
    }
  }
  function collect(id, kind, deviceId = kind, fraction = 0.5) {
    combat.request(id, {
      type: 'pickup-activate',
      payload: { kind, deviceId, fraction },
    });
  }
  return { combat, actors, events, add, step, collect };
}
test('repulsor charges, pushes locally, respects decks/flight and has bounded repeat hits', () => {
  const h = harness();
  h.add('player', 100);
  const near = h.add('near', 112, 6);
  const far = h.add('far', 200);
  const flying = h.add('flying', 104);
  flying.grounded = false;
  h.collect('player', 'repulsor');
  h.step(58);
  assert.equal(near.hits.length, 0);
  h.step(3);
  assert.equal(near.hits.length, 1);
  assert.equal(far.hits.length, 0);
  assert.equal(flying.hits.length, 0);
  assert.ok(Math.hypot(...near.hits[0].impulse) <= 12);
  assert.ok(near.hits[0].impulse[0] > 0 && near.hits[0].impulse[2] > 0);
  h.collect('far', 'repulsor', 'second');
  h.step(61);
  assert.equal(near.hits.length, 1);
});
test('the earliest crossing wins a shared device, independently of runtime order', () => {
  const h = harness();
  h.add('player', 100);
  h.add('rival', 108);
  h.collect('player', 'repulsor', 'shared', 0.8);
  h.collect('rival', 'repulsor', 'shared', 0.2);
  h.step();
  assert.ok(h.combat.view().emitters.rival);
  assert.equal(h.combat.view().emitters.player, undefined);
  assert.equal(h.combat.available('shared'), false);
  h.step(170);
  assert.equal(h.combat.available('shared'), true);
});
test('arc fires exactly three swept bolts and reaches a separated rival', () => {
  const h = harness();
  h.add('player', 0);
  const target = h.add('target', 180);
  h.collect('player', 'arc');
  h.step(170);
  assert.equal(h.events.filter((e) => e.type === 'combat-fire').length, 3);
  assert.ok(target.hits.length >= 1);
  assert.equal(h.combat.view().shots.length, 0);
});
test('arc stops at authored walls and cannot shoot through them', () => {
  const wall = createCollisionWorld({
    id: 'wall',
    version: 1,
    geometryId: 'wall',
    triangles: [
      {
        id: 'wall',
        kind: 'structure',
        owner: 'wall',
        points: [
          [-20, -5, 80],
          [20, -5, 80],
          [20, 15, 80],
        ],
      },
      {
        id: 'wall',
        kind: 'structure',
        owner: 'wall',
        points: [
          [-20, -5, 80],
          [20, 15, 80],
          [-20, 15, 80],
        ],
      },
    ],
  });
  const h = harness(wall);
  h.add('player', 0);
  const target = h.add('target', 140);
  h.collect('player', 'arc');
  h.step(170);
  assert.equal(target.hits.length, 0);
  wall.dispose();
});
test('ion wake persists long enough to hit a follower two seconds behind', () => {
  const h = harness();
  const source = h.add('player', 300, 0, 100);
  const follower = h.add('follower', 100, 0, 100);
  const otherLane = h.add('other-lane', 100, 10, 100);
  h.collect('player', 'ion');
  h.step(200);
  assert.ok(
    h.combat.avoidance('follower') > 4,
    'the follower chooses a clear lane before the trail',
  );
  h.step(360);
  assert.equal(
    follower.hits.length,
    1,
    'a single wake burst cannot repeatedly drain the same racer',
  );
  assert.equal(otherLane.hits.length, 0);
  assert.equal(source.hits.length, 0);
  assert.ok(h.combat.view().wakes.length > 0);
  assert.equal(h.combat.view().emitters.player, undefined);
  h.step(470);
  assert.equal(h.combat.view().wakes.length, 0);
});
test('shield results are forwarded and grace limits successive hits', () => {
  const h = harness();
  h.add('player', 0);
  const target = h.add('target', 80, 0, 0, true);
  h.collect('player', 'arc');
  h.step(170);
  assert.equal(target.hits.length, 1);
  assert.equal(target.hits[0].shielded, true);
  assert.ok(
    h.events.some(
      (e) => e.id === 'target' && e.type === 'combat-hit' && e.payload.shielded,
    ),
  );
});
test('snapshot restores a charging effect deterministically and recovery removes hazards', () => {
  const h = harness();
  h.add('player', 0);
  const target = h.add('target', 100);
  h.collect('player', 'arc');
  h.step(10);
  const saved = h.combat.snapshot();
  h.step(160);
  const expected = h.combat.snapshot();
  const hits = structuredClone(target.hits);
  target.hits = [];
  h.combat.restore(saved);
  h.step(160);
  assert.deepEqual(h.combat.snapshot(), expected);
  assert.deepEqual(target.hits, hits);
  h.collect('player', 'ion');
  h.step(40);
  assert.ok(h.combat.view().wakes.length);
  h.combat.resetActor('player');
  assert.equal(h.combat.view().wakes.length, 0);
  assert.equal(h.combat.view().emitters.player, undefined);
  assert.throws(() => h.combat.restore({ ...saved, time: NaN }), /mismatch/);
});
test('offensive gates use forward swept crossing and retain the per-lap anti-farming ledger', () => {
  const device = {
    id: 'pulse',
    type: 'repulsor',
    distance: 100,
    lateral: 0,
    width: 5,
    length: 10,
  };
  const sim = createPickupSimulation({
    trackLength: 500,
    devices: [device],
    vehicle: { distance: 90 },
  });
  const vehicle = (distance, grounded = true) => ({
    distance,
    speed: 150,
    lateral: 0,
    heading: 0,
    grounded,
  });
  sim.beforeStep({}, 1 / 120, vehicle(90));
  const events = sim.afterStep(vehicle(90), vehicle(110), {});
  assert.equal(events.filter((e) => e.type === 'pickup-activate').length, 1);
  sim.reset({ reason: 'manual-recover', state: vehicle(90) });
  assert.equal(sim.afterStep(vehicle(90), vehicle(110), {}).length, 0);
  sim.reset({ state: vehicle(90) });
  assert.equal(
    sim.afterStep(vehicle(90, false), vehicle(110, false), {}).length,
    0,
  );
  assert.equal(COMBAT_RULES.pulseDelay, 0.5);
});
