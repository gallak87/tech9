import * as THREE from 'three';
import { framePoint } from './frames.js';

// Sweep individual profile faces so precast corners retain hard normal edges.
export function sweepGeometry(
  track,
  profile,
  { start = 0, end = track.length, step = 6, uvScale = 16 } = {},
) {
  const count = Math.ceil((end - start) / step);
  const positions = [];
  const uv = [];
  const indices = [];
  const frames = Array.from({ length: count + 1 }, (_, index) =>
    track.sample(start + ((end - start) * index) / count),
  );
  for (let face = 0; face < profile.length - 1; face += 1) {
    const vertexStart = positions.length / 3;
    const [ax, ay] = profile[face];
    const [bx, by] = profile[face + 1];
    for (let index = 0; index <= count; index += 1) {
      for (const [x, y, u] of [
        [ax, ay, 0],
        [bx, by, 1],
      ]) {
        const point = framePoint(frames[index], x, y);
        positions.push(point.x, point.y, point.z);
        uv.push(u, (start + ((end - start) * index) / count) / uvScale);
      }
      if (index < count) {
        const n = vertexStart + index * 2;
        indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function boxProfile(x, y, width, height) {
  return [
    [x - width / 2, y + height / 2],
    [x + width / 2, y + height / 2],
    [x + width / 2, y - height / 2],
    [x - width / 2, y - height / 2],
    [x - width / 2, y + height / 2],
  ];
}

export function beamTransform(start, end, thickness = 1, depth = thickness) {
  const direction = end.clone().sub(start);
  return {
    position: start.clone().add(end).multiplyScalar(0.5),
    quaternion: new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize(),
    ),
    scale: new THREE.Vector3(thickness, direction.length(), depth),
  };
}

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

// Expansion seals follow the actual rendered triangle planes, rather than the
// ideal spline frame. A straight box intersects the tessellated road on banks
// and grades, producing alternating exposed/buried pixels as the camera moves.
export function roadSealGeometry(
  track,
  surface,
  { spacing = 36, breadth = 0.078, offset = 0.008 } = {},
) {
  const attribute = surface.getAttribute('position');
  const segments = attribute.count / 2 - 1;
  const step = track.length / segments;
  const positions = [];
  const normals = [];
  const edgeInset = 0.02 / track.width;
  const point = (index) =>
    new THREE.Vector3().fromBufferAttribute(attribute, index);
  const clip = (polygon, axis, limit, keepAbove) => {
    const result = [];
    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const insideA = keepAbove ? a[axis] >= limit : a[axis] <= limit;
      const insideB = keepAbove ? b[axis] >= limit : b[axis] <= limit;
      if (insideA) result.push(a);
      if (insideA !== insideB) {
        const fraction = (limit - a[axis]) / (b[axis] - a[axis]);
        result.push({
          u: THREE.MathUtils.lerp(a.u, b.u, fraction),
          v: THREE.MathUtils.lerp(a.v, b.v, fraction),
          position: a.position.clone().lerp(b.position, fraction),
        });
      }
    }
    return result;
  };
  for (let distance = 0; distance < track.length; distance += spacing) {
    const start = distance - breadth / 2;
    const end = distance + breadth / 2;
    const bands = [[Math.max(0, start), Math.min(track.length, end)]];
    if (start < 0) bands.push([track.length + start, track.length]);
    if (end > track.length) bands.push([0, end - track.length]);
    for (const [from, to] of bands) {
      const first = Math.max(0, Math.floor(from / step));
      const last = Math.min(segments - 1, Math.floor(to / step));
      for (let segment = first; segment <= last; segment += 1) {
        const vertices = [
          { u: 0, v: 0, position: point(segment * 2) },
          { u: 1, v: 0, position: point(segment * 2 + 1) },
          { u: 0, v: 1, position: point(segment * 2 + 2) },
          { u: 1, v: 1, position: point(segment * 2 + 3) },
        ];
        for (const triangle of [
          [0, 2, 1],
          [1, 2, 3],
        ]) {
          let polygon = triangle.map((index) => vertices[index]);
          const normal = new THREE.Vector3()
            .crossVectors(
              polygon[1].position.clone().sub(polygon[0].position),
              polygon[2].position.clone().sub(polygon[0].position),
            )
            .normalize();
          for (const [axis, limit, keepAbove] of [
            ['v', (from - segment * step) / step, true],
            ['v', (to - segment * step) / step, false],
            ['u', edgeInset, true],
            ['u', 1 - edgeInset, false],
          ]) {
            if (!polygon.length) break;
            polygon = clip(polygon, axis, limit, keepAbove);
          }
          for (let i = 1; i < polygon.length - 1; i += 1) {
            for (const vertex of [polygon[0], polygon[i], polygon[i + 1]]) {
              const lifted = vertex.position
                .clone()
                .addScaledVector(normal, offset);
              positions.push(lifted.x, lifted.y, lifted.z);
              normals.push(normal.x, normal.y, normal.z);
            }
          }
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
