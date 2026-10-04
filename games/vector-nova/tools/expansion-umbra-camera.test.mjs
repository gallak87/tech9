import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import createLevel from '../src/levels/umbra/index.js';
import { buildUmbraRoad } from '../src/levels/umbra/track/index.js';
import { createCameraRig } from '../src/camera/index.js';

test('Elevated Umbra approaches expose actual lower decks before committing to both gaps', () => {
  const level = createLevel(),
    track = level.createTrack();
  const road = buildUmbraRoad(track);
  road.group.updateMatrixWorld(true);
  try {
    for (const jump of track.jumps) {
      for (const before of [150, 80, 20]) {
        const camera = new T.PerspectiveCamera(61, 1.6, 0.1, 22000);
        createCameraRig(camera, {
          ...level.camera,
          safeFrame: undefined,
        }).update(
          track,
          { distance: jump.takeoff - before, lateral: 0, speed: 0 },
          1,
        );
        camera.updateMatrixWorld(true);
        let visible = 0;
        for (const offset of [10, 30, 65, 100]) {
          const frame = track.sample(jump.landingStart + offset);
          const point = frame.position.clone().addScaledVector(frame.up, 0.1);
          const screen = point.clone().project(camera);
          const distance = point.distanceTo(camera.position);
          const ray = new T.Raycaster(
            camera.position,
            point.clone().sub(camera.position).normalize(),
            0.1,
            distance - 0.2,
          );
          if (
            Math.abs(screen.x) < 0.95 &&
            Math.abs(screen.y) < 0.9 &&
            !ray.intersectObject(road.group, true).length
          )
            visible++;
        }
        assert.ok(
          visible >= (before === 150 ? 2 : 3),
          `${jump.id}, ${before}m: lower deck hidden`,
        );
      }
    }
  } finally {
    road.dispose();
  }
});

test('Jump preview transports continuously and leaves unrelated circuits unchanged', () => {
  const level = createLevel(),
    track = level.createTrack();
  const camera = new T.PerspectiveCamera(61, 1.6, 0.1, 22000);
  const rig = createCameraRig(camera, {
    ...level.camera,
    safeFrame: undefined,
  });
  const state = {
    distance: track.jumps[0].takeoff - 330,
    lateral: 0,
    speed: 100,
  };
  let previous;
  for (let i = 0; i < 190; i++) {
    rig.update(track, state, 1 / 60);
    assert.ok(
      [...camera.position, ...camera.quaternion].every(Number.isFinite),
    );
    if (previous)
      assert.ok(
        camera.position.distanceTo(previous) < 3,
        'approach camera jumped',
      );
    previous = camera.position.clone();
    state.distance += state.speed / 60;
  }
  const ordinary = new T.PerspectiveCamera(61, 1.6, 0.1, 22000);
  const optIn = new T.PerspectiveCamera(61, 1.6, 0.1, 22000);
  const local = { ...level.camera, safeFrame: undefined };
  createCameraRig(ordinary, { ...local, jumpPreview: undefined }).update(
    track,
    { distance: 400, lateral: 0, speed: 80 },
    1,
  );
  createCameraRig(optIn, local).update(
    track,
    { distance: 400, lateral: 0, speed: 80 },
    1,
  );
  assert.deepEqual(optIn.position.toArray(), ordinary.position.toArray());
  assert.deepEqual(optIn.quaternion.toArray(), ordinary.quaternion.toArray());
});

test('Flight dolly retains the takeoff pose and smoothly restores craft proximity', () => {
  const level = createLevel(),
    track = level.createTrack();
  const distance = track.jumps[0].takeoff - 1;
  const frame = track.sample(distance);
  const pose = {
    position: frame.position.clone().addScaledVector(frame.up, 0.72),
    quaternion: frame.quaternion.clone(),
    grounded: false,
  };
  const state = { distance, speed: 100, lateral: 0 };
  const camera = new T.PerspectiveCamera(61, 1.6, 0.1, 22000);
  const rig = createCameraRig(camera, {
    ...level.camera,
    safeFrame: undefined,
  });
  rig.update(track, state, 1, { worldPose: { ...pose, grounded: true } });
  const incoming = camera.position.clone(),
    rotation = camera.quaternion.clone();
  rig.update(track, state, 1 / 60, { worldPose: pose });
  assert.ok(camera.position.distanceTo(incoming) < 1e-8);
  assert.ok(camera.quaternion.angleTo(rotation) < 1e-7);
  const initialDistance = camera.position.distanceTo(pose.position);
  const initialForward = new T.Vector3(0, 0, -1)
    .applyQuaternion(camera.quaternion)
    .dot(frame.tangent);
  let previous = camera.position.clone();
  for (let i = 0; i < 90; i++) {
    rig.update(track, state, 1 / 60, { worldPose: pose });
    assert.ok(camera.position.distanceTo(previous) < 1, 'flight camera jumped');
    previous.copy(camera.position);
  }
  assert.ok(camera.position.distanceTo(pose.position) < initialDistance * 0.7);
  assert.ok(
    new T.Vector3(0, 0, -1)
      .applyQuaternion(camera.quaternion)
      .dot(frame.tangent) >
      initialForward + 0.02,
    'late flight returns toward forward chase',
  );
});
