import { CatmullRomCurve3, Vector3 } from 'three';

const METRES_PER_SAMPLE = 2;
const MAX_DIVISIONS = 4096;
const MAX_POINTS = 256;
const MAX_CACHED_SEGMENTS = 2048;
const cache = new Map();
const wrap = (i, n) => ((i % n) + n) % n;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const signaturePoint = (point) => [
  point.id,
  point.x,
  point.y,
  point.z,
  point.bank ?? 0,
  point.roll ?? 0,
];

function extrapolated(edge, next, side) {
  return {
    id: [side, edge.id, next.id],
    x: 2 * edge.x - next.x,
    y: 2 * edge.y - next.y,
    z: 2 * edge.z - next.z,
    bank: edge.bank ?? 0,
    roll: edge.roll ?? 0,
  };
}

function radius(before, after) {
  const a = before.length(),
    b = after.length();
  if (a < 1e-9 || b < 1e-9) return 0;
  const angle = before.angleTo(after);
  if (angle < 1e-7) return Infinity;
  return (a + b) / (2 * angle);
}

// A true reversal has zero knot tangent. Sampling only one side of that knot
// would otherwise mistake two straight lines meeting at a cusp for no bend.
function reversesAt(a, b, c, horizontal = false) {
  const before = new Vector3(b.x - a.x, horizontal ? 0 : b.y - a.y, b.z - a.z),
    after = new Vector3(c.x - b.x, horizontal ? 0 : c.y - b.y, c.z - b.z);
  if (before.lengthSq() < 1e-12 || after.lengthSq() < 1e-12) return false;
  return before.normalize().dot(after.normalize()) < -1 + 1e-10;
}

function measure(controls) {
  const [a, b, c, d] = controls;
  // Capping applies only to malformed/oversized geometry. An ordinary 25 km
  // course needs roughly 19k samples across all its segments, not per segment.
  const estimate = distance(b, c) + (distance(a, b) + distance(c, d)) / 4;
  const divisions = Math.min(
    MAX_DIVISIONS,
    Math.max(16, Math.ceil(estimate / METRES_PER_SAMPLE)),
  );
  const curve = new CatmullRomCurve3(
    controls.map((p) => new Vector3(p.x, p.y, p.z)),
    false,
    'centripetal',
  );
  // The middle segment uses precisely the same four controls as the full
  // curve, without its global arc table or point-count-dependent sample phase.
  const points = Array.from({ length: divisions + 1 }, (_, i) =>
    curve.getPoint((1 + i / divisions) / 3),
  );
  let minRadius = reversesAt(a, b, c) || reversesAt(b, c, d) ? 0 : Infinity,
    minHorizontalRadius =
      reversesAt(a, b, c, true) || reversesAt(b, c, d, true) ? 0 : Infinity,
    maxGrade = 0;
  const before = new Vector3(),
    after = new Vector3();
  for (let i = 1; i < points.length; i++) {
    after.subVectors(points[i], points[i - 1]);
    const horizontal = Math.hypot(after.x, after.z);
    const grade =
      horizontal < 1e-9
        ? Math.abs(after.y) < 1e-9
          ? 0
          : Infinity
        : Math.abs(after.y) / horizontal;
    maxGrade = Math.max(maxGrade, grade);
    if (i < 2) continue;
    before.subVectors(points[i - 1], points[i - 2]);
    minRadius = Math.min(minRadius, radius(before, after));
    before.y = after.y = 0;
    // A vertical centerline has no horizontal direction; grade catches it.
    if (before.lengthSq() > 1e-12 && after.lengthSq() > 1e-12)
      minHorizontalRadius = Math.min(
        minHorizontalRadius,
        radius(before, after),
      );
  }
  return {
    minRadius,
    minHorizontalRadius,
    maxGrade,
    sampleCount: points.length,
  };
}

/** Deterministic centerline checks for comparing local edits. These do not
 * replace full road/frame, crossing, jump or clearance validation. Results are
 * detached; unchanged four-control signatures give unchanged measurements. */
export function analyzeCornerSegments(doc) {
  if (!Array.isArray(doc?.points))
    throw new TypeError('Road points are required.');
  const { points } = doc;
  if (points.length > MAX_POINTS) throw new RangeError('Too many road points.');
  if (points.length < 2) return [];
  for (const point of points)
    if (
      typeof point?.id !== 'string' ||
      ![point.x, point.y, point.z, point.bank ?? 0, point.roll ?? 0].every(
        Number.isFinite,
      )
    )
      throw new TypeError('Road points must have IDs and finite geometry.');
  const closed = doc.courseType !== 'downhill';
  const count = closed ? points.length : points.length - 1;
  return Array.from({ length: count }, (_, index) => {
    const controls = [-1, 0, 1, 2].map((offset) => {
      const at = index + offset;
      if (closed) return points[wrap(at, points.length)];
      if (at < 0) return extrapolated(points[0], points[1], 'before');
      if (at >= points.length)
        return extrapolated(points.at(-1), points.at(-2), 'after');
      return points[at];
    });
    const signature = JSON.stringify([
      'centripetal-segment-v1',
      closed,
      controls.map(signaturePoint),
    ]);
    let metrics = cache.get(signature);
    if (metrics) cache.delete(signature);
    else metrics = measure(controls);
    if (cache.size >= MAX_CACHED_SEGMENTS)
      cache.delete(cache.keys().next().value);
    cache.set(signature, metrics);
    return {
      startPointId: controls[1].id,
      endPointId: controls[2].id,
      signature,
      ...metrics,
    };
  });
}
