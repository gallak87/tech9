import {
  analyzeDocument,
  validateDocument,
  pointRouteFractions,
  DOCUMENT_LIMITS,
  DOWNHILL_RUNOUT,
} from './document.js';

const masks = new WeakMap();
const wrap = (i, n) => ((i % n) + n) % n;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const lerp = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  z: a.z + (b.z - a.z) * t,
});
const unsupported = (doc) =>
  (doc.rolls?.length ?? 0) > 0 ||
  doc.points.some((p) => Math.abs(p.roll ?? 0) > 1e-7) ||
  (doc.jumps ?? []).some((j) => !j.launchPointId || !j.landingPointId);
function protectedPoints(doc, report) {
  const cached = masks.get(doc);
  if (cached?.report === report) return cached.indices;
  const n = doc.points.length,
    closed = doc.courseType !== 'downhill';
  const fixed = new Set([0, 1, n - 1]);
  const fractions = pointRouteFractions(doc),
    length = report.length;
  const corridors = (doc.jumps ?? []).map((j) => [
    j.start * length - 160,
    j.end * length + (j.receiving ?? 300),
  ]);
  if (!closed) corridors.push([length - DOWNHILL_RUNOUT, length]);
  const controls = new Set();
  for (let i = 0; i < n; i++) {
    if (
      corridors.some(
        ([start, end]) =>
          fractions[i] * length >= start && fractions[i] * length <= end,
      )
    ) {
      for (let offset = -2; offset <= 2; offset++) {
        const index = closed ? wrap(i + offset, n) : i + offset;
        if (index >= 0 && index < n) controls.add(index);
      }
    }
  }
  for (const i of controls) fixed.add(i);
  masks.set(doc, { report, indices: fixed });
  return fixed;
}
function localIndices(doc, center, radius) {
  const n = doc.points.length,
    closed = doc.courseType !== 'downhill';
  return [
    ...new Set(
      Array.from({ length: radius * 2 + 1 }, (_, i) =>
        closed ? wrap(center + i - radius, n) : center + i - radius,
      ).filter((i) => i >= 0 && i < n),
    ),
  ];
}
/** Pass the editor's cached report; this function never reruns physical analysis.
 * Feature masks are cached per unchanged document/report for render hot paths. */
export function canSmoothCorner(doc, analysis) {
  if (
    !analysis ||
    analysis.valid ||
    analysis.primaryIssue?.kind !== 'bend' ||
    !Array.isArray(doc?.points) ||
    doc.points.length < 4 ||
    unsupported(doc)
  )
    return false;
  const index = analysis.primaryIssue.pointIndex;
  if (!Number.isInteger(index) || index < 0 || index >= doc.points.length)
    return false;
  try {
    const fixed = protectedPoints(doc, analysis);
    return localIndices(doc, index, 2).some((i) => !fixed.has(i));
  } catch {
    return false;
  }
}
function relaxed(doc, center, radius, strength, fixed) {
  const candidate = { ...doc, points: doc.points.map((p) => ({ ...p })) };
  const n = doc.points.length,
    closed = doc.courseType !== 'downhill';
  for (const i of localIndices(doc, center, radius)) {
    if (fixed.has(i)) continue;
    const before = doc.points[closed ? wrap(i - 1, n) : i - 1],
      after = doc.points[closed ? wrap(i + 1, n) : i + 1];
    if (!before || !after) continue;
    const separation = Math.min(
      Math.abs(i - center),
      closed ? n - Math.abs(i - center) : Infinity,
    );
    const weight = separation === 0 ? 1 : separation === 1 ? 0.65 : 0.3;
    const target = lerp(before, after, 0.5),
      point = doc.points[i];
    const cap = Math.min(
      600,
      Math.max(
        80,
        Math.max(distance(point, before), distance(point, after)) * 0.8,
      ),
    );
    const amount = Math.min(
      strength * weight,
      cap / Math.max(1e-9, distance(point, target)),
    );
    Object.assign(candidate.points[i], lerp(point, target, amount));
  }
  return candidate;
}
function curved(doc, center, strength, fixed) {
  const n = doc.points.length,
    closed = doc.courseType !== 'downhill';
  const index = (offset) =>
    closed ? wrap(center + offset, n) : center + offset;
  const ids = [-2, -1, 0, 1, 2].map(index);
  if (new Set(ids).size !== 5 || ids.some((i) => i < 0 || i >= n)) return null;
  const a = doc.points[ids[0]],
    b = doc.points[ids[4]];
  const before = doc.points[index(-3)],
    after = doc.points[index(3)];
  if (!before || !after) return null;
  const chord = distance(a, b),
    handle = chord / 3;
  const unit = (from, to) => {
    const d = Math.max(1e-9, distance(from, to));
    return { x: (to.x - from.x) / d, z: (to.z - from.z) / d };
  };
  const enter = unit(before, a),
    leave = unit(b, after);
  const c = { x: a.x + enter.x * handle, z: a.z + enter.z * handle },
    d = { x: b.x - leave.x * handle, z: b.z - leave.z * handle };
  const candidate = { ...doc, points: doc.points.map((p) => ({ ...p })) };
  for (let j = 1; j < 4; j++) {
    const i = ids[j];
    if (fixed.has(i)) continue;
    const t = j / 4,
      u = 1 - t;
    const target = {
      x:
        u ** 3 * a.x + 3 * u * u * t * c.x + 3 * u * t * t * d.x + t ** 3 * b.x,
      z:
        u ** 3 * a.z + 3 * u * u * t * c.z + 3 * u * t * t * d.z + t ** 3 * b.z,
    };
    const cap = Math.min(600, Math.max(80, chord * 0.5));
    const amount = Math.min(
      strength,
      cap / Math.max(1e-9, distance(doc.points[i], target)),
    );
    Object.assign(candidate.points[i], lerp(doc.points[i], target, amount));
  }
  return candidate;
}
function openCorner(doc, center, offset, fixed) {
  if (fixed.has(center)) return null;
  const n = doc.points.length,
    closed = doc.courseType !== 'downhill';
  const before = doc.points[closed ? wrap(center - 1, n) : center - 1],
    after = doc.points[closed ? wrap(center + 1, n) : center + 1];
  if (!before || !after) return null;
  const midpoint = lerp(before, after, 0.5),
    point = doc.points[center];
  const target = {
    x: midpoint.x - (after.z - before.z) * offset,
    z: midpoint.z + (after.x - before.x) * offset,
  };
  const cap = Math.min(
    600,
    Math.max(
      80,
      Math.max(distance(point, before), distance(point, after)) * 0.8,
    ),
  );
  const candidate = { ...doc, points: doc.points.map((p) => ({ ...p })) };
  Object.assign(
    candidate.points[center],
    lerp(
      point,
      target,
      Math.min(1, cap / Math.max(1e-9, distance(point, target))),
    ),
  );
  return candidate;
}
/** Change only nearby X/Z controls. No candidate is returned until every existing
 * physical track check passes. The source, feature anchors and elevations stay intact. */
export async function smoothCorner(
  value,
  { pointIndex, analysis, yieldControl = () => Promise.resolve() } = {},
) {
  const source = validateDocument(value),
    report = analysis ?? analyzeDocument(source);
  if (report.valid) return source;
  if (unsupported(source))
    throw new Error(
      'Automatic smoothing cannot change twists or unanchored jumps. Move this point or its neighbours manually; your road has not changed.',
    );
  const center = pointIndex ?? report.primaryIssue?.pointIndex;
  if (
    report.primaryIssue?.kind !== 'bend' ||
    !Number.isInteger(center) ||
    center < 0 ||
    center >= source.points.length
  )
    throw new Error(
      'Choose a highlighted tight corner to smooth. Your road has not changed.',
    );
  const fixed = protectedPoints(source, report);
  if (!localIndices(source, center, 2).some((i) => !fixed.has(i)))
    throw new Error(
      'This corner is inside a protected start, jump or receiving section. Move the neighbouring ordinary road manually; your road has not changed.',
    );
  const seen = new Set();
  const candidates = [];
  for (const radius of [0, 1, 2])
    for (const strength of [0.3, 0.55, 0.8, 1])
      candidates.push(() => relaxed(source, center, radius, strength, fixed));
  for (const strength of [0.3, 0.55, 0.8, 1])
    candidates.push(() => curved(source, center, strength, fixed));
  for (const offset of [-0.35, 0.35, -0.65, 0.65])
    candidates.push(() => openCorner(source, center, offset, fixed));
  for (const build of candidates) {
    const candidate = build();
    if (!candidate) continue;
    const key = JSON.stringify(candidate.points.map((p) => [p.x, p.z]));
    if (seen.has(key)) continue;
    seen.add(key);
    if (
      candidate.points.some(
        (p) =>
          Math.abs(p.x) > DOCUMENT_LIMITS.coordinate ||
          Math.abs(p.z) > DOCUMENT_LIMITS.coordinate,
      )
    )
      continue;
    await yieldControl();
    const checked = analyzeDocument(candidate);
    if (checked.valid) return validateDocument(candidate);
  }
  throw new Error(
    'This corner needs a manual adjustment or Spread road out. Local smoothing could not pass the track checks while keeping the start, jumps and receiving sections unchanged. Your road has not changed.',
  );
}
