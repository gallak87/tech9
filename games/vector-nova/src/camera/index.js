import * as T from 'three';
import { createSafeFrame } from './safe-frame.js';
export function createCameraRig(
  camera,
  {
    preserveFlightView = false,
    portraitAspect = 0,
    maxPortraitScale = 1.5,
    chaseHeight = 5,
    lookAhead = 35,
    safeFrame,
    jumpPreview,
    flightViewScale = 1,
    flightChaseBlend = 0,
  } = {},
  subjectBounds = null,
) {
  const fitSubject =
    safeFrame === undefined ? null : createSafeFrame(safeFrame, subjectBounds);
  let initialized = false;
  const previousAnchor = new T.Vector3();
  const previousFrame = new T.Quaternion();
  const previousCraftAnchor = new T.Vector3();
  let previousWorldMotion = false;
  let flightView = null;
  let landingView = null;
  const transport = new T.Quaternion();
  const desiredRotation = new T.Quaternion();
  const lookMatrix = new T.Matrix4();
  const offset = new T.Vector3();
  const localUp = new T.Vector3(0, 1, 0);
  return {
    reset() {
      initialized = false;
      flightView = null;
      landingView = null;
    },
    update(
      track,
      state,
      dt,
      {
        mode = 'chase',
        reducedMotion = false,
        worldPose = null,
        subject = null,
      } = {},
    ) {
      const worldMotion = !!worldPose && !worldPose.grounded;
      const f = worldMotion
        ? {
            position: worldPose.position.clone(),
            quaternion: worldPose.quaternion,
            right: new T.Vector3(1, 0, 0).applyQuaternion(worldPose.quaternion),
            up: new T.Vector3(0, 1, 0).applyQuaternion(worldPose.quaternion),
            tangent: new T.Vector3(0, 0, 1).applyQuaternion(
              worldPose.quaternion,
            ),
          }
        : track.sample(state.distance);
      const craftAnchor = worldPose
        ? worldPose.position
        : f.position
            .clone()
            .addScaledVector(f.right, state.lateral)
            .addScaledVector(f.up, 0.72);
      const changedSource = initialized && worldMotion !== previousWorldMotion;
      if (preserveFlightView && mode === 'chase' && changedSource) {
        const inverse = f.quaternion.clone().invert();
        const carriedView = {
          offset: camera.position
            .clone()
            .sub(previousCraftAnchor)
            .applyQuaternion(inverse),
          rotation: inverse.clone().multiply(camera.quaternion),
          elapsed: 0,
        };
        flightView = worldMotion ? carriedView : null;
        landingView = worldMotion ? null : carriedView;
      } else if (landingView) {
        landingView.elapsed += dt;
      }
      if (mode !== 'chase') {
        flightView = null;
        landingView = null;
      }
      const p = f.position
        .clone()
        .addScaledVector(f.right, worldMotion ? 0 : state.lateral)
        .addScaledVector(f.up, 1.15);
      let target, eye, back;
      if (mode === 'inspection') return;
      if (mode === 'vista') {
        eye = f.position
          .clone()
          .addScaledVector(f.right, 42)
          .addScaledVector(f.up, 23)
          .addScaledVector(f.tangent, -46);
        target = p;
      } else if (worldMotion) {
        if (flightView) flightView.elapsed += dt;
        eye = flightView
          ? flightView.offset
              .clone()
              .multiplyScalar(
                T.MathUtils.lerp(
                  1,
                  flightViewScale,
                  T.MathUtils.smoothstep(flightView.elapsed, 0.05, 0.8),
                ),
              )
              .applyQuaternion(f.quaternion)
              .add(craftAnchor)
          : p
              .clone()
              .addScaledVector(f.tangent, -14 - state.speed * 0.025)
              .addScaledVector(f.up, 4.0);
        target = p.clone().addScaledVector(f.tangent, 22);
        if (flightView && flightChaseBlend > 0) {
          const blend =
            T.MathUtils.clamp(flightChaseBlend, 0, 1) *
            T.MathUtils.smoothstep(flightView.elapsed, 0.25, 1.25);
          eye.lerp(
            p
              .clone()
              .addScaledVector(f.tangent, -14 - state.speed * 0.025)
              .addScaledVector(f.up, 4),
            blend,
          );
        }
      } else {
        const nextJump =
          jumpPreview &&
          track.jumps?.find((jump) => {
            const remaining = jump.takeoff - state.distance;
            return remaining >= 0 && remaining < jumpPreview.distance;
          });
        const preview = nextJump
          ? T.MathUtils.smoothstep(
              jumpPreview.distance - (nextJump.takeoff - state.distance),
              0,
              jumpPreview.distance * 0.5,
            )
          : 0;
        const height = T.MathUtils.lerp(
          chaseHeight,
          jumpPreview?.height ?? chaseHeight,
          preview,
        );
        const backDistance = T.MathUtils.lerp(
          12.5,
          jumpPreview?.back ?? 12.5,
          preview,
        );
        const ahead = track.sample(
          state.distance + lookAhead + state.speed * 0.18,
        );
        back = track.sample(
          state.distance - backDistance - state.speed * 0.025,
        );
        eye = back.position
          .clone()
          .addScaledVector(back.right, state.lateral * 0.83)
          .addScaledVector(back.up, height);
        target = p.clone().lerp(
          ahead.position
            .clone()
            .addScaledVector(ahead.right, state.lateral * 0.25)
            .addScaledVector(ahead.up, 1.6),
          0.55,
        );
        if (nextJump) {
          const receiving = track.sample(nextJump.landingStart + 20);
          target.lerp(
            receiving.position.clone().addScaledVector(receiving.up, 2),
            preview * 0.2,
          );
        }
      }
      // Preserve the actual incoming composition throughout free flight. A
      // craft-centred flight goal would still recenter an off-centre road view
      // even after fixing its frame origin. Relatching returns that carried view
      // to ordinary road composition gradually, without a source-change step.
      let landingBlend = 1;
      if (landingView) {
        const t = T.MathUtils.clamp(landingView.elapsed / 0.32, 0, 1);
        landingBlend = t * t * (3 - 2 * t);
        eye = landingView.offset
          .clone()
          .applyQuaternion(f.quaternion)
          .add(craftAnchor)
          .lerp(eye, landingBlend);
      }
      // Carry both position and orientation through the continuous road frame.
      // Translation alone leaves the eye lagging inside a steep crest/pullout;
      // blending up vectors can collapse when the road turns upside down.
      if (initialized && mode === 'chase') {
        if (preserveFlightView && changedSource) {
          // Road frames are anchored on the centerline, flight frames on the
          // craft itself. Compare craft anchors at the handoff: subtracting one
          // frame origin from the other injects the entire lane offset sideways.
          // Road yaw and craft yaw also differ; let the ordinary aim smoothing
          // absorb that source change instead of rotating the camera instantly.
          camera.position.add(
            offset.copy(craftAnchor).sub(previousCraftAnchor),
          );
        } else {
          transport.copy(f.quaternion).multiply(previousFrame.clone().invert());
          offset
            .copy(camera.position)
            .sub(previousAnchor)
            .applyQuaternion(transport);
          camera.position.copy(f.position).add(offset);
          camera.quaternion.premultiply(transport);
        }
      }
      previousAnchor.copy(f.position);
      previousFrame.copy(f.quaternion);
      previousCraftAnchor.copy(craftAnchor);
      previousWorldMotion = worldMotion;
      const k = initialized ? 1 - Math.exp(-dt * 12) : 1;
      camera.position.lerp(eye, k);
      if (back) {
        const clearance = offset
          .copy(camera.position)
          .sub(back.position)
          .dot(back.up);
        if (clearance < 3)
          camera.position.addScaledVector(back.up, 3 - clearance);
      }
      lookMatrix.lookAt(camera.position, target, f.up);
      desiredRotation.setFromRotationMatrix(lookMatrix);
      if (flightView) {
        const blend =
          T.MathUtils.clamp(flightChaseBlend, 0, 1) *
          T.MathUtils.smoothstep(flightView.elapsed, 0.25, 1.25);
        desiredRotation
          .copy(f.quaternion)
          .multiply(flightView.rotation)
          .slerp(new T.Quaternion().setFromRotationMatrix(lookMatrix), blend);
      } else if (landingView) {
        desiredRotation.copy(
          f.quaternion
            .clone()
            .multiply(landingView.rotation)
            .slerp(desiredRotation, landingBlend),
        );
        if (landingBlend === 1) landingView = null;
      }
      camera.quaternion.slerp(
        desiredRotation,
        initialized ? 1 - Math.exp(-dt * 12) : 1,
      );
      const baseFov =
        61 + (reducedMotion ? 0 : Math.min(state.speed / 157, 1) * 7);
      // A level can opt into more vertical room in narrow portrait viewports.
      const portraitScale =
        portraitAspect > 0
          ? Math.min(
              maxPortraitScale,
              Math.max(1, portraitAspect / camera.aspect),
            )
          : 1;
      const fov =
        portraitScale === 1
          ? baseFov
          : T.MathUtils.radToDeg(
              2 *
                Math.atan(
                  Math.tan(T.MathUtils.degToRad(baseFov / 2)) * portraitScale,
                ),
            );
      camera.fov +=
        (fov - camera.fov) * (initialized ? 1 - Math.exp(-dt * 4) : 1);
      camera.updateProjectionMatrix();
      if (fitSubject && subject && mode === 'chase' && !worldMotion)
        fitSubject(camera, subject);
      camera.up.copy(localUp).applyQuaternion(camera.quaternion);
      initialized = true;
    },
  };
}
