import * as T from 'three';

const clamp = T.MathUtils.clamp;
const enterRotation = (t, ramp) =>
  (ramp * (t ** 3 - 0.5 * t ** 4)) / (1 - ramp);
// Smooth angular acceleration at each end, constant rotation in the middle.
export const rotationProgress = (value, ramp = 0.15) => {
  const u = clamp(value, 0, 1);
  return u < ramp
    ? enterRotation(u / ramp, ramp)
    : u > 1 - ramp
      ? 1 - enterRotation((1 - u) / ramp, ramp)
      : (u - ramp / 2) / (1 - ramp);
};
// Integrate a unit horizontal tangent instead of interpolating lateral
// offsets. The enclosed bends have opposite signed curvature, with no sharp
// shoulder where the open reverse corkscrew changes direction.
export function createWeaveAxis(zLength, deltaX) {
  const breaks = [0, 0.13, 0.5, 0.87, 1];
  const beta = T.MathUtils.degToRad(75);
  const nodes = [
    -0.9602898564975363, -0.7966664774136267, -0.525532409916329,
    -0.1834346424956498, 0.1834346424956498, 0.525532409916329,
    0.7966664774136267, 0.9602898564975363,
  ];
  const weights = [
    0.1012285362903763, 0.2223810344533745, 0.3137066458778873,
    0.362683783378362, 0.362683783378362, 0.3137066458778873,
    0.2223810344533745, 0.1012285362903763,
  ];
  const integral = (u, alpha) => {
    const angles = [0, alpha, -beta, alpha, 0];
    let x = 0,
      z = 0;
    for (let phase = 0; phase < 4; phase++) {
      const span = breaks[phase + 1] - breaks[phase];
      const cuts = [0, 0.15, 0.85, 1].map((v) => breaks[phase] + v * span);
      for (let part = 0; part < 3; part++) {
        const low = cuts[part],
          high = Math.min(u, cuts[part + 1]);
        if (high <= low) continue;
        const half = (high - low) / 2,
          middle = (high + low) / 2;
        for (let index = 0; index < nodes.length; index++) {
          const q = middle + half * nodes[index];
          const angle = T.MathUtils.lerp(
            angles[phase],
            angles[phase + 1],
            rotationProgress((q - breaks[phase]) / span),
          );
          x += half * weights[index] * Math.sin(angle);
          z += half * weights[index] * Math.cos(angle);
        }
      }
    }
    return { x, z };
  };
  let low = 0,
    high = T.MathUtils.degToRad(85);
  for (let index = 0; index < 44; index++) {
    const middle = (low + high) / 2,
      total = integral(1, middle);
    if (total.x / total.z < deltaX / zLength) low = middle;
    else high = middle;
  }
  const alpha = (low + high) / 2,
    total = integral(1, alpha),
    length = zLength / total.z;
  const angles = [0, alpha, -beta, alpha, 0];
  const parts = [];
  for (let phase = 0; phase < 4; phase++) {
    const span = breaks[phase + 1] - breaks[phase];
    const cuts = [0, 0.15, 0.85, 1].map((v) => breaks[phase] + v * span);
    for (let part = 0; part < 3; part++)
      parts.push({
        phase,
        span,
        low: cuts[part],
        high: cuts[part + 1],
        prefix: integral(cuts[part], alpha),
      });
  }
  return {
    length,
    point(u) {
      if (u <= 0) return { x: 0, z: 0 };
      if (u >= 1) return { x: total.x * length, z: total.z * length };
      const part = parts.find((candidate) => u < candidate.high);
      const half = (u - part.low) / 2,
        middle = (u + part.low) / 2;
      let { x, z } = part.prefix;
      // Every completed quadrature interval is immutable. Start from its exact
      // accumulated sum and evaluate only the current partial interval in the
      // original order; this is the same curve, without runtime reintegration.
      for (let index = 0; index < nodes.length; index++) {
        const q = middle + half * nodes[index];
        const angle = T.MathUtils.lerp(
          angles[part.phase],
          angles[part.phase + 1],
          rotationProgress((q - breaks[part.phase]) / part.span),
        );
        x += half * weights[index] * Math.sin(angle);
        z += half * weights[index] * Math.cos(angle);
      }
      return { x: x * length, z: z * length };
    },
  };
}
