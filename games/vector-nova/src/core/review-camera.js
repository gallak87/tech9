import * as T from 'three';

// A static, fitted view of the actual drivable mesh for the human shape gate.
// No flythrough or simulation input is introduced by the review controls.
export function createReviewCamera(track, camera) {
  const bounds = new T.Box3();
  for (let s = 0; s < track.length; s += 4) {
    const frame = track.sample(s);
    for (const side of [-1, 1])
      bounds.expandByPoint(
        frame.position
          .clone()
          .addScaledVector(frame.right, (side * track.width) / 2),
      );
  }
  const center = bounds.getCenter(new T.Vector3());
  const corners = [];
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z])
        corners.push(new T.Vector3(x, y, z).sub(center));
  let selected = 'perspective';
  return {
    select(view) {
      if (['perspective', 'top', 'profile'].includes(view)) selected = view;
    },
    update() {
      const direction = new T.Vector3(
        ...(selected === 'top'
          ? [0, 1, 0.001]
          : selected === 'profile'
            ? [1, 0.08, 0]
            : [1, 0.95, 1.2]),
      ).normalize();
      camera.up.set(0, 1, 0);
      camera.position.copy(center).add(direction);
      camera.lookAt(center);
      camera.fov = 42;
      const inverse = camera.quaternion.clone().invert();
      const tangent = Math.tan(T.MathUtils.degToRad(camera.fov / 2));
      let distance = 0;
      for (const corner of corners) {
        const local = corner.clone().applyQuaternion(inverse);
        distance = Math.max(
          distance,
          local.z + Math.abs(local.y) / tangent,
          local.z +
            Math.abs(local.x) /
              (tangent * camera.aspect * (innerWidth > 760 ? 0.74 : 1)),
        );
      }
      camera.position.copy(center).addScaledVector(direction, distance * 1.15);
      // Reserve the left review card without rotating away from the course.
      if (innerWidth > 760)
        camera.setViewOffset(
          innerWidth,
          innerHeight,
          -innerWidth * 0.12,
          0,
          innerWidth,
          innerHeight,
        );
      camera.updateProjectionMatrix();
    },
  };
}
