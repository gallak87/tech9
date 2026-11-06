import { Curve, Vector3 } from 'three';

const APPROACH_LENGTHS = { 1: 500, 2: 350, 5: 300, 7: 360, 8: 200, 9: 500 };
const smooth = (t) => t * t * t * (10 + t * (-15 + 6 * t));

// Hermite position, slope and curvature constraints. The two roof departures
// use the cubic subset below to retain clearance around the existing hull.
function quintic(a, b, da, db, dda, ddb, t, target) {
  const t2 = t * t,
    t3 = t2 * t,
    t4 = t3 * t,
    t5 = t4 * t;
  return target
    .copy(a)
    .multiplyScalar(1 - 10 * t3 + 15 * t4 - 6 * t5)
    .addScaledVector(b, 10 * t3 - 15 * t4 + 6 * t5)
    .addScaledVector(da, t - 6 * t3 + 8 * t4 - 3 * t5)
    .addScaledVector(db, -4 * t3 + 7 * t4 - 3 * t5)
    .addScaledVector(dda, (t2 - 3 * t3 + 3 * t4 - t5) / 2)
    .addScaledVector(ddb, (t3 - 2 * t4 + t5) / 2);
}

/** Local geometry repair in the carrier's unscaled rest-world coordinates. */
export function easeNomadApproach(source, index, scale, straight, sourceBank) {
  const span = APPROACH_LENGTHS[index];
  if (!span) return { curve: source, bankAt: sourceBank };
  // Dense arc mapping keeps the transition distances physical, independent of
  // how many original control points a particular carrier happens to use.
  source.arcLengthDivisions = Math.ceil(source.getLength() / 0.25);
  source.updateArcLengths();
  const length = source.getLength();
  const start = length - span / scale;
  const straightLength = (straight?.length ?? 0) / scale;
  const end = length - straightLength;
  const duration = end - start;
  const point = (distance) => source.getPointAt(distance / length);
  const derivative = (distance) =>
    point(distance + 0.25)
      .sub(point(distance - 0.25))
      .multiplyScalar(2);
  const secondDerivative = (distance) =>
    point(distance + 0.5)
      .add(point(distance - 0.5))
      .addScaledVector(point(distance), -2)
      .multiplyScalar(4);
  const a = point(start);
  const lip = source.getPoint(1);
  const launchDirection = source.getTangent(1);
  const b = straight
    ? lip.clone().addScaledVector(launchDirection, -straightLength)
    : lip;
  const da = derivative(start).multiplyScalar(duration);
  const db = launchDirection.clone().multiplyScalar(duration);
  const dda = secondDerivative(start).multiplyScalar(duration * duration);
  const ddb = straight
    ? new Vector3()
    : secondDerivative(length - 0.5).multiplyScalar(duration * duration);
  if (index === 1 || index === 2) {
    dda
      .copy(b)
      .sub(a)
      .multiplyScalar(6)
      .addScaledVector(da, -4)
      .addScaledVector(db, -2);
    ddb
      .copy(a)
      .sub(b)
      .multiplyScalar(6)
      .addScaledVector(da, 2)
      .addScaledVector(db, 4);
  }
  // High Balcony is also a fast receiving roof. Retain its horizontal runway
  // until the final 240 m while easing height over the longer approach.
  const horizontalDuration = 120 / scale;
  const horizontalStart = end - horizontalDuration;
  const horizontal =
    index === 2
      ? {
          a: point(horizontalStart),
          da: derivative(horizontalStart).multiplyScalar(horizontalDuration),
          dda: secondDerivative(horizontalStart).multiplyScalar(
            horizontalDuration ** 2,
          ),
          db: launchDirection.clone().multiplyScalar(horizontalDuration),
        }
      : null;
  // Non-launch descents retain their exact horizontal line and bank. Only the
  // height is eased, preserving the lateral portals and cargo-hall footprint.
  const curve = new Curve();
  curve.arcLengthDivisions = source.arcLengthDivisions;
  curve.getPoint = (fraction, target = new Vector3()) => {
    const distance = fraction * length;
    if (distance <= start) return target.copy(point(distance));
    if (straight && distance >= end)
      return target
        .copy(lip)
        .addScaledVector(launchDirection, distance - length);
    quintic(a, b, da, db, dda, ddb, (distance - start) / duration, target);
    if (!straight) {
      const original = point(distance);
      target.x = original.x;
      target.z = original.z;
    } else if (horizontal) {
      const position =
        distance <= horizontalStart
          ? point(distance)
          : quintic(
              horizontal.a,
              b,
              horizontal.da,
              horizontal.db,
              horizontal.dda,
              new Vector3(),
              (distance - horizontalStart) / horizontalDuration,
              new Vector3(),
            );
      target.x = position.x;
      target.z = position.z;
    } else if (index === 5) {
      // Keep the wall ride's horizontal line paired with its authored bank.
      // Only the last bend eases into the extended straight; changing that
      // earlier turn also changes the actual sideways momentum at release.
      const blendLength = 180 / scale;
      const blend = smooth(
        Math.max(0, (distance - end + blendLength) / blendLength),
      );
      const original = point(distance);
      const aligned = lip
        .clone()
        .addScaledVector(launchDirection, distance - length);
      target.x = original.x + (aligned.x - original.x) * blend;
      target.z = original.z + (aligned.z - original.z) * blend;
    }
    return target;
  };
  return {
    curve,
    bankAt(fraction) {
      const distance = fraction * length;
      if (distance >= end) return 0;
      return sourceBank(source.getUtoTmapping(fraction));
    },
  };
}
