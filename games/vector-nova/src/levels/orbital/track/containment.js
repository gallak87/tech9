import * as THREE from 'three';
import { framePoint } from '../../../track/frames.js';

function archShape(outer, inner, top, innerTop) {
  const shape = new THREE.Shape();
  const corner = 3.3,
    spring = 2.85;
  shape.moveTo(-outer, 0.2);
  shape.lineTo(-outer, spring);
  shape.quadraticCurveTo(-outer, top, -corner, top);
  shape.lineTo(corner, top);
  shape.quadraticCurveTo(outer, top, outer, spring);
  shape.lineTo(outer, 0.2);
  shape.lineTo(inner, 0.2);
  shape.lineTo(inner, spring);
  shape.quadraticCurveTo(inner, innerTop, corner, innerTop);
  shape.lineTo(-corner, innerTop);
  shape.quadraticCurveTo(-inner, innerTop, -inner, spring);
  shape.lineTo(-inner, 0.2);
  shape.closePath();
  return shape;
}

export function containmentGeometry(track, emitter = false) {
  // Rounded longitudinal inverted-U frames. Their feet sit outside the racing
  // edge and the upper body cants outward, leaving broad views through each U.
  let source = emitter
    ? new THREE.ShapeGeometry(archShape(4.28, 4.12, 3.77, 3.61), 5)
    : new THREE.ExtrudeGeometry(archShape(4.5, 3.9, 4, 3.4), {
        depth: 0.56,
        steps: 1,
        bevelEnabled: false,
        curveSegments: 5,
      });
  if (source.index) {
    const original = source;
    source = source.toNonIndexed();
    original.dispose();
  }
  const attribute = source.attributes.position;
  const positions = [],
    uv = [],
    distances = [];
  for (let distance = 0; distance < track.length; distance += 12)
    for (const side of [-1, 1]) {
      // The body needs outward normals after the coordinate-axis swap. Flat
      // insets must face the racing corridor on both sides of the track.
      for (let triangle = 0; triangle < attribute.count; triangle += 3)
        for (const offset of (emitter ? side === -1 : side === 1)
          ? [0, 2, 1]
          : [0, 1, 2]) {
          const vertex = triangle + offset;
          const s = distance + attribute.getX(vertex);
          const y = attribute.getY(vertex);
          const depth = emitter ? -0.295 : attribute.getZ(vertex) - 0.28;
          const x = side * (14.8 + y * 0.18 + depth);
          const point = framePoint(track.sample(s), x, y);
          positions.push(...point.toArray());
          uv.push(
            y / 4,
            (((s % track.length) + track.length) % track.length) / 16,
          );
          distances.push(s);
        }
    }
  source.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute(
    'roadDistance',
    new THREE.Float32BufferAttribute(distances, 1),
  );
  if (emitter) {
    // Banking can twist the very thin crown triangles past their original
    // planar winding. Orient their actual deformed faces toward the corridor.
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3(),
      center = new THREE.Vector3(),
      normal = new THREE.Vector3();
    const position = geometry.attributes.position;
    for (let vertex = 0; vertex < position.count; vertex += 3) {
      a.fromBufferAttribute(position, vertex);
      b.fromBufferAttribute(position, vertex + 1);
      c.fromBufferAttribute(position, vertex + 2);
      center
        .copy(a)
        .add(b)
        .add(c)
        .multiplyScalar(1 / 3);
      const frame = track.sample(
        (distances[vertex] + distances[vertex + 1] + distances[vertex + 2]) / 3,
      );
      const side = Math.sign(center.sub(frame.position).dot(frame.right));
      normal.subVectors(b, a).cross(c.sub(a));
      if (side * normal.dot(frame.right) > 0)
        for (const attribute of Object.values(geometry.attributes))
          for (let axis = 0; axis < attribute.itemSize; axis += 1) {
            const first = (vertex + 1) * attribute.itemSize + axis;
            const second = (vertex + 2) * attribute.itemSize + axis;
            const value = attribute.array[first];
            attribute.array[first] = attribute.array[second];
            attribute.array[second] = value;
          }
    }
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
