import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import createLevel from '../src/levels/worldspire/index.js';
import { createCameraRig } from '../src/camera/index.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { createVehicleState, getVehiclePace } from '../src/physics/index.js';
import { COLLISION_HULLS } from '../src/ships/collision-hulls.js';

test('Worldspire supported S-bend begins safe-frame aim before a hard camera correction', async (t) => {
  const level = createLevel(),
    track = level.createTrack();
  const collision = level.createCollisionWorld({ track });
  const native = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(track, collision),
  });
  let actor;
  const dynamics = {
    ...native,
    createActor(...args) {
      actor = native.createActor(...args);
      return actor;
    },
  };
  const runtime = level.createRuntime({
    track,
    collisionWorld: collision,
    dynamics,
    settings: { steeringAssist: 0.3 },
    presentation: false,
  });
  t.after(() => {
    runtime.dispose();
    native.dispose();
    collision.dispose();
  });
  const results = [];
  for (const shipId of ['kestrel', 'shrike'])
    for (const boost of [false, true]) {
      const hull = COLLISION_HULLS[shipId].bounds;
      const bounds = new T.Box3(
        new T.Vector3(...hull.min),
        new T.Vector3(...hull.max),
      );
      const corners = [];
      for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
          for (const z of [bounds.min.z, bounds.max.z])
            corners.push(new T.Vector3(x, y, z));
      const peaks = [0, 0];
      for (const distance of [3400, 3420, 3460]) {
        const pace = getVehiclePace(shipId, track.pace);
        const state = {
          ...createVehicleState(shipId),
          distance,
          lateral: 0,
          speed: boost ? pace.boostSpeed : pace.cruiseSpeed,
        };
        native.reset();
        runtime.reset({ reason: 'initialize', state, seed: 7 });
        const subject = new T.Object3D();
        const cameras = [0, 1].map(
          () => new T.PerspectiveCamera(68, 16 / 9, 0.2, 22000),
        );
        const rigs = cameras.map((camera, i) =>
          createCameraRig(
            camera,
            { ...level.camera, ...(i ? {} : { safeFrameInset: 0 }) },
            bounds,
          ),
        );
        const previous = [null, null],
          before = [null, null];
        for (let tick = 0; tick < 60; tick++) {
          const events = runtime.advance(
            state,
            { throttle: 1, steer: 0, boost },
            1 / 120,
          );
          const pose = runtime.pose(1);
          assert.equal(
            pose.grounded,
            true,
            'probe must remain on the supported production skin',
          );
          assert.notEqual(pose.recovering, true);
          assert.equal(
            actor.read().contacts.length,
            0,
            'framing probe must not measure a real impact',
          );
          assert.equal(state.resetCount, 0);
          assert.equal(
            events.some((event) =>
              ['jump-launch', 'road-departure', 'road-recovery'].includes(
                event.type,
              ),
            ),
            false,
          );
          if (tick % 2) continue;
          subject.position.copy(pose.position);
          subject.quaternion.copy(pose.quaternion);
          subject.updateWorldMatrix(true, false);
          for (let i = 0; i < rigs.length; i++) {
            const camera = cameras[i];
            rigs[i].update(track, state, 1 / 60, { subject, worldPose: pose });
            if (previous[i] && before[i] && tick > 8) {
              const change = Math.abs(
                camera.quaternion.angleTo(previous[i]) -
                  previous[i].angleTo(before[i]),
              );
              peaks[i] = Math.max(peaks[i], change);
            }
            before[i] = previous[i];
            previous[i] = camera.quaternion.clone();
          }
          cameras[1].updateMatrixWorld();
          const frame = level.camera.safeFrame(cameras[1].aspect);
          for (const corner of corners) {
            const point = corner
              .clone()
              .applyMatrix4(subject.matrixWorld)
              .project(cameras[1]);
            assert.ok(
              point.x >= frame.left - 0.01 &&
                point.x <= frame.right + 0.01 &&
                point.y >= frame.bottom - 0.01 &&
                point.y <= frame.top + 0.01,
              'soft aim retains the unchanged hard hull visibility frame',
            );
          }
        }
      }
      assert.ok(
        peaks[1] < peaks[0] * 0.85,
        `${shipId}/${boost}: early aim must reduce the reproduced correction spike`,
      );
      assert.ok(
        peaks[1] < 0.0085,
        `${shipId}/${boost}: camera correction exceeded the bounded smoothness limit`,
      );
      results.push({
        shipId,
        boost,
        oldAngularStepChange: peaks[0],
        angularStepChange: peaks[1],
      });
    }
  t.diagnostic(JSON.stringify(results));
});
