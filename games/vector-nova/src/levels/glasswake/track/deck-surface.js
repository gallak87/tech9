import { Vector3 } from 'three';
import { sweepGeometry } from '../../../track/geometry.js';

// Adjacent materials share the same cross-road grid. A full-width triangle
// cuts diagonally through a twisting deck and makes the magnetic hull bob.
export function createGlasswakeDeckBuilder(track) {
  const half = track.width / 2;
  const cuts = new Set([-half, half]);
  for (let x = -half; x < half; x += 3) cuts.add(x);
  for (const zone of track.gripZones) {
    cuts.add(zone.lateralMin);
    cuts.add(zone.lateralMax);
  }
  const lanes = [...cuts].sort((a, b) => a - b);
  return (start, end, left, right) => {
    const profile = lanes
      .filter((x) => x >= left && x <= right)
      .map((x) => [x, 0]);
    const geometry = sweepGeometry(track, profile, { start, end, step: 2 });
    const coordinates = geometry.getAttribute('roadCoord');
    const normals = geometry.getAttribute('normal');
    const frames = new Map();
    const normal = new Vector3();
    for (let i = 0; i < coordinates.count; i++) {
      const distance = coordinates.getX(i);
      if (!frames.has(distance)) {
        const before = track.sample(distance - 0.1);
        const after = track.sample(distance + 0.1);
        frames.set(distance, {
          right: track.sample(distance).right.clone(),
          along: after.position.clone().sub(before.position),
          twist: after.right.clone().sub(before.right),
        });
      }
      const frame = frames.get(distance);
      // Continuous shading across lattice and material edges; include the
      // lateral change in tangent through banks rather than flattening normals.
      normal
        .copy(frame.along)
        .addScaledVector(frame.twist, coordinates.getY(i));
      normal.cross(frame.right).normalize();
      normals.setXYZ(i, normal.x, normal.y, normal.z);
    }
    return geometry;
  };
}
