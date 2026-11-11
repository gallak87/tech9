import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { createCombatSimulation, combatHitBounds } from './combat.js';

const DT = 1 / 120;
const track = {
  id: 'team-combat',
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
function harness(onHit) {
  const combat = createCombatSimulation({ track, onHit }),
    actors = new Map(),
    events = [];
  function add(
    id,
    z,
    {
      x = 0,
      team,
      hitBounds,
      shielded = false,
      quaternion = new Quaternion(),
    } = {},
  ) {
    const actor = {
      state: { distance: z, lateral: x, speed: 0 },
      team,
      hitBounds,
      hits: [],
      pose: () => ({
        position: new Vector3(actor.state.lateral, 1.2, actor.state.distance),
        quaternion: quaternion.clone(),
        grounded: true,
      }),
      notify: (event) => events.push({ actor: id, ...event }),
      hit: (payload) => {
        actor.hits.push(payload);
        return shielded;
      },
    };
    actors.set(id, actor);
    return actor;
  }
  const bind = () => {
    for (const [id, actor] of actors) combat.bind(id, actor);
  };
  const step = (count = 1) => {
    for (let i = 0; i < count; i++) {
      bind();
      combat.step(DT);
    }
  };
  const request = (id, kind) =>
    combat.request(id, {
      type: 'pickup-activate',
      payload: { kind, deviceId: `test-${kind}`, fraction: 0 },
    });
  return { combat, actors, events, add, bind, step, request };
}

test('allied hulls neither absorb physical Lance bolts nor acquire Arc locks, while empty teams remain free for all', () => {
  const h = harness();
  h.add('player', 0, { team: 'hunters' });
  const ally = h.add('ally', 35, { team: 'hunters' }),
    enemy = h.add('quarry', 80, { team: 'quarry' });
  h.bind();
  assert.equal(h.combat.fireLance('player'), true);
  h.step(60);
  assert.equal(ally.hits.length, 0);
  assert.equal(enemy.hits.length, 1);
  const arc = harness();
  arc.add('player', 0, { team: 'hunters' });
  arc.add('ally', 30, { team: 'hunters' });
  arc.add('quarry', 150, { team: 'quarry' });
  arc.bind();
  arc.request('player', 'arc');
  arc.step(20);
  assert.ok(arc.combat.snapshot().shots.length > 0);
  assert.equal(arc.combat.snapshot().shots[0].target, 'quarry');
  const free = harness();
  free.add('player', 0, { team: '' });
  const other = free.add('other', 50, { team: '' });
  free.bind();
  free.combat.fireLance('player');
  free.step(40);
  assert.equal(other.hits.length, 1);
});

test('Repulsor and Ion consequences and exposure skip allies but retain enemy hits', () => {
  const pulse = harness();
  pulse.add('player', 0, { team: 'hunters' });
  const ally = pulse.add('ally', 20, { team: 'hunters' }),
    enemy = pulse.add('enemy', 25, { team: 'quarry' });
  pulse.bind();
  pulse.request('player', 'repulsor');
  pulse.step(75);
  assert.equal(ally.hits.length, 0);
  assert.equal(enemy.hits.length, 1);
  const wake = harness();
  wake.add('source', 40, { team: 'hunters' });
  const friendly = wake.add('ally', 35, { team: 'hunters' }),
    hostile = wake.add('enemy', 35, { team: 'quarry' });
  wake.bind();
  wake.request('source', 'ion');
  wake.step(75);
  assert.equal(friendly.hits.length, 0);
  assert.ok(hostile.hits.length > 0);
  assert.equal(wake.combat.ionContact('ally'), 0);
  assert.equal(wake.combat.avoidance('ally'), null);
});

test('large chassis hit bounds include their rotated local center and are validated', () => {
  for (const [x, hitBounds, quaternion] of [
    [6, { half: [8, 3, 20], center: [0, 0, 0] }, new Quaternion()],
    [
      10,
      { half: { x: 3, y: 3, z: 2 }, center: [10, 0, 0] },
      new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI),
    ],
  ]) {
    const h = harness();
    h.add('player', 0);
    const target = h.add('goliath', 100, { x, hitBounds, quaternion });
    h.bind();
    h.combat.fireLance('player');
    h.step(60);
    assert.equal(target.hits.length, 1);
  }
  const ordinary = harness();
  ordinary.add('player', 0);
  const target = ordinary.add('ordinary', 100, { x: 6 });
  ordinary.bind();
  ordinary.combat.fireLance('player');
  ordinary.step(60);
  assert.equal(target.hits.length, 0);
  assert.throws(() => combatHitBounds({ half: [0, 3, 20] }), /positive finite/);
  assert.throws(
    () => combatHitBounds({ half: [8, 3, 20], center: [NaN, 0, 0] }),
    /finite local center/,
  );
});

test('a resolved hit observer receives one cloned contact identity after shielding without changing normal payloads', () => {
  for (const shielded of [false, true]) {
    const observed = [],
      h = harness((payload) => {
        observed.push(structuredClone(payload));
        payload.position[0] = 999;
      });
    h.add('player', 0);
    h.add('enemy', 70, { shielded });
    h.bind();
    h.combat.fireLance('player');
    h.step(60);
    assert.equal(observed.length, 1);
    assert.equal(observed[0].shielded, shielded);
    assert.ok(Number.isSafeInteger(observed[0].hitId));
    const ordinary = h.events.find((event) => event.type === 'combat-hit');
    assert.equal('hitId' in ordinary.payload, false);
    assert.notEqual(ordinary.payload.position[0], 999);
    assert.ok(
      h.combat
        .snapshot()
        .flashes.some((flash) => flash.id === observed[0].hitId),
      'the observer identity matches its actual contact flash',
    );
    h.step(90);
    assert.equal(
      h.combat
        .snapshot()
        .flashes.some((flash) => flash.id === observed[0].hitId),
      false,
      'expired feedback does not erase the resolved observer contact',
    );
    assert.equal(observed.length, 1);
  }
});
