import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import createLevel from '../src/levels/zephyr/index.js';
import { createCameraRig } from '../src/camera/index.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { createVehicleState, STEERING_ASSIST } from '../src/physics/index.js';

const DT = 1 / 120;
const UP = new T.Vector3(0, 1, 0);
const FORWARD = new T.Vector3(0, 0, 1);

// Distinguish actual yaw from the pitch/roll needed to follow a banked deck.
function supportedYaw(before, after) {
  const normal = UP.clone().applyQuaternion(after.quaternion);
  const transported = new T.Quaternion()
    .setFromUnitVectors(UP.clone().applyQuaternion(before.quaternion), normal)
    .multiply(before.quaternion);
  const from = FORWARD.clone().applyQuaternion(transported);
  const to = FORWARD.clone().applyQuaternion(after.quaternion);
  return Math.atan2(normal.dot(from.clone().cross(to)), from.dot(to));
}

test('Zephyr opening right bends retain 0.3 neutral yaw without bank-transport assistance', async (t) => {
  const level = createLevel();
  const track = level.createTrack();
  const collisionWorld = level.createCollisionWorld({ track });
  const dynamics = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(track, collisionWorld),
  });
  // Omitted settings exercise the production default. Zero/unit references
  // isolate normal transport from the intentional curvature-yaw contribution.
  const runtimes = [undefined, 0, 1].map((steeringAssist) =>
    level.racing.createMotion({
      track,
      collisionWorld,
      dynamics,
      presentation: false,
      settings: steeringAssist === undefined ? {} : { steeringAssist },
    }),
  );
  t.after(() => {
    for (const runtime of runtimes) runtime.dispose();
    dynamics.dispose();
    collisionWorld.dispose();
  });
  assert.equal(STEERING_ASSIST, 0.3);
  // Covers both bank ramps, the cross-span bend and the flattening approach
  // before the first waterfall boost strip, at the reported 396 km/h.
  for (const distance of [70, 150, 300, 450, 600, 700]) {
    const yaws = runtimes.map((runtime) => {
      dynamics.reset();
      const state = { ...createVehicleState(), distance, speed: 110 };
      runtime.reset({ state });
      let yaw = 0;
      for (let tick = 0; tick < 30; tick++) {
        const before = runtime.pose(1);
        const events = runtime.advance(state, { throttle: 1 }, DT);
        const after = runtime.pose(1);
        assert.ok(after.grounded, `${distance}m: lost road support`);
        assert.ok(
          !events.some(({ type }) =>
            ['impact', 'road-departure', 'jump-launch'].includes(type),
          ),
          `${distance}m: contact/flight contaminated the yaw probe`,
        );
        yaw += supportedYaw(before, after);
      }
      assert.ok(state.distance > distance + 26, 'probe must traverse the bend');
      return yaw;
    });
    assert.ok(
      Math.abs(yaws[1]) < 1e-8,
      `${distance}m: normal transport adds yaw`,
    );
    const fraction = (yaws[0] - yaws[1]) / (yaws[2] - yaws[1]);
    assert.ok(
      Math.abs(fraction - STEERING_ASSIST) < 0.015,
      `${distance}m: neutral assistance fraction ${fraction}`,
    );
  }
});

test('Zephyr cross-span chase stays smooth before the waterfall without spiral camera enlargement', () => {
  const level = createLevel();
  const track = level.createTrack();
  const camera = new T.PerspectiveCamera(61, 16 / 10, 0.1, 12000);
  const bounds = new T.Box3(
    new T.Vector3(-2.25, -0.12, -3.51),
    new T.Vector3(2.25, 1.8, 3.7),
  );
  const rig = createCameraRig(camera, level.camera, bounds);
  let previous = null;
  for (
    let distance = 55;
    distance < track.jumps[0].takeoff - 90;
    distance += 110 * DT
  ) {
    const state = { distance, speed: 110, lateral: 0 };
    assert.equal(level.camera.chaseHeight(track, state), 5);
    assert.equal(level.camera.chaseDistance(track, state), 12.5);
    assert.equal(level.camera.lookAhead(track, state), 38);
    const before = { ...state };
    rig.update(track, state, DT);
    assert.deepEqual(state, before, 'camera cannot change handling state');
    if (previous) {
      assert.ok(
        camera.quaternion.angleTo(previous.quaternion) < 0.025,
        `${distance}m: abrupt chase rotation`,
      );
      assert.ok(
        camera.position.distanceTo(previous.position) < 2,
        `${distance}m: abrupt chase translation`,
      );
    }
    previous = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
    };
  }
});
