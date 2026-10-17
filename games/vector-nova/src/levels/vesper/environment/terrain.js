// Spend the denser floor mesh at Rootfall's planted bank, not the whole horizon.
function terrainAxis(start, length, segments, detailMin, detailMax) {
  const points = [];
  for (let i = 0; i < segments; i++) {
    const a = start + (i * length) / segments;
    const b = start + ((i + 1) * length) / segments;
    points.push(a);
    if (b >= detailMin && a <= detailMax) points.push((a + b) / 2);
  }
  points.push(start + length);
  return points;
}
export const VESPER_TERRAIN_X = terrainAxis(-1800, 4200, 86, 330, 670);
export const VESPER_TERRAIN_Z = terrainAxis(-1850, 3700, 74, -490, -40);
export const VESPER_TERRAIN_SEGMENTS = [
  VESPER_TERRAIN_X.length - 1,
  VESPER_TERRAIN_Z.length - 1,
];

function terrainCell(points, value) {
  let low = 0,
    high = points.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (value < points[mid]) high = mid;
    else low = mid;
  }
  return low;
}

/** A rooted shoulder beside Rootfall; its crest remains below the raceway. */
function rootfallBank(x, z) {
  const r = ((x - 500) / 155) ** 2 + ((z + 265) / 205) ** 2;
  return r < 1 ? 45 * (1 - r) ** 2 : 0;
}

/** Shared surface for the rendered forest floor and every rooted plant. */
export function vesperGroundHeight(x, z, ground = -100) {
  const localX = x - 300;
  return (
    ground -
    8 +
    rootfallBank(x, z) +
    Math.sin(localX * 0.011) * Math.cos(z * 0.009) * 29 +
    Math.sin((localX + z) * 0.021) * 8 +
    Math.sin(x * 0.004 + z * 0.003) * 12
  );
}

/** Interpolate the actual two triangles in each rendered floor cell. */
export function vesperTerrainHeight(x, z, ground = -100) {
  const ix = terrainCell(VESPER_TERRAIN_X, x),
    iz = terrainCell(VESPER_TERRAIN_Z, z);
  const x0 = VESPER_TERRAIN_X[ix],
    z0 = VESPER_TERRAIN_Z[iz];
  const width = VESPER_TERRAIN_X[ix + 1] - x0,
    depth = VESPER_TERRAIN_Z[iz + 1] - z0;
  const tx = Math.max(0, Math.min(1, (x - x0) / width)),
    tz = Math.max(0, Math.min(1, (z - z0) / depth));
  const a = vesperGroundHeight(x0, z0, ground);
  const b = vesperGroundHeight(x0, z0 + depth, ground);
  const c = vesperGroundHeight(x0 + width, z0 + depth, ground);
  const d = vesperGroundHeight(x0 + width, z0, ground);
  return tx + tz <= 1
    ? a * (1 - tx - tz) + d * tx + b * tz
    : d * (1 - tz) + b * (1 - tx) + c * (tx + tz - 1);
}
