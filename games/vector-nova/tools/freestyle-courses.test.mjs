import test from 'node:test';
import assert from 'node:assert/strict';
import createSkywell from '../src/levels/zephyr-skywell/index.js';
import createOriel from '../src/levels/freestyle-oriel/index.js';
import createRavel from '../src/levels/freestyle-ravel/index.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import { createVehicleState } from '../src/physics/index.js';
import { createTransferPilot } from './freestyle-pilot.mjs';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';

// Every bank and pipe must remain reachable after landing scenery becomes
// solid. Bounded native transfers use ordinary held, quantized controls rather
// than placing a ship on the receiver or driving normal-speed full laps.
for (const [name, createLevel] of [
  ['Skywell', createSkywell],
  ['Oriel', createOriel],
  ['Ravel', createRavel],
]) {
  test(`${name}'s five receivers retain clear native catches around solid scenery`, async (t) => {
    const level = createLevel(),
      track = level.createTrack();
    const collisionWorld = await level.createCollisionWorld({ track });
    const dynamics = await level.createDynamics({
      track,
      collisionWorld: withMagneticBoundaries(track, collisionWorld),
    });
    const runtime = createDeviceRuntime({
      track,
      devices: level.racing.createDevices(track),
      equipmentEnabled: false,
      motion: level.createRuntime({
        track,
        collisionWorld,
        dynamics,
        presentation: false,
        settings: { steeringAssist: 0.3 },
      }),
    });
    t.after(() => {
      runtime.dispose();
      dynamics.dispose();
      collisionWorld.dispose();
    });
    for (const [index, jump] of track.jumps.entries()) {
      await t.test(jump.label, () => {
        const state = {
          ...createVehicleState('shrike'),
          ...track.scenarios[`jump${index + 1}-approach`],
        };
        runtime.reset({ state, seed: 7 });
        const pilot = createTransferPilot(track, {
            reaction: 0.15,
            quantum: 0.25,
          }),
          events = [];
        for (let tick = 0; tick < 2400; tick++) {
          const emitted = runtime.advance(
            state,
            pilot({ state, motion: runtime.snapshot(), pose: runtime.pose(1) }),
            1 / 120,
          );
          events.push(...emitted);
          if (
            emitted.some((event) =>
              ['freestyle-bank', 'jump-miss'].includes(event.type),
            )
          )
            break;
        }
        assert.equal(
          events.find((event) => event.type === 'jump-transfer')?.payload
            .outcome,
          'landed',
        );
        assert.equal(
          events.find((event) => event.type === 'freestyle-bank')?.payload
            .landed,
          true,
        );
        assert.equal(
          events.some((event) =>
            ['impact', 'road-recovery'].includes(event.type),
          ),
          false,
          'the accepted flight and catch corridor must stay clear of scenery',
        );
        assert.equal(runtime.pose(1).grounded, true);
      });
    }
  });
}
