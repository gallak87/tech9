import * as THREE from 'three';

// A kiln-fired structural module needs a small flat chamfer, not a densely
// subdivided rounded primitive. Six faces + twelve edge strips + eight corner
// triangles yield 44 triangles, with real light-catching facets within bounds.
export function beveledBoxGeometry(width, height, depth, radius) {
  const half = [width / 2, height / 2, depth / 2];
  const r = Math.min(radius, ...half.map((value) => value * 0.45));
  const positions = [],
    normals = [],
    uv = [];
  const face = (points) => {
    const normal = points[1]
      .clone()
      .sub(points[0])
      .cross(points[2].clone().sub(points[0]))
      .normalize();
    const center = points
      .reduce((sum, point) => sum.add(point), new THREE.Vector3())
      .multiplyScalar(1 / points.length);
    if (normal.dot(center) < 0) {
      points.reverse();
      normal.negate();
    }
    const axis =
      Math.abs(normal.x) >= Math.max(Math.abs(normal.y), Math.abs(normal.z))
        ? 0
        : Math.abs(normal.y) >= Math.abs(normal.z)
          ? 1
          : 2;
    const axes = [0, 1, 2].filter((candidate) => candidate !== axis);
    for (let index = 1; index < points.length - 1; index += 1)
      for (const point of [points[0], points[index], points[index + 1]]) {
        positions.push(point.x, point.y, point.z);
        normals.push(normal.x, normal.y, normal.z);
        const coordinates = point.toArray();
        uv.push(
          coordinates[axes[0]] / (half[axes[0]] * 2) + 0.5,
          coordinates[axes[1]] / (half[axes[1]] * 2) + 0.5,
        );
      }
  };
  for (let axis = 0; axis < 3; axis += 1)
    for (const sign of [-1, 1]) {
      const others = [0, 1, 2].filter((candidate) => candidate !== axis);
      face(
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([a, b]) => {
          const point = [0, 0, 0];
          point[axis] = half[axis] * sign;
          point[others[0]] = (half[others[0]] - r) * a;
          point[others[1]] = (half[others[1]] - r) * b;
          return new THREE.Vector3(...point);
        }),
      );
    }
  for (let axis = 0; axis < 3; axis += 1) {
    const [a, b] = [0, 1, 2].filter((candidate) => candidate !== axis);
    for (const signA of [-1, 1])
      for (const signB of [-1, 1]) {
        face(
          [
            [-1, 0],
            [1, 0],
            [1, 1],
            [-1, 1],
          ].map(([along, edge]) => {
            const point = [0, 0, 0];
            point[axis] = (half[axis] - r) * along;
            point[a] = (half[a] - (edge ? r : 0)) * signA;
            point[b] = (half[b] - (edge ? 0 : r)) * signB;
            return new THREE.Vector3(...point);
          }),
        );
      }
  }
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1]) {
        const signs = [x, y, z];
        face(
          [0, 1, 2].map(
            (axis) =>
              new THREE.Vector3(
                ...half.map(
                  (value, index) =>
                    (value - (index === axis ? 0 : r)) * signs[index],
                ),
              ),
          ),
        );
      }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeBoundingSphere();
  return geometry;
}
