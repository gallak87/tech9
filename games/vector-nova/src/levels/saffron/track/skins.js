import * as T from 'three';

// Clip the actual slab triangles in route coordinates, retaining their exact
// barycentric surface. A separate curve sweep can intersect the slab on banks.
export function deckSkinGeometry(surfaces, track, start, end, halfWidth, lift) {
  const positions = [],
    coordinates = [];
  function clip(polygon, axis, boundary, sign) {
    const output = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      const da = (a.uv[axis] - boundary) * sign;
      const db = (b.uv[axis] - boundary) * sign;
      if (da >= -1e-7) output.push(a);
      if (da < 0 !== db < 0) {
        const t = da / (da - db);
        output.push({
          uv: a.uv.map((v, n) => T.MathUtils.lerp(v, b.uv[n], t)),
          point: a.point.clone().lerp(b.point, t),
        });
      }
    }
    return output;
  }
  for (const surface of surfaces) {
    if (surface.end < start || surface.start > end) continue;
    const geometry = surface.geometry,
      index = geometry.index;
    const uv = geometry.attributes.roadCoord,
      p = geometry.attributes.position;
    for (let i = 0; i < index.count; i += 3) {
      const stations = [0, 1, 2].map((offset) =>
        uv.getX(index.getX(i + offset)),
      );
      if (Math.max(...stations) < start || Math.min(...stations) > end)
        continue;
      let polygon = [0, 1, 2].map((offset) => {
        const vertex = index.getX(i + offset);
        return {
          uv: [uv.getX(vertex), uv.getY(vertex)],
          point: new T.Vector3().fromBufferAttribute(p, vertex),
        };
      });
      for (const [axis, boundary, sign] of [
        [0, start, 1],
        [0, end, -1],
        [1, -halfWidth, 1],
        [1, halfWidth, -1],
      ])
        if (polygon.length) polygon = clip(polygon, axis, boundary, sign);
      for (let n = 1; n < polygon.length - 1; n++)
        for (const vertex of [polygon[0], polygon[n], polygon[n + 1]]) {
          const up = track.sample(vertex.uv[0]).up;
          const point = vertex.point.clone().addScaledVector(up, lift);
          positions.push(point.x, point.y, point.z);
          coordinates.push(...vertex.uv);
        }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute(
    'roadCoord',
    new T.Float32BufferAttribute(coordinates, 2),
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
