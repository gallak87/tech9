import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import { createCombatSimulation } from './combat.js';
import { createDeviceRuntime } from './runtime.js';
import { createVehicleState } from '../physics/index.js';
import { createInterceptorEvent } from '../events/interceptor.js';
import { compatibleRuntime, runtimeIdentity } from '../core/session-runtime.js';

const dt = 1 / 120;
const track = {
  id: 'boss-contact-damage',
  length: 3000,
  width: 44,
  closed: false,
  sample: (distance) => ({
    position: new Vector3(0, 0, distance),
    tangent: new Vector3(0, 0, 1),
    right: new Vector3(1, 0, 0),
    up: new Vector3(0, 1, 0),
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

function motion(impulses = []) {
  let state;
  return {
    id: 'damage-policy-motion',
    version: 1,
    rulesId: 'damage-policy-motion-v1',
    scenarios: {},
    reset(context) {
      state = context.state;
    },
    advance(current, _input, duration) {
      state = current;
      state.time += duration;
      state.distance += state.speed * duration;
      return [];
    },
    pose: () =>
      state
        ? {
            position: new Vector3(state.lateral, 1.2, state.distance),
            quaternion: new Quaternion(),
            grounded: true,
          }
        : null,
    applyImpulse(current, impulse) {
      impulses.push(impulse.toArray());
      current.speed += impulse.z;
    },
    snapshot: () => null,
    restore() {},
    update() {},
    dispose() {},
  };
}

function encounter(damageDuringGrace, shield = false) {
  const mission = createInterceptorEvent({
    bossId: 'goliath',
    difficulty: 'hard',
    routeLength: 1000,
    escapeDistance: 2000,
  });
  mission.step(1, { targetDistance: 150, playerDistance: 118 });
  mission.step(5, { targetDistance: 600, playerDistance: 568 });
  const contacts = [],
    impulses = [],
    events = [];
  let target;
  const combat = createCombatSimulation({
    track,
    onHit(payload) {
      const pose = target.pose(1);
      const hitLocal = new Vector3()
        .fromArray(payload.position)
        .sub(pose.position)
        .applyQuaternion(pose.quaternion.clone().invert())
        .toArray();
      const scored = mission.hit({
        ...payload,
        hitLocal,
        key: String(payload.hitId),
      });
      contacts.push({ ...payload, damage: scored[0]?.payload.damage ?? 0 });
    },
  });
  const player = createDeviceRuntime({
    track,
    devices: [],
    combat,
    motion: motion(),
    combatId: 'player',
    team: 'hunters',
  });
  const ally = createDeviceRuntime({
    track,
    devices: [],
    combat,
    motion: motion(),
    combatId: 'rook',
    team: 'hunters',
  });
  target = createDeviceRuntime({
    track,
    combat,
    motion: motion(impulses),
    combatId: 'goliath',
    team: 'quarry',
    damageDuringGrace,
    combatResistance: 0.9,
    hitBounds: { half: [8, 3, 20], center: [0, 2.8, 0] },
    devices: shield
      ? [
          {
            id: 'new-shield',
            type: 'aegis',
            distance: shield === 'initial' ? 600.05 : 604,
            lateral: 0,
            width: 6,
            length: 2,
          },
        ]
      : [],
  });
  target.observePresentation({
    events: (batch) => events.push(...batch),
    reset() {},
  });
  const runtimes = [player, ally, target];
  const states = [568, 540, 600].map((distance) => ({
    ...createVehicleState('bastion'),
    distance,
    speed: 10,
  }));
  runtimes.forEach((runtime, index) => runtime.reset({ state: states[index] }));
  function step({ lance, pulse = false } = {}) {
    runtimes.forEach((runtime, index) =>
      runtime.advance(states[index], coast, dt),
    );
    if (lance) assert.equal(combat.fireLance(lance), true);
    if (pulse)
      combat.request('player', {
        type: 'pickup-activate',
        payload: { kind: 'repulsor', deviceId: 'core-slam', fraction: 0 },
      });
    player.advanceInteractions(dt);
    mission.step(dt, {
      targetDistance: states[2].distance,
      playerDistance: states[0].distance,
      targetLateral: states[2].lateral,
      playerLateral: states[0].lateral,
    });
    runtimes.forEach((runtime) => runtime.update({}));
  }
  return {
    mission,
    combat,
    target,
    states,
    contacts,
    impulses,
    events,
    step,
    dispose() {
      runtimes.forEach((runtime) => runtime.dispose());
    },
  };
}

test('boss-only contacts during impulse grace retain real Lance and centred core-pulse HP without extra impulse, reserve or stun', () => {
  for (const enabled of [false, true]) {
    const h = encounter(enabled);
    try {
      h.step({ lance: 'rook' });
      for (let tick = 0; tick < 40 && h.contacts.length === 0; tick++) h.step();
      assert.equal(h.contacts.length, 1);
      assert.equal(h.contacts[0].damage, 4, 'real allied rear-core Lance');
      for (let tick = 0; tick < 5; tick++) h.step();
      const grace = h.combat.snapshot().grace.goliath;
      const energy = h.states[2].energy;
      const impulseCount = h.impulses.length;
      assert.equal(impulseCount, 1);
      h.step({ lance: 'player', pulse: true });
      for (let tick = 0; tick < 63; tick++) h.step();
      assert.equal(h.contacts.length, enabled ? 3 : 1);
      assert.equal(h.mission.snapshot().alliedDamage, 4);
      assert.equal(
        h.mission.snapshot().playerDamage,
        enabled ? 90 : 0,
        'real54-damage Lance and36-damage centred pulse both reach the hot core',
      );
      assert.equal(h.mission.snapshot().health, enabled ? 856 : 946);
      assert.equal(
        h.impulses.length,
        impulseCount,
        'damage-only contacts do not apply new impulses',
      );
      assert.equal(
        h.states[2].energy,
        energy,
        'reserve is charged only for the first physical impact',
      );
      assert.equal(
        h.combat.snapshot().grace.goliath,
        grace,
        'contact damage does not extend physical grace',
      );
      assert.equal(
        h.combat.disruption('goliath'),
        null,
        'the original short disruption expires without a fresh stun',
      );
      if (enabled) {
        assert.ok(
          h.contacts
            .slice(1)
            .every((contact) => contact.damageOnly && contact.duration === 0),
        );
        assert.equal(
          new Set(h.contacts.map((contact) => contact.hitId)).size,
          3,
        );
      }
    } finally {
      h.dispose();
    }
  }
});

test('a newly collected Aegis still fractures and blocks a damage-only core pulse during existing impulse grace', () => {
  const h = encounter(true, true);
  try {
    h.step({ lance: 'rook' });
    for (let tick = 0; tick < 40 && h.contacts.length === 0; tick++) h.step();
    for (let tick = 0; tick < 5; tick++) h.step();
    const grace = h.combat.snapshot().grace.goliath;
    const energy = h.states[2].energy;
    h.step({ lance: 'player', pulse: true });
    for (let tick = 0; tick < 63; tick++) h.step();
    assert.equal(h.contacts.length, 3);
    assert.equal(h.contacts[2].shielded, true);
    assert.equal(h.contacts[2].damageOnly, true);
    assert.equal(h.contacts[2].damage, 0);
    assert.equal(h.mission.snapshot().playerDamage, 54);
    assert.equal(h.target.snapshot().aegisRemaining, 0);
    assert.equal(
      h.events.filter((event) => event.type === 'shield-hit').length,
      1,
    );
    assert.equal(h.impulses.length, 1);
    assert.equal(h.states[2].energy, energy);
    assert.equal(h.combat.snapshot().grace.goliath, grace);
    assert.ok(
      h.combat
        .view()
        .flashes.some(
          (flash) => flash.target === 'goliath' && flash.kind === 'aegis',
        ),
    );
  } finally {
    h.dispose();
  }
});

test('contact-damage policy is explicit immutable actor identity while default runtimes stay compatible', () => {
  const create = (damageDuringGrace) =>
    createDeviceRuntime({
      track,
      devices: [],
      motion: motion(),
      combatId: 'goliath',
      damageDuringGrace,
    });
  const normal = create(undefined),
    explicit = create(false),
    boss = create(true);
  try {
    assert.equal(normal.rulesId, explicit.rulesId);
    assert.notEqual(boss.rulesId, normal.rulesId);
    assert.match(boss.rulesId, /"damageDuringGrace":true/);
    assert.equal(compatibleRuntime(boss, runtimeIdentity(normal)), false);
    assert.equal(compatibleRuntime(boss, runtimeIdentity(boss)), true);
    for (const invalid of [null, 0, 1, 'true']) {
      assert.throws(() => create(invalid), /boolean/);
      const combat = createCombatSimulation({ track });
      assert.throws(
        () => combat.bind('invalid', { damageDuringGrace: invalid }),
        /boolean/,
      );
    }
  } finally {
    [normal, explicit, boss].forEach((runtime) => runtime.dispose());
  }
});

test('a shielded first impact can be followed by damage-only HP without inventing a missing disruption', () => {
  const h = encounter(true, 'initial');
  try {
    h.step({ lance: 'rook' });
    for (let tick = 0; tick < 40 && h.contacts.length === 0; tick++) h.step();
    assert.equal(h.contacts[0].shielded, true);
    assert.equal(h.contacts[0].damage, 0);
    assert.equal(h.combat.disruption('goliath'), null);
    assert.equal(h.impulses.length, 0);
    const grace = h.combat.snapshot().grace.goliath;
    for (let tick = 0; tick < 5; tick++) h.step();
    h.step({ lance: 'player' });
    for (let tick = 0; tick < 20 && h.contacts.length < 2; tick++) h.step();
    assert.equal(h.contacts.length, 2);
    assert.equal(h.contacts[1].shielded, false);
    assert.equal(h.contacts[1].damageOnly, true);
    assert.equal(h.contacts[1].duration, 0);
    assert.equal(h.contacts[1].damage, 54);
    assert.equal(h.combat.disruption('goliath'), null);
    assert.equal(h.combat.snapshot().grace.goliath, grace);
    assert.equal(h.impulses.length, 0);
    assert.equal(h.states[2].energy, 100);
  } finally {
    h.dispose();
  }
});
