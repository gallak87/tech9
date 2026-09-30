import * as THREE from 'three';
import { framePoint } from './frames.js';

const positive = (name, value) => {
  if (!Number.isFinite(value) || value <= 0)
    throw new RangeError(`${name} must be positive and finite`);
};
const finite = (name, values) => {
  if (!values.every(Number.isFinite))
    throw new TypeError(`${name} must be finite`);
};
const vector = (name, value) => {
  if (!value?.isVector3) throw new TypeError(`${name} must be a Vector3`);
  finite(name, value.toArray());
};

// Sweep individual profile faces so precast corners retain hard normal edges.
export function sweepGeometry(
  track,
  profile,
  { start = 0, end = track.length, step = 6, uvScale = 16 } = {},
) {
  positive('Track length', track.length);
  positive('Sweep step', step);
  positive('Sweep UV scale', uvScale);
  finite('Sweep range', [start, end]);
  if (end <= start) throw new RangeError('Sweep end must exceed start');
  if (typeof track.sample !== 'function')
    throw new TypeError('Sweep needs track.sample');
  if (!Array.isArray(profile) || profile.length < 2)
    throw new TypeError('Sweep profile needs at least two [right, up] points');
  for (const [index, point] of profile.entries()) {
    if (!Array.isArray(point) || point.length !== 2)
      throw new TypeError(`Invalid sweep profile point ${index}`);
    finite(`Sweep profile point ${index}`, point);
    if (
      index &&
      point.every((value, axis) => value === profile[index - 1][axis])
    )
      throw new RangeError(`Collapsed sweep profile face ${index - 1}`);
  }
  const count = Math.ceil((end - start) / step);
  if (
    !Number.isSafeInteger(count) ||
    (count + 1) * (profile.length - 1) * 2 > 1000000
  )
    throw new RangeError(
      'Sweep exceeds 1000000 vertices; increase step or split the range',
    );
  const positions = [];
  const uv = [];
  const indices = [];
  const frames = Array.from({ length: count + 1 }, (_, index) => {
    const distance = start + ((end - start) * index) / count;
    const frame = track.sample(distance);
    const copy = {};
    // Samplers may reuse scratch objects. Freeze each needed frame before the next call.
    for (const key of ['position', 'right', 'up', 'tangent']) {
      vector(`Sweep ${key} at ${distance}m`, frame?.[key]);
      copy[key] = frame[key].clone();
    }
    return copy;
  });
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
  finite('Box centre', [x, y]);
  positive('Box width', width);
  positive('Box height', height);
  return [
    [x - width / 2, y + height / 2],
    [x + width / 2, y + height / 2],
    [x + width / 2, y - height / 2],
    [x - width / 2, y - height / 2],
    [x - width / 2, y + height / 2],
  ];
}

export function beamTransform(start, end, thickness = 1, depth = thickness) {
  vector('Beam start', start);
  vector('Beam end', end);
  positive('Beam thickness', thickness);
  positive('Beam depth', depth);
  const direction = end.clone().sub(start);
  positive('Beam length', direction.length());
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
  positive('Track length', track.length);
  positive('Track width', track.width);
  positive('Seal spacing', spacing);
  positive('Seal breadth', breadth);
  finite('Seal offset', [offset]);
  if (breadth >= track.length || track.width <= 0.04)
    throw new RangeError(
      'Seal breadth must fit the lap and track width must exceed its edge insets',
    );
  const attribute = surface.getAttribute('position');
  if (
    !attribute ||
    attribute.itemSize !== 3 ||
    attribute.count < 4 ||
    attribute.count % 2 ||
    !Array.from(attribute.array).every(Number.isFinite)
  )
    throw new TypeError('Seals require a finite two-point sweep surface');
  if (track.length / spacing > 1000000)
    throw new RangeError('Seal spacing creates too many bands');
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
