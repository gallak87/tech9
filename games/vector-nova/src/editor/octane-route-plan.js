// Horizontal landmarks for woven circuits. Two passages with the same X/Z have
// different route stations, so the height pass can turn them into an overpass.
export function createOctaneRoutePlan({ seed, length, waves, attempt = 0 }) {
  if (waves !== 2 || length < 5000 || attempt >= 2) return null;
  const key = Math.imul((seed ^ (seed >>> 16)) >>> 0, 0x9e3779b1) >>> 0;
  const braid = ((key & 1) ^ attempt) === 0;
  const breadth = 0.8 + ((key >>> 8) % 96) / 160;
  const skew = (((key >>> 20) % 101) - 50) / 120;
  const waist = 0.53 + ((key >>> 4) % 11) / 100;
  const cross = Math.acos(waist) / (2 * Math.PI);
  const stations = braid
    ? [0, cross, 0.25, 0.5 - cross, 0.5, 0.5 + cross, 0.75, 1 - cross]
    : [0, 0.14, 0.25, 0.37, 0.5, 0.66, 0.75, 0.88];
  return stations.map((u) => {
    const angle = 2 * Math.PI * u;
    const x = Math.cos(angle);
    const s = Math.sin(angle);
    // A braid crosses twice, a pinched loop once. The shared quadratic
    // offset bends the entire footprint around the inside of the harbor.
    const span = braid ? x * x - waist * waist : x * (1 + 0.45 * x);
    const spanSlope = braid ? 2 * x : 1 + 0.9 * x;
    const z = breadth * s * span + skew * s * s;
    const dx = -s;
    const dz = breadth * (x * span - s * s * spanSlope) + 2 * skew * s * x;
    const magnitude = Math.hypot(dx, dz);
    return { u, x, z, dx: dx / magnitude, dz: dz / magnitude };
  });
}
