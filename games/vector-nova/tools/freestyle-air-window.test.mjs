import test from 'node:test';
import assert from 'node:assert/strict';
import createLevel from '../src/levels/zephyr-skywell/index.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import { createVehicleState } from '../src/physics/index.js';
import { SHIPS } from '../src/ships/catalog.js';
import { createTransferPilot } from './freestyle-pilot.mjs';

// Real production triangles, world gravity and finite hull contacts. The pilot
// only supplies held, quantized inputs; it never places a ship on its receiver.
test('the long-air course receives every stock hull and boosted transfers without recovery snaps', async (t) => {
  const level = createLevel(),
    track = level.createTrack();
  const collisionWorld = await level.createCollisionWorld({ track });
  const dynamics = await level.createDynamics({ track, collisionWorld });
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
  assert.equal(
    dynamics.gravity,
    18,
    'native gravity must match the authored airborne controller',
  );
  for (const [shipId, boost] of [
    ...SHIPS.map((ship) => [ship.id, false]),
    ['shrike', true],
  ]) {
    for (let i = 0; i < track.jumps.length; i++) {
      const state = {
        ...createVehicleState(shipId),
        ...track.scenarios[`jump${i + 1}-approach`],
      };
      runtime.reset({ state, seed: 7 });
      const pilot = createTransferPilot(track, {
        reaction: 0.15,
        quantum: 0.25,
      });
      const events = [];
      let launchedAt = null,
        touchdownAt = null;
      for (let tick = 0; tick < 2400; tick++) {
        const input = {
          ...pilot({
            state,
            motion: runtime.snapshot(),
            pose: runtime.pose(1),
          }),
          boost,
        };
        const emitted = runtime.advance(state, input, 1 / 120);
        events.push(...emitted);
        if (emitted.some((event) => event.type === 'jump-launch'))
          launchedAt = state.time;
        if (emitted.some((event) => event.type === 'jump-transfer'))
          touchdownAt = state.time;
        if (
          emitted.some((event) =>
            ['freestyle-bank', 'jump-miss'].includes(event.type),
          )
        )
          break;
      }
      const label = `${shipId}${boost ? ' boosted' : ''} / ${track.jumps[i].label}`;
      assert.equal(
        events.find((event) => event.type === 'jump-transfer')?.payload.outcome,
        'landed',
        label,
      );
      assert.equal(
        events.some((event) => event.type === 'road-recovery'),
        false,
        label,
      );
      assert.ok(
        touchdownAt - launchedAt >= 3.8,
        `${label}: genuine airtime, not a wider catch trigger`,
      );
      assert.equal(runtime.pose(1).grounded, true, label);
      assert.equal(
        events.find((event) => event.type === 'freestyle-bank')?.payload.landed,
        true,
        `${label}: sustained physical support must receive landing credit`,
      );
      assert.ok(
        state.time - touchdownAt >= 0.29,
        `${label}: grading waits for real settlement`,
      );
      if (shipId === 'kestrel' && !boost && i === 0)
        assert.equal(
          events.find((event) => event.type === 'freestyle-bank').payload.clean,
          true,
          'an ordinary settled native arrival keeps its clean grade',
        );
    }
  }
});
