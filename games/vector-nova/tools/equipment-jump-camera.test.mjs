import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import createOrbital from '../src/levels/orbital/index.js';
import createHalcyon from '../src/levels/halcyon/index.js';
import { createCameraRig } from '../src/camera/index.js';
import { createMagneticRuntime } from '../src/core/session-runtime.js';
import { createVehicleState } from '../src/physics/index.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { getCollisionHull } from '../src/ships/collision-hulls.js';

const STEP = 1 / 120;
const FRAME = 1 / 60;
const input = { throttle: 1, steer: 0 };
const bounds = getCollisionHull('kestrel').bounds;
const subjectBounds = new T.Box3(
  new T.Vector3().fromArray(bounds.min),
  new T.Vector3().fromArray(bounds.max),
);

for (const [id, createLevel] of [
  ['orbital', createOrbital],
  ['halcyon', createHalcyon],
]) {
  test(`${id} powered landings carry the camera relative to the craft across render phases`, async (t) => {
    const level = createLevel({ shape: false });
    const track = level.createTrack();
    const native = await createRapierWorld({
      collisionWorld: withMagneticBoundaries(track),
    });
    t.after(() => native.dispose());
    const peaks = [];
    const cases = [];
    for (const alpha of [0, 0.5, 0.9])
      for (const lateral of [-8, 8])
        for (const offset of [0, 1])
          cases.push({ alpha, lateral, offset, deflect: false });
    for (const lateral of [-8, 8])
      cases.push({ alpha: 0.5, lateral, offset: 1, deflect: true });
    for (const { alpha, lateral, offset, deflect } of cases) {
      native.reset();
      const runtime = createMagneticRuntime({
        track,
        dynamics: native,
        equipment: true,
        settings: { steeringAssist: 0.3 },
      });
      try {
        const state = {
          ...createVehicleState('kestrel'),
          distance: 150,
          lateral,
          speed: 80,
        };
        runtime.reset({ state });
        runtime.advance(state, input, STEP);
        const camera = new T.PerspectiveCamera(61, 16 / 9, 0.1, 12000);
        const subject = new T.Object3D();
        const rig = createCameraRig(camera, level.camera, subjectBounds);
        let previous = { ...state };
        let previousCraft = runtime.pose(1).position.clone();
        let previousRelative;
        let landedFrame = null,
          landedSubstep;
        let deflected = false;
        const peak = { alpha, lateral, offset, deflect, relative: 0, craft: 0 };
        const render = () => {
          const pose = runtime.pose(alpha);
          subject.position.copy(pose.position);
          subject.quaternion.copy(pose.quaternion);
          const interpolated = {
            ...state,
            distance: T.MathUtils.lerp(
              previous.distance,
              state.distance,
              alpha,
            ),
            lateral: T.MathUtils.lerp(previous.lateral, state.lateral, alpha),
            heading: T.MathUtils.lerp(previous.heading, state.heading, alpha),
          };
          rig.update(track, interpolated, FRAME, { worldPose: pose, subject });
          const relative = camera.position.clone().sub(pose.position);
          const relativeStep = previousRelative
            ? relative.distanceTo(previousRelative)
            : 0;
          const craftStep = pose.position.distanceTo(previousCraft);
          previousRelative = relative;
          previousCraft = pose.position.clone();
          return { relativeStep, craftStep };
        };
        render();
        assert.ok(runtime.jump(state));
        if (offset) runtime.advance(state, input, STEP);
        for (let frame = 0; frame < 180; frame++) {
          for (let substep = 0; substep < 2; substep++) {
            if (deflect && !deflected) {
              const saved = runtime.snapshot();
              if (saved.flight?.elapsed > 0.95) {
                // Resume a native post-impact flight attitude. This isolates
                // the camera handoff from the earlier racer-contact manifold.
                const yaw = new T.Quaternion().setFromAxisAngle(
                  new T.Vector3(0, 1, 0),
                  Math.sign(lateral) * 0.35,
                );
                saved.currentPose.quaternion = new T.Quaternion()
                  .fromArray(saved.currentPose.quaternion)
                  .multiply(yaw)
                  .toArray();
                saved.previousPose.quaternion = [
                  ...saved.currentPose.quaternion,
                ];
                saved.flight.hitAt = saved.flight.elapsed;
                saved.flight.angularVelocity = [0, 0, 0];
                runtime.restore(saved);
                deflected = true;
              }
            }
            previous = { ...state };
            const events = runtime.advance(state, input, STEP);
            // Match core/game.emit: a transfer resets the render predecessor;
            // never manufacture a takeoff-to-landing interpolation segment.
            if (
              events.some(({ type }) =>
                ['jump-transfer', 'road-recovery'].includes(type),
              )
            )
              previous = { ...state };
            if (
              events.some(
                ({ type, payload }) =>
                  type === 'jump-transfer' && payload.outcome === 'landed',
              )
            ) {
              landedFrame = frame;
              landedSubstep = substep;
            }
          }
          const measured = render();
          if (landedFrame !== null) {
            peak.relative = Math.max(peak.relative, measured.relativeStep);
            peak.craft = Math.max(peak.craft, measured.craftStep);
            if (frame >= landedFrame + 12) break;
          }
        }
        assert.notEqual(landedFrame, null, 'the actual powered hop must land');
        if (deflect)
          assert.equal(
            deflected,
            true,
            'the saved post-impact attitude is exercised',
          );
        peak.landedSubstep = landedSubstep;
        peaks.push(peak);
      } finally {
        runtime.dispose();
      }
    }
    t.diagnostic(JSON.stringify(peaks));
    assert.deepEqual(
      new Set(peaks.map((p) => p.landedSubstep)),
      new Set([0, 1]),
    );
    for (const peak of peaks) {
      const label = `${id}, lane ${peak.lateral}, alpha ${peak.alpha}, substep ${peak.landedSubstep}`;
      assert.ok(peak.craft < 3, `${label}: craft itself moved ${peak.craft}m`);
      assert.ok(
        peak.relative < 1.5,
        `${label}: camera shifted ${peak.relative}m relative to the craft`,
      );
    }
  });

  test(`${id} ordinary grounded chase is unchanged by flight-view carry`, () => {
    const level = createLevel({ shape: false });
    const track = level.createTrack();
    const cameras = [false, true].map(
      () => new T.PerspectiveCamera(61, 16 / 9, 0.1, 12000),
    );
    const rigs = cameras.map((camera, index) =>
      createCameraRig(
        camera,
        { ...level.camera, preserveFlightView: Boolean(index) },
        subjectBounds,
      ),
    );
    const subject = new T.Object3D();
    for (let frame = 0; frame < 120; frame++) {
      const state = {
        ...createVehicleState(),
        distance: 150 + frame * 80 * FRAME,
        lateral: 8,
        speed: 80,
      };
      const road = track.sample(state.distance);
      const worldPose = {
        grounded: true,
        position: road.position
          .clone()
          .addScaledVector(road.right, state.lateral)
          .addScaledVector(road.up, 0.72),
        quaternion: road.quaternion.clone(),
      };
      subject.position.copy(worldPose.position);
      subject.quaternion.copy(worldPose.quaternion);
      rigs.forEach((rig) =>
        rig.update(track, state, FRAME, { worldPose, subject }),
      );
      assert.ok(cameras[0].position.distanceTo(cameras[1].position) < 1e-10);
      assert.ok(cameras[0].quaternion.angleTo(cameras[1].quaternion) < 1e-7);
      assert.equal(cameras[0].fov, cameras[1].fov);
    }
  });
}
