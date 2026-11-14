import {
  addJump,
  analyzeDocument,
  pointRouteFractions,
  DOCUMENT_LIMITS,
} from './document.js';
import { createRouteSampler } from './route.js';

const overlap = (a, b, c, d) => a < d && b > c;
const upright = (angle) =>
  Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) < 0.05;

// Compare the whole authored ramp corridor, not just the launch/landing chord.
// Sampling is shared across candidates; only the final eight need full edits.
function chooseCandidates(
  doc,
  candidates,
  stations,
  length,
  receiving,
  rampAssist,
  first,
) {
  const route = createRouteSampler(doc),
    frames = new Map();
  const at = (distance) => {
    if (!frames.has(distance)) frames.set(distance, route.sample(distance));
    return frames.get(distance);
  };
  const origin = stations[first] ?? 0;
  for (const candidate of candidates) {
    const start = stations[candidate.startIndex],
      end = stations[candidate.endIndex];
    const launch = doc.points[candidate.startIndex],
      landing = doc.points[candidate.endIndex];
    const dx = landing.x - launch.x,
      dz = landing.z - launch.z;
    const chord = Math.hypot(dx, dz),
      x = dx / chord,
      z = dz / chord;
    const begin = rampAssist ? Math.max(0, start - 600) : start - 160;
    const rejoin = end + receiving + (rampAssist ? 450 : 40);
    const approach = at(begin),
      receiver = at(rejoin);
    let quality =
      Math.abs(end - start - 260) / 130 + (1 - chord / (end - start)) * 4;
    for (const [distance, weight] of [
      [begin, 1],
      [start, 1],
      [end, 1],
      [end + receiving, 1],
      [rejoin, 2],
    ]) {
      const t = at(distance).tangent;
      const alignment =
        (t.x * x + t.z * z) / Math.max(0.001, Math.hypot(t.x, t.z));
      quality += (1 - Math.max(-1, Math.min(1, alignment))) * weight;
    }
    if (rampAssist) {
      const approachDistance = Math.hypot(
        launch.x - x * 120 - approach.position.x,
        launch.z - z * 120 - approach.position.z,
      );
      quality += Math.max(0, 260 - approachDistance) / 130;
    }
    const rx = receiver.position.x - landing.x,
      rz = receiver.position.z - landing.z;
    const receiverSpan = rejoin - end;
    quality += Math.abs(receiverSpan - (rx * x + rz * z)) / receiverSpan;
    quality += Math.abs(rx * z - rz * x) / receiverSpan;
    // Penalize nearby unrelated decks at the proposed road's actual height.
    // The authoritative route validator still decides whether an edit is safe.
    const headroom = Math.min(120, chord / 3) * Math.tan(Math.PI / 12) + 8;
    const launchY = rampAssist
      ? Math.min(DOCUMENT_LIMITS.height - headroom, Math.max(80, launch.y + 35))
      : launch.y;
    const landingY = rampAssist ? Math.max(12, launchY - 75) : landing.y;
    for (let i = 0; i < doc.points.length; i++) {
      if (stations[i] >= begin - 40 && stations[i] <= rejoin + 40) continue;
      const p = doc.points[i],
        px = p.x - launch.x,
        pz = p.z - launch.z;
      const along = px * x + pz * z;
      if (along < -120 || along > chord + receiving) continue;
      const lateral = Math.abs(px * z - pz * x),
        clearance = doc.width * 1.6;
      const height =
        along < 0 ? launchY + along * Math.tan(Math.PI / 12) : landingY;
      if (Math.abs(p.y - height) < 30 && lateral < clearance)
        quality += 2 * (1 - lateral / clearance);
    }
    candidate.quality = quality;
    candidate.forward = (start - origin + length) % length;
  }
  const ranked = [...candidates].sort(
    (a, b) =>
      a.quality - b.quality ||
      a.forward - b.forward ||
      a.startIndex - b.startIndex ||
      a.endIndex - b.endIndex,
  );
  const chosen = [];
  const separation = Math.max(120, length / 8);
  const distance = (a, b) => {
    const delta = Math.abs(stations[a.startIndex] - stations[b.startIndex]);
    return doc.courseType === 'downhill'
      ? delta
      : Math.min(delta, length - delta);
  };
  const take = (accept) => {
    for (const candidate of ranked) {
      if (chosen.length === 8) break;
      if (!chosen.includes(candidate) && accept(candidate))
        chosen.push(candidate);
    }
  };
  take((candidate) =>
    chosen.every((other) => distance(candidate, other) >= separation),
  );
  take((candidate) =>
    chosen.every((other) => other.startIndex !== candidate.startIndex),
  );
  take(() => true);
  return chosen;
}

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
  const selected = candidates.length
    ? chooseCandidates(
        doc,
        candidates,
        stations,
        length,
        receiving,
        rampAssist,
        first,
      )
    : [];
  let attempts = 0;
  for (const candidate of selected) {
    attempts++;
    onProgress({ attempt: attempts, total: selected.length });
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
