import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { ChaseCamera } from '../src/camera/ChaseCamera.js';

test('captain camera attaches to the rendered helm and switching restores outside projection', () => {
  const camera = new PerspectiveCamera(58, 1.6, 0.15, 1600),
    boat = { x: 15, z: 110, heading: Math.PI / 2, speed: 6 },
    rules = { state: 'running' };
  let selected,
    pose = {
      position: [15.4, 1.8, 110.5],
      target: [19, 1.3, 110.5],
      up: [0, 1, 0],
    };
  const view = {
    setCameraMode(mode) {
      selected = mode;
    },
    getHelmPose() {
      return pose;
    },
  };
  const owner = new ChaseCamera(camera, boat, rules, view);
  owner.setMode('captain');
  owner.update(1 / 60);
  assert.equal(selected, 'captain');
  assert.deepEqual(camera.position.toArray(), pose.position);
  assert.equal(camera.near, 0.05);
  pose = { ...pose, position: [25.4, 1.8, 110.5], target: [29, 1.3, 110.5] };
  owner.update(1 / 60);
  assert.deepEqual(
    camera.position.toArray(),
    pose.position,
    'interior camera never drifts behind the moving hull',
  );
  owner.setMode('chase');
  owner.update(1 / 60);
  assert.equal(selected, 'chase');
  assert.equal(camera.near, 0.15);
  assert.ok(camera.position.y > 8);
  assert.ok(camera.position.distanceTo({ x: boat.x, y: 0, z: boat.z }) > 10);
});
