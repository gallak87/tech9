import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { ChaseCamera } from '../src/camera/ChaseCamera.js';
import { getVessel } from '../src/game/vessels.js';
import { START } from '../src/world/islandDefinition.js';

test('captain camera attaches to the rendered helm and switching restores outside projection', () => {
  const camera = new PerspectiveCamera(58, 1.6, 0.15, 1600),
    boat = { ...START, speed: 6, vessel: getVessel('schooner') },
    rules = { state: 'running' };
  let selected,
    pose = {
      position: [START.x + 0.4, 5.5, START.z + 0.5],
      target: [START.x + 4, 5, START.z + 0.5],
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
  pose = {
    ...pose,
    position: [START.x + 10.4, 5.5, START.z + 0.5],
    target: [START.x + 14, 5, START.z + 0.5],
  };
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

test('ship selection gives the taller galleon more room in ready and chase views', () => {
  for (const state of ['ready', 'running']) {
    const camera = new PerspectiveCamera(58, 1.6, 0.15, 1600);
    const boat = { ...START, speed: 0, vessel: getVessel('schooner') };
    const owner = new ChaseCamera(
      camera,
      boat,
      { state },
      { setCameraMode() {} },
    );
    owner.update(1 / 60);
    const schoonerHeight = camera.position.y;
    const schoonerDistance = Math.hypot(
      camera.position.x - boat.x,
      camera.position.z - boat.z,
    );
    boat.vessel = getVessel('galleon');
    owner.resetMotion();
    owner.update(1 / 60);
    assert.ok(
      camera.position.y > schoonerHeight,
      `${state} framing accommodates the taller mast`,
    );
    assert.ok(
      Math.hypot(camera.position.x - boat.x, camera.position.z - boat.z) >
        schoonerDistance,
      `${state} framing steps back for the longer hull`,
    );
  }
});
