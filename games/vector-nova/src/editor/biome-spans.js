import {
  analyzeDocument,
  pointRouteFractions,
  validateDocument,
} from './document.js';

export const ROAD_SPAN_BIOMES = Object.freeze(['nightweir', 'vesper-forest']);
const overlap = (a, b, c, d) => a < d && b > c;

/** Anchored endpoints are resolved afresh after road edits; only the road finish
 * changes. Environment, sky, hazards and physics retain their whole-course owner. */
export function resolvedBiomeSpans(value, trackLength) {
  const doc = validateDocument(value);
  if (!doc.biomeSpans.length || doc.points.length < 4) return [];
  const fractions = pointRouteFractions(doc);
  const length = trackLength ?? analyzeDocument(doc).length;
  return doc.biomeSpans.map((span) => ({
    id: span.id,
    start:
      fractions[doc.points.findIndex((p) => p.id === span.startPointId)] *
      length,
    end:
      fractions[doc.points.findIndex((p) => p.id === span.endPointId)] * length,
    biome: span.biome,
  }));
}

function selection(doc, startIndex, endIndex) {
  if (
    !Number.isInteger(startIndex) ||
    !Number.isInteger(endIndex) ||
    startIndex < 0 ||
    endIndex >= doc.points.length ||
    endIndex <= startIndex
  )
    throw new Error(
      'Choose a start point and a later end point for the road finish.',
    );
  return [startIndex, endIndex];
}

function intervals(doc) {
  const indices = new Map(doc.points.map((p, i) => [p.id, i]));
  return doc.biomeSpans.map((span) => ({
    start: indices.get(span.startPointId),
    end: indices.get(span.endPointId),
    biome: span.biome,
  }));
}

function subtract(ranges, start, end) {
  return ranges.flatMap((span) => {
    if (!overlap(start, end, span.start, span.end)) return [span];
    return [
      ...(span.start < start ? [{ ...span, end: start }] : []),
      ...(span.end > end ? [{ ...span, start: end }] : []),
    ];
  });
}

function finish(doc, ranges) {
  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const span of ranges) {
    const last = merged.at(-1);
    if (last && last.end === span.start && last.biome === span.biome)
      last.end = span.end;
    else merged.push({ ...span });
  }
  if (merged.length > 32)
    throw new Error(
      'Use at most 32 road-finish sections. Clear or join some sections first.',
    );
  const used = new Set(
    [
      ...doc.points,
      ...doc.props,
      ...doc.jumps,
      ...doc.rolls,
      ...doc.pickups.devices,
    ].map((object) => object.id),
  );
  doc.biomeSpans = merged.map((span) => {
    const startPointId = doc.points[span.start].id,
      endPointId = doc.points[span.end].id;
    let hash = 2166136261;
    for (const c of `${startPointId}:${endPointId}:${span.biome}`)
      hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
    const base = `road-span-${hash.toString(16)}`;
    let id = base,
      suffix = 1;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id);
    return { id, startPointId, endPointId, biome: span.biome };
  });
  return validateDocument(doc);
}

export function applyBiomeSpan(value, { startIndex, endIndex, biome } = {}) {
  const doc = validateDocument(value);
  selection(doc, startIndex, endIndex);
  if (!ROAD_SPAN_BIOMES.includes(biome))
    throw new Error('This road-finish pilot supports Nightweir and Vesper.');
  const fractions = pointRouteFractions(doc),
    length = analyzeDocument(doc).length,
    start = fractions[startIndex],
    end = fractions[endIndex];
  if (!length)
    throw new Error(
      'Add at least four road points before choosing a road finish.',
    );
  const protectedJump = doc.jumps.some((j) =>
    overlap(
      start * length,
      end * length,
      j.start * length - 160,
      j.end * length + j.receiving + 80,
    ),
  );
  const protectedRoll =
    doc.rolls.some((r) => overlap(start, end, r.start, r.end)) ||
    doc.points
      .slice(startIndex, endIndex + 1)
      .some((p) => Math.abs(p.roll) > 0.001);
  if (protectedJump || protectedRoll)
    throw new Error(
      'Choose an upright section away from jump ramps and landing roads for this road-finish pilot.',
    );
  const ranges = subtract(intervals(doc), startIndex, endIndex);
  ranges.push({ start: startIndex, end: endIndex, biome });
  return finish(doc, ranges);
}

export function clearBiomeSpan(value, { startIndex, endIndex, spanId } = {}) {
  const doc = validateDocument(value);
  if (spanId !== undefined) {
    const span = doc.biomeSpans.find((s) => s.id === spanId);
    if (!span)
      throw new Error('Choose an existing road-finish section to clear.');
    startIndex = doc.points.findIndex((p) => p.id === span.startPointId);
    endIndex = doc.points.findIndex((p) => p.id === span.endPointId);
  }
  selection(doc, startIndex, endIndex);
  return finish(doc, subtract(intervals(doc), startIndex, endIndex));
}
