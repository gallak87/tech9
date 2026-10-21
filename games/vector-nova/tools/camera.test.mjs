import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCameraRig } from '../src/camera/index.js';
import { createTrack } from '../src/levels/halcyon/track/model.js';

test('repeated feedback does not drift the chase rig and clears cleanly', () => {
  const track = createTrack();
  const cameras = [0, 1].map(
    () => new THREE.PerspectiveCamera(64, 16 / 9, 0.2, 14000),
  );
  const rigs = cameras.map((camera) => createCameraRig(camera));
  const state = { distance: 100, lateral: 0, speed: 112 };
  const feedback = {
    fov: 0,
    position: [0.05, 0.04, 0.08],
    rotation: [0.008, 0, 0.012],
  };
  for (let i = 0; i < 180; i++) {
    rigs[0].update(track, state, 1 / 60);
    rigs[1].update(track, state, 1 / 60, { feedback });
    assert.ok(cameras[0].position.distanceTo(cameras[1].position) < 0.11);
    state.distance += state.speed / 60;
  }
  rigs.forEach((rig) => rig.update(track, state, 1 / 60));
  assert.ok(cameras[0].position.distanceTo(cameras[1].position) < 1e-9);
  assert.ok(cameras[0].quaternion.angleTo(cameras[1].quaternion) < 1e-7);
  rigs[1].update(track, state, 1 / 60, { feedback, reducedMotion: true });
  rigs[0].update(track, state, 1 / 60, { reducedMotion: true });
  assert.ok(cameras[0].position.distanceTo(cameras[1].position) < 1e-9);
});

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

test('chase keeps driving-side clearance through banks, tunnels, inversion and plunge', () => {
  const track = createTrack();
  const camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.2, 14000);
  const rig = createCameraRig(camera);
  for (const scenario of [
    'bank',
    'tunnel-showcase',
    'gallery-showcase',
    'signature-entry',
    'signature-inverted',
    'signature-drop',
    'signature-exit',
  ]) {
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

test('camera remains continuous through vertical tangents and fully inverted track', () => {
  // A vertical loop exposes the world-up singularity without relying on the
  // current course's chosen maximum grade or on a particular frame algorithm.
  const radius = 120;
  const loop = {
    sample(distance) {
      const angle = distance / radius;
      const tangent = new THREE.Vector3(0, Math.sin(angle), Math.cos(angle));
      const right = new THREE.Vector3(1, 0, 0);
      const up = new THREE.Vector3().crossVectors(tangent, right);
      return {
        position: new THREE.Vector3(
          0,
          radius * (1 - Math.cos(angle)),
          radius * Math.sin(angle),
        ),
        right,
        up,
        tangent,
        quaternion: new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(right, up, tangent),
        ),
      };
    },
  };
  const camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.2, 14000);
  const rig = createCameraRig(camera);
  let previous;
  for (
    let distance = 0;
    distance < Math.PI * radius * 2;
    distance += 157 / 60
  ) {
    rig.update(loop, { distance, lateral: 0, speed: 157 }, 1 / 60, {});
    assert.ok(
      [...camera.position, ...camera.quaternion, ...camera.up].every(
        Number.isFinite,
      ),
    );
    if (previous)
      assert.ok(
        camera.quaternion.angleTo(previous) < 0.06,
        'Camera must not flip at vertical or inverted orientations',
      );
    const back = loop.sample(distance - 12.5 - 157 * 0.025);
    assert.ok(
      camera.position.clone().sub(back.position).dot(back.up) > 2.9,
      'Camera stays on the driving side of the deck',
    );
    assert.ok(
      camera.up.dot(loop.sample(distance).up) > 0.8,
      'Camera retains the road-relative horizon',
    );
    previous = camera.quaternion.clone();
  }
});

test('level camera height and preview remain local through a banked crest', () => {
  const track = createTrack();
  const ordinary = new THREE.PerspectiveCamera(64, 16 / 9, 0.2, 14000);
  const explicit = new THREE.PerspectiveCamera(64, 16 / 9, 0.2, 14000);
  const raised = new THREE.PerspectiveCamera(64, 16 / 9, 0.2, 14000);
  const rigs = [
    createCameraRig(ordinary),
    createCameraRig(explicit, { chaseHeight: 5, lookAhead: 35 }),
    createCameraRig(raised, { chaseHeight: 6.5, lookAhead: 47 }),
  ];
  const state = { ...track.scenarios.bank, speed: 100, lateral: 0 };
  for (let i = 0; i < 120; i++) {
    rigs.forEach((r) => r.update(track, state, 1 / 60));
    assert.deepEqual(ordinary.position.toArray(), explicit.position.toArray());
    assert.deepEqual(
      ordinary.quaternion.toArray(),
      explicit.quaternion.toArray(),
    );
    const back = track.sample(state.distance - 15);
    assert.ok(
      raised.position.clone().sub(ordinary.position).dot(back.up) > 1.3,
    );
    assert.ok(raised.up.dot(back.up) > 0.8);
    state.distance += state.speed / 60;
  }
});
