import {
  addJump,
  analyzeDocument,
  pointRouteFractions,
  validateDocument,
  DOCUMENT_LIMITS,
} from './document.js';
import { createRouteSampler } from './route.js';

export const AUTHORING_JUMP_SIZES = Object.freeze({
  small: 180,
  medium: 300,
  large: 500,
});
const copy = (value) => structuredClone(value);
const signature = (points) => JSON.stringify(points);
const overlap = (a, b, c, d) => a < d && b > c;
const upright = (angle) =>
  Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) < 0.05;

function stations(doc) {
  const fractions = pointRouteFractions(doc),
    route = createRouteSampler(doc);
  return { route, distances: fractions.map((at) => at * route.length) };
}

// Route fractions move when a local ramp is fitted. Surviving authored IDs form
// a monotone correspondence, preserving unrelated features at their road nodes.
function remapFeatures(before, after) {
  const from = pointRouteFractions(before),
    to = pointRouteFractions(after),
    targetIds = new Map(after.points.map((p, i) => [p.id, to[i]])),
    knots = [[0, 0]];
  before.points.forEach((p, i) => {
    if (targetIds.has(p.id)) knots.push([from[i], targetIds.get(p.id)]);
  });
  knots.push([1, 1]);
  knots.sort((a, b) => a[0] - b[0]);
  const map = (at) => {
    let next = 1;
    while (next < knots.length - 1 && knots[next][0] < at) next++;
    const a = knots[next - 1],
      b = knots[next],
      t = Math.max(0, Math.min(1, (at - a[0]) / (b[0] - a[0] || 1)));
    return a[1] + (b[1] - a[1]) * t;
  };
  after.rolls = before.rolls.map((r) => ({
    ...r,
    start: map(r.start),
    end: map(r.end),
  }));
  after.props = before.props.map((p) => ({ ...p, distance: map(p.distance) }));
  after.pickups.devices = before.pickups.devices.map((p) => ({
    ...p,
    at: map(p.at),
  }));
  const old = new Map(before.jumps.map((j) => [j.id, j]));
  after.jumps = after.jumps.map((j) => {
    const previous = old.get(j.id);
    return previous && !j.launchPointId
      ? { ...j, start: map(previous.start), end: map(previous.end) }
      : j;
  });
  return validateDocument(after);
}

function restoreSource(doc, jump) {
  const saved = jump.authoring;
  const beforeIndex =
      saved.beforeId === null
        ? -1
        : doc.points.findIndex((p) => p.id === saved.beforeId),
    afterIndex =
      saved.afterId === null
        ? doc.points.length
        : doc.points.findIndex((p) => p.id === saved.afterId);
  if (
    (saved.beforeId !== null && beforeIndex < 0) ||
    afterIndex < 0 ||
    afterIndex <= beforeIndex
  )
    throw new Error(
      'This jump’s surrounding road has changed. Undo those edits or rebuild the jump with a fresh preview.',
    );
  const current = doc.points.slice(beforeIndex + 1, afterIndex);
  if (
    signature(current) !== saved.signature ||
    current.length !== saved.generatedPointIds.length ||
    current.some((p, i) => p.id !== saved.generatedPointIds[i])
  )
    throw new Error(
      'This jump’s ramp has been edited. Undo the ramp edits before resizing, or explicitly rebuild it from the current road.',
    );
  const restored = copy(doc);
  restored.points.splice(
    beforeIndex + 1,
    current.length,
    ...copy(saved.beforePoints),
  );
  restored.jumps = restored.jumps.filter((j) => j.id !== jump.id);
  const result = remapFeatures(doc, restored),
    { distances } = stations(result),
    sourceBefore =
      saved.beforeId === null
        ? 0
        : distances[result.points.findIndex((p) => p.id === saved.beforeId)];
  return { document: result, atDistance: sourceBefore + saved.sourceOffset };
}

function attachSource(before, after, jumpId, atDistance, size) {
  let first = 0;
  while (
    first < before.points.length &&
    first < after.points.length &&
    signature(before.points[first]) === signature(after.points[first])
  )
    first++;
  let oldEnd = before.points.length,
    newEnd = after.points.length;
  while (
    oldEnd > first &&
    newEnd > first &&
    signature(before.points[oldEnd - 1]) === signature(after.points[newEnd - 1])
  ) {
    oldEnd--;
    newEnd--;
  }
  const { distances } = stations(before),
    corridor = after.points.slice(first, newEnd),
    jump = after.jumps.find((j) => j.id === jumpId);
  jump.authoring = {
    version: 1,
    size,
    sourceOffset: atDistance - (first ? distances[first - 1] : 0),
    beforeId: first ? before.points[first - 1].id : null,
    afterId: oldEnd < before.points.length ? before.points[oldEnd].id : null,
    beforePoints: copy(before.points.slice(first, oldEnd)),
    generatedPointIds: corridor.map((p) => p.id),
    signature: signature(corridor),
  };
  return validateDocument(after);
}

function protectCorridor(doc, start, end, receiving, route, distances) {
  const begin = Math.max(0, start - 640),
    finish = end + receiving + 490;
  if (
    doc.jumps.some((j) =>
      overlap(
        begin,
        finish,
        j.start * route.length - 300,
        j.end * route.length + j.receiving + 200,
      ),
    )
  )
    throw new Error(
      'Another jump uses this approach or landing road. Select a section farther from that jump.',
    );
  const rollConflict =
    doc.rolls.some((r) =>
      overlap(
        begin,
        finish,
        r.start * route.length - 50,
        r.end * route.length + 50,
      ),
    ) ||
    doc.points.some((p, i) => {
      const next = doc.points[(i + 1) % doc.points.length];
      return (
        (!upright(p.roll) ||
          !upright(next.roll) ||
          Math.abs(p.roll - next.roll) > 0.01 ||
          Math.abs(p.bank) > 0.05) &&
        overlap(
          begin,
          finish,
          distances[i] - 50,
          (distances[i + 1] ?? route.length) + 50,
        )
      );
    });
  if (rollConflict)
    throw new Error(
      'This ramp would replace a bank or twist. Select an upright section away from the shaped road.',
    );
  if (
    doc.biomeSpans.some((span) =>
      overlap(
        begin,
        finish,
        distances[doc.points.findIndex((p) => p.id === span.startPointId)],
        distances[doc.points.findIndex((p) => p.id === span.endPointId)],
      ),
    )
  )
    throw new Error(
      'This ramp would replace a road-finish section. Clear that section first, or select another part of the road.',
    );
}

function sampledAnchors(doc, distances, route, start, end) {
  const entries = doc.points.map((point, i) => ({ point, at: distances[i] }));
  const anchor = (at) => {
    const position = route.sample(at).position;
    const near = entries.find(
      (e) =>
        Math.abs(e.at - at) < 32 &&
        Math.hypot(
          e.point.x - position.x,
          e.point.y - position.y,
          e.point.z - position.z,
        ) < 32,
    );
    if (near) return near.point.id;
    const point = {
      id: `point-${globalThis.crypto.randomUUID()}`,
      x: position.x,
      y: position.y,
      z: position.z,
      bank: 0,
      roll: 0,
    };
    entries.push({ at, point });
    return point.id;
  };
  const startPointId = anchor(start),
    endPointId = anchor(end);
  entries.sort((a, b) => a.at - b.at);
  return {
    document: { ...copy(doc), points: entries.map((e) => e.point) },
    startPointId,
    endPointId,
  };
}

function preview(doc, jumpId, requestedSize, source, legacyRebuild) {
  const route = createRouteSampler(doc),
    jump = doc.jumps.find((j) => j.id === jumpId),
    fractions = pointRouteFractions(doc),
    owned = jump.authoring.generatedPointIds,
    firstOwned = doc.points.findIndex((p) => p.id === owned[0]),
    lastOwned = doc.points.findIndex((p) => p.id === owned.at(-1)),
    takeoff = jump.start * route.length,
    landingStart = jump.end * route.length,
    receiverEnd = landingStart + jump.receiving,
    begin = Math.min(takeoff, fractions[firstOwned] * route.length),
    end = Math.max(receiverEnd, fractions[lastOwned] * route.length),
    position = (at) => route.sample(at).position.toArray(),
    section = (kind, a, b) => {
      const count = Math.max(2, Math.ceil((b - a) / 12) + 1);
      return {
        kind,
        points: Array.from({ length: count }, (_, i) =>
          position(a + ((b - a) * i) / (count - 1)),
        ),
      };
    };
  return {
    document: doc,
    jumpId,
    requestedSize,
    resolved: {
      gapLength: landingStart - takeoff,
      horizontalGap: Math.hypot(
        ...[0, 2].map(
          (axis) => position(landingStart)[axis] - position(takeoff)[axis],
        ),
      ),
      receiving: jump.receiving,
      approachLength: takeoff - begin,
      rejoinLength: end - receiverEnd,
      footprint: end - begin,
      takeoff,
      landingStart,
      receiverEnd,
      corridorStart: begin,
      corridorEnd: end,
    },
    ghost: {
      takeoff: position(takeoff),
      landing: position(landingStart),
      receiverEnd: position(receiverEnd),
      sections: [
        section('approach', begin, takeoff),
        section('gap', takeoff, landingStart),
        section('receiver', landingStart, end),
      ],
    },
    sourceAt: source,
    warnings: legacyRebuild
      ? [
          'Rebuild uses the current road as its baseline; the original pre-jump road was not saved. Undo restores this version.',
        ]
      : [],
  };
}

/** Prepare one immutable, fully checked road edit. The caller previews the ghost
 * then commits document once; preparing or rejecting never mutates its draft. */
export async function prepareJumpEdit(
  value,
  {
    pointIndex,
    atDistance,
    size = 'small',
    jumpId,
    receiving = 300,
    legacyRebuild = false,
    yieldControl = () => Promise.resolve(),
    onProgress = () => {},
  } = {},
) {
  if (!Object.hasOwn(AUTHORING_JUMP_SIZES, size))
    throw new Error('Choose a Small, Medium or Large jump.');
  let doc = validateDocument(value);
  const initial = analyzeDocument(doc);
  if (!initial.valid)
    throw new Error(
      `Finish a valid road before adding a jump. ${initial.errors[0]}`,
    );
  let adopted = false;
  if (jumpId) {
    const jump = doc.jumps.find((j) => j.id === jumpId);
    if (!jump) throw new Error('Select an existing jump before resizing it.');
    if (jump.authoring && !legacyRebuild) {
      const restored = restoreSource(doc, jump);
      doc = restored.document;
      atDistance = restored.atDistance;
    } else {
      if (!legacyRebuild)
        throw new Error(
          'This older jump has no saved original road. Choose Rebuild jump to preview replacing its ramps; Undo restores the current version.',
        );
      atDistance = jump.start * initial.length;
      doc.jumps = doc.jumps.filter((j) => j.id !== jumpId);
      adopted = true;
    }
  }
  const source = copy(doc),
    { route, distances } = stations(doc);
  if (atDistance === undefined && Number.isInteger(pointIndex))
    atDistance = distances[pointIndex];
  if (!Number.isFinite(atDistance))
    throw new Error('Select a road point where the jump should launch.');
  const gap = AUTHORING_JUMP_SIZES[size],
    finish = route.length - (doc.courseType === 'downhill' ? 600 : 0);
  if (atDistance < 192)
    throw new Error(
      'Select a point at least 200 m after the start so the jump has a supported approach.',
    );
  if (atDistance + gap + receiving + 490 >= finish)
    throw new Error(
      'There is not enough road after this point for the gap, receiver and rejoin. Select an earlier point or choose a smaller jump.',
    );
  if (!Number.isFinite(receiving) || receiving < 150 || receiving > 1200)
    throw new Error('Choose a receiving road between 150 and 1,200 m.');
  protectCorridor(
    doc,
    atDistance,
    atDistance + gap,
    receiving,
    route,
    distances,
  );
  const sampled = sampledAnchors(
    doc,
    distances,
    route,
    atDistance,
    atDistance + gap,
  );
  if (sampled.document.points.length > DOCUMENT_LIMITS.points)
    throw new Error(
      'Remove a few road points to leave room for the jump preview (256 point limit).',
    );
  onProgress({ attempt: 1, total: 1 });
  await yieldControl();
  let candidate;
  try {
    candidate = addJump(sampled.document, {
      startPointId: sampled.startPointId,
      endPointId: sampled.endPointId,
      receiving,
      id: jumpId ?? `jump-${globalThis.crypto.randomUUID()}`,
      rampAssist: true,
    });
    candidate = remapFeatures(source, candidate);
    const report = analyzeDocument(candidate);
    if (!report.valid) throw new Error(report.errors[0]);
  } catch (error) {
    throw new Error(
      `A safe ${size} jump does not fit here. ${error.message} Select a straighter section, or try a smaller jump.`,
      { cause: error },
    );
  }
  const resultId =
    jumpId ??
    candidate.jumps.find((j) => !source.jumps.some((old) => old.id === j.id))
      .id;
  candidate = attachSource(source, candidate, resultId, atDistance, size);
  return preview(candidate, resultId, size, atDistance, adopted);
}
