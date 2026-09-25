import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { FollowCamera } from '../src/FollowCamera.js';

test('follow pose respects translated/rotated subject and terrain during interpolation', () => {
  const camera = new PerspectiveCamera();
  let subject = { x: 10, y: 3, z: 20, heading: Math.PI / 2 };
  const rig = new FollowCamera(camera, {
    getTarget: () => subject,
    groundHeight: (x) => (x > 10 && x < 30 ? 50 : 0),
    follow: { distance: 10, height: 4, clearance: 2 },
  });
  rig.update(0);
  assert.ok(camera.position.distanceTo({ x: 0, y: 7, z: 20 }) < 1e-8);
  subject = { x: 50, y: 3, z: 20, heading: Math.PI / 2 };
  rig.update(0.1);
  assert.ok(camera.position.x > 10 && camera.position.x < 30);
  assert.equal(camera.position.y, 52);
  rig.resetMotion();
  rig.update(0);
  assert.equal(camera.position.x, 40);
  assert.equal(camera.position.y, 7);
});

test('mounted pose preserves up, projection and immediate reflection invalidation', () => {
  const camera = new PerspectiveCamera();
  let changes = 0;
  const rig = new FollowCamera(camera, {
    getTarget: () => ({ x: 0, z: 0, heading: 0 }),
    mounted: {
      getPose: () => ({
        position: [2, 3, 4],
        target: [2, 3, 0],
        up: [0.1, 1, 0],
      }),
      near: 0.03,
      fov: 75,
    },
    onChange: () => changes++,
  });
  rig.setMode('mounted');
  rig.update(1 / 60);
  assert.deepEqual(camera.position.toArray(), [2, 3, 4]);
  assert.equal(camera.near, 0.03);
  assert.equal(camera.fov, 75);
  assert.ok(camera.up.x > 0);
  assert.equal(changes, 1);
  rig.setMode('mounted');
  assert.equal(changes, 1);
  rig.setMode('follow');
  rig.update(1 / 60);
  assert.deepEqual(camera.up.toArray(), [0, 1, 0]);
  assert.equal(camera.fov, 58);
  assert.equal(changes, 2);
  const before = camera.position.clone();
  rig.dispose();
  rig.setMode('mounted');
  rig.update(1);
  rig.resetMotion();
  assert.deepEqual(camera.position, before);
  assert.equal(changes, 2);
});

test('camera rejects invalid options and poses, without applying invalid positions', () => {
  const camera = new PerspectiveCamera();
  assert.throws(
    () => new FollowCamera(camera, { getTarget() {}, follow: { fov: 180 } }),
    /Invalid/,
  );
  const rig = new FollowCamera(camera, {
    getTarget: () => ({ x: NaN, z: 1, heading: 0 }),
  });
  assert.throws(() => rig.update(1), /Target/);
  assert.throws(() => rig.setMode('mounted'), /provider/);
  assert.throws(() => rig.setMode('bird'), /Unknown/);
  assert.deepEqual(camera.position.toArray(), [0, 0, 0]);
});
