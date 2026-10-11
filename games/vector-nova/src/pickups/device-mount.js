import { Vector3 } from 'three';

// Raised road skins can sit above the ideal swept road used by pickups.
// Fit the cassette casing above the real panel envelope; its skirt still seats
// into the road. This is presentation only, never the pickup contact footprint.
export function roadDeviceMountHeight(surfaces, device, projector) {
  if (device.type !== 'vector') return 0;
  const from = device.distance - device.length / 2;
  const to = device.distance + device.length / 2;
  const left = device.lateral - device.width / 2 - 0.35;
  const right = device.lateral + device.width / 2 + 0.35;
  const point = new Vector3();
  const normal = new Vector3();
  let highest = 0;
  for (const geometry of surfaces) {
    const coordinates = geometry.getAttribute('roadCoord');
    const positions = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const count = index?.count ?? coordinates.count;
    for (let i = 0; i < count; i += 3) {
      const vertices = [0, 1, 2].map((j) =>
        index ? index.getX(i + j) : i + j,
      );
      const distances = vertices.map((j) => coordinates.getX(j));
      const laterals = vertices.map((j) => coordinates.getY(j));
      if (
        Math.max(...distances) < from - 0.35 ||
        Math.min(...distances) > to + 0.35 ||
        Math.max(...laterals) < left ||
        Math.min(...laterals) > right
      )
        continue;
      // Split at the projector's triangle edges as well as the panel's:
      // checking panel vertices alone misses a swept-triangle dip underneath.
      const footprint = distances.map((s, j) => [laterals[j], s]);
      const projected = projector.geometry([footprint], 0);
      const at = projected.getAttribute('roadCoord');
      const base = projected.getAttribute('position');
      const up = projected.getAttribute('normal');
      const a = new Vector3().fromBufferAttribute(positions, vertices[0]);
      const ab = new Vector3()
        .fromBufferAttribute(positions, vertices[1])
        .sub(a);
      const ac = new Vector3()
        .fromBufferAttribute(positions, vertices[2])
        .sub(a);
      const bx = laterals[1] - laterals[0],
        bs = distances[1] - distances[0];
      const cx = laterals[2] - laterals[0],
        cs = distances[2] - distances[0];
      const determinant = bx * cs - bs * cx;
      for (let j = 0; j < at.count; j++) {
        const x = at.getX(j) - laterals[0],
          s = at.getY(j) - distances[0];
        const u = (x * cs - s * cx) / determinant,
          v = (bx * s - bs * x) / determinant;
        point.copy(a).addScaledVector(ab, u).addScaledVector(ac, v);
        point.sub(new Vector3().fromBufferAttribute(base, j));
        highest = Math.max(
          highest,
          point.dot(normal.fromBufferAttribute(up, j)),
        );
      }
      projected.dispose();
    }
  }
  return Math.max(0, highest + 0.025 - 0.063);
}
