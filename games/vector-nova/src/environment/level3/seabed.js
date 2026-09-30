export const NACRE_SEABED_SIZE = 7000;
export const NACRE_SEABED_SEGMENTS = 128;

export function nacreSeabedBaseY(track) {
  return Math.min(track.bounds.min.y - 65, (track.waterY ?? 0) - 185);
}

function vertexHeight(track, x, z) {
  const ridges =
    32 * Math.exp(-(((x - 600) / 280) ** 2) - ((z + 40) / 700) ** 2) +
    38 * Math.exp(-(((x + 180) / 620) ** 2) - ((z + 520) / 160) ** 2) +
    24 * Math.exp(-(((x + 650) / 260) ** 2) - ((z - 140) / 480) ** 2);
  return Math.min(
    track.bounds.min.y - 43,
    nacreSeabedBaseY(track) -
      15 +
      Math.sin(x * 0.004 + Math.cos(z * 0.003)) * 9 +
      Math.sin(z * 0.008) * 5 +
      ridges,
  );
}

// Exact triangle interpolation used by the 128x128 sediment mesh. Track feet
// and reef roots query the same surface, including the new benthic ridges.
export function nacreSeabedHeight(track, worldX, worldZ) {
  const x = worldX - (track.bounds.min.x + track.bounds.max.x) / 2;
  const z = worldZ - (track.bounds.min.z + track.bounds.max.z) / 2;
  const step = NACRE_SEABED_SIZE / NACRE_SEABED_SEGMENTS;
  const gx = (x + NACRE_SEABED_SIZE / 2) / step;
  const gz = (z + NACRE_SEABED_SIZE / 2) / step;
  const ix = Math.floor(gx),
    iz = Math.floor(gz),
    u = gx - ix,
    v = gz - iz;
  const x0 = ix * step - NACRE_SEABED_SIZE / 2,
    z0 = iz * step - NACRE_SEABED_SIZE / 2;
  const a = vertexHeight(track, x0, z0),
    b = vertexHeight(track, x0, z0 + step);
  const c = vertexHeight(track, x0 + step, z0 + step),
    d = vertexHeight(track, x0 + step, z0);
  return u + v <= 1
    ? a + (d - a) * u + (b - a) * v
    : c + (b - c) * (1 - u) + (d - c) * (1 - v);
}
