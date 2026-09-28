import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCameraRig } from '../src/camera/index.js';
import { createTrack } from '../src/track/model.js';

test('chase transport retains the authored following distance at racing speed', () => {
  const track = createTrack();
  const camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.2, 14000);
  const rig = createCameraRig(camera);
  const state = { distance: 100, lateral: 0, speed: 112 };
  for (let i = 0; i < 300; i++) {
    rig.update(track, state, 1 / 60, {});
    const gap = camera.position.distanceTo(
      track.sample(state.distance).position,
    );
    assert.ok(gap < 19, `Unintended camera lag: ${gap}m`);
    state.distance += state.speed / 60;
  }
});

test('banked chase stays above the running surface and below tunnel clearance', () => {
  const track = createTrack();
  const camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.2, 14000);
  const rig = createCameraRig(camera);
  for (const scenario of ['bank', 'tunnel-showcase', 'gallery-showcase']) {
    rig.reset();
    const state = { ...track.scenarios[scenario], speed: 100 };
    for (let i = 0; i < 120; i++) {
      rig.update(track, state, 1 / 60, {});
      const frame = track.sample(state.distance - 15);
      const height = camera.position.clone().sub(frame.position).dot(frame.up);
      assert.ok(height > 2.5 && height < 8, `${scenario} clearance ${height}m`);
      assert.ok(Math.abs(camera.up.length() - 1) < 1e-9);
      state.distance += state.speed / 60;
    }
  }
});
