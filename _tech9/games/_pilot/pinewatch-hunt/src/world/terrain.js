/** Fixed, authored-scale landscape shared by rendering and future grounded actors. */
export const WORLD_SIZE = 160;
export const WORLD_HALF = WORLD_SIZE / 2;

export function pathCenter(z) {
  const distance = 23 - z;
  return Math.sin(distance * 0.055) * 4 + distance * 0.05;
}

export function pathWidth(z) {
  return (
    2.05 +
    0.27 * Math.sin(z * 0.19) +
    0.18 * Math.cos(z * 0.31) +
    0.17 * Math.sin(z * 0.73) +
    0.09 * Math.cos(z * 1.31)
  );
}

export function pathDistance(x, z) {
  const main = Math.abs(x - pathCenter(z));
  // A quiet side trail leaves the main walk in the middle distance.
  const side =
    z < -13 && x > pathCenter(z)
      ? Math.abs(z + 19 + (x - 4) * 0.37) * 1.7
      : 100;
  return Math.min(main, side);
}

export function terrainHeight(x, z) {
  const rolling =
    0.48 * Math.sin(x * 0.071) * Math.cos(z * 0.057) +
    0.32 * Math.sin(z * 0.081) +
    0.28 * Math.sin((x + z) * 0.043);
  const shoulder =
    Math.min(1, pathDistance(x, z) / 5) *
    (0.22 + 0.15 * Math.sin(x * 0.29 + z * 0.18));
  const rim = Math.max(0, Math.max(Math.abs(x), Math.abs(z)) - 56) / 24;
  const rimProfile =
    1.25 +
    0.62 * Math.sin(x * 0.063 + z * 0.029) +
    0.45 * Math.sin(x * 0.15 - z * 0.08);
  const destination =
    3.7 * Math.exp(-((x - 2) ** 2 / 540 + (z + 52) ** 2 / 132));
  const secondary =
    1.8 * Math.exp(-((x + 26) ** 2 / 210 + (z + 42) ** 2 / 95)) +
    2.2 * Math.exp(-((x - 28) ** 2 / 190 + (z + 61) ** 2 / 180));
  const pathMask = Math.min(
    1,
    Math.max(0, (pathDistance(x, z) - pathWidth(z) + 0.5) / 2.2),
  );
  const hummocks =
    pathMask *
    (0.11 * Math.sin(x * 0.75 + z * 0.41) * Math.cos(z * 0.57) +
      0.27 * Math.sin(x * 0.2 + z * 0.11) * Math.cos(z * 0.26));
  return (
    rolling +
    shoulder +
    rim * rim * rimProfile +
    destination +
    secondary +
    hummocks
  );
}

export function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
