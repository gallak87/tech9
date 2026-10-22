import * as T from 'three';

/** Identical sheet stations and cross sections feed rendering and static collision. */
export function sheetGeometry(
  track,
  start,
  end,
  { min = -36, max = 36, lift = 0, columns = 12 } = {},
) {
  const rows = Math.max(1, Math.ceil((end - start) / 6));
  const positions = [],
    normals = [],
    uv = [],
    coordinates = [],
    indices = [];
  for (let row = 0; row <= rows; row++) {
    const distance = T.MathUtils.lerp(start, end, row / rows);
    const f = track.sample(distance),
      p = track.profileAt(distance);
    for (let col = 0; col <= columns; col++) {
      const lateral = T.MathUtils.lerp(min, max, col / columns);
      const point = f.position
        .clone()
        .addScaledVector(f.right, lateral)
        .addScaledVector(f.up, p.depth * (lateral / p.halfWidth) ** 2 + lift);
      const across = f.right
        .clone()
        .addScaledVector(f.up, (2 * p.depth * lateral) / p.halfWidth ** 2);
      const along = track
        .surfacePoint(distance + 0.25, lateral)
        .sub(track.surfacePoint(distance - 0.25, lateral));
      normals.push(...along.cross(across).normalize().toArray());
      positions.push(...point.toArray());
      uv.push(lateral / 6, distance / 6);
      coordinates.push(distance, lateral);
      if (row < rows && col < columns) {
        const a = row * (columns + 1) + col,
          b = a + columns + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.setAttribute(
    'roadCoord',
    new T.Float32BufferAttribute(coordinates, 2),
  );
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}
export function rimGeometry(track, start, end, side) {
  const rows = Math.ceil((end - start) / 6),
    positions = [],
    indices = [];
  for (let row = 0; row <= rows; row++) {
    const distance = T.MathUtils.lerp(start, end, row / rows),
      f = track.sample(distance);
    const depth = track.profileAt(distance).depth;
    for (const [lateral, lift] of [
      [side * 36, 0],
      [side * 36.8, 1.25],
      [side * 38.2, 1.25],
      [side * 38.2, -2.8],
    ]) {
      positions.push(
        ...f.position
          .clone()
          .addScaledVector(f.right, lateral)
          .addScaledVector(f.up, depth + lift)
          .toArray(),
      );
    }
    if (row < rows)
      for (let face = 0; face < 3; face++) {
        const a = row * 4 + face;
        const triangles =
          side > 0
            ? [a, a + 4, a + 1, a + 1, a + 4, a + 5]
            : [a, a + 1, a + 4, a + 1, a + 5, a + 4];
        indices.push(...triangles);
      }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
