import * as T from 'three';
import { validateSafeFrame } from './contract.js';

// Keep an opted-in subject inside a screen rectangle without moving the eye,
// widening the lens or changing the normal road/flight camera goals. The rig's
// existing rotation damping returns toward its ordinary aim when room permits.
export function createSafeFrame(frame, bounds) {
  if (typeof frame !== 'function') validateSafeFrame(frame);
  if (
    !bounds?.isBox3 ||
    bounds.isEmpty() ||
    ![...bounds.min, ...bounds.max].every(Number.isFinite)
  )
    throw new Error('Camera safeFrame requires finite local subject bounds');
  const local = [];
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z])
        local.push(new T.Vector3(x, y, z));
  const world = local.map(() => new T.Vector3());
  const point = new T.Vector3();
  const rotation = new T.Quaternion();
  const xAxis = new T.Vector3(1, 0, 0);
  const yAxis = new T.Vector3(0, 1, 0);
  return (camera, subject) => {
    const rectangle =
      typeof frame === 'function'
        ? validateSafeFrame(frame(camera.aspect))
        : frame;
    subject.updateWorldMatrix(true, false);
    for (let i = 0; i < local.length; i += 1)
      world[i].copy(local[i]).applyMatrix4(subject.matrixWorld);
    const tangent = Math.tan(T.MathUtils.degToRad(camera.fov / 2));
    const left = Math.atan(rectangle.left * tangent * camera.aspect);
    const right = Math.atan(rectangle.right * tangent * camera.aspect);
    const bottom = Math.atan(rectangle.bottom * tangent);
    const top = Math.atan(rectangle.top * tangent);
    // Pitch and yaw couple on off-axis corners. A few bounded refinements keep
    // both constraints satisfied; normal in-frame composition exits immediately.
    for (let iteration = 0; iteration < 6; iteration += 1) {
      camera.updateMatrixWorld();
      let minX = Infinity,
        maxX = -Infinity;
      let minY = Infinity,
        maxY = -Infinity;
      for (const vertex of world) {
        point.copy(vertex).applyMatrix4(camera.matrixWorldInverse);
        // Rotation cannot resolve an eye inside its subject. Do not manufacture
        // a camera relocation or turn toward geometry behind the eye.
        if (point.z >= -camera.near) return;
        const x = Math.atan2(point.x, -point.z);
        const y = Math.atan2(point.y, -point.z);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      const yaw = maxX > right ? right - maxX : minX < left ? left - minX : 0;
      const pitch = minY < bottom ? minY - bottom : maxY > top ? maxY - top : 0;
      if (Math.abs(yaw) < 1e-10 && Math.abs(pitch) < 1e-10) break;
      camera.quaternion.multiply(rotation.setFromAxisAngle(yAxis, yaw));
      camera.quaternion.multiply(rotation.setFromAxisAngle(xAxis, pitch));
    }
    camera.updateMatrixWorld();
  };
}
