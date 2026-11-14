import {
  analyzeDocument,
  validateDocument,
  documentCurve,
  DOCUMENT_LIMITS,
} from './document.js';

export function canSpreadRoad(doc) {
  return (
    doc.points.length >= 4 &&
    !(doc.jumps?.length || doc.rolls?.length) &&
    doc.points.every((point) => Math.abs(point.roll ?? 0) < 1e-7)
  );
}

/** Give a plain drawn road more room, preserving its shape and all elevations.
 * This is an explicit authoring edit; no running physics or checks are relaxed. */
export function spreadRoad(value) {
  const source = validateDocument(value);
  if (!canSpreadRoad(source))
    throw new Error(
      'Automatic spreading works on roads without jumps or twists. Move the highlighted point or its neighbours instead.',
    );
  if (analyzeDocument(source).valid) return source;
  const center = source.points.reduce(
    (sum, point) => ({
      x: sum.x + point.x / source.points.length,
      z: sum.z + point.z / source.points.length,
    }),
    { x: 0, z: 0 },
  );
  const originalLength = documentCurve(source).getLength();
  let shortest = Infinity;
  for (
    let i = 0;
    i < source.points.length - (source.courseType === 'downhill' ? 1 : 0);
    i++
  ) {
    const a = source.points[i],
      b = source.points[(i + 1) % source.points.length];
    shortest = Math.min(shortest, Math.hypot(a.x - b.x, a.z - b.z));
  }
  if (shortest < 1 || !Number.isFinite(originalLength) || originalLength < 1)
    throw new Error(
      'Move overlapping points apart first, then spread the road.',
    );
  let scale = Math.max(1, 1200 / originalLength, 60 / shortest);
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = {
      ...source,
      points: source.points.map((point) => ({
        ...point,
        x: center.x + (point.x - center.x) * scale,
        z: center.z + (point.z - center.z) * scale,
      })),
    };
    if (
      candidate.points.some(
        (point) =>
          Math.abs(point.x) > DOCUMENT_LIMITS.coordinate ||
          Math.abs(point.z) > DOCUMENT_LIMITS.coordinate,
      )
    )
      break;
    const report = analyzeDocument(candidate);
    if (report.length > DOCUMENT_LIMITS.length) break;
    if (report.valid) return validateDocument(candidate);
    const radiusFactor =
      Number.isFinite(report.minRadius) && report.minRadius > 0
        ? 110 / report.minRadius
        : 1;
    const frameFactor = (report.maxFrameRate ?? 0) / 0.045;
    const gradeFactor = (report.maxGrade ?? 0) / 0.4;
    const bankFactor = (report.maxBankRate ?? 0) / 0.007;
    scale *= Math.min(
      4,
      Math.max(1.15, radiusFactor, frameFactor, gradeFactor, bankFactor) * 1.03,
    );
  }
  throw new Error(
    'This layout needs a local change. Move the highlighted point or its neighbours to open the corner; spreading it farther would make the track too large.',
  );
}
