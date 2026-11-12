import test from 'node:test';
import assert from 'node:assert/strict';
import createSkywell from '../src/levels/zephyr-skywell/index.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import { createVehicleState } from '../src/physics/index.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { createLandingFeedback } from '../src/presentation/landing-feedback.js';
import { FREESTYLE_RULES } from '../src/freestyle/rules.js';
import { createTransferPilot } from './freestyle-pilot.mjs';

test('native Freestyle support produces one immediate touchdown before the credited points bank', async (t) => {
  const level = createSkywell(),
    track = level.createTrack(),
    collisionWorld = await level.createCollisionWorld({ track }),
    dynamics = await level.createDynamics({
      track,
      collisionWorld: withMagneticBoundaries(track, collisionWorld),
    }),
    runtime = createDeviceRuntime({
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
    ...createVehicleState('kestrel'),
    ...track.scenarios['jump1-approach'],
  };
  runtime.reset({ state, seed: 7 });
  const feedback = createLandingFeedback(),
    pilot = createTransferPilot(track, { reaction: 0.15, quantum: 0.25 }),
    cues = [];
  let touchdownAt = null,
    bankedAt = null;
  const dt = 1 / 120;
  for (let tick = 0; tick < 2400; tick++) {
    const control = pilot({
      state,
      motion: runtime.snapshot(),
      pose: runtime.pose(1),
    });
    const events = runtime.advance(state, control, dt);
    for (const event of events) feedback.event({ ...event, time: state.time });
    const pose = runtime.pose(1),
      cue = feedback.sample({
        clock: state.time,
        grounded: pose?.grounded,
        recovering: pose?.recovering,
      });
    if (cue) {
      cues.push(cue);
      touchdownAt = state.time;
      assert.equal(
        bankedAt,
        null,
        'touchdown does not wait for score judgment',
      );
      assert.equal(pose.grounded, true);
      assert.ok(runtime.snapshot().freestyle.pendingLanding);
      assert.equal(runtime.snapshot().freestyle.score, 0);
    }
    const bank = events.find((event) => event.type === 'freestyle-bank');
    if (bank) {
      assert.equal(bank.payload.landed, true);
      bankedAt = state.time;
      break;
    }
  }
  assert.equal(cues.length, 1, 'native contact sounds once');
  assert.equal(cues[0].type, 'landing-catch');
  assert.ok(bankedAt !== null, 'sustained support still earns the usual grade');
  const delay = bankedAt - touchdownAt;
  assert.ok(delay >= FREESTYLE_RULES.landingWindow - dt - 1e-7);
  assert.ok(delay <= FREESTYLE_RULES.landingWindow + dt);
});
