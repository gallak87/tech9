import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import { createCameraRig } from '../src/camera/index.js';
import { EDITOR_CAMERA } from '../src/editor/camera.js';
import { generateDocument } from '../src/editor/document.js';
import { createEditorLevel } from '../src/editor/nightweir.js';
import { EDITOR_JUMP_SPEEDS } from '../src/editor/jumps.js';
import { roadPresetOptions } from '../src/editor/road-presets.js';
import { createVehicleState } from '../src/physics/index.js';
import { getCollisionHull } from '../src/ships/collision-hulls.js';

const STEP = 1 / 120;
const hull = getCollisionHull('kestrel').bounds;
const bounds = new T.Box3(
  new T.Vector3().fromArray(hull.min),
  new T.Vector3().fromArray(hull.max),
);
const corners = [];
for (const x of [bounds.min.x, bounds.max.x])
  for (const y of [bounds.min.y, bounds.max.y])
    for (const z of [bounds.min.z, bounds.max.z])
      corners.push(new T.Vector3(x, y, z));

function observeJump(
  level,
  track,
  jump,
  {
    alpha = 0.5,
    boost = false,
    lateral = 0,
    fps = 60,
    cameraOptions = level.camera,
  } = {},
) {
  const state = {
    ...createVehicleState('kestrel'),
    distance: jump.takeoff - 140,
    lateral,
    speed: EDITOR_JUMP_SPEEDS[boost ? 'boost' : 'cruise'],
  };
  const input = { throttle: 1, steer: 0, brake: 0, boost, airbrake: false };
  const runtime = level.createRuntime({ track, presentation: false });
  runtime.reset({ state });
  const camera = new T.PerspectiveCamera(64, 16 / 10, 0.2, 200000);
  const rig = createCameraRig(camera, cameraOptions, bounds);
  const subject = new T.Object3D();
  const peak = { angle: 0, relative: 0, approachAngle: 0, takeoffAngle: 0 };
  let previousState = { ...state },
    previousRotation,
    previousRelative;
  let sawFlight = false,
    landed = null,
    afterLanding = 0;
  try {
    for (let frame = 0; frame < fps * 14; frame++) {
      for (let tick = 0; tick < 120 / fps; tick++) {
        previousState = { ...state };
        const events = runtime.advance(state, input, STEP);
        for (const event of events) {
          if (['jump-transfer', 'road-recovery'].includes(event.type))
            previousState = { ...state };
          if (event.type === 'jump-transfer') landed = event.payload.outcome;
          assert.notEqual(
            event.type,
            'jump-miss',
            'the selected camera fixture must complete a healthy jump',
          );
        }
      }
      const pose = runtime.pose(alpha);
      const rendered = {
        ...state,
        distance: T.MathUtils.lerp(
          previousState.distance,
          state.distance,
          alpha,
        ),
        lateral: T.MathUtils.lerp(previousState.lateral, state.lateral, alpha),
        heading: T.MathUtils.lerp(previousState.heading, state.heading, alpha),
      };
      subject.position.copy(pose.position);
      subject.quaternion.copy(pose.quaternion);
      rig.update(track, rendered, 1 / fps, {
        worldPose: pose,
        subject,
        reducedMotion: true,
      });
      const angle = previousRotation
        ? camera.quaternion.angleTo(previousRotation)
        : 0;
      const relative = camera.position.clone().sub(pose.position);
      const shift = previousRelative
        ? relative.distanceTo(previousRelative)
        : 0;
      if (!sawFlight && pose.grounded)
        peak.approachAngle = Math.max(peak.approachAngle, angle);
      if (!pose.grounded && !sawFlight) peak.takeoffAngle = angle;
      sawFlight ||= !pose.grounded;
      peak.angle = Math.max(peak.angle, angle);
      peak.relative = Math.max(peak.relative, shift);
      previousRotation = camera.quaternion.clone();
      previousRelative = relative;
      camera.updateMatrixWorld();
      subject.updateWorldMatrix(true, false);
      for (const corner of corners) {
        const p = corner
          .clone()
          .applyMatrix4(subject.matrixWorld)
          .project(camera);
        assert(
          p.z > -1 && p.z < 1 && Math.abs(p.x) < 0.98 && Math.abs(p.y) < 0.98,
          `the actual hull stays visible through ${jump.id}: ${p.toArray()}`,
        );
      }
      if (landed && ++afterLanding > fps * 0.5) break;
    }
    assert(sawFlight, 'exercise the airborne source');
    assert.equal(landed, 'landed', 'exercise the receiving-road handoff');
    return peak;
  } finally {
    runtime.dispose();
  }
}

for (const preset of ['woven', 'big-air']) {
  test(`${preset} generated jumps retain the camera through approach, takeoff and landing`, () => {
    const doc = generateDocument({ ...roadPresetOptions(preset), seed: 42017 });
    const level = createEditorLevel(doc),
      track = level.createTrack();
    assert.equal(level.camera, EDITOR_CAMERA);
    for (const jump of track.jumps)
      for (const boost of [false, true])
        for (const lateral of [-6, 6]) {
          const peak = observeJump(level, track, jump, { boost, lateral });
          assert(
            peak.angle < T.MathUtils.degToRad(6),
            `${jump.id}: angle step ${T.MathUtils.radToDeg(peak.angle)}`,
          );
          assert(
            peak.relative < 3.5,
            `${jump.id}: craft-relative eye step ${peak.relative}`,
          );
          assert(
            peak.takeoffAngle < 1e-6,
            'takeoff carries the incoming orientation',
          );
          assert(
            peak.approachAngle < T.MathUtils.degToRad(2),
            'approach remains the ordinary continuous road chase',
          );
        }
  });
}

test('the carried editor view remains continuous across render phases and frame rates', () => {
  const doc = generateDocument({ ...roadPresetOptions('woven'), seed: 42 });
  const level = createEditorLevel(doc),
    track = level.createTrack();
  for (const fps of [30, 60, 120])
    for (const alpha of [0, 0.5, 0.9]) {
      const peak = observeJump(level, track, track.jumps[0], {
        fps,
        alpha,
        lateral: 6,
      });
      assert(
        peak.angle * fps < T.MathUtils.degToRad(360),
        `${fps}/${alpha}: no source-change snap`,
      );
      assert(
        peak.relative * fps < 210,
        `${fps}/${alpha}: no frame-origin jump`,
      );
      assert(peak.takeoffAngle < 1e-6);
    }
});

test('the real generated Big Air landing exposes the old source-change regression', () => {
  const doc = generateDocument({
    ...roadPresetOptions('big-air'),
    seed: 42017,
  });
  const level = createEditorLevel(doc),
    track = level.createTrack();
  const old = observeJump(level, track, track.jumps[0], {
    cameraOptions: { ...EDITOR_CAMERA, preserveFlightView: false },
  });
  assert(
    old.angle > T.MathUtils.degToRad(10),
    'the old handoff visibly rotates between incompatible frames',
  );
  assert(
    old.relative > 5,
    'the old handoff displaces the eye relative to the craft',
  );
});

test('ordinary grounded editor roads retain their previous camera composition exactly', () => {
  const doc = generateDocument({
    seed: 42,
    length: 3000,
    jumpFrequency: 'none',
  });
  const level = createEditorLevel(doc),
    track = level.createTrack();
  const before = new T.PerspectiveCamera(64, 1.6, 0.2, 200000);
  const after = before.clone();
  const oldRig = createCameraRig(
    before,
    { ...EDITOR_CAMERA, preserveFlightView: false },
    bounds,
  );
  const fixedRig = createCameraRig(after, EDITOR_CAMERA, bounds);
  const subject = new T.Object3D();
  for (let frame = 0; frame < 120; frame++) {
    const state = {
      ...createVehicleState(),
      distance: 50 + frame * 2,
      speed: 112,
      lateral: 6,
    };
    const road = track.sample(state.distance);
    const pose = {
      grounded: true,
      position: road.position
        .clone()
        .addScaledVector(road.right, state.lateral)
        .addScaledVector(road.up, 0.72),
      quaternion: road.quaternion.clone(),
    };
    subject.position.copy(pose.position);
    subject.quaternion.copy(pose.quaternion);
    oldRig.update(track, state, 1 / 60, { worldPose: pose, subject });
    fixedRig.update(track, state, 1 / 60, { worldPose: pose, subject });
    assert.deepEqual(after.position.toArray(), before.position.toArray());
    assert.deepEqual(after.quaternion.toArray(), before.quaternion.toArray());
    assert.equal(after.fov, before.fov);
  }
});
