import { addJump, analyzeDocument, pointRouteFractions } from './document.js';

const overlap = (a, b, c, d) => a < d && b > c;
const upright = (angle) =>
  Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) < 0.05;

/** Suggest an ordinary, clear road section without changing the caller's draft.
 * Each accepted suggestion has passed the real ramp authoring and route checks. */
export async function findNextSuitableJump(
  doc,
  {
    fromIndex = 0,
    receiving = 300,
    rampAssist = true,
    analysis = analyzeDocument(doc),
    fractions = pointRouteFractions(doc),
    yieldControl = () => Promise.resolve(),
    onProgress = () => {},
  } = {},
) {
  if (!analysis.valid)
    throw new Error(
      'Finish a valid road before choosing a jump section. Use the track checks to find the problem.',
    );
  const length = analysis.length;
  const stations = fractions.map((at) => at * length);
  const finish = length - (doc.courseType === 'downhill' ? 600 : 0);
  const protectedRuns = (doc.jumps ?? []).map((jump) => [
    jump.start * length - 300,
    jump.end * length + jump.receiving + 200,
  ]);
  protectedRuns.push(
    ...(doc.rolls ?? []).map((roll) => [
      roll.start * length - 50,
      roll.end * length + 50,
    ]),
  );
  for (let i = 0; i < doc.points.length - 1; i++) {
    const a = doc.points[i],
      b = doc.points[i + 1];
    if (
      !upright(a.roll ?? 0) ||
      !upright(b.roll ?? 0) ||
      Math.abs((b.roll ?? 0) - (a.roll ?? 0)) > 0.05
    )
      protectedRuns.push([stations[i] - 50, stations[i + 1] + 50]);
  }
  const order = Array.from(
    { length: Math.max(0, doc.points.length - 1) },
    (_, i) => i,
  );
  const first = Math.max(0, Math.min(order.length - 1, fromIndex));
  order.sort(
    (a, b) =>
      ((a - first + order.length) % order.length) -
      ((b - first + order.length) % order.length),
  );
  const candidates = [];
  for (const startIndex of order) {
    const start = stations[startIndex];
    if (start < 160) continue;
    const ends = [];
    for (
      let endIndex = startIndex + 1;
      endIndex < doc.points.length;
      endIndex++
    ) {
      const end = stations[endIndex],
        gap = end - start;
      if (gap > 500) break;
      if (gap < 100 || end + receiving + (rampAssist ? 450 : 40) >= finish)
        continue;
      const begin = rampAssist ? Math.max(0, start - 600) : start - 160;
      const rejoin = end + receiving + (rampAssist ? 450 : 40);
      if (protectedRuns.some(([a, b]) => overlap(begin, rejoin, a, b)))
        continue;
      const launch = doc.points[startIndex],
        landing = doc.points[endIndex];
      const chord = Math.hypot(landing.x - launch.x, landing.z - launch.z);
      if (chord < gap * 0.8) continue;
      ends.push({ startIndex, endIndex, score: Math.abs(gap - 260) });
    }
    ends.sort((a, b) => a.score - b.score);
    candidates.push(...ends.slice(0, 2));
  }
  let attempts = 0;
  for (const candidate of candidates.slice(0, 8)) {
    attempts++;
    onProgress({ attempt: attempts, total: Math.min(8, candidates.length) });
    await yieldControl();
    try {
      const preparedDocument = addJump(doc, {
        ...candidate,
        receiving,
        rampAssist,
      });
      if (!analyzeDocument(preparedDocument).valid) continue;
      return {
        startIndex: candidate.startIndex,
        endIndex: candidate.endIndex,
        gapLength:
          stations[candidate.endIndex] - stations[candidate.startIndex],
        document: preparedDocument,
      };
    } catch {
      // Curvature and ramp clearance need the authoritative authoring checks.
    }
  }
  throw new Error(
    'No clear automatic section fits here. A longer course or removing a nearby jump can free space; you can also choose launch and landing points manually.',
  );
}
