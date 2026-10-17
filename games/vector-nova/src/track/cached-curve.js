import { Vector3 } from 'three';

// A fixed Catmull-Rom span is a cubic. Compile its coefficients once instead of
// rebuilding three polynomials and their knot intervals for every road query.
// Keep Three's arc-length lookup so distance, route shape and tangents agree.
export function cacheClosedCatmullRom(curve) {
  if (!curve.isCatmullRomCurve3 || !curve.closed)
    throw new Error('Expected a fixed closed Catmull-Rom curve');
  const count = curve.points.length;
  const spans = Array.from({ length: count }, (_, i) => {
    const points = [0, 1 / 3, 2 / 3, 1].map((t) =>
      curve.getPoint((i + t) / count),
    );
    return ['x', 'y', 'z'].map((axis) => {
      const [p, q, r, s] = points.map((point) => point[axis]);
      return [
        4.5 * (-p + 3 * q - 3 * r + s),
        4.5 * (2 * p - 5 * q + 4 * r - s),
        0.5 * (-11 * p + 18 * q - 9 * r + 2 * s),
        p,
      ];
    });
  });
  return (u) => {
    const span = curve.getUtoTmapping(u) * count;
    const i = Math.floor(span);
    const t = span - i;
    const coefficients = spans[i % count];
    const value = ([a, b, c, d]) => ((a * t + b) * t + c) * t + d;
    return new Vector3(
      value(coefficients[0]),
      value(coefficients[1]),
      value(coefficients[2]),
    );
  };
}
