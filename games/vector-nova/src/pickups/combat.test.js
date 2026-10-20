import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createCombatSimulation, COMBAT_RULES } from './combat.js';
import { createPickupSimulation } from './simulation.js';
import { createCollisionWorld } from '../physics/collision-world.js';
import { ionWakeContact, sampleIonContact } from './ion-contact.js';
import { ION_WAKE_RADIUS } from './rules.js';

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
test('every racer can collect the same combat gate together or close behind', () => {
  for (const kind of ['repulsor', 'arc', 'ion']) {
    const h = harness();
    for (const id of ['player', 'rival', 'follower']) h.add(id, 100);
    h.collect('player', kind, 'shared', 0.8);
    h.collect('rival', kind, 'shared', 0.2);
    h.step();
    assert.equal(h.combat.view().emitters.rival.kind, kind);
    assert.equal(h.combat.view().emitters.player.kind, kind);
    h.step(12);
    h.collect('follower', kind, 'shared');
    h.step();
    assert.equal(h.combat.view().emitters.follower.kind, kind);
    assert.equal(
      h.events.filter((e) => e.type === 'pickup-activate').length,
      3,
    );
    assert.equal(
      h.events.filter((e) => e.type === 'pickup-unavailable').length,
      0,
    );
  }
});
test('a racer cannot stack active weapons, without denying another racer', () => {
  const h = harness();
  h.add('player', 100);
  h.add('rival', 108);
  h.collect('player', 'ion', 'wake');
  h.step();
  const burst = h.combat.view().emitters.player.burst;
  h.collect('player', 'arc', 'shared');
  h.collect('rival', 'arc', 'shared');
  h.step();
  assert.equal(h.combat.view().emitters.player.kind, 'ion');
  assert.equal(h.combat.view().emitters.player.burst, burst);
  assert.equal(h.combat.view().emitters.rival.kind, 'arc');
  assert.deepEqual(
    h.events.filter((e) => e.type === 'pickup-unavailable'),
    [
      {
        id: 'player',
        type: 'pickup-unavailable',
        payload: {
          kind: 'arc',
          deviceId: 'shared',
          reason: 'active',
        },
      },
    ],
  );
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
test('every Arc contact flashes the target while damage grace still allows only one impulse', () => {
  const h = harness();
  h.add('player', 0);
  const target = h.add('target', 14);
  h.collect('player', 'arc');
  const contacts = new Set();
  for (let tick = 0; tick < 160; tick++) {
    h.step();
    for (const flash of h.combat.view().flashes)
      if (flash.target === 'target' && flash.kind === 'arc')
        contacts.add(flash.id);
  }
  assert.equal(contacts.size, 3);
  assert.equal(target.hits.length, 1);
  assert.equal(
    h.events.filter((event) => event.type === 'combat-confirm').length,
    1,
  );
  for (const id of ['player', 'target'])
    assert.equal(
      h.events.filter(
        (event) => event.type === 'combat-contact' && event.id === id,
      ).length,
      2,
      'later contacts are audible to both racers without extra damage',
    );
  assert.equal(h.combat.view().flashes.length, 0, 'all visual contacts expire');
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

test('Ion visual exposure survives the one-hit limit without spending more shield or reserve', () => {
  for (const shield of [false, true]) {
    const h = harness();
    h.add('player', 300, 0, 100);
    const follower = h.add('follower', 100, 0, 100, shield);
    h.collect('player', 'ion');
    h.step(300);
    assert.equal(follower.hits.length, 1);
    assert.equal(follower.hits[0].shielded, shield);
    assert.ok(h.combat.ionContact('follower') > 0);
    assert.equal(h.combat.ionContact('player'), 0, 'own wake stays harmless');
    const saved = h.combat.snapshot();
    const savedDistance = follower.state.distance;
    const events = h.events.length;
    for (let n = 0; n < 20; n++) h.combat.ionContact('follower');
    assert.deepEqual(
      h.combat.snapshot(),
      saved,
      'presentation reads never mutate the replay',
    );
    assert.equal(
      h.events.length,
      events,
      'no extra hit sounds or confirmations',
    );
    follower.state.lateral = 12;
    assert.equal(h.combat.ionContact('follower'), 0);
    follower.state.lateral = 0;
    follower.grounded = false;
    assert.equal(h.combat.ionContact('follower'), 0);
    follower.grounded = true;
    h.step(200);
    assert.equal(
      follower.hits.length,
      1,
      'later deposits do not add another impulse',
    );
    h.combat.restore(saved);
    follower.state.distance = savedDistance;
    assert.ok(
      h.combat.ionContact('follower') > 0,
      'restoring wake geometry restores exposure',
    );
    h.combat.resetActor('follower');
    assert.equal(h.combat.ionContact('follower'), 0);
  }
});

test('Ion contact respects the banked wake volume, lifetime and source exclusion', () => {
  const wake = {
    a: [0, 0, 0],
    b: [0, 0, 10],
    source: 'rook',
    age: 0,
    quaternion: new T.Quaternion()
      .setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI / 2)
      .toArray(),
  };
  const point = new T.Vector3(0, 0, 5);
  const nearest = new T.Vector3();
  assert.equal(ionWakeContact(wake, point, nearest), 1);
  assert.deepEqual(nearest.toArray(), point.toArray());
  assert.ok(
    ionWakeContact(wake, new T.Vector3(2.6, 0, 5)) < 0,
    'banked vertical clearance',
  );
  assert.ok(ionWakeContact(wake, new T.Vector3(0, 3, 5)) > 0);
  assert.equal(ionWakeContact(wake, new T.Vector3(0, ION_WAKE_RADIUS, 5)), 0);
  assert.ok(
    ionWakeContact(wake, new T.Vector3(0, ION_WAKE_RADIUS + 0.01, 5)) < 0,
  );
  assert.equal(sampleIonContact([wake], point, 'rook', 3.2), 0);
  assert.equal(
    sampleIonContact([wake], point, 'player', 3.2, () => false),
    0,
  );
  wake.age = 3.2;
  assert.equal(sampleIonContact([wake], point, 'player', 3.2), 0);
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
  assert.throws(() => h.combat.restore({ ...saved, version: 1 }), /mismatch/);
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
  sim.afterStep(vehicle(110), vehicle(590), {});
  assert.equal(
    sim
      .afterStep(vehicle(590), vehicle(610), {})
      .filter((e) => e.type === 'pickup-activate').length,
    1,
    'the next lap makes the gate available again',
  );
  sim.reset({ state: vehicle(90) });
  assert.equal(
    sim.afterStep(vehicle(90, false), vehicle(110, false), {}).length,
    0,
  );
  assert.equal(COMBAT_RULES.pulseDelay, 0.5);
});
