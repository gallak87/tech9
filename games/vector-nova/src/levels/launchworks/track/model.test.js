import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createLaunchworksTrack } from './model.js';
import { createLaunchworksDevices } from '../devices.js';
import { createCameraRig } from '../../../camera/index.js';
import { createVehicleState } from '../../../physics/index.js';

test('every transfer has a supported wide Vector approach and an unobstructed ballistic line', () => {
  const track = createLaunchworksTrack(),
    devices = createLaunchworksDevices(track);
  assert.equal(devices.length, 5);
  const headings = [];
  for (const [i, jump] of track.jumps.entries()) {
    const strip = devices[i];
    assert.equal(strip.type, 'vector');
    assert.ok(strip.width >= 28);
    assert.ok(strip.distance + strip.length / 2 < jump.takeoff);
    assert.equal(track.isGap(strip.distance), false);
    const launch = track.sample(jump.takeoff),
      receiver = track.sample(jump.target);
    const horizontal = receiver.position.clone().sub(launch.position);
    horizontal.y = 0;
    assert.ok(
      Math.abs(horizontal.dot(launch.right)) < 0.02,
      'a transfer never requires midair turning',
    );
    assert.ok(Math.abs(receiver.curvature) < 1e-8);
    assert.ok(Math.abs(launch.tangent.dot(launch.right)) < 1e-8);
    headings.push(Math.atan2(launch.tangent.x, launch.tangent.z));
  }
  assert.ok(
    Math.max(...headings) - Math.min(...headings) > 0.6,
    'the transfers face distinct directions',
  );
  assert.ok(
    track.bounds.max.x - track.bounds.min.x > 2000,
    'the course uses a lateral footprint',
  );
});

test('an open start supplies a chase view behind the stationary racer', () => {
  const track = createLaunchworksTrack(),
    start = track.sample(0);
  assert.ok(
    track.sample(-18).position.clone().sub(start.position).dot(start.tangent) <
      -17.9,
  );
  const camera = new T.PerspectiveCamera(61, 16 / 9, 0.1, 24000);
  const rig = createCameraRig(camera, {
    chaseHeight: 6.5,
    chaseDistance: 18,
    lookAhead: 55,
  });
  rig.update(track, createVehicleState('shrike'), 1 / 60);
  assert.ok(
    camera.position.clone().sub(start.position).dot(start.tangent) < -15,
  );
  assert.ok(camera.getWorldDirection(new T.Vector3()).dot(start.tangent) > 0.9);
});
