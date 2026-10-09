import * as T from 'three';

// Hold the eye at the confirmed miss; only pan as the ship flies and rebounds.
export function createCrashView(camera) {
  const eye = camera.position.clone();
  const up = camera.up.clone().normalize();
  const matrix = new T.Matrix4();
  const rotation = new T.Quaternion();

  return {
    update(position, dt) {
      if (dt <= 0) return;
      camera.position.copy(eye);
      matrix.lookAt(eye, position, up);
      rotation.setFromRotationMatrix(matrix);
      camera.quaternion.slerp(rotation, 1 - Math.exp(-dt * 6));
      camera.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    },
  };
}
