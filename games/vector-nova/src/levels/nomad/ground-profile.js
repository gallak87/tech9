import { Vector3 } from 'three';

/** Connected, exact piecewise-planar salt terraces. Each shelf is level across
 * X and shares the longitudinal grade. This entire surface is invariant under
 * the convoy's ground translation (0, grade * speed * t, -speed * t).
 */
export function createNomadGroundProfile({ height, grade, benches = [] }) {
  if (!Number.isFinite(height) || !Number.isFinite(grade))
    throw new Error('Nomad ground height and grade must be finite.');
  const ids = new Set();
  const saltBenches = benches.map((bench, index) => {
    const { id, minX, maxX, heightOffset } = bench;
    if (
      typeof id !== 'string' ||
      !id ||
      ids.has(id) ||
      ![minX, maxX, heightOffset].every(Number.isFinite) ||
      minX >= maxX ||
      (index > 0 && minX <= benches[index - 1].maxX)
    )
      throw new Error(
        'Nomad salt benches need unique IDs and ordered, separated finite plateaus.',
      );
    ids.add(id);
    return Object.freeze({
      ...bench,
      carrierIds: Object.freeze([...(bench.carrierIds ?? [])]),
    });
  });
  Object.freeze(saltBenches);
  const groundProfileKnots = Object.freeze(
    saltBenches.flatMap((bench) => [
      Object.freeze({ x: bench.minX, heightOffset: bench.heightOffset }),
      Object.freeze({ x: bench.maxX, heightOffset: bench.heightOffset }),
    ]),
  );
  function segmentAt(x) {
    if (!saltBenches.length) return { offset: 0, slope: 0 };
    if (x <= saltBenches[0].maxX)
      return { offset: saltBenches[0].heightOffset, slope: 0 };
    for (let index = 1; index < saltBenches.length; index++) {
      const previous = saltBenches[index - 1],
        next = saltBenches[index];
      if (x < next.minX) {
        const slope =
          (next.heightOffset - previous.heightOffset) /
          (next.minX - previous.maxX);
        return {
          offset: previous.heightOffset + (x - previous.maxX) * slope,
          slope,
        };
      }
      if (x <= next.maxX) return { offset: next.heightOffset, slope: 0 };
    }
    return { offset: saltBenches.at(-1).heightOffset, slope: 0 };
  }
  return {
    saltBenches,
    groundProfileKnots,
    groundHeightAt(x, z) {
      return height - grade * z + segmentAt(x).offset;
    },
    groundNormalAt(x, _z, target = new Vector3()) {
      return target.set(-segmentAt(x).slope, 1, grade).normalize();
    },
  };
}

/** Older isolated fixtures may still provide only the original salt plane. */
export function nomadGroundHeightAt(track, x, z) {
  return (
    track.groundHeightAt?.(x, z) ??
    track.saltPlane.height - track.saltPlane.grade * z
  );
}

export function nomadGroundNormalAt(track, x, z, target = new Vector3()) {
  if (track.groundNormalAt) {
    const normal = track.groundNormalAt(x, z, target);
    return normal === target ? target : target.copy(normal);
  }
  return target.set(0, 1, track.saltPlane.grade).normalize();
}
