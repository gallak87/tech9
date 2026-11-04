import * as T from 'three';

const cross = (a, b, p) =>
  (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

// Opt-in projection onto the exact rendered triangles, including transverse
// curvature. Borrow meshes; the returned geometry belongs to each device.
export function createSurfaceProjector(
  track,
  surfaces,
  { nominal = false } = {},
) {
  const buckets = new Map(),
    bucketSize = 64;
  const bounds = { minX: Infinity, maxX: -Infinity };
  for (const mesh of surfaces) {
    const matrix =
      nominal && mesh.userData?.motionGroup
        ? mesh.userData.nominalMatrixWorld
        : mesh.matrixWorld;
    if (!matrix?.isMatrix4)
      throw new Error(
        'Moving road surfaces require a nominalMatrixWorld for device projection.',
      );
    const g = mesh.geometry,
      p = g.attributes.position,
      c = g.attributes.roadCoord;
    const indices = g.index,
      count = indices?.count ?? p.count;
    for (let i = 0; i < count; i += 3) {
      const vertices = [0, 1, 2].map((j) => {
        const n = indices ? indices.getX(i + j) : i + j;
        return {
          at: [c.getY(n), c.getX(n)],
          p: new T.Vector3().fromBufferAttribute(p, n).applyMatrix4(matrix),
        };
      });
      const normal = vertices[1].p
        .clone()
        .sub(vertices[0].p)
        .cross(vertices[2].p.clone().sub(vertices[0].p))
        .normalize();
      const triangle = {
        vertices,
        normal,
        motionGroup: mesh.userData?.motionGroup,
        minX: Math.min(...vertices.map((v) => v.at[0])),
        maxX: Math.max(...vertices.map((v) => v.at[0])),
        minS: Math.min(...vertices.map((v) => v.at[1])),
        maxS: Math.max(...vertices.map((v) => v.at[1])),
      };
      bounds.minX = Math.min(bounds.minX, triangle.minX);
      bounds.maxX = Math.max(bounds.maxX, triangle.maxX);
      const distances = vertices.map((v) => v.at[1]);
      for (
        let b = Math.floor(Math.min(...distances) / bucketSize);
        b <= Math.floor(Math.max(...distances) / bucketSize);
        b++
      ) {
        if (!buckets.has(b)) buckets.set(b, []);
        buckets.get(b).push(triangle);
      }
    }
  }
  const candidates = (from, to) => {
    const result = new Set();
    for (
      let b = Math.floor(from / bucketSize);
      b <= Math.floor(to / bucketSize);
      b++
    )
      for (const triangle of buckets.get(b) ?? []) result.add(triangle);
    return result;
  };
  function surfaceAt(distance, lateral) {
    const s =
        track.closed === false
          ? T.MathUtils.clamp(distance, 0, track.length)
          : T.MathUtils.euclideanModulo(distance, track.length),
      point = [lateral, s];
    for (const triangle of candidates(s, s)) {
      const { vertices } = triangle;
      const [a, b, c] = vertices,
        area = cross(a.at, b.at, c.at);
      const u = cross(b.at, c.at, point) / area,
        v = cross(c.at, a.at, point) / area,
        w = 1 - u - v;
      if (Math.min(u, v, w) >= -1e-6) return { triangle, u, v, w };
    }
    throw new Error(
      `Device footprint has no rendered surface at ${s}, ${lateral}`,
    );
  }
  function sample(distance, lateral) {
    const { triangle, u, v, w } = surfaceAt(distance, lateral);
    const [a, b, c] = triangle.vertices;
    return a.p
      .clone()
      .multiplyScalar(u)
      .addScaledVector(b.p, v)
      .addScaledVector(c.p, w);
  }
  function geometry(shapes, offset = 0.08, skirt = null, { motionGroup } = {}) {
    const positions = [],
      normals = [],
      coordinates = [];
    const vertex = (v, normal, lift) => {
      positions.push(...v.p.clone().addScaledVector(normal, lift).toArray());
      normals.push(...normal.toArray());
      coordinates.push(...v.at);
    };
    for (const original of shapes) {
      const low = Math.min(...original.map((v) => v[1])),
        high = Math.max(...original.map((v) => v[1]));
      for (
        let lap = track.closed === false ? 0 : Math.floor(low / track.length);
        lap <= (track.closed === false ? 0 : Math.floor(high / track.length));
        lap++
      ) {
        const shape = original.map(([x, s]) => [x, s - lap * track.length]);
        const minX = Math.min(...shape.map((p) => p[0]));
        const maxX = Math.max(...shape.map((p) => p[0]));
        const minS = Math.min(...shape.map((p) => p[1]));
        const maxS = Math.max(...shape.map((p) => p[1]));
        if (maxX < bounds.minX || minX > bounds.maxX) continue;
        const sign = Math.sign(
          shape.reduce((sum, a, i) => {
            const b = shape[(i + 1) % shape.length];
            return sum + a[0] * b[1] - b[0] * a[1];
          }, 0),
        );
        for (const triangle of candidates(
          Math.max(0, low - lap * track.length),
          Math.min(track.length, high - lap * track.length),
        )) {
          if (motionGroup !== undefined && triangle.motionGroup !== motionGroup)
            continue;
          if (
            triangle.maxX < minX ||
            triangle.minX > maxX ||
            triangle.maxS < minS ||
            triangle.minS > maxS
          )
            continue;
          let polygon = triangle.vertices;
          for (let e = 0; e < shape.length && polygon.length; e++) {
            const a = shape[e],
              b = shape[(e + 1) % shape.length],
              clipped = [];
            for (let i = 0; i < polygon.length; i++) {
              const current = polygon[i],
                next = polygon[(i + 1) % polygon.length];
              const da = cross(a, b, current.at) * sign,
                db = cross(a, b, next.at) * sign;
              if (da >= -1e-8) clipped.push(current);
              if (da >= 0 !== db >= 0) {
                const t = da / (da - db);
                clipped.push({
                  at: current.at.map((v, k) =>
                    T.MathUtils.lerp(v, next.at[k], t),
                  ),
                  p: current.p.clone().lerp(next.p, t),
                });
              }
            }
            polygon = clipped;
          }
          const n = triangle.normal;
          for (let i = 1; i < polygon.length - 1; i++)
            for (const v of [polygon[0], polygon[i], polygon[i + 1]])
              vertex(v, n, offset);
          if (skirt !== null && polygon.length >= 3)
            for (let i = 0; i < polygon.length; i++) {
              const a = polygon[i],
                b = polygon[(i + 1) % polygon.length];
              if (track.deviceOutlineSkirts) {
                // Adjacent projected triangles already meet. Internal skirts
                // overlap on curved decks and can mask the painted surface.
                const onOutline = shape.some((p, j) => {
                  const q = shape[(j + 1) % shape.length];
                  const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
                  return (
                    Math.abs(cross(p, q, a.at)) <= length * 1e-5 &&
                    Math.abs(cross(p, q, b.at)) <= length * 1e-5
                  );
                });
                if (!onOutline) continue;
              }
              const side = b.p.clone().sub(a.p).cross(n).normalize();
              for (const [v, lift] of [
                [a, offset],
                [a, skirt],
                [b, offset],
                [b, offset],
                [a, skirt],
                [b, skirt],
              ]) {
                positions.push(
                  ...v.p.clone().addScaledVector(n, lift).toArray(),
                );
                normals.push(...side.toArray());
                coordinates.push(...v.at);
              }
            }
        }
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
    g.setAttribute('roadCoord', new T.Float32BufferAttribute(coordinates, 2));
    g.computeBoundingSphere();
    return g;
  }
  return {
    sample,
    motionGroupAt: (s, x = 0) => surfaceAt(s, x).triangle.motionGroup,
    geometry,
    frame: (s, x) => track.sampleSurface?.(s, x) ?? track.sample(s),
    dispose() {
      buckets.clear();
    },
  };
}
