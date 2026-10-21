import { Vector3 } from 'three';

/** Uniform periodic cubic lookup; samples are the already-authored route bake. */
export function createClosedPointLookup(points, period) {
  const count = points.length / 3;
  if (
    !Number.isInteger(count) ||
    count < 4 ||
    !Number.isFinite(period) ||
    period <= 0
  )
    throw new Error('Invalid closed point lookup');
  return (distance, target = new Vector3()) => {
    const wrapped =
      distance >= 0 && distance < period
        ? distance
        : ((distance % period) + period) % period;
    const station = (wrapped * count) / period;
    const index = Math.floor(station),
      t = station - index;
    const a = ((index + count - 1) % count) * 3;
    const b = (index % count) * 3;
    const c = ((index + 1) % count) * 3;
    const d = ((index + 2) % count) * 3;
    const t2 = t * t,
      t3 = t2 * t;
    const wa = -0.5 * t + t2 - 0.5 * t3;
    const wb = 1 - 2.5 * t2 + 1.5 * t3;
    const wc = 0.5 * t + 2 * t2 - 1.5 * t3;
    const wd = -0.5 * t2 + 0.5 * t3;
    return target.set(
      points[a] * wa + points[b] * wb + points[c] * wc + points[d] * wd,
      points[a + 1] * wa +
        points[b + 1] * wb +
        points[c + 1] * wc +
        points[d + 1] * wd,
      points[a + 2] * wa +
        points[b + 2] * wb +
        points[c + 2] * wc +
        points[d + 2] * wd,
    );
  };
}
