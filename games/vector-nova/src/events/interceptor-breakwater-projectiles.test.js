import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import createNightweir from '../levels/interceptor-nightweir/index.js';
import { createRapierWorld } from '../physics/rapier-world.js';
import { withMagneticBoundaries } from '../physics/magnetic-boundaries.js';
import { createVehicleState } from '../physics/index.js';
import { createCombatSimulation } from '../pickups/combat.js';
import { createDeviceRuntime } from '../pickups/runtime.js';
import { ionWakeContact } from '../pickups/ion-contact.js';
import { ION_WAKE_RADIUS, LANCE_LIFETIME } from '../pickups/rules.js';
import { getRacerControl } from '../race/racers.js';
import { createInterceptorMotion } from './interceptor-motion.js';
import { createInterceptorChaseMotion } from './interceptor-chase.js';
import { createInterceptorField } from './interceptor-field.js';
import { createInterceptorEvent } from './interceptor.js';

const dt = 1 / 120;
const speed = 300 / 3.6;
let course;
function physicalCourse() {
  if (!course) {
    const level = createNightweir();
    const track = level.createTrack();
    course = {
      level,
      track,
      collisionWorld: withMagneticBoundaries(
        track,
        level.createCollisionWorld({ track }),
      ),
    };
  }
  return course;
}

async function createHarness({
  stationIndex = 0,
  gap = 32,
  lane = 4.6,
  shielded = false,
  arcGate = false,
} = {}) {
  const { track, level, collisionWorld } = physicalCourse();
  const dynamics = await createRapierWorld({ collisionWorld });
  const station = track.length * [0.14, 0.76][stationIndex];
  const mission = createInterceptorEvent({
    bossId: 'bulwark',
    difficulty: 'hard',
    allies: [],
    routeLength: track.length,
    escapeDistance: track.length * 2,
  });
  // Scenario setup precedes both physical resets. Consume the earlier beat
  // through the real owner so station two lights its opposite shoulder. No
  // contact, health, actor pose or replay state is fabricated.
  if (stationIndex) {
    const progress = {
      targetDistance: track.length * 0.14,
      playerDistance: track.length * 0.14 - gap,
    };
    mission.step(dt, progress);
    for (let tick = 0; tick < Math.ceil(9.2 / dt); tick++)
      mission.step(dt, progress);
  }
  const boss = {
    ...createVehicleState('bastion'),
    chassisId: 'bulwark',
    distance: station,
    speed,
  };
  const player = {
    ...createVehicleState('shrike'),
    distance: station - gap,
    lateral: lane,
    speed,
  };
  const hits = [],
    events = [],
    cuts = [];
  let target, hunter;
  const combat = createCombatSimulation({
    track,
    collisionWorld,
    dynamics,
    onHit(payload) {
      const pose = target.pose(1);
      const hitLocal = new T.Vector3()
        .fromArray(payload.position)
        .sub(pose.position)
        .applyQuaternion(pose.quaternion.clone().invert())
        .toArray();
      hits.push({ ...payload, hitLocal });
      const accepted = mission.hit({
        ...payload,
        hitLocal,
        key: `${payload.hitId}:${payload.source}:${payload.target}`,
      });
      for (const event of accepted) {
        events.push(event);
        if (event.type === 'interceptor-breakwater') {
          const laid = structuredClone(combat.view().wakes);
          assert.equal(combat.stopIon('bulwark'), true);
          assert.deepEqual(
            combat.view().wakes,
            laid,
            'the physical cutoff preserves every already deposited segment',
          );
          cuts.push({ event, laid });
        }
      }
    },
  });
  const context = {
    track,
    dynamics,
    collisionWorld,
    settings: { steeringAssist: 0.3 },
    presentation: false,
  };
  const field = createInterceptorField({
    track,
    bossId: 'bulwark',
    getCounterattack: () => mission.snapshot().counterattack,
  });
  const targetMotion = createInterceptorMotion(context, {
    createMotion: level.racing.createMotion,
    getYaw: () => mission.snapshot().counterattack.yaw,
  });
  target = createDeviceRuntime({
    track,
    devices: shielded
      ? [
          {
            id: 'real-aegis',
            type: 'aegis',
            distance: station + 12,
            lateral: 0,
            width: 12,
            length: 10,
          },
        ]
      : [],
    motion: targetMotion,
    combat,
    combatId: 'bulwark',
    team: 'quarry',
    hitBounds: field.opponents[0].hitBounds,
    combatResistance: 0.9,
    damageDuringGrace: true,
  });
  const hunterMotion = createInterceptorChaseMotion(context, {
    createMotion: level.racing.createMotion,
    getTarget: () => ({ state: boss, runtime: target }),
  });
  hunter = createDeviceRuntime({
    track,
    devices: arcGate
      ? [
          {
            id: 'real-arc',
            type: 'arc',
            distance: player.distance + 100,
            lateral: lane,
            width: 8,
            length: 10,
          },
        ]
      : [],
    motion: hunterMotion,
    combat,
    team: 'hunters',
  });
  target.reset({ state: boss });
  hunter.reset({ state: player });
  let unsafeTicks = 0,
    unsupportedTicks = 0;
  function step({ fire = false } = {}) {
    const bossControl = field.control({
      opponent: {
        specification: field.opponents[0],
        state: boss,
        runtime: target,
      },
      track,
      devices: [],
      nearby: [boss, player],
    });
    // The pilot chooses a line through ordinary steering. Passing the motion
    // rather than the device wrapper avoids the AI's automatic wake avoidance
    // overwriting that choice; the player has no such automatic input override.
    const control = getRacerControl(player, track, {
      difficulty: 'hard',
      lane,
      runtime: hunterMotion,
    });
    control.boost = false;
    target.beginAdvance(boss, bossControl, dt);
    hunter.beginAdvance(player, control, dt);
    dynamics.step(dt);
    target.finishAdvance(boss);
    hunter.finishAdvance(player);
    for (const event of mission.step(dt, {
      targetDistance: boss.distance,
      playerDistance: player.distance,
      playerLateral: player.lateral,
      targetLateral: boss.lateral,
    })) {
      events.push(event);
      if (event.type === 'interceptor-fire' && event.payload.kind === 'ion')
        combat.request('bulwark', {
          type: 'pickup-activate',
          payload: {
            kind: 'ion',
            deviceId: 'bulwark-countermeasure',
            wakeMuzzle: [0, 0.15, -10.4],
          },
        });
      if (event.type === 'interceptor-wake-stop') combat.stopIon('bulwark');
    }
    if (fire) assert.equal(combat.fireLance('player'), true);
    hunter.advanceInteractions(dt);
    const pose = hunter.pose(1);
    if (pose.grounded === false || pose.recovering === true) unsupportedTicks++;
    if (
      combat
        .view()
        .wakes.some((wake) => ionWakeContact(wake, pose.position) >= 0)
    )
      unsafeTicks++;
  }
  function advance(seconds) {
    for (let tick = 0; tick < Math.ceil(seconds / dt); tick++) step();
  }
  return {
    mission,
    boss,
    player,
    target,
    combat,
    hits,
    events,
    cuts,
    step,
    advance,
    statistics: () => ({ unsafeTicks, unsupportedTicks }),
    setLane(value) {
      lane = value;
    },
    dispose() {
      hunter.dispose();
      target.dispose();
      dynamics.dispose();
    },
  };
}

const gunContacts = (h) =>
  h.hits.filter((hit) => hit.source === 'player' && hit.target === 'bulwark');
const acceptedHits = (h) =>
  h.events.filter((event) => event.type === 'interceptor-hit');

test('both moving Breakwater drives are reachable by ordinary Lance from a safe flank at near and middle chase gaps', async () => {
  const results = [];
  for (const stationIndex of [0, 1]) {
    const side = stationIndex === 0 ? 1 : -1;
    for (const gap of [32, 80])
      for (const line of [4.4, 4.8, 5.2]) {
        const h = await createHarness({ stationIndex, gap, lane: side * line });
        try {
          h.advance(1.35);
          assert.equal(
            h.mission.snapshot().counterattack.breakwater.active,
            true,
          );
          const fireGap = h.boss.distance - h.player.distance;
          h.step({ fire: true });
          h.advance(LANCE_LIFETIME + dt);
          const [contact] = gunContacts(h);
          assert.ok(
            contact,
            'each chosen line makes an actual swept hull contact',
          );
          assert.equal(contact.shielded, false);
          assert.equal(contact.equipment, 'lance');
          assert.ok(contact.hitLocal.every(Number.isFinite));
          const result = {
            stationIndex,
            gap,
            line,
            fireGap,
            point: contact.hitLocal,
            cuts: h.cuts.length,
            ...h.statistics(),
          };
          results.push(result);
          assert.ok(h.cuts.length <= 1);
          if (h.cuts.length) {
            assert.equal(acceptedHits(h)[0].payload.damage, 54);
            assert.equal(h.mission.snapshot().health, 950 - 54);
            assert.equal(h.cuts[0].event.payload.side, side);
            assert.ok(side * contact.hitLocal[0] >= 3);
            assert.ok(side * contact.hitLocal[0] <= 5.4);
            assert.equal(h.combat.view().emitters.bulwark, undefined);
            assert.equal(
              h.mission.snapshot().counterattack.breakwater.disabled,
              true,
            );
          } else {
            assert.equal(acceptedHits(h)[0].payload.damage, 9);
            assert.equal(h.mission.snapshot().health, 950 - 9);
          }
        } finally {
          h.dispose();
        }
      }
  }
  // The curved moving stern needs an aimed flank, not an identical numerical
  // lane at every distance. A reachable line must also clear the actual 3D
  // wake for the whole attempt and remain grounded without recovery immunity.
  for (const stationIndex of [0, 1])
    for (const gap of [32, 80])
      assert.ok(
        results.some(
          (result) =>
            result.stationIndex === stationIndex &&
            result.gap === gap &&
            result.cuts === 1 &&
            result.unsafeTicks === 0 &&
            result.unsupportedTicks === 0 &&
            result.line > ION_WAKE_RADIUS,
        ),
        JSON.stringify(results),
      );
});

test('wrong shoulder, centre armor and a collected Aegis block leave the real emitter active', async () => {
  for (const [label, lane, shielded] of [
    ['wrong shoulder', -4.6, false],
    ['centre', 0, false],
    ['Aegis', 4.6, true],
  ]) {
    const h = await createHarness({ lane, shielded });
    try {
      h.advance(1.35);
      if (shielded)
        assert.ok(
          h.target.snapshot().aegisRemaining > 0,
          'the boss actually crossed its Aegis gate',
        );
      h.step({ fire: true });
      h.advance(0.35);
      const [contact] = gunContacts(h);
      assert.ok(contact, `${label} must be a real contact`);
      assert.equal(contact.shielded, shielded);
      assert.equal(h.cuts.length, 0);
      assert.equal(h.mission.snapshot().counterattack.breakwater.active, true);
      assert.ok(h.combat.view().emitters.bulwark);
      assert.equal(h.mission.snapshot().health, 950 - (shielded ? 0 : 9));
      assert.deepEqual(
        acceptedHits(h).map((event) => event.payload.damage),
        shielded ? [] : [9],
      );
    } finally {
      h.dispose();
    }
  }
});

test('a real shoulder Arc burst earns one cutoff payout and subsequent contacts stay chip', async () => {
  const h = await createHarness({ arcGate: true });
  try {
    h.advance(2.8);
    const contacts = gunContacts(h);
    assert.ok(
      contacts.length >= 2,
      'the actual collected Arc burst must reach the moving shoulder repeatedly',
    );
    assert.ok(
      contacts.every(
        (contact) =>
          contact.kind === 'arc' && !contact.equipment && !contact.shielded,
      ),
    );
    assert.equal(h.cuts.length, 1);
    const damage = acceptedHits(h).map((event) => event.payload.damage);
    assert.equal(damage[0], 15);
    assert.ok(damage.slice(1).every((amount) => amount === 2));
    assert.equal(
      h.mission.snapshot().health,
      950 - damage.reduce((sum, amount) => sum + amount, 0),
    );
    assert.equal(h.combat.view().emitters.bulwark, undefined);
    assert.equal(h.statistics().unsupportedTicks, 0);
  } finally {
    h.dispose();
  }
});

test('cutoff preserves its laid wake and an ordinarily steering pilot can still be damaged by that old trail', async () => {
  const h = await createHarness();
  try {
    h.advance(1.35);
    h.step({ fire: true });
    for (let tick = 0; tick < 60 && !h.cuts.length; tick++) h.step();
    assert.equal(h.cuts.length, 1);
    assert.equal(h.statistics().unsafeTicks, 0);
    const laid = h.cuts[0].laid;
    assert.ok(laid.length > 0);
    const ids = laid.map((wake) => wake.id);
    h.setLane(0);
    h.advance(0.65);
    assert.deepEqual(
      h.combat.view().wakes.map((wake) => wake.id),
      ids,
      'the disabled emitter deposits no new segments while its old trail persists',
    );
    const contact = h.hits.find(
      (hit) =>
        hit.source === 'bulwark' &&
        hit.target === 'player' &&
        hit.kind === 'ion',
    );
    assert.ok(
      contact && !contact.shielded,
      'ordinary steering into an old segment still causes real Ion damage',
    );
    assert.ok(
      laid.some(
        (wake) =>
          ionWakeContact(wake, new T.Vector3().fromArray(contact.position)) >=
          0,
      ),
    );
    assert.equal(h.cuts.length, 1);
    assert.equal(h.statistics().unsupportedTicks, 0);
  } finally {
    h.dispose();
  }
});
