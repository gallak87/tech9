import { createRouteSampler, curvePointFraction } from './route.js';
import { bankTrimRate, BANK_TRIM_RATE_LIMIT } from './roll-rate.js';

const DEGREE = Math.PI / 180;
const GRID = 150;
const APPROACH = 100;
const FADE = 96;

function runways(doc, length) {
  return [
    [0, GRID],
    ...doc.jumps.map((jump) => [
      jump.start * length - APPROACH,
      jump.end * length + jump.receiving,
    ]),
  ];
}

function signedBank(frame) {
  // The right and up axes share the same pitch factor in their Y components.
  return Math.atan2(frame.right.y, frame.up.y);
}

/** Cancel the rail's automatic corner bank where a generated race needs level ground. */
export function levelSeededRunways(doc) {
  const route = createRouteSampler(doc);
  const protectedSpans = runways(doc, route.length);
  let changed = false;
  const points = doc.points.map((point, index) => {
    const distance = curvePointFraction(route.curve, index) * route.length;
    let distanceToRunway = route.closed ? route.length - distance : Infinity;
    for (const [start, end] of protectedSpans) {
      distanceToRunway = Math.min(
        distanceToRunway,
        Math.max(start - distance, distance - end, 0),
      );
    }
    if (distanceToRunway >= FADE) return point;
    const t = 1 - distanceToRunway / FADE;
    const weight = t * t * (3 - 2 * t);
    const correction = signedBank(route.sample(distance)) * weight;
    if (Math.abs(correction) < DEGREE) return point;
    changed = true;
    // Only generator-made approaches are leveled. A full-turn feature elsewhere
    // retains its unwrapped rotation, including at the circuit seam.
    return {
      ...point,
      bank: Math.max(-0.35, Math.min(0.35, point.bank - correction)),
    };
  });
  if (!changed) return doc;

  const edgeCount = route.closed ? points.length : points.length - 1;
  let maxSlope = 0;
  for (let i = 0; i < edgeCount; i++) {
    const p = points[i],
      q = points[(i + 1) % points.length];
    maxSlope = Math.max(maxSlope, bankTrimRate(p, q));
  }
  if (maxSlope > BANK_TRIM_RATE_LIMIT) {
    const gain = (BANK_TRIM_RATE_LIMIT * 0.999) / maxSlope;
    return {
      ...doc,
      points: points.map((p) => ({ ...p, bank: p.bank * gain })),
    };
  }
  return { ...doc, points };
}

/** This is a seed quality criterion. Manual tracks retain free banking. */
export function checkSeededBanking(doc, route, frames, step, finishDistance) {
  const protectedSpans = runways(doc, route.length);
  const gaps = doc.jumps.map((jump) => [
    jump.start * route.length,
    jump.end * route.length,
  ]);
  const supported =
    finishDistance - gaps.reduce((total, [a, b]) => total + b - a, 0);
  let continuous = 0;
  let sideways = 0;
  for (let i = 0; i < frames.length; i++) {
    const distance = i * step;
    if (distance > finishDistance) break;
    if (gaps.some(([a, b]) => distance > a && distance < b)) {
      continuous = 0;
      continue;
    }
    const frame = frames[i];
    const angle = Math.abs(signedBank(frame));
    if (
      angle > 12 * DEGREE &&
      protectedSpans.some(([a, b]) => distance >= a && distance <= b)
    )
      return 'The generated starting grid or jump corridor banks too far.';
    if (angle < 60 * DEGREE) {
      continuous = 0;
      continue;
    }
    continuous += step;
    sideways += step;
    if (continuous > 350 || sideways > 0.22 * supported)
      return 'The generated deck stays sideways too long.';
  }
  return null;
}
