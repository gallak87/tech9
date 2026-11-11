import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import createShatterline from '../src/levels/shatterline/index.js';
import { createVehicleState } from '../src/physics/index.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { getCollisionHull } from '../src/ships/collision-hulls.js';
import { createLandingFeedback } from '../src/presentation/landing-feedback.js';

const DT = 1 / 120;
const drive = { throttle: 1, steer: 0 };

test('native powered tube contact presents one supported landing without changing physics', async (t) => {
  const level = createShatterline();
  const track = level.createTrack();
  const collisionWorld = level.createCollisionWorld({ track });
  const dynamics = await level.createDynamics({
    track,
    collisionWorld: withMagneticBoundaries(track, collisionWorld),
  });
  const runtime = level.createRuntime({
    track,
    collisionWorld,
    dynamics,
    presentation: false,
    settings: { steeringAssist: 0.3 },
  });
  t.after(() => {
    runtime.dispose();
    dynamics.dispose();
    collisionWorld.dispose();
  });
  const tube = track.tubes[0],
    lateral = 28;
  const state = {
    ...createVehicleState('kestrel'),
    distance: (tube.entryEnd + tube.exitStart) / 2,
    lateral,
    speed: 80,
  };
  runtime.reset({ reason: 'scenario', state });
  runtime.advance(state, drive, DT);
  const feedback = createLandingFeedback();
  assert.equal(runtime.jump(state), true);
  feedback.sample({ clock: state.time, grounded: false });
  // Reuse the existing equipment-jump-landing native contact fixture: resume
  // a descending powered hop just above the real curved production surface.
  const station = state.distance + 8,
    frame = track.sampleSurface(station, lateral);
  const hull = getCollisionHull('kestrel');
  let extent = 0;
  for (let i = 0; i < hull.vertices.length; i += 3)
    extent = Math.max(
      extent,
      -new T.Vector3()
        .fromArray(hull.vertices, i)
        .applyQuaternion(frame.quaternion)
        .dot(frame.up),
    );
  const airborne = runtime.snapshot();
  airborne.currentPose = {
    position: frame.position
      .clone()
      .addScaledVector(frame.up, extent + 0.15)
      .toArray(),
    quaternion: frame.quaternion.toArray(),
  };
  airborne.previousPose = structuredClone(airborne.currentPose);
  Object.assign(airborne.flight, {
    velocity: frame.tangent
      .clone()
      .multiplyScalar(80)
      .addScaledVector(frame.up, -20)
      .toArray(),
    angularVelocity: [0, 0, 0],
    elapsed: 1.15,
    hitAt: 1.15,
    contacts: 1,
    equipmentGuide: { distance: station, lateral, height: 0.72 },
  });
  state.time += 1.15;
  runtime.restore(airborne);
  const events = [],
    cues = [];
  for (let tick = 0; tick < 24; tick++) {
    const batch = runtime.advance(state, drive, DT);
    events.push(...batch);
    const pose = runtime.pose(1),
      before = structuredClone(state);
    const transfer = batch.some(({ type }) => type === 'jump-transfer');
    const physics = transfer ? dynamics.snapshot() : null;
    const motion = transfer ? runtime.snapshot() : null;
    for (const event of batch) feedback.event({ ...event, time: state.time });
    const cue = feedback.sample({
      clock: state.time,
      grounded: pose.grounded,
      recovering: pose.recovering,
    });
    feedback.read();
    if (cue) cues.push(cue);
    assert.deepEqual(state, before, 'presentation cannot modify the vehicle');
    if (transfer) {
      assert.deepEqual(
        dynamics.snapshot(),
        physics,
        'contact physics are unchanged',
      );
      assert.deepEqual(
        runtime.snapshot(),
        motion,
        'motion and replay state are unchanged',
      );
    }
  }
  assert.equal(
    events.some(({ type }) => type === 'jump-launch'),
    false,
    'powered hops do not require an authored launch event',
  );
  const transfers = events.filter(({ type }) => type === 'jump-transfer');
  assert.equal(transfers.length, 1);
  assert.equal(transfers[0].payload.id, 'equipment-jump');
  assert.equal(transfers[0].payload.outcome, 'landed');
  assert.equal(
    cues.length,
    1,
    'one confirmed contact produces exactly one cue',
  );
  assert.equal(cues[0].type, 'landing-catch');
  assert.equal(runtime.pose(1).grounded, true);
  assert.equal(feedback.read().supported, true);
});
