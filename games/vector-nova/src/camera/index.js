import * as T from 'three';
export function createCameraRig(camera) {
  let initialized = false;
  const previousAnchor = new T.Vector3();
  const previousFrame = new T.Quaternion();
  const transport = new T.Quaternion();
  const desiredRotation = new T.Quaternion();
  const lookMatrix = new T.Matrix4();
  const offset = new T.Vector3();
  const localUp = new T.Vector3(0, 1, 0);
  return {
    reset() {
      initialized = false;
    },
    update(track, state, dt, { mode = 'chase', reducedMotion = false } = {}) {
      const f = track.sample(state.distance);
      const p = f.position
        .clone()
        .addScaledVector(f.right, state.lateral)
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
      } else {
        const ahead = track.sample(state.distance + 35 + state.speed * 0.18);
        back = track.sample(state.distance - 12.5 - state.speed * 0.025);
        eye = back.position
          .clone()
          .addScaledVector(back.right, state.lateral * 0.83)
          .addScaledVector(back.up, 5.0);
        target = p.clone().lerp(
          ahead.position
            .clone()
            .addScaledVector(ahead.right, state.lateral * 0.25)
            .addScaledVector(ahead.up, 1.6),
          0.55,
        );
      }
      // Carry both position and orientation through the continuous road frame.
      // Translation alone leaves the eye lagging inside a steep crest/pullout;
      // blending up vectors can collapse when the road turns upside down.
      if (initialized && mode === 'chase') {
        transport.copy(f.quaternion).multiply(previousFrame.clone().invert());
        offset
          .copy(camera.position)
          .sub(previousAnchor)
          .applyQuaternion(transport);
        camera.position.copy(f.position).add(offset);
        camera.quaternion.premultiply(transport);
      }
      previousAnchor.copy(f.position);
      previousFrame.copy(f.quaternion);
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
      camera.quaternion.slerp(
        desiredRotation,
        initialized ? 1 - Math.exp(-dt * 12) : 1,
      );
      camera.up.copy(localUp).applyQuaternion(camera.quaternion);
      const fov = 61 + (reducedMotion ? 0 : Math.min(state.speed / 157, 1) * 7);
      camera.fov +=
        (fov - camera.fov) * (initialized ? 1 - Math.exp(-dt * 4) : 1);
      camera.updateProjectionMatrix();
      initialized = true;
    },
  };
}
