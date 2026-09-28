import * as T from 'three';
export function createCameraRig(camera) {
  let initialized = false;
  const up = new T.Vector3(0, 1, 0);
  const previousAnchor = new T.Vector3();
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
      let target,
        eye,
        newUp = f.up;
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
        const back = track.sample(state.distance - 12.5 - state.speed * 0.025);
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
      // Transport the camera with track progress before damping its relative
      // offset. World-space damping otherwise adds speed/response metres of
      // unintended follow lag, shrinking the craft as it accelerates.
      if (initialized && mode === 'chase')
        camera.position.add(f.position.clone().sub(previousAnchor));
      previousAnchor.copy(f.position);
      const k = initialized ? 1 - Math.exp(-dt * 12) : 1;
      camera.position.lerp(eye, k);
      up.lerp(newUp, initialized ? 1 - Math.exp(-dt * 7) : 1).normalize();
      camera.up.copy(up);
      camera.lookAt(target);
      const fov = 61 + (reducedMotion ? 0 : Math.min(state.speed / 157, 1) * 7);
      camera.fov +=
        (fov - camera.fov) * (initialized ? 1 - Math.exp(-dt * 4) : 1);
      camera.updateProjectionMatrix();
      initialized = true;
    },
  };
}
