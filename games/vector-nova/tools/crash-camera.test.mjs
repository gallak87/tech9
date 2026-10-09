import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createCameraRig } from '../src/camera/index.js';

const dt = 1 / 60;
const track = {
  sample(distance) {
    return {
      position: new T.Vector3(0, 0, distance),
      quaternion: new T.Quaternion(),
      right: new T.Vector3(1, 0, 0),
      up: new T.Vector3(0, 1, 0),
      tangent: new T.Vector3(0, 0, 1),
    };
  },
};
function setup(options = { preserveFlightView: true }) {
  const camera = new T.PerspectiveCamera(64, 16 / 9, 0.2, 14000);
  const rig = createCameraRig(camera, options);
  const state = { distance: 100, lateral: 0, speed: 90 };
  const pose = {
    position: new T.Vector3(0, 0.72, 100),
    quaternion: new T.Quaternion(),
    grounded: false,
    recovering: false,
  };
  rig.update(track, state, dt);
  rig.update(track, state, dt, { worldPose: pose });
  return { camera, rig, state, pose };
}
function step(probe, extra = {}) {
  probe.rig.update(track, probe.state, dt, { worldPose: probe.pose, ...extra });
}
function sameView(a, b) {
  assert.ok(a.position.distanceTo(b.position) < 1e-9);
  assert.ok(a.quaternion.angleTo(b.quaternion) < 1e-7);
  assert.equal(a.fov, b.fov);
}

test('confirmed failure freezes the eye and pans without inheriting hull tumble or zooming', () => {
  const straight = setup(),
    tumbling = setup();
  const incoming = straight.camera.clone();
  for (const probe of [straight, tumbling]) {
    probe.pose.recovering = true;
    step(probe);
    sameView(probe.camera, incoming);
  }
  for (let i = 1; i <= 90; i++) {
    for (const probe of [straight, tumbling]) {
      probe.pose.position.set(0, 0.72 + Math.sin(i / 15) * 3, 100 + i * 1.5);
    }
    tumbling.pose.quaternion.setFromEuler(
      new T.Euler(i * 0.16, i * 0.2, i * 0.3),
    );
    step(straight);
    step(tumbling);
    sameView(straight.camera, tumbling.camera);
    assert.deepEqual(
      straight.camera.position.toArray(),
      incoming.position.toArray(),
    );
    assert.equal(straight.camera.fov, incoming.fov);
    assert.ok(straight.camera.up.y > 0.9, 'stable horizon during the tumble');
    if (i > 20) {
      straight.camera.updateMatrixWorld();
      const screen = straight.pose.position.clone().project(straight.camera);
      assert.ok(Math.abs(screen.x) < 0.9 && Math.abs(screen.y) < 0.9);
      assert.ok(screen.z > -1 && screen.z < 1);
    }
  }
  assert.ok(straight.camera.position.distanceTo(straight.pose.position) > 140);
  assert.ok(straight.camera.quaternion.angleTo(incoming.quaternion) > 0.01);
});

test('bounces leave the eye fixed and the pan settles during long manual recovery', () => {
  const probe = setup();
  probe.pose.recovering = true;
  step(probe);
  const initialDistance = probe.camera.position.distanceTo(probe.pose.position);
  for (let i = 0; i < 180; i++) step(probe);
  assert.equal(
    probe.camera.position.distanceTo(probe.pose.position),
    initialDistance,
  );
  const before = probe.camera.clone();
  probe.pose.position.y += 2;
  step(probe);
  assert.deepEqual(probe.camera.position.toArray(), before.position.toArray());
  assert.ok(probe.camera.quaternion.angleTo(before.quaternion) < 0.05);
  for (let i = 0; i < 600; i++) step(probe);
  const settled = probe.camera.clone();
  for (let i = 0; i < 60; i++) step(probe);
  sameView(probe.camera, settled);
});

test('reduced motion keeps the fixed eye, pause freezes the pan and reset clears history', () => {
  const probe = setup();
  probe.pose.recovering = true;
  step(probe, { reducedMotion: true });
  const initial = probe.camera.position.clone();
  for (let i = 0; i < 120; i++) step(probe, { reducedMotion: true });
  assert.ok(probe.camera.position.distanceTo(initial) < 1e-9);
  const paused = probe.camera.clone();
  probe.pose.position.x += 5;
  for (let i = 0; i < 120; i++) step(probe, { paused: true });
  sameView(probe.camera, paused);
  step(probe);
  assert.ok(probe.camera.quaternion.angleTo(paused.quaternion) > 0.01);
  assert.deepEqual(probe.camera.position.toArray(), paused.position.toArray());
  probe.rig.reset();
  probe.rig.update(track, probe.state, dt);
  const fresh = new T.PerspectiveCamera(64, 16 / 9, 0.2, 14000);
  createCameraRig(fresh, { preserveFlightView: true }).update(
    track,
    probe.state,
    dt,
  );
  sameView(probe.camera, fresh);
});

test('supported landing and checkpoint recovery carry composition then blend to ordinary chase', () => {
  for (const teleport of [0, 500]) {
    // Crash return is shared even on a circuit without preserved normal flight.
    const probe = setup({});
    probe.pose.recovering = true;
    step(probe);
    for (let i = 0; i < 60; i++) step(probe);
    const incoming = probe.camera.clone();
    probe.state.distance += teleport;
    probe.pose.position.z += teleport;
    probe.pose.grounded = true;
    probe.pose.recovering = false;
    step(probe);
    incoming.position.z += teleport;
    sameView(probe.camera, incoming);
    for (let i = 0; i < 120; i++) step(probe);
    const normal = new T.PerspectiveCamera(64, 16 / 9, 0.2, 14000);
    createCameraRig(normal).update(track, probe.state, dt, {
      worldPose: probe.pose,
    });
    assert.ok(probe.camera.position.distanceTo(normal.position) < 0.001);
    assert.ok(probe.camera.quaternion.angleTo(normal.quaternion) < 0.001);
  }
});

test('healthy flight keeps existing behavior and a free-camera return can rejoin an ongoing crash', () => {
  const explicit = setup(),
    legacy = setup();
  delete legacy.pose.recovering;
  for (let i = 0; i < 60; i++) {
    explicit.pose.position.z += 1.5;
    legacy.pose.position.copy(explicit.pose.position);
    step(explicit);
    step(legacy);
    sameView(explicit.camera, legacy.camera);
  }
  explicit.pose.recovering = true;
  step(explicit);
  const restored = explicit.camera.clone();
  explicit.rig.reset();
  step(explicit);
  sameView(explicit.camera, restored);
});
