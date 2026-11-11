import * as T from 'three';

/** A complete swept road/driver/camera exclusion, including the owning arc. */
export function createForestRouteClearance(
  track,
  { step = 3, halfWidth = track.width / 2 + 4, minUp = -1, maxUp = 26 } = {},
) {
  const cell = 48,
    buckets = new Map(),
    routeBounds = new T.Box3();
  const localBox = new T.Box3(
    new T.Vector3(-halfWidth, minUp, -step * 0.7),
    new T.Vector3(halfWidth, maxUp, step * 0.7),
  );
  const cells = (bounds, visit) => {
    const a = bounds.min,
      b = bounds.max;
    for (let x = Math.floor(a.x / cell); x <= Math.floor(b.x / cell); x++)
      for (let y = Math.floor(a.y / cell); y <= Math.floor(b.y / cell); y++)
        for (let z = Math.floor(a.z / cell); z <= Math.floor(b.z / cell); z++)
          visit(`${x},${y},${z}`);
  };
  const count = Math.ceil(track.length / step),
    spacing = track.length / count;
  for (let i = 0; i < count; i++) {
    const distance = i * spacing,
      frame = track.sample(distance);
    const matrix = new T.Matrix4().compose(
      frame.position,
      frame.quaternion,
      new T.Vector3(1, 1, 1),
    );
    const box = localBox.clone().applyMatrix4(matrix);
    routeBounds.union(box);
    const entry = { distance, bounds: box, inverse: matrix.clone().invert() };
    cells(box, (key) => {
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(entry);
    });
  }
  const a = new T.Vector3(),
    b = new T.Vector3(),
    c = new T.Vector3(),
    triangle = new T.Triangle();
  const bounds = new T.Box3(),
    nearby = new Set();
  return {
    halfWidth,
    minUp,
    maxUp,
    intersectsGeometry(geometry, matrix) {
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const whole = geometry.boundingBox.clone();
      if (matrix) whole.applyMatrix4(matrix);
      if (!routeBounds.intersectsBox(whole)) return null;
      let nearRoute = false;
      cells(whole, (key) => {
        if (
          (buckets.get(key) ?? []).some((entry) =>
            entry.bounds.intersectsBox(whole),
          )
        )
          nearRoute = true;
      });
      if (!nearRoute) return null;
      const p = geometry.attributes.position,
        index = geometry.index;
      const indices =
        index?.array ?? Array.from({ length: p.count }, (_, i) => i);
      for (let i = 0; i < indices.length; i += 3) {
        a.fromBufferAttribute(p, indices[i]);
        b.fromBufferAttribute(p, indices[i + 1]);
        c.fromBufferAttribute(p, indices[i + 2]);
        if (matrix) {
          a.applyMatrix4(matrix);
          b.applyMatrix4(matrix);
          c.applyMatrix4(matrix);
        }
        bounds.setFromPoints([a, b, c]);
        nearby.clear();
        cells(bounds, (key) => {
          for (const entry of buckets.get(key) ?? [])
            if (entry.bounds.intersectsBox(bounds)) nearby.add(entry);
        });
        for (const entry of nearby) {
          triangle.a.copy(a).applyMatrix4(entry.inverse);
          triangle.b.copy(b).applyMatrix4(entry.inverse);
          triangle.c.copy(c).applyMatrix4(entry.inverse);
          if (localBox.intersectsTriangle(triangle))
            return { distance: entry.distance, triangle: i / 3 };
        }
      }
      return null;
    },
  };
}
