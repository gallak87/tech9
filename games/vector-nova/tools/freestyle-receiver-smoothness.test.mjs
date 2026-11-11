import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as T from 'three';
import { createOrielFreestyleTrack } from '../src/levels/freestyle-oriel/track/model.js';
import { createRavelFreestyleTrack } from '../src/levels/freestyle-ravel/track/model.js';
import createOrielLevel from '../src/levels/freestyle-oriel/index.js';
import { createVehicleState } from '../src/physics/index.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { createCameraRig } from '../src/camera/index.js';

for (const [name, createTrack, nodeHash] of [
  [
    'Oriel',
    createOrielFreestyleTrack,
    '333a2eac030d4ab789e7fd57603206530ec0cac5cc36c4d2a42013b5aa59389e',
  ],
  [
    'Ravel',
    createRavelFreestyleTrack,
    '2303a8750bd7edd9bfa59cbb2e809006001e1506fece4af8f5a092bdc4c97500',
  ],
]) {
  test(`${name} keeps the approved metre nodes while removing chord derivative kicks`, () => {
    const track = createTrack(),
      hash = createHash('sha256');
    for (let s = 0; s < track.length; s++)
      hash.update(JSON.stringify(track.sample(s).position.toArray()));
    hash.update(JSON.stringify(track.sample(track.length).position.toArray()));
    assert.equal(
      hash.digest('hex'),
      nodeHash,
      'the approved route nodes stay exact',
    );
    for (let s = 0.125; s < track.length; s += 0.25) {
      const a = Math.floor(s),
        b = Math.min(a + 1, track.length);
      const oldChord = track
        .sample(a)
        .position.lerp(track.sample(b).position, (s - a) / (b - a));
      assert.ok(
        track.sample(s).position.distanceTo(oldChord) < 0.002,
        'smoothing may only move points by less than two millimetres between retained nodes',
      );
    }
  });
}

test('Oriel pipe and bank contact frames have no metre-frequency angular impulses', () => {
  const track = createOrielFreestyleTrack();
  for (const [start, end] of [
    [track.tubes[0].start + 2, track.tubes[0].end - 2],
    [track.jumps[1].landingStart + 2, track.jumps[1].recovery - 2],
  ]) {
    for (const lateral of [0, 10])
      for (let s = Math.ceil(start); s < end; s += 0.5) {
        const before = track.sampleSurface(s - 0.003, lateral, {
          geometryOnly: true,
        });
        const after = track.sampleSurface(s + 0.003, lateral, {
          geometryOnly: true,
        });
        assert.ok(
          before.quaternion.angleTo(after.quaternion) < 0.0002,
          `the actual support/camera chart kicks across six millimetres at ${s}m/${lateral}m`,
        );
      }
  }
});

test('Oriel native driving and chase remain supported through the first curved receivers', async (t) => {
  const level = createOrielLevel(),
    track = level.createTrack();
  const collisionWorld = await level.createCollisionWorld({ track });
  let dynamics, runtime;
  t.after(() => {
    runtime?.dispose();
    dynamics?.dispose();
    collisionWorld.dispose();
  });
  dynamics = await level.createDynamics({
    track,
    collisionWorld: withMagneticBoundaries(track, collisionWorld),
  });
  runtime = level.createRuntime({
    track,
    collisionWorld,
    dynamics,
    presentation: false,
    settings: { steeringAssist: 0.3 },
  });
  for (const [label, distance] of [
    ['first pipe', track.tubes[0].entryEnd + 5],
    ['second bank', track.jumps[1].landingStart + 60],
  ]) {
    const state = {
      ...createVehicleState('shrike'),
      distance,
      speed: 85,
      lateral: 10,
    };
    runtime.reset({ state, seed: 7 });
    const camera = new T.PerspectiveCamera(64, 16 / 9, 0.2, 36000);
    const rig = createCameraRig(camera, level.camera);
    let previous = null;
    for (let tick = 0; tick < 400; tick++) {
      const events = runtime.advance(
        state,
        { throttle: 1, brake: 0, boost: false, steer: 0, airbrake: false },
        1 / 120,
      );
      const pose = runtime.pose(1);
      rig.update(track, state, 1 / 120, { worldPose: pose });
      assert.equal(
        pose.grounded,
        true,
        `${label} must keep native magnetic support`,
      );
      assert.equal(
        events.some((event) =>
          ['impact', 'road-recovery'].includes(event.type),
        ),
        false,
        `${label} must not turn its own driving skin into an obstacle`,
      );
      assert.ok(
        [
          ...pose.position.toArray(),
          ...camera.position.toArray(),
          ...camera.quaternion.toArray(),
        ].every(Number.isFinite),
      );
      if (previous && tick > 20) {
        assert.ok(
          pose.quaternion.angleTo(previous.ship) < 0.015,
          `${label} has a native hull kick`,
        );
        assert.ok(
          camera.quaternion.angleTo(previous.camera) < 0.015,
          `${label} has a chase camera kick`,
        );
      }
      previous = {
        ship: pose.quaternion.clone(),
        camera: camera.quaternion.clone(),
      };
    }
  }
});
