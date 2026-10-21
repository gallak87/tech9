import * as T from 'three';

const PROFILE = [
  [40, 15],
  [42, 38],
  [32, 62],
  [18, 81],
  [2, 95],
  [-12, 100],
];
const WINDOWS = [
  [0.48, 0.14, 0.21, 0.095],
  [0.61, 0.37, 0.265, 0.1],
  [0.48, 0.6, 0.21, 0.095],
  [0.61, 0.84, 0.265, 0.105],
];

// Positive outside all windows. The broad lobes break the ellipse without
// introducing high-frequency details that would alias at the driver's view.
function windowField(u, v) {
  let field = Infinity;
  for (let i = 0; i < WINDOWS.length; i++) {
    const [cx, cy, rx, ry] = WINDOWS[i];
    const x = (u - cx) / rx,
      y = (v - cy) / ry;
    const a = Math.atan2(y, x);
    field = Math.min(
      field,
      Math.hypot(x, y) -
        1 -
        Math.sin(a * 3 + i * 1.7) * 0.12 -
        Math.sin(a * 5 - i) * 0.06,
    );
  }
  return field;
}

function createSurface(track, start, end) {
  const rows = Math.min(256, Math.max(2, Math.ceil((end - start) / 6)));
  const cols = 41,
    positions = [],
    uvs = [],
    indices = [];
  for (let row = 0; row <= rows; row++) {
    const s = start + ((end - start) * row) / rows,
      frame = track.sample(s);
    for (let col = 0; col < cols; col++) {
      const t = (col / (cols - 1)) * (PROFILE.length - 1);
      const section = Math.min(PROFILE.length - 2, Math.floor(t)),
        blend = t - section;
      const x = T.MathUtils.lerp(
        PROFILE[section][0],
        PROFILE[section + 1][0],
        blend,
      );
      const y = T.MathUtils.lerp(
        PROFILE[section][1],
        PROFILE[section + 1][1],
        blend,
      );
      const wave = Math.sin(s * 0.016 + (col / (cols - 1)) * 3.6);
      const p = frame.position
        .clone()
        .addScaledVector(frame.right, x + wave * 2)
        .addScaledVector(frame.up, y + wave * 3);
      positions.push(p.x, p.y, p.z);
      uvs.push(col / (cols - 1), row / rows);
      if (row < rows && col < cols - 1) {
        const n = row * cols + col;
        indices.push(n, n + cols, n + 1, n + 1, n + cols, n + cols + 1);
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createCrust(surface) {
  const position = surface.attributes.position,
    normal = surface.attributes.normal,
    uv = surface.attributes.uv;
  const points = [],
    fields = [],
    front = [],
    crossings = new Map();
  for (let i = 0; i < position.count; i++) {
    points.push({
      p: [position.getX(i), position.getY(i), position.getZ(i)],
      n: [normal.getX(i), normal.getY(i), normal.getZ(i)],
      uv: [uv.getX(i), uv.getY(i)],
    });
    fields.push(windowField(uv.getX(i), uv.getY(i)));
  }
  function crossing(a, b) {
    if (Math.abs(fields[a]) < 1e-8) return a;
    if (Math.abs(fields[b]) < 1e-8) return b;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (crossings.has(key)) return crossings.get(key);
    const pa = points[a],
      pb = points[b];
    let low = 0,
      high = 1;
    // Solve the actual irregular contour, not a triangle-centroid decision or
    // a linear interpolation of a non-linear distance function.
    for (let iteration = 0; iteration < 28; iteration++) {
      const t = (low + high) * 0.5;
      const value = windowField(
        T.MathUtils.lerp(pa.uv[0], pb.uv[0], t),
        T.MathUtils.lerp(pa.uv[1], pb.uv[1], t),
      );
      if (value >= 0 === fields[a] >= 0) low = t;
      else high = t;
    }
    const t = (low + high) * 0.5;
    const n = new T.Vector3(...pa.n)
      .lerp(new T.Vector3(...pb.n), t)
      .normalize();
    const index = points.length;
    points.push({
      p: pa.p.map((value, axis) => T.MathUtils.lerp(value, pb.p[axis], t)),
      n: n.toArray(),
      uv: pa.uv.map((value, axis) => T.MathUtils.lerp(value, pb.uv[axis], t)),
    });
    fields.push(0);
    crossings.set(key, index);
    return index;
  }
  const sourceIndex = surface.index;
  for (let i = 0; i < sourceIndex.count; i += 3) {
    const triangle = [
      sourceIndex.getX(i),
      sourceIndex.getX(i + 1),
      sourceIndex.getX(i + 2),
    ];
    const polygon = [];
    for (let edge = 0; edge < 3; edge++) {
      const a = triangle[edge],
        b = triangle[(edge + 1) % 3];
      const insideA = fields[a] >= 0,
        insideB = fields[b] >= 0;
      if (insideA) polygon.push(a);
      if (insideA !== insideB) polygon.push(crossing(a, b));
    }
    for (let corner = 1; corner < polygon.length - 1; corner++) {
      const a = polygon[0],
        b = polygon[corner],
        c = polygon[corner + 1];
      if (a !== b && b !== c && c !== a) front.push(a, b, c);
    }
  }
  const positions = [],
    uvs = [],
    indices = [],
    edges = new Map(),
    count = points.length;
  for (const offset of [1.05, -2.4])
    for (const { p, n, uv: coordinate } of points) {
      positions.push(
        p[0] + n[0] * offset,
        p[1] + n[1] * offset,
        p[2] + n[2] * offset,
      );
      uvs.push(...coordinate);
    }
  function addEdge(a, b) {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (edges.has(key)) edges.delete(key);
    else edges.set(key, [a, b]);
  }
  for (let i = 0; i < front.length; i += 3) {
    const [a, b, c] = front.slice(i, i + 3);
    indices.push(a, b, c, c + count, b + count, a + count);
    addEdge(a, b);
    addEdge(b, c);
    addEdge(c, a);
  }
  const revealStart = indices.length;
  // Shared solved edge vertices close both the aperture reveal and the outer
  // shell perimeter. No duplicate unshared contour points or T-junctions.
  for (const [a, b] of edges.values())
    indices.push(a, a + count, b, b, a + count, b + count);
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.addGroup(0, revealStart, 0);
  geometry.addGroup(revealStart, indices.length - revealStart, 1);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Caller owns both returned geometries; material and texture ownership stay separate. */
export function createMineralVeilGeometry(track, start, end) {
  if (
    !track?.sample ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start
  )
    throw new RangeError(
      'Mineral veil requires a track and a finite positive interval',
    );
  const surface = createSurface(track, start, end);
  try {
    return { surface, crust: createCrust(surface) };
  } catch (error) {
    surface.dispose();
    throw error;
  }
}

/** Extend the actual arch terminal contour into flared bedrock. This fitted
 * landmark assembly does not assume the kit's ring tessellation or quality.
 */
export function createMineralSpringingGeometry(arch, side, depth) {
  const source = arch.attributes.position,
    ring = [];
  for (let i = 0; i < source.count; i++) {
    const p = new T.Vector3().fromBufferAttribute(source, i);
    if (Math.abs(p.y) < 0.001 && p.x * side > 0) ring.push(p);
  }
  const center = ring
    .reduce((sum, p) => sum.add(p), new T.Vector3())
    .divideScalar(ring.length);
  const unique = new Map();
  for (const p of ring)
    if (p.distanceTo(center) > 3)
      unique.set(`${p.x.toFixed(3)}:${p.z.toFixed(3)}`, p);
  const contour = [...unique.values()].sort(
    (a, b) =>
      Math.atan2(a.z - center.z, a.x - center.x) -
      Math.atan2(b.z - center.z, b.x - center.x),
  );
  const positions = [],
    uv = [],
    indices = [],
    rows = 12,
    cols = contour.length;
  for (let row = 0; row <= rows; row++) {
    const t = row / rows,
      flare = 1.015 + 0.58 * t * t;
    for (let col = 0; col < cols; col++) {
      const p = contour[col];
      positions.push(
        center.x + (p.x - center.x) * flare + side * 9 * t * t,
        0.7 - depth * t,
        center.z + (p.z - center.z) * flare,
      );
      uv.push(col / cols, (t * depth) / 16);
      if (row < rows) {
        const a = row * cols + col,
          b = row * cols + ((col + 1) % cols);
        indices.push(a, b, a + cols, b, b + cols, a + cols);
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
