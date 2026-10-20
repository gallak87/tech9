import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { createDeviceLayout } from '../src/pickups/layout.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import {
  createCombatSimulation,
  isCombatDevice,
  COMBAT_RULES,
} from '../src/pickups/combat.js';
import { VECTOR_PROPULSION } from '../src/pickups/simulation.js';
import { createMagneticRuntime } from '../src/core/session-runtime.js';
import { createVehicleState } from '../src/physics/index.js';
import { VEHICLE_HULL } from '../src/physics/hull.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';

const directory = new URL('../src/levels/', import.meta.url);
for (const folder of await readdir(directory, { withFileTypes: true })) {
  if (!folder.isDirectory()) continue;
  const files = await readdir(new URL(`${folder.name}/`, directory));
  if (!files.includes('metadata.js')) continue;
  const definition = (
    await import(`../src/levels/${folder.name}/index.js`)
  ).default({});
  const track = definition.createTrack();
  const devices = definition.racing.createDevices(track);
  const attacks = devices.filter((device) => isCombatDevice(device.type));

  test(`${folder.name}: complete pickup set leaves safe, optional combat lanes`, () => {
    createDeviceLayout(track, devices);
    assert.deepEqual(
      [...new Set(devices.map((device) => device.type))].sort(),
      ['aegis', 'arc', 'ion', 'repulsor', 'vector'],
    );
    for (let i = 0; i < devices.length; i++) {
      const device = devices[i];
      assert.ok(
        device.distance + device.length / 2 <
          (track.finishDistance ?? track.length),
        `${device.id}: hardware must precede the finish/runout`,
      );
      if (i)
        assert.ok(
          devices[i - 1].distance <= device.distance,
          'AI reads pickups in route order',
        );
      for (const other of devices.slice(i + 1)) {
        assert.ok(
          Math.abs(device.distance - other.distance) >=
            (device.length + other.length) / 2 ||
            Math.abs(device.lateral - other.lateral) >=
              (device.width + other.width) / 2,
          `${device.id} overlaps ${other.id}`,
        );
      }
    }
    for (let i = 0; i < attacks.length; i++) {
      const device = attacks[i];
      assert.ok(
        Math.abs(device.lateral) > device.width / 2 + VEHICLE_HULL.halfWidth,
        `${device.id}: a centred ship must be able to decline the weapon`,
      );
      assert.ok(
        Math.abs(device.lateral) + device.width / 2 <= track.width / 2 - 3,
        `${device.id}: leave room beside the rail`,
      );
      for (const distance of [
        device.distance - device.length / 2,
        device.distance,
        device.distance + device.length / 2,
      ]) {
        assert.ok(
          (track.surfaceCoverage?.(distance) ?? 1) > 0,
          `${device.id}: requires running surface`,
        );
        assert.ok(
          !track.tubeAt?.(distance),
          `${device.id}: flat gate must not occupy a curved tube`,
        );
        assert.ok(
          track.sample(distance).position.toArray().every(Number.isFinite),
        );
      }
      for (const jump of track.jumps ?? []) {
        const start = device.distance - device.length / 2;
        const end = device.distance + device.length / 2;
        if (end < jump.takeoff)
          assert.ok(
            jump.takeoff - end >= (device.type === 'ion' ? 800 : 350),
            `${device.id}: attack too close to ${jump.id} takeoff`,
          );
        if (start > jump.recovery)
          assert.ok(
            start - jump.recovery >= 150,
            `${device.id}: allow landing recovery after ${jump.id}`,
          );
      }
      const next =
        attacks[i + 1] ?? (track.closed !== false ? attacks[0] : null);
      if (device.type === 'ion' && next) {
        const gap =
          next.distance -
          device.distance +
          (i + 1 === attacks.length ? track.length : 0);
        assert.ok(
          gap >= COMBAT_RULES.wakeDuration * VECTOR_PROPULSION.cruiseSpeed,
          `${device.id}: its active wake would block the next weapon`,
        );
      }
    }
  });

  test(`${folder.name}: player and rival can both activate every combat gate with local motion`, async (t) => {
    const createMotion =
      definition.racing.createMotion ?? createMagneticRuntime;
    const collisionWorld = withMagneticBoundaries(track);
    const dynamics = await createRapierWorld({ collisionWorld });
    t.after(() => dynamics.dispose());
    for (const device of attacks) {
      const combat = createCombatSimulation({ track });
      const actors = ['player', 'rival'].map((combatId, index) => {
        const state = {
          ...createVehicleState(),
          distance: device.distance - 12 - index * 18,
          lateral: device.lateral,
          speed: 100,
        };
        const runtime = createDeviceRuntime({
          track,
          devices,
          combat,
          combatId,
          motion: createMotion({
            track,
            collisionWorld,
            dynamics,
            presentation: false,
          }),
        });
        runtime.reset({ state });
        return { state, runtime, combatId };
      });
      try {
        for (let tick = 0; tick < 120; tick++) {
          for (const { state, runtime } of actors)
            runtime.beginAdvance(state, { throttle: 1 }, 1 / 120);
          dynamics.step(1 / 120);
          for (const { state, runtime } of actors) runtime.finishAdvance(state);
          actors[0].runtime.advanceInteractions(1 / 120);
          if (actors.every(({ state }) => state.distance > device.distance + 2))
            break;
        }
        for (const { runtime, combatId } of actors) {
          assert.notEqual(
            runtime.pose(1)?.grounded,
            false,
            `${device.id}: supported approach`,
          );
          assert.equal(
            combat.view().emitters[combatId]?.kind,
            device.type,
            `${device.id}: independent activation for ${combatId}`,
          );
        }
      } finally {
        for (const { runtime } of actors) runtime.dispose();
      }
    }
  });
}
