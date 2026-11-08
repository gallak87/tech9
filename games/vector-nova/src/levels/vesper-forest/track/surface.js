import * as T from 'three';

// A twisting lane has its own tangent and curvature. Its ruled ribbon still
// uses the approved centreline and cross sections that generate the real deck.
export function createVesperSurfaceSampler(sample, { start, end, length }) {
  const surfaces = new Map(),
    frames = new Map();
  const remember = (cache, key, value, limit) => {
    if (cache.size >= limit) cache.delete(cache.keys().next().value);
    cache.set(key, value);
    return value;
  };
  const baseFrame = (distance) => {
    const wrapped = T.MathUtils.euclideanModulo(distance, length);
    return (
      frames.get(wrapped) ?? remember(frames, wrapped, sample(distance), 1024)
    );
  };
  function geometry(distance, lateral) {
    const frame = baseFrame(distance),
      before = baseFrame(distance - 0.25),
      after = baseFrame(distance + 0.25),
      right = frame.right.clone();
    const along = after.position
      .clone()
      .addScaledVector(after.right, lateral)
      .sub(before.position.clone().addScaledVector(before.right, lateral))
      .divideScalar(0.5);
    if (along.lengthSq() < 0.1) along.copy(frame.tangent);
    const longitudinalShear = along.dot(right);
    const tangent = along.addScaledVector(right, -longitudinalShear);
    const longitudinalMetric = tangent.length();
    tangent.normalize();
    const up = tangent.clone().cross(right).normalize();
    const rightDerivative = after.right
      .clone()
      .sub(before.right)
      .divideScalar(0.5);
    // T · R = 0 gives T' · R = -T · R'. Reuse the ribbon derivative
    // above instead of building two more complete offset-lane geometries.
    const curvature = -tangent.dot(rightDerivative) / longitudinalMetric;
    return {
      ...frame,
      position: frame.position.clone().addScaledVector(frame.right, lateral),
      right,
      tangent,
      up,
      quaternion: new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(right, up, tangent),
      ),
      longitudinalMetric,
      curvature,
      lateralMetric: 1,
      longitudinalShear,
      transverseCurvature: 0,
      bounds: { min: -14, max: 14, minDerivative: 0, maxDerivative: 0 },
      period: 0,
      viewBlend: 0,
      hullInsetScale: 1,
    };
  }
  const copy = (frame) => ({
    ...frame,
    position: frame.position.clone(),
    right: frame.right.clone(),
    up: frame.up.clone(),
    tangent: frame.tangent.clone(),
    quaternion: frame.quaternion.clone(),
    bounds: { ...frame.bounds },
  });
  return (distance, lateral = 0) => {
    const wrapped = T.MathUtils.euclideanModulo(distance, length);
    // Ordinary shelves retain their approved reference handling. Only the
    // authored full twist requires the offset-lane guidance correction.
    if (wrapped < start || wrapped > end) return undefined;
    const key = `${wrapped}:${lateral}`;
    const cached = surfaces.get(key);
    if (cached) return copy(cached);
    const frame = geometry(distance, lateral);
    // These caches contain only route-derived data. Never expose their mutable
    // vectors or include them in simulation snapshots and replay identity.
    return copy(remember(surfaces, key, frame, 256));
  };
}
