import test from 'node:test';
import assert from 'node:assert/strict';
import createOriel from '../src/levels/freestyle-oriel/index.js';
import createRavel from '../src/levels/freestyle-ravel/index.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import { createVehicleState } from '../src/physics/index.js';
import { createTransferPilot } from './freestyle-pilot.mjs';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';

// One bounded physical pipe catch per new course, not another long full-chain
// handling campaign. The same production hull, contact triangles and shared
// settling rule must work after changing route composition and pipe width.
for (const [name, createLevel, index] of [
  ['Oriel', createOriel, 0],
  ['Ravel', createRavel, 1],
]) {
  test(`${name}'s new pipe receives a stock hull through native contacts`, async (t) => {
    const level = createLevel(),
      track = level.createTrack();
    const collisionWorld = level.createCollisionWorld({ track });
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
    const state = {
      ...createVehicleState('shrike'),
      ...track.scenarios[`jump${index + 1}-approach`],
    };
    runtime.reset({ state, seed: 7 });
    const pilot = createTransferPilot(track, { reaction: 0.15, quantum: 0.25 }),
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
      events.find((event) => event.type === 'jump-transfer')?.payload.outcome,
      'landed',
    );
    assert.equal(
      events.find((event) => event.type === 'freestyle-bank')?.payload.landed,
      true,
    );
    assert.equal(
      events.some((event) => event.type === 'road-recovery'),
      false,
    );
    assert.equal(runtime.pose(1).grounded, true);
  });
}
