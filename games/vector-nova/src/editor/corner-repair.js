import {
  analyzeDocument,
  validateDocument,
  pointRouteFractions,
  DOCUMENT_LIMITS,
  DOWNHILL_RUNOUT,
} from './document.js';
import { analyzeCornerSegments } from './corner-metrics.js';

export const MAX_CORNER_REPAIR_CANDIDATES = 42;

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
  const assisted = new Set(
    (doc.jumps ?? []).flatMap(
      (jump) => jump.authoring?.generatedPointIds ?? [],
    ),
  );
  for (let i = 0; i < n; i++) {
    if (
      assisted.has(doc.points[i].id) ||
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
const bendIssue = (analysis) =>
  analysis?.primaryIssue?.kind === 'bend'
    ? analysis.primaryIssue
    : analysis?.advisories?.find((issue) => issue.kind === 'bend');
/** Pass the editor's cached report; this function never reruns physical analysis.
 * Feature masks are cached per unchanged document/report for render hot paths. */
export function canSmoothCorner(doc, analysis) {
  const issue = bendIssue(analysis);
  if (
    !analysis ||
    !issue ||
    !Array.isArray(doc?.points) ||
    doc.points.length < 4 ||
    unsupported(doc)
  )
    return false;
  const index = issue.pointIndex;
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
function curved(doc, center, strength, fixed, handleRatio = 1 / 3) {
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
    handle = chord * handleRatio;
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

function insertedPoint(a, b, t, position) {
  return {
    ...a,
    id: `point-${globalThis.crypto.randomUUID()}`,
    ...position,
    y: a.y + (b.y - a.y) * t,
    bank: a.bank + (b.bank - a.bank) * t,
    roll: a.roll + (b.roll - a.roll) * t,
  };
}
function lengthenedRun(doc, center, side, amount, fixed) {
  const n = doc.points.length,
    index = (offset) =>
      doc.courseType === 'downhill'
        ? center + offset
        : wrap(center + offset, n),
    at = index(side),
    outer = doc.points[index(side * 2)],
    point = doc.points[at];
  if (!point || !outer || fixed.has(at)) return null;
  const run = distance(point, outer);
  if (run < 1e-7) return null;
  const cap = Math.min(
      600,
      Math.max(80, Math.max(run, distance(point, doc.points[center])) * 0.8),
    ),
    displacement = Math.min(amount, cap) / run,
    candidate = { ...doc, points: doc.points.map((p) => ({ ...p })) };
  candidate.points[at].x += (point.x - outer.x) * displacement;
  candidate.points[at].z += (point.z - outer.z) * displacement;
  return candidate;
}

function pathFraction(a, middle, b) {
  return (
    distance(a, middle) /
    Math.max(1e-9, distance(a, middle) + distance(middle, b))
  );
}
// Distribute the bend across entry, apex and exit controls, rather than making
// the user insert those controls and widen the corner by hand.
function filleted(doc, center, fraction, fixed) {
  if (fixed.has(center) || doc.points.length + 2 > DOCUMENT_LIMITS.points)
    return null;
  const n = doc.points.length;
  const before =
      doc.points[
        doc.courseType === 'downhill' ? center - 1 : wrap(center - 1, n)
      ],
    point = doc.points[center],
    after =
      doc.points[
        doc.courseType === 'downhill' ? center + 1 : wrap(center + 1, n)
      ];
  if (!before || !after) return null;
  const enter = lerp(point, before, fraction),
    leave = lerp(point, after, fraction),
    middle = {
      ...point,
      x: (enter.x + 2 * point.x + leave.x) / 4,
      z: (enter.z + 2 * point.z + leave.z) / 4,
    };
  if (distance(point, middle) > 600) return null;
  const points = doc.points.map((p) => ({ ...p }));
  points.splice(
    center,
    1,
    insertedPoint(before, point, pathFraction(before, enter, middle), enter),
    middle,
    insertedPoint(point, after, pathFraction(middle, leave, after), leave),
  );
  return { ...doc, points };
}

function insertedCurve(doc, center, handleRatio, fixed) {
  const n = doc.points.length,
    closed = doc.courseType !== 'downhill',
    index = (offset) => (closed ? wrap(center + offset, n) : center + offset),
    ids = [-2, -1, 0, 1, 2].map(index);
  if (
    n + 2 > DOCUMENT_LIMITS.points ||
    new Set(ids).size !== 5 ||
    ids.some((i) => i < 0 || i >= n) ||
    ids.slice(1, 4).some((i) => fixed.has(i))
  )
    return null;
  const a = doc.points[ids[0]],
    b = doc.points[ids[4]],
    before = doc.points[index(-3)],
    after = doc.points[index(3)];
  if (!before || !after) return null;
  const chord = distance(a, b),
    handle = chord * handleRatio;
  const unit = (from, to) => {
    const d = Math.max(1e-9, distance(from, to));
    return { x: (to.x - from.x) / d, z: (to.z - from.z) / d };
  };
  const enter = unit(before, a),
    leave = unit(b, after),
    c = { x: a.x + enter.x * handle, z: a.z + enter.z * handle },
    d = { x: b.x - leave.x * handle, z: b.z - leave.z * handle };
  const at = (t) => {
    const u = 1 - t;
    return {
      x:
        u ** 3 * a.x + 3 * u * u * t * c.x + 3 * u * t * t * d.x + t ** 3 * b.x,
      z:
        u ** 3 * a.z + 3 * u * u * t * c.z + 3 * u * t * t * d.z + t ** 3 * b.z,
    };
  };
  const points = doc.points.map((p) => ({ ...p }));
  for (let j = 1; j < 4; j++) {
    const original = doc.points[ids[j]],
      target = at(j / 4);
    if (distance(original, target) > Math.min(600, Math.max(80, chord * 0.5)))
      return null;
    Object.assign(points[ids[j]], target);
  }
  const entryPosition = at(0.125),
    exitPosition = at(0.875),
    entry = insertedPoint(
      a,
      doc.points[ids[1]],
      pathFraction(a, entryPosition, points[ids[1]]),
      entryPosition,
    ),
    exit = insertedPoint(
      doc.points[ids[3]],
      b,
      pathFraction(points[ids[3]], exitPosition, b),
      exitPosition,
    );
  // Insert by surviving ID so closed-course wraparound does not reorder nodes.
  points.splice(
    points.findIndex((p) => p.id === doc.points[ids[1]].id),
    0,
    entry,
  );
  points.splice(
    points.findIndex((p) => p.id === doc.points[ids[4]].id),
    0,
    exit,
  );
  return { ...doc, points };
}

const partialErrors = new Set([
  'A bend is too tight. Widen the corner or move its road points apart.',
  'A climb is too steep. Spread the height change over more road.',
  'A road connection twists or bends too sharply. Spread the shape over more road.',
]);
function partialChecker(source, report, center, explicitPoint) {
  if (
    source.props.length ||
    source.rolls.length ||
    source.points.some(
      (point) => Math.abs(point.bank) > 1e-7 || Math.abs(point.roll) > 1e-7,
    ) ||
    report.errors.some((error) => !partialErrors.has(error))
  )
    return () => false;
  const segments = analyzeCornerSegments(source),
    signatures = new Set(segments.map((segment) => segment.signature)),
    previousPairs = new Map(
      segments.map((segment) => [
        `${segment.startPointId}/${segment.endPointId}`,
        segment,
      ]),
    ),
    pointId = source.points[center].id,
    issue = report.primaryIssue;
  const targets = segments.filter(
    (segment) =>
      segment.minRadius < 55 &&
      (!explicitPoint && issue.segmentStartId && issue.segmentEndId
        ? segment.startPointId === issue.segmentStartId &&
          segment.endPointId === issue.segmentEndId
        : segment.startPointId === pointId || segment.endPointId === pointId),
  );
  if (!targets.length) return () => false;
  const errors = new Set(report.errors);
  return (candidate, checked) => {
    if (checked.errors.some((error) => !errors.has(error))) return false;
    const result = analyzeCornerSegments(candidate),
      present = new Set(result.map((segment) => segment.signature));
    if (targets.some((segment) => present.has(segment.signature))) return false;
    const changed = result.filter(
      (segment) => !signatures.has(segment.signature),
    );
    if (
      !changed.length ||
      changed.some((segment) => {
        const previous = previousPairs.get(
            `${segment.startPointId}/${segment.endPointId}`,
          ),
          gradeLimit = previous
            ? Math.max(0.45, previous.maxGrade) + 1e-6
            : 0.45;
        return segment.minRadius < 55 || segment.maxGrade > gradeLimit;
      })
    )
      return false;
    // The global arc sampler can be slightly stricter than an individual tuple
    // at a threshold. Its remaining witness must not be in the repaired region.
    const changedPairs = new Set(
      changed.map((segment) => `${segment.startPointId}/${segment.endPointId}`),
    );
    return !(checked.issues ?? [checked.primaryIssue]).some(
      (witness) =>
        witness &&
        ['bend', 'rotation'].includes(witness.kind) &&
        changedPairs.has(`${witness.segmentStartId}/${witness.segmentEndId}`),
    );
  };
}

function candidateFits(doc) {
  if (doc.points.length > DOCUMENT_LIMITS.points) return false;
  const last =
    doc.courseType === 'downhill' ? doc.points.length - 1 : doc.points.length;
  return doc.points.every((p, i) => {
    if (
      Math.abs(p.x) > DOCUMENT_LIMITS.coordinate ||
      Math.abs(p.z) > DOCUMENT_LIMITS.coordinate
    )
      return false;
    if (i >= last) return true;
    const next = doc.points[(i + 1) % doc.points.length];
    return Math.hypot(p.x - next.x, p.y - next.y, p.z - next.z) >= 30;
  });
}
/** Change only nearby X/Z controls. No candidate is returned until every existing
 * physical check passes, or the changed spline tuples are independently safe
 * while preexisting remote defects remain byte-identical. */
export async function smoothCorner(
  value,
  { pointIndex, analysis, yieldControl = () => Promise.resolve() } = {},
) {
  const source = validateDocument(value),
    displayed = analysis ?? analyzeDocument(source),
    issue = bendIssue(displayed);
  if (!issue && displayed.valid) return source;
  // Wild manual tracks may be playable with advice. An optional corner repair
  // still targets the original recommended geometry, rather than accepting the
  // first candidate merely because it passes the wider Test-drive limits.
  const strict = analyzeDocument(source, { strict: true }),
    report = { ...strict, primaryIssue: issue ?? strict.primaryIssue };
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
  const partiallyRepairs = partialChecker(
    source,
    report,
    center,
    pointIndex !== undefined && pointIndex !== report.primaryIssue.pointIndex,
  );
  const candidates = [];
  for (const radius of [0, 1, 2])
    for (const strength of [0.3, 0.55, 0.8, 1])
      candidates.push(() => relaxed(source, center, radius, strength, fixed));
  for (const strength of [0.3, 0.55, 0.8, 1])
    candidates.push(() => curved(source, center, strength, fixed));
  for (const offset of [-0.35, 0.35, -0.65, 0.65])
    candidates.push(() => openCorner(source, center, offset, fixed));
  for (const amount of [120, 240, 400])
    for (const side of [-1, 1])
      candidates.push(() => lengthenedRun(source, center, side, amount, fixed));
  for (const offset of [-0.9, 0.9, -1.2, 1.2, -1.6, 1.6])
    candidates.push(() => openCorner(source, center, offset, fixed));
  for (const fraction of [0.25, 0.4, 0.55, 0.7])
    candidates.push(() => filleted(source, center, fraction, fixed));
  for (const handle of [0.25, 0.5, 0.7]) {
    candidates.push(() => curved(source, center, 1, fixed, handle));
    candidates.push(() => insertedCurve(source, center, handle, fixed));
  }
  for (const build of candidates.slice(0, MAX_CORNER_REPAIR_CANDIDATES)) {
    const candidate = build();
    if (!candidate) continue;
    const key = JSON.stringify(
      candidate.points.map((p) => [p.x, p.y, p.z, p.bank, p.roll]),
    );
    if (seen.has(key)) continue;
    seen.add(key);
    if (!candidateFits(candidate)) continue;
    await yieldControl();
    const checked = analyzeDocument(candidate, { strict: true });
    if (checked.valid || partiallyRepairs(candidate, checked))
      return validateDocument(candidate);
  }
  throw new Error(
    'This corner needs a manual adjustment or Spread road out. Local smoothing could not make every changed road section safe while keeping the start, jumps, receiving sections and existing heights unchanged. Your road has not changed.',
  );
}
