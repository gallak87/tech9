/** Same world-space surface used by the existing floor and the tree pilot. */
export function vesperGroundHeight(x, z, ground = -100) {
  const localX = x - 300;
  return (
    ground -
    8 +
    Math.sin(localX * 0.011) * Math.cos(z * 0.009) * 12 +
    Math.sin((localX + z) * 0.021) * 4
  );
}

/** Interpolate the actual two triangles in the existing 86 × 74 floor grid. */
export function vesperTerrainHeight(x, z, ground = -100) {
  const width = 4200 / 86,
    depth = 3700 / 74;
  const gridX = Math.max(0, Math.min(85.999999, (x + 1800) / width));
  const gridZ = Math.max(0, Math.min(73.999999, (z + 1850) / depth));
  const ix = Math.floor(gridX),
    iz = Math.floor(gridZ);
  const tx = gridX - ix,
    tz = gridZ - iz;
  const x0 = ix * width - 1800,
    z0 = iz * depth - 1850;
  const a = vesperGroundHeight(x0, z0, ground);
  const b = vesperGroundHeight(x0, z0 + depth, ground);
  const c = vesperGroundHeight(x0 + width, z0 + depth, ground);
  const d = vesperGroundHeight(x0 + width, z0, ground);
  return tx + tz <= 1
    ? a * (1 - tx - tz) + d * tx + b * tz
    : d * (1 - tz) + b * (1 - tx) + c * (tx + tz - 1);
}
