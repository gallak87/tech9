import test from 'node:test';
import assert from 'node:assert/strict';
import createLevel from './index.js';
import { createRacers } from '../../race/racers.js';
import { createRapierWorld } from '../../physics/rapier-world.js';
import { withMagneticBoundaries } from '../../physics/magnetic-boundaries.js';
import { createInterceptorMotion } from '../../events/interceptor-motion.js';
import { createInterceptorField } from '../../events/interceptor-field.js';
import { createInterceptorEvent } from '../../events/interceptor.js';
import { createDeviceRuntime } from '../../pickups/runtime.js';

// A Shrike-only roll probe cannot catch the courier's compound hull contacting
// the next owned deck chunk. Keep the real boss, three allies and both turns.
test('the real Bulwark squad completes the corkscrew and closed loop with all reached Breakwater volleys', async () => {
  const level = createLevel(),
    track = level.createTrack(),
    devices = level.racing.createDevices(track),
    collisionWorld = level.createCollisionWorld({ track });
  const dynamics = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(track, collisionWorld),
  });
  const mission = createInterceptorEvent({
    bossId: 'bulwark',
    targetId: 'bulwark',
    difficulty: 'hard',
    routeLength: track.length,
    escapeDistance: track.length * 2,
  });
  const field = createInterceptorField({
    track,
    bossId: 'bulwark',
    getCounterattack: () => mission.snapshot().counterattack,
  });
  const bossImpacts = [];
  const racers = createRacers({
    track,
    devices,
    field,
    dynamics,
    continuous: true,
    createRuntime(specification) {
      const context = {
        track,
        collisionWorld,
        dynamics,
        settings: { steeringAssist: 0.3 },
        presentation: false,
      };
      const runtime = createDeviceRuntime({
        track,
        devices:
          specification.id === 'bulwark'
            ? devices.filter((device) => device.type === 'aegis')
            : devices,
        combatId: specification.id,
        motion:
          specification.id === 'bulwark'
            ? createInterceptorMotion(context, {
                createMotion: level.racing.createMotion,
                getYaw: () => mission.snapshot().counterattack.yaw,
              })
            : level.racing.createMotion(context),
      });
      const finish = runtime.finishAdvance.bind(runtime);
      runtime.finishAdvance = (state) => {
        const events = finish(state);
        if (specification.id === 'bulwark')
          for (const event of events)
            if (event.type === 'impact')
              bossImpacts.push({ distance: state.distance, ...event.payload });
        return events;
      };
      return runtime;
    },
  });
  try {
    racers.reset();
    const boss = racers.opponents[0];
    let minimumCruise = Infinity;
    for (
      let tick = 0;
      tick < 90 * 120 && boss.state.distance < track.length * 1.3;
      tick++
    ) {
      racers.advance(1 / 120);
      mission.step(1 / 120, {
        targetDistance: boss.state.distance,
        playerDistance: boss.state.distance - 100,
      });
      if (tick > 10 * 120)
        minimumCruise = Math.min(minimumCruise, boss.state.speed);
    }
    assert.ok(
      boss.state.distance > track.length * 1.3,
      `actual compound hull continued to ${boss.state.distance.toFixed(1)} m`,
    );
    for (const opponent of racers.opponents.slice(1))
      assert.ok(
        opponent.state.distance > track.length * 1.2,
        `${opponent.specification.id} completed the full loop and corkscrew`,
      );
    assert.ok(
      minimumCruise > 70,
      `courier remains moving at ${minimumCruise.toFixed(1)} m/s`,
    );
    assert.equal(bossImpacts.length, 0, JSON.stringify(bossImpacts));
    assert.deepEqual(
      mission.snapshot().counterattacks.map((attack) => attack.shots),
      [2, 2, 2],
    );
  } finally {
    racers.dispose();
    dynamics.dispose();
  }
});
