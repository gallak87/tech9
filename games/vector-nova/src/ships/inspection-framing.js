import { Vector3, MathUtils } from 'three';

// Fit occupied screen space, then center it. A symmetric fit around the world
// midpoint wastes space because perspective makes the nearer ship much larger.
// Only the dev paired view uses this; the target keeps its real shot distance.
export function createPairedFraming(bounds) {
  const center = new Vector3(
    (bounds.min[0] + bounds.max[0]) / 2,
    0.55,
    (bounds.min[2] + bounds.max[2]) / 2,
  );
  const points = [];
  for (const subject of bounds.subjects)
    for (const x of [subject.min[0], subject.max[0]])
      for (const y of [subject.min[1], subject.max[1]])
        for (const z of [subject.min[2], subject.max[2]])
          points.push(new Vector3(x, y, z).sub(center));
  const right = new Vector3(),
    up = new Vector3(),
    point = new Vector3();
  const projected = points.map(() => ({ x: 0, y: 0, depth: 0 }));
  const result = { distance: 1, offsetX: 0, offsetY: 0 };
  let minX, maxX, minY, maxY;
  function measure(distance, projection) {
    minX = minY = Infinity;
    maxX = maxY = -Infinity;
    for (const point of projected) {
      const scale = projection / (distance - point.depth);
      const x = point.x * scale,
        y = point.y * scale;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return {
    frame(direction, rotation, viewport, screenHeight, fov) {
      right.set(0, 1, 0).cross(direction).normalize();
      up.crossVectors(direction, right).normalize();
      const projection =
        screenHeight / (2 * Math.tan(MathUtils.degToRad(fov / 2)));
      let near = 1;
      for (const [index, corner] of points.entries()) {
        point.copy(corner).applyQuaternion(rotation);
        const target = projected[index];
        target.x = point.dot(right);
        target.y = point.dot(up);
        target.depth = point.dot(direction);
        near = Math.max(near, target.depth + 0.5);
      }
      const width = viewport.width * 0.92,
        height = viewport.height * 0.9;
      let far = near + projection * 2;
      for (let step = 0; step < 32; step++) {
        const distance = (near + far) / 2;
        measure(distance, projection);
        if (maxX - minX > width || maxY - minY > height) near = distance;
        else far = distance;
      }
      measure(far, projection);
      result.distance = far;
      result.offsetX = (minX + maxX) / 2;
      result.offsetY = -(minY + maxY) / 2;
      return result;
    },
  };
}
