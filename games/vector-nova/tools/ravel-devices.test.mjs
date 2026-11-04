import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import createLevel from '../src/levels/ravel/index.js';
import { createVehicleState } from '../src/physics/index.js';
import { advanceSession } from '../src/core/session-runtime.js';
import { getRacerControl } from '../src/race/racers.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import { createCombatSimulation, COMBAT_RULES } from '../src/pickups/combat.js';
import { VECTOR_PROPULSION } from '../src/pickups/simulation.js';

const definition = createLevel();
const track = definition.createTrack();
const devices = definition.racing.createDevices(track);
const combatIds = ['ravel-saddle-arc', 'ravel-fan-repulsor', 'ravel-inner-ion'];
const shieldIds = [
  'ravel-saddle-aegis',
  'ravel-fan-aegis',
  'ravel-inner-combat-aegis',
];
const relocatedShieldIds = ['ravel-section-6-aegis', 'ravel-section-9-aegis'];
const newDevices = [...combatIds, ...shieldIds, ...relocatedShieldIds].map(
  (id) => {
    const device = devices.find((entry) => entry.id === id);
    assert.ok(device, `missing authored device ${id}`);
    return device;
  },
);
let collisionWorld, dynamics;
before(async () => {
  collisionWorld = definition.createCollisionWorld({ track });
  dynamics = await definition.createDynamics({ track, collisionWorld });
});
after(() => {
  dynamics?.dispose();
  collisionWorld?.dispose();
});

test('Ravel has all five sorted shared device types and preserves its long outer reward', () => {
  assert.deepEqual(
    new Set(devices.map((device) => device.type)),
    new Set(['vector', 'aegis', 'arc', 'repulsor', 'ion']),
  );
  assert.ok(
    devices.every(
      (device, index) =>
        !index || device.distance >= devices[index - 1].distance,
    ),
  );
  const outer = devices.find(
    (device) => device.id === 'ravel-outer-long-vector',
  );
  const inner = devices.find((device) => device.id === 'ravel-inner-vector');
  assert.equal(outer.lateral, 100);
  assert.equal(outer.length, 600);
  assert.equal(inner.length, 60);
  assert.ok(outer.length >= inner.length * 10);
});

test('Aegis gates leave at least 150m between successive shields, including the lap seam', () => {
  const shields = devices.filter((device) => device.type === 'aegis');
  assert.ok(shields.length > 1);
  for (const [index, shield] of shields.entries()) {
    const next = shields[(index + 1) % shields.length];
    const gap =
      next.distance -
      shield.distance +
      (index === shields.length - 1 ? track.length : 0);
    assert.ok(
      gap >= 150,
      `${shield.id} and ${next.id} are only ${gap.toFixed(1)}m apart`,
    );
  }
});

test('all new full footprints and approach padding remain on quiet supported ground away from jump/recovery corridors', () => {
  for (const device of newDevices) {
    const low = device.distance - device.length / 2 - 8;
    const high = device.distance + device.length / 2 + 8;
    for (const jump of track.jumps) {
      assert.ok(
        high < jump.takeoff || low > jump.recovery,
        `${device.id} enters ${jump.id}`,
      );
      assert.ok(
        high < jump.takeoff || low > jump.landingEnd,
        `${device.id} crowds ${jump.id}'s receiver`,
      );
    }
    for (let distance = low; distance <= high; distance += 1) {
      for (
        let lateral = device.lateral - device.width / 2;
        lateral <= device.lateral + device.width / 2;
        lateral += 0.5
      ) {
        const frame = track.sampleBranchSurface(distance, lateral);
        assert.equal(
          track.surfaceCoverage(distance, lateral),
          1,
          `${device.id}: real skin coverage`,
        );
        assert.ok(lateral >= frame.bounds.min && lateral <= frame.bounds.max);
        for (const time of [0, 0.73, 1.9, 4.2])
          assert.equal(
            track.waveAt(distance, lateral, time).height,
            0,
            `${device.id}: fixed quiet hardware`,
          );
      }
    }
  }
  for (const id of combatIds) {
    const device = devices.find((entry) => entry.id === id);
    const branch = track.branchAt(device.distance, device.lateral);
    assert.ok(
      Math.abs(device.lateral - branch.centre) >= 24,
      'offense is an optional side lane',
    );
  }
});

test('each attack has reachable shield counterplay and Ion has a full emission interval before the next attack including the seam', () => {
  for (let index = 0; index < combatIds.length; index++) {
    const attack = devices.find((device) => device.id === combatIds[index]);
    const shield = devices.find((device) => device.id === shieldIds[index]);
    assert.equal(shield.type, 'aegis');
    assert.ok(
      attack.distance - shield.distance >= 80 &&
        attack.distance - shield.distance <= 180,
    );
    assert.ok(
      (attack.distance - shield.distance) / VECTOR_PROPULSION.cruiseSpeed < 6,
    );
    assert.equal(
      track.branchAt(attack.distance, attack.lateral).id,
      track.branchAt(shield.distance, shield.lateral).id,
    );
  }
  const attacks = devices.filter((device) =>
    ['arc', 'repulsor', 'ion'].includes(device.type),
  );
  for (let index = 0; index < attacks.length; index++) {
    if (attacks[index].type !== 'ion') continue;
    const current = attacks[index],
      next = attacks[(index + 1) % attacks.length];
    const distance =
      next.distance -
      next.length / 2 +
      (index === attacks.length - 1 ? track.length : 0) -
      (current.distance + current.length / 2);
    assert.ok(
      distance >= COMBAT_RULES.wakeDuration * VECTOR_PROPULSION.cruiseSpeed,
      `Ion has only ${distance}m before next attack`,
    );
  }
});

// Actual Rapier hulls, complete production layout, private Ravel motion and the
// shared combat service acquire each gate through forward physical contact.
for (const device of newDevices) {
  test(`real supported contact equips and executes ${device.id}`, () => {
    const combat = createCombatSimulation({ track, collisionWorld, dynamics });
    const runtime = createDeviceRuntime({
      track,
      devices,
      combat,
      motion: definition.createRuntime({
        track,
        collisionWorld,
        dynamics,
        presentation: false,
      }),
    });
    const state = {
      ...createVehicleState(),
      distance: device.distance - 28,
      lateral: device.lateral,
      speed: 120,
    };
    const events = [];
    let activatedAt = null,
      expiredAt = null,
      maximumWakes = 0,
      shieldRemaining = 0;
    const race = { runoutControl: (_state, input) => input, step: () => [] };
    runtime.reset({ state });
    try {
      const duration =
        device.type === 'ion' ? 5.2 : device.type === 'arc' ? 1.7 : 1.1;
      for (let tick = 0; tick < duration * 120; tick++) {
        const input = {
          ...getRacerControl(state, track, {
            lane: device.lateral,
            difficulty: 'hard',
            devices: [],
          }),
          boost: false,
        };
        events.push(
          ...advanceSession({
            state,
            input,
            dt: 1 / 120,
            runtime,
            race,
            dynamics,
            emit() {},
          }),
        );
        activatedAt ??= events.some(
          (event) =>
            event.type === 'pickup-activate' &&
            event.payload.deviceId === device.id,
        )
          ? state.time
          : null;
        expiredAt ??= events.some(
          (event) =>
            event.type === 'pickup-expire' &&
            event.payload.deviceId === device.id,
        )
          ? state.time
          : null;
        maximumWakes = Math.max(maximumWakes, combat.view().wakes.length);
        shieldRemaining = Math.max(
          shieldRemaining,
          runtime.snapshot().aegisRemaining,
        );
        assert.equal(
          runtime.pose(1).grounded,
          true,
          `${device.id}: actual support at ${state.distance}, ${state.lateral}`,
        );
        assert.equal(Boolean(runtime.pose(1).recovering), false);
        assert.ok(
          !events.some((event) =>
            [
              'road-departure',
              'road-recovery',
              'jump-launch',
              'jump-miss',
            ].includes(event.type),
          ),
        );
        runtime.update({});
      }
      assert.ok(
        activatedAt !== null,
        'ordinary forward hull contact acquires the exact authored gate',
      );
      assert.ok(state.distance > device.distance + device.length / 2);
      if (device.type === 'aegis')
        assert.ok(
          shieldRemaining > 5.9,
          'full shared six-second protection was equipped',
        );
      if (device.type === 'repulsor')
        assert.equal(
          events.filter(
            (event) =>
              event.type === 'combat-fire' && event.payload.kind === 'repulsor',
          ).length,
          1,
        );
      if (device.type === 'arc')
        assert.equal(
          events.filter(
            (event) =>
              event.type === 'combat-fire' && event.payload.kind === 'arc',
          ).length,
          3,
        );
      if (device.type === 'ion') {
        assert.ok(
          maximumWakes > 20,
          'the real emitter deposits a sustained physical wake',
        );
        assert.ok(
          expiredAt !== null && expiredAt - activatedAt > 4.45,
          'the full shared Ion program ran',
        );
        assert.ok(
          state.distance < track.braid.mergeStart,
          'this inner wake finishes before the common merge',
        );
      }
    } finally {
      runtime.dispose();
    }
  });
}
