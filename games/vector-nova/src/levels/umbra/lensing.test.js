import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createUmbraTrack } from './track/model.js';
import { tidalResponse, airborneGravity } from './track/forces.js';
import { sampleUmbraLens, createUmbraLensing } from './lensing.js';

const track = createUmbraTrack();
function context(distance, roll = 0) {
  const road = track.sample(distance);
  const ship = { group: new T.Group() };
  ship.group.position.copy(road.position).addScaledVector(road.up, 0.72);
  ship.group.quaternion.copy(road.quaternion);
  ship.group.userData.bounds = {
    min: [-2.4, -0.3, -3.8],
    max: [2.4, 1.2, 3.8],
  };
  const camera = new T.PerspectiveCamera(64, 1.6, 0.2, 22000);
  camera.position
    .copy(road.position)
    .addScaledVector(road.tangent, -20)
    .addScaledVector(road.up, 8);
  camera.up.copy(road.up).applyAxisAngle(road.tangent, roll);
  camera.lookAt(ship.group.position);
  return {
    state: { distance, lateral: 0 },
    ship,
    camera,
    mode: 'racing',
    settings: { reducedMotion: false },
    motion: { mode: 'magnetic' },
    time: 17,
  };
}

test('Umbra lens tracks the projected physical pull through banking and camera roll', () => {
  for (const zone of track.tidalZones)
    for (const roll of [0, Math.PI / 2, Math.PI]) {
      const frame = context((zone.start + zone.end) / 2, roll);
      const saved = {
        position: frame.ship.group.position.toArray(),
        quaternion: frame.ship.group.quaternion.toArray(),
        state: { ...frame.state },
      };
      const sample = sampleUmbraLens(track, frame, 1440, 900);
      const response = tidalResponse(track, frame.state.distance);
      const physical = track
        .sample(frame.state.distance)
        .right.multiplyScalar(response.lateralAcceleration);
      assert.ok(sample.active);
      assert.ok(new T.Vector3(...sample.force).distanceTo(physical) < 1e-10);
      const a = frame.ship.group.position.clone().project(frame.camera);
      const b = frame.ship.group.position
        .clone()
        .add(physical.clone().normalize())
        .project(frame.camera);
      const expected = new T.Vector2(
        (b.x - a.x) * 1440,
        (b.y - a.y) * 900,
      ).normalize();
      assert.ok(expected.dot(new T.Vector2(...sample.direction)) > 0.999);
      assert.ok(sample.radius >= 900 * 0.065 && sample.radius <= 900 * 0.19);
      assert.ok(
        [
          ...sample.center,
          ...sample.direction,
          sample.radius,
          sample.intensity,
        ].every(Number.isFinite),
      );
      assert.deepEqual(
        {
          position: frame.ship.group.position.toArray(),
          quaternion: frame.ship.group.quaternion.toArray(),
          state: frame.state,
        },
        saved,
      );
    }
});

test('Umbra lens uses each flight field and removes distortion for reduced motion', () => {
  for (const jump of track.jumps) {
    const frame = context(jump.takeoff);
    frame.motion = { motion: { mode: 'flight', flight: { id: jump.id } } };
    const sample = sampleUmbraLens(track, frame, 390, 844);
    assert.ok(sample.active);
    assert.deepEqual(
      sample.force,
      airborneGravity({ jump, position: frame.ship.group.position }).toArray(),
    );
    frame.settings.reducedMotion = true;
    const quiet = sampleUmbraLens(track, frame, 390, 844);
    assert.equal(quiet.distortion, 0);
    assert.equal(quiet.animationTime, 0);
    assert.equal(quiet.intensity, sample.intensity);
    assert.deepEqual(quiet.direction, sample.direction);
    frame.motion.motion.mode = 'recovery';
    assert.equal(sampleUmbraLens(track, frame, 390, 844).active, false);
  }
});

test('Umbra lens is absent outside fields and reviews, and freezes its phase on pause', () => {
  const zone = track.tidalZones[1];
  const frame = context((zone.start + zone.end) / 2);
  const active = sampleUmbraLens(track, frame, 844, 390);
  frame.mode = 'paused';
  assert.deepEqual(sampleUmbraLens(track, frame, 844, 390), active);
  for (const mode of ['title', 'inspection', 'fly', 'overview']) {
    frame.mode = mode;
    assert.equal(sampleUmbraLens(track, frame, 844, 390).active, false);
  }
  frame.mode = 'racing';
  frame.reviewing = true;
  assert.equal(sampleUmbraLens(track, frame, 844, 390).active, false);
  assert.equal(sampleUmbraLens(track, context(0), 1440, 900).active, false);
});

test('Umbra lens detaches and releases its pass once without disposing the borrowed image', () => {
  let pass,
    detached = 0,
    materialReleased = 0,
    imageReleased = 0;
  const lens = createUmbraLensing({
    attachWorldPass(value) {
      pass = value;
      return () => detached++;
    },
  });
  const image = new T.Texture();
  image.addEventListener('dispose', () => imageReleased++);
  pass.uniforms.tDiffuse.value = image;
  pass.material.addEventListener('dispose', () => materialReleased++);
  const zone = track.tidalZones[0];
  const sample = sampleUmbraLens(
    track,
    context((zone.start + zone.end) / 2),
    1440,
    900,
  );
  lens.update(sample, 1440, 900);
  assert.equal(pass.enabled, true);
  lens.reset();
  assert.equal(pass.enabled, false);
  lens.dispose();
  lens.dispose();
  assert.equal(detached, 1);
  assert.equal(materialReleased, 1);
  assert.equal(imageReleased, 0);
  image.dispose();
});
