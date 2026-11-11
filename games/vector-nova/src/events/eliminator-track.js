import * as T from 'three';

/** A supported, closed pack-racing course. Worlds own their control points and
 * section names; cuts, vehicle motion and equipment retain the shared rules.
 */
export function createEliminatorTrack({
  id,
  name,
  points,
  targetLength,
  width = 50,
  sections,
  bankLimit = 0.44,
  bankScale = 120,
  rollAt = () => 0,
}) {
  let scale = 1,
    curve;
  for (let i = 0; i < 8; i++) {
    curve = new T.CatmullRomCurve3(
      points.map(([x, y, z]) => new T.Vector3(x * scale, y, z * scale)),
      true,
      'centripetal',
    );
    curve.arcLengthDivisions = 18000;
    curve.updateArcLengths();
    scale *= targetLength / curve.getLength();
  }
  const length = curve.getLength(),
    wrap = (s) => T.MathUtils.euclideanModulo(s, length);
  const positionAt = (s) => curve.getPointAt(wrap(s) / length);
  const tangentAt = (s) =>
    positionAt(s + 0.7)
      .sub(positionAt(s - 0.7))
      .normalize();
  const curvatureAt = (s) => {
    const tangent = tangentAt(s);
    const right = new T.Vector3(tangent.z, 0, -tangent.x).normalize();
    return tangentAt(s + 1)
      .sub(tangentAt(s - 1))
      .multiplyScalar(0.5)
      .dot(right);
  };
  // Catmull-Rom preserves tangent continuity but not its second derivative.
  // Filter only the authored banking field, preventing a curvature knot from
  // becoming a metre-high step at the edge of a fifty-metre road.
  const bankCount = Math.ceil(length / 4);
  const rawBanks = Array.from({ length: bankCount }, (_, i) =>
    T.MathUtils.clamp(
      curvatureAt((i * length) / bankCount) * bankScale,
      -bankLimit,
      bankLimit,
    ),
  );
  const banks = rawBanks.map((_, i) => {
    let value = 0,
      weight = 0;
    for (let j = -5; j <= 5; j++) {
      const w = 6 - Math.abs(j);
      value += rawBanks[T.MathUtils.euclideanModulo(i + j, bankCount)] * w;
      weight += w;
    }
    return value / weight;
  });
  const bankAt = (s) => {
    const value = (wrap(s) / length) * bankCount,
      i = Math.floor(value);
    return T.MathUtils.lerp(banks[i], banks[(i + 1) % bankCount], value - i);
  };
  function sample(s) {
    const distance = wrap(s),
      position = positionAt(distance),
      tangent = tangentAt(distance);
    const horizontalRight = new T.Vector3(tangent.z, 0, -tangent.x).normalize();
    const curvature = tangentAt(distance + 1)
      .sub(tangentAt(distance - 1))
      .multiplyScalar(0.5)
      .dot(horizontalRight);
    const bank = bankAt(distance);
    const roll = -bank + rollAt(distance / length);
    const right = horizontalRight.clone().applyAxisAngle(tangent, roll);
    const up = new T.Vector3().crossVectors(tangent, right).normalize();
    return {
      position,
      tangent,
      right,
      up,
      curvature,
      bank,
      roll,
      quaternion: new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(right, up, tangent),
      ),
    };
  }
  const regions = sections.map((label, i) => ({
    id: `district-${i + 1}`,
    name: label,
    label,
    start: (i * length) / sections.length,
    end: ((i + 1) * length) / sections.length,
    showcase: ((i + 0.5) * length) / sections.length,
    representative: true,
  }));
  const bounds = new T.Box3().setFromPoints(
    Array.from({ length: 360 }, (_, i) => positionAt((i * length) / 360)),
  );
  return {
    id: `${id}-supported-loop-v1`,
    name,
    geometryVersion: `${id}-supported-loop-v1`,
    length,
    width,
    closed: true,
    sample,
    jumps: [],
    sections: regions,
    checkpoints: Array.from({ length: 12 }, (_, i) => ({
      id: `checkpoint-${i}`,
      index: i,
      distance: (i * length) / 12,
    })),
    cutGates: [0, 0.2, 0.4, 0.6, 0.8].map((f) => f * length),
    bounds: bounds.expandByVector(new T.Vector3(500, 300, 500)),
    scenarios: {
      staging: { distance: 0, speed: 0, lateral: 0, heading: 0 },
      ...Object.fromEntries(
        regions.map((section) => [
          `${section.id}-approach`,
          { distance: section.start, speed: 100, lateral: 0, heading: 0 },
        ]),
      ),
    },
  };
}
