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
function harness(collisionWorld = null, course = track) {
  const combat = createCombatSimulation({ track: course, collisionWorld });
  const actors = new Map(),
    events = [];
  function add(id, z, x = 0, speed = 0, shield = false) {
    const state = { distance: z, lateral: x, speed };
    const actor = {
      state,
      hits: [],
      grounded: true,
      pose: () => ({
        position: course
          .sample(state.distance)
          .position.clone()
          .addScaledVector(course.sample(state.distance).right, state.lateral)
          .addScaledVector(course.sample(state.distance).up, 1.2),
        quaternion: course.sample(state.distance).quaternion.clone(),
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

test('live Lance fire and impact retain equipment identity without changing heavy-hit consequences', () => {
  for (const shielded of [false, true]) {
    const h = harness();
    h.add('player', 0);
    const target = h.add('target', 80, 0, 0, shielded);
    const targetPose = target.pose;
    const bank = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 0, 1),
      0.6,
    );
    target.pose = () => ({ ...targetPose(), quaternion: bank.clone() });
    for (const [id, actor] of h.actors) h.combat.bind(id, actor);
    assert.equal(h.combat.fireLance('player'), true);
    assert.equal(h.combat.view().flashes[0].equipment, 'lance');
    h.step(30);
    const fire = h.events.find(({ type }) => type === 'combat-fire');
    const hit = h.events.find(({ type }) => type === 'combat-hit');
    assert.equal(fire.payload.equipment, 'lance');
    assert.equal(hit.payload.equipment, 'lance');
    assert.equal(hit.payload.kind, 'repulsor');
    assert.equal(hit.payload.shielded, shielded);
    assert.equal(target.hits.length, 1);
    const flash = h.combat
      .view()
      .flashes.find((entry) => entry.target === 'target');
    assert.equal(flash.equipment, 'lance');
    assert.equal(flash.kind, shielded ? 'aegis' : 'repulsor');
    assert.deepEqual(
      flash.quaternion,
      shielded ? bank.toArray() : [0, 0, 0, 1],
      'armor fragments follow the incoming shot; a shield keeps its own hull frame',
    );
    if (!shielded) {
      h.step(60);
      assert.equal(h.combat.view().flashes.length, 0);
      assert.equal(h.combat.disruption('target').equipment, 'lance');
      const snapshot = h.combat.snapshot();
      h.combat.restore(snapshot);
      assert.equal(h.combat.disruption('target').equipment, 'lance');
    }
  }
});
test('repulsor charges, pushes locally, respects decks/flight and has bounded repeat hits', () => {
  const h = harness();
  h.add('player', 100);
  const near = h.add('near', 112, 6);
  const far = h.add('far', 240);
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
test('Repulsor reaches 108 road metres in both directions without affecting separate decks or flight', () => {
  const h = harness();
  h.add('player', 200);
  const ahead = h.add('ahead', 307);
  const behind = h.add('behind', 93);
  const outside = h.add('outside', 309);
  const offDeck = h.add('off-deck', 240);
  const deckPose = offDeck.pose;
  offDeck.pose = () => {
    const pose = deckPose();
    pose.position.y += 12;
    return pose;
  };
  const flying = h.add('flying', 230);
  flying.grounded = false;
  h.collect('player', 'repulsor');
  h.step(61);
  assert.equal(COMBAT_RULES.pulseRadius, 108);
  assert.equal(ahead.hits.length, 1);
  assert.equal(behind.hits.length, 1);
  assert.ok(ahead.hits[0].impulse[2] > 0);
  assert.ok(behind.hits[0].impulse[2] < 0);
  assert.equal(outside.hits.length, 0);
  assert.equal(offDeck.hits.length, 0);
  assert.equal(flying.hits.length, 0);
  const pulse = h.combat.view().flashes.find((flash) => !flash.target);
  assert.equal(pulse.distance, 200);
  assert.equal(pulse.lateral, 0);
});
test('Repulsor follows rising road contours while keeping static cover authoritative', () => {
  const course = {
    ...track,
    sample(distance) {
      const tangent = new T.Vector3(0, 0.3, 1).normalize();
      const right = new T.Vector3(1, 0, 0);
      const up = tangent.clone().cross(right);
      return {
        ...track.sample(distance),
        position: new T.Vector3(0, distance * 0.3, distance),
        tangent,
        right,
        up,
        quaternion: new T.Quaternion().setFromRotationMatrix(
          new T.Matrix4().makeBasis(right, up, tangent),
        ),
      };
    },
  };
  for (const covered of [false, true]) {
    const h = harness(
      {
        sweepHull(a, b) {
          return {
            fraction:
              covered && a.position.z < 150 && b.position.z >= 150 ? 0.5 : 1,
          };
        },
      },
      course,
    );
    h.add('player', 100);
    const target = h.add('target', 196);
    h.collect('player', 'repulsor');
    h.step(61);
    assert.equal(target.hits.length, covered ? 0 : 1);
    if (!covered)
      assert.ok(
        target.hits[0].impulse[1] > 0,
        'impulse follows the receiving road plane',
      );
  }
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
  h.step(240);
  assert.equal(h.events.filter((e) => e.type === 'combat-fire').length, 3);
  assert.ok(target.hits.length >= 1);
  assert.equal(h.combat.view().shots.length, 0);
});
test('Arc fires at the slower speed over a 0.9-second window and homes across lanes', () => {
  for (const source of ['player', 'rival']) {
    const h = harness();
    h.add(source, 0, -9, 100);
    const target = h.add('target', 110, 9, 100);
    h.collect(source, 'arc');
    const fired = [];
    let previousCount = 0;
    for (let tick = 0; tick < 240; tick++) {
      h.step();
      const count = h.events.filter(
        (event) => event.type === 'combat-fire',
      ).length;
      if (count > previousCount) {
        fired.push(h.combat.view().time);
        const shot = h.combat.view().shots.at(-1);
        assert.equal(
          shot.speed,
          345 + 100,
          'retain the firing ship’s forward momentum',
        );
        assert.equal(shot.target, 'target');
        assert.ok(
          shot.heading > 0 &&
            shot.heading <= COMBAT_RULES.arcTurnRate / 120 + 1e-9,
        );
      }
      previousCount = count;
    }
    assert.equal(fired.length, 3);
    for (const [index, at] of [0.15, 0.6, 1.05].entries())
      assert.ok(Math.abs(fired[index] - at) <= 1 / 120 + 1e-9);
    assert.equal(
      target.hits.length,
      2,
      'gentle tracking reaches a moving racer across the road',
    );
    assert.equal(h.combat.view().shots.length, 0);
  }
});
test('Arc only acquires a nearby forward grounded racer, with stable tie-breaking', () => {
  for (const reverse of [false, true]) {
    const h = harness();
    h.add('source', 100);
    h.add('behind', 90);
    h.add('outside-cone', 105, 12);
    h.add('distant', 400);
    h.add('flying', 130).grounded = false;
    const deck = h.add('other-deck', 135);
    const pose = deck.pose;
    deck.pose = () => {
      const p = pose();
      p.position.y += 12;
      return p;
    };
    const targets = ['alpha', 'beta'];
    if (reverse) targets.reverse();
    for (const id of targets) h.add(id, 180, 8);
    h.collect('source', 'arc');
    h.step(18);
    assert.equal(h.combat.view().shots[0].target, 'alpha');
  }
});
test('Arc turning is bounded; losing a target never reacquires or makes a U-turn', () => {
  const h = harness();
  h.add('source', 0);
  const target = h.add('target', 120, 9);
  h.add('alternate', 160, -9);
  h.collect('source', 'arc');
  h.step(20);
  const shotId = h.combat.view().shots[0].id;
  const before = h.combat.view().shots[0].heading;
  target.state.lateral = -12;
  h.step();
  let shot = h.combat.view().shots.find((s) => s.id === shotId);
  assert.ok(
    Math.abs(shot.heading - before) <= COMBAT_RULES.arcTurnRate / 120 + 1e-9,
  );
  target.state.distance = 0;
  h.step();
  shot = h.combat.view().shots.find((s) => s.id === shotId);
  assert.equal(shot.target, null);
  const heading = shot.heading;
  target.state.distance = 120;
  h.step(4);
  shot = h.combat.view().shots.find((s) => s.id === shotId);
  assert.equal(shot.target, null);
  assert.equal(shot.heading, heading);
  assert.ok(shot.velocity[2] > 0);
});
test('homing survives a banked lap seam and restores an in-flight lock deterministically', () => {
  const radius = 300;
  const course = {
    ...track,
    closed: true,
    length: Math.PI * 2 * radius,
    sample(distance) {
      const angle = distance / radius;
      const quaternion = new T.Quaternion().setFromEuler(
        new T.Euler(0, angle, 0.35, 'YXZ'),
      );
      return {
        position: new T.Vector3(
          radius * (1 - Math.cos(angle)),
          0,
          radius * Math.sin(angle),
        ),
        quaternion,
        right: new T.Vector3(1, 0, 0).applyQuaternion(quaternion),
        up: new T.Vector3(0, 1, 0).applyQuaternion(quaternion),
        tangent: new T.Vector3(0, 0, 1).applyQuaternion(quaternion),
      };
    },
  };
  const h = harness(null, course);
  h.add('source', course.length - 50, -7);
  const target = h.add('target', 50, 7);
  h.collect('source', 'arc');
  h.step(23);
  const saved = h.combat.snapshot();
  assert.equal(saved.shots[0].target, 'target');
  assert.ok(saved.shots[0].heading > 0);
  h.step(220);
  const expected = h.combat.snapshot();
  const hits = structuredClone(target.hits);
  assert.ok(hits.length > 0);
  target.hits = [];
  h.combat.restore(saved);
  h.step(220);
  assert.deepEqual(h.combat.snapshot(), expected);
  assert.deepEqual(target.hits, hits);
});
test('every Arc contact flashes, with only the first and third shots outside hit grace', () => {
  const h = harness();
  h.add('player', 0);
  const target = h.add('target', 14);
  h.collect('player', 'arc');
  const contacts = new Set();
  for (let tick = 0; tick < 210; tick++) {
    h.step();
    for (const flash of h.combat.view().flashes)
      if (flash.target === 'target' && flash.kind === 'arc')
        contacts.add(flash.id);
  }
  assert.equal(contacts.size, 3);
  assert.equal(target.hits.length, 2);
  assert.equal(
    h.events.filter((event) => event.type === 'combat-confirm').length,
    2,
  );
  for (const id of ['player', 'target'])
    assert.equal(
      h.events.filter(
        (event) => event.type === 'combat-contact' && event.id === id,
      ).length,
      1,
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
  assert.equal(target.hits.length, 2);
  assert.equal(target.hits[0].shielded, true);
  assert.equal(target.hits[1].shielded, false);
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
