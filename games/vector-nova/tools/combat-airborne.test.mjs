import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createCombatSimulation } from '../src/pickups/combat.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import {
  createMagneticRuntime,
  advanceSession,
} from '../src/core/session-runtime.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { createVehicleState } from '../src/physics/index.js';
import { ionWakeContact } from '../src/pickups/ion-contact.js';

const DT = 1 / 120;
const track = {
  id: 'combat-powered-hop-immunity',
  length: 2000,
  width: 28,
  closed: false,
  finishDistance: 1900,
  jumps: [],
  checkpoints: [],
  sample: (distance) => ({
    position: new T.Vector3(0, 0, distance),
    quaternion: new T.Quaternion(),
    tangent: new T.Vector3(0, 0, 1),
    right: new T.Vector3(1, 0, 0),
    up: new T.Vector3(0, 1, 0),
    curvature: 0,
  }),
};
async function fixture(
  t,
  {
    sourceDistance = 380,
    sourceSpeed = 0,
    targetSpeed = 0,
    shielded = false,
  } = {},
) {
  const dynamics = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(track),
  });
  const combat = createCombatSimulation({ track });
  const motion = createMagneticRuntime({ track, dynamics, equipment: true });
  const sourceMotion = createMagneticRuntime({ track, dynamics });
  const runtime = createDeviceRuntime({ track, devices: [], motion, combat });
  const source = createDeviceRuntime({
    track,
    devices: [],
    motion: sourceMotion,
    combat,
    combatId: 'rival',
  });
  const state = {
    ...createVehicleState('kestrel'),
    distance: 400,
    speed: targetSpeed,
    equipment: ['jump', ...(shielded ? ['deflector'] : [])],
  };
  const other = {
    ...createVehicleState(),
    distance: sourceDistance,
    speed: sourceSpeed,
  };
  runtime.reset({ state });
  source.reset({ state: other });
  const events = [];
  const race = { runoutControl: (_state, input) => input, step: () => [] };
  const racers = {
    enabled: true,
    beginAdvance: (dt) => source.beginAdvance(other, {}, dt),
    finishAdvance: () => source.finishAdvance(other),
  };
  const tick = (input = {}) =>
    advanceSession({
      state,
      input,
      dt: DT,
      runtime,
      race,
      dynamics,
      racers,
      emit: (event) => events.push(event),
    });
  const request = (kind) =>
    combat.request('rival', {
      type: 'pickup-activate',
      payload: { kind, deviceId: `incoming-${kind}` },
    });
  const fireLance = () => {
    // A rival's production tick binds the same real state/pose before firing.
    combat.bind('rival', {
      state: other,
      pose: () => source.pose(1),
      notify() {},
    });
    assert.equal(combat.fireLance('rival'), true);
  };
  t.after(() => {
    runtime.dispose();
    source.dispose();
    dynamics.dispose();
  });
  tick();
  return { combat, runtime, state, other, events, tick, request, fireLance };
}

for (const kind of ['repulsor', 'arc', 'lance'])
  for (const shielded of [false, true])
    test(`${kind} ignores an actual equipment hop without spending grace, then contacts after landing (Deflector=${shielded})`, async (t) => {
      const h = await fixture(t, { shielded });
      // The real equipment path activates on the same physics tick as incoming
      // fire. Early flight remains within the weapon's ordinary vertical volume.
      if (kind !== 'lance') h.request(kind);
      const chargeTicks = kind === 'repulsor' ? 59 : kind === 'arc' ? 16 : 0;
      for (let i = 0; i < chargeTicks; i++) h.tick();
      if (kind === 'lance') h.fireLance();
      h.tick({ equipment1: true, equipment2: shielded });
      assert.equal(h.runtime.pose(1).grounded, false);
      assert.ok(
        h.events.some(
          ({ type, payload }) =>
            type === 'equipment-activate' && payload.kind === 'jump',
        ),
      );
      let airTicks = 0;
      while (h.runtime.pose(1).grounded === false && airTicks++ < 300) {
        assert.equal(
          h.state.energy,
          100,
          'airborne attack cannot spend reserve',
        );
        assert.equal(h.combat.disruption('player'), null);
        assert.equal(
          h.combat.view().grace.player,
          undefined,
          'a miss cannot consume hit grace',
        );
        assert.equal(h.combat.ionContact('player'), 0);
        assert.equal(
          h.runtime.equipment().shield,
          shielded,
          'airborne attacks cannot consume Deflector',
        );
        h.tick();
      }
      assert.ok(airTicks > 100 && airTicks < 170);
      assert.equal(h.runtime.pose(1).grounded, true);
      assert.equal(
        h.events.filter(({ type }) => type === 'combat-hit').length,
        0,
      );
      assert.equal(h.combat.view().grace.player, undefined);
      const landed = h.combat.view().time;
      if (kind === 'lance') h.fireLance();
      else h.request(kind);
      const deadline =
        kind === 'repulsor' ? 0.52 : kind === 'arc' ? 0.22 : 0.05;
      while (
        h.combat.view().time - landed < deadline &&
        !h.events.some(({ type }) => type === 'combat-hit')
      )
        h.tick();
      const hit = h.events.find(({ type }) => type === 'combat-hit');
      assert.ok(
        hit,
        'a supported ship is immediately eligible for the next real hit',
      );
      assert.equal(hit.payload.shielded, shielded);
      assert.equal(Boolean(h.combat.disruption('player')), !shielded);
      assert.equal(h.state.energy < 100, !shielded);
      assert.equal(h.runtime.equipment().shield, false);
      assert.equal(
        hit.payload.equipment,
        kind === 'lance' ? 'lance' : undefined,
      );
    });

for (const shielded of [false, true])
  test(`a live Ion wake ignores powered flight and contacts on the exact supported landing tick (Deflector=${shielded})`, async (t) => {
    const h = await fixture(t, {
      sourceDistance: 380,
      sourceSpeed: 80,
      shielded,
    });
    h.request('ion');
    h.tick({ equipment1: true, equipment2: shielded });
    assert.equal(h.runtime.pose(1).grounded, false);
    let airTicks = 0,
      overlappingInAir = false;
    while (h.runtime.pose(1).grounded === false && airTicks++ < 300) {
      const pose = h.runtime.pose(1);
      overlappingInAir ||= h.combat
        .view()
        .wakes.some((wake) => ionWakeContact(wake, pose.position) >= 0);
      assert.equal(h.combat.ionContact('player'), 0);
      assert.equal(h.combat.disruption('player'), null);
      assert.equal(h.combat.view().grace.player, undefined);
      assert.ok(
        Object.values(h.combat.view().wakeHits).every(
          ({ targets }) => !targets.includes('player'),
        ),
      );
      assert.equal(h.state.energy, 100);
      assert.equal(h.runtime.equipment().shield, shielded);
      h.tick();
    }
    assert.ok(
      overlappingInAir,
      'the test must cross a live wake volume while still airborne',
    );
    assert.equal(h.runtime.pose(1).grounded, true);
    assert.ok(h.combat.ionContact('player') > 0);
    assert.equal(
      h.combat.disruption('player')?.kind,
      shielded ? undefined : 'ion',
    );
    assert.equal(h.state.energy < 100, !shielded);
    assert.ok(
      Object.values(h.combat.view().wakeHits).some(({ targets }) =>
        targets.includes('player'),
      ),
    );
    assert.equal(
      h.events.filter(({ type }) => type === 'combat-hit').length,
      1,
    );
    assert.equal(
      h.events.find(({ type }) => type === 'combat-hit').payload.shielded,
      shielded,
    );
    assert.equal(h.runtime.equipment().shield, false);
  });

test('an existing ground disruption suspends through flight and resumes on the supported landing', async (t) => {
  const h = await fixture(t);
  h.request('repulsor');
  for (let i = 0; i < 61; i++) h.tick();
  assert.equal(h.combat.disruption('player')?.kind, 'repulsor');
  const startedAt = h.combat.view().disruptions.player.startedAt;
  const energy = h.state.energy;
  h.tick({ equipment1: true });
  let airTicks = 0;
  while (h.runtime.pose(1).grounded === false && airTicks++ < 300) {
    assert.equal(
      h.combat.disruption('player'),
      null,
      'airborne UI and physics must not observe the ground effect',
    );
    assert.equal(
      h.combat.view().disruptions.player.startedAt,
      startedAt,
      'flight does not restart the penalty clock',
    );
    assert.ok(
      h.state.energy >= energy,
      'suspended disruption cannot spend more reserve',
    );
    h.tick();
  }
  assert.ok(airTicks > 100 && airTicks < 170);
  assert.equal(h.runtime.pose(1).grounded, true);
  assert.equal(h.combat.disruption('player')?.kind, 'repulsor');
  assert.ok(h.combat.disruption('player').remaining < 1.9);
  assert.equal(h.combat.view().disruptions.player.startedAt, startedAt);
});

test('landing cannot retroactively sweep a Lance across the distance flown while immune', async (t) => {
  const h = await fixture(t, { targetSpeed: 80 });
  h.tick({ equipment1: true });
  let fired = false,
    airTicks = 0;
  while (h.runtime.pose(1).grounded === false && airTicks++ < 300) {
    const flight = h.runtime.snapshot().motion.flight;
    if (
      !fired &&
      flight.velocity[1] < 0 &&
      h.runtime.pose(1).position.y < 3.2
    ) {
      h.fireLance();
      fired = true;
    }
    h.tick();
  }
  assert.ok(fired);
  assert.equal(h.runtime.pose(1).grounded, true);
  assert.equal(
    h.events.filter(({ type }) => type === 'combat-hit').length,
    0,
    'a grounded hit must use the previous airborne pose, not the old takeoff pose',
  );
  assert.equal(h.combat.disruption('player'), null);
  const shot = h.combat.view().shots.find(({ heavy }) => heavy);
  assert.ok(
    shot && shot.distance < h.state.distance - 20,
    'the real projectile remains well behind the landed ship',
  );
});
