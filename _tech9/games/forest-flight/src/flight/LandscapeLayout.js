const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, value) => {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Shared continuous height query; the runway and apron are exactly level. */
export function groundHeight(x, z) {
  const valley = smooth(350, 1750, Math.abs(x));
  const ridge = 0.65 + 0.35 * Math.sin(z * 0.0027 + x * 0.0018);
  const hills =
    valley * (130 + 230 * ridge) + smooth(1500, 2750, Math.abs(z)) * 170;
  const rolling =
    7 +
    11 * Math.sin(x * 0.005) * Math.cos(z * 0.004) +
    5 * Math.sin(x * 0.013 + z * 0.008);
  const strip = Math.max(
    smooth(55, 180, Math.abs(x)),
    smooth(700, 1000, Math.abs(z)),
  );
  const apron = Math.max(
    smooth(65, 140, Math.abs(x + 100)),
    smooth(125, 220, Math.abs(z - 250)),
  );
  const ridgeDetail =
    valley *
    (12 * Math.sin(x * 0.021 + z * 0.004) * Math.cos(z * 0.019) +
      5 * Math.sin(x * 0.044 - z * 0.025));
  return (hills + ridgeDetail + Math.max(0, rolling)) * Math.min(strip, apron);
}

export function randomSequence(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function forestCover(x, z) {
  if (Math.abs(x) < 80 && Math.abs(z) < 900) return 0;
  if (Math.abs(x + 100) < 100 && Math.abs(z - 250) < 200) return 0;
  const grove =
    Math.sin(x * 0.005 + Math.cos(z * 0.003) * 2) *
    Math.cos(z * 0.004 - x * 0.001);
  return 1 - smooth(0.15, 0.75, grove);
}
export function trailDistance(x, z) {
  return Math.abs(
    x - (320 + 85 * Math.sin(z * 0.003) + 26 * Math.sin(z * 0.012)),
  );
}
export const trees = [];
export const treeCells = new Map();
const random = randomSequence(81733);
for (let gx = -200; gx < 200; gx++) {
  for (let gz = -200; gz < 200; gz++) {
    const x = (gx + 0.05 + random() * 0.9) * 14;
    const z = (gz + 0.05 + random() * 0.9) * 14;
    if (random() > forestCover(x, z) * 0.88 || trailDistance(x, z) < 4)
      continue;
    const mature =
      0.5 +
      0.5 * Math.sin(x * 0.009 + Math.cos(z * 0.007)) * Math.cos(z * 0.008);
    const height = 17 + random() * 10 + mature * 9;
    const tree = {
      x,
      z,
      y: groundHeight(x, z),
      height,
      radius: height * 0.232,
      angle: random() * Math.PI * 2,
      tone: random(),
      kind: Math.floor(random() * 3),
    };
    trees.push(tree);
    const key = `${Math.floor(x / 80)},${Math.floor(z / 80)}`;
    if (!treeCells.has(key)) treeCells.set(key, []);
    treeCells.get(key).push(tree);
  }
}

/** A camera window has constant capacity; tiles are reproducible in any order. */
export function detailTile(cx, cz) {
  const rng = randomSequence(
    (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ 92151) >>> 0,
  );
  const entries = [];
  for (let i = 0; i < 2200; i++) {
    const x = (cx + rng()) * 32,
      z = (cz + rng()) * 32;
    if (
      (Math.abs(x) < 27 && Math.abs(z) < 710) ||
      (Math.abs(x + 100) < 69 && Math.abs(z - 250) < 115) ||
      trailDistance(x, z) < 1.4
    )
      continue;
    const cover = forestCover(x, z);
    const patch = Math.sin(x * 0.19 + Math.cos(z * 0.16)) * Math.cos(z * 0.23);
    if (i >= 8 && rng() > 0.64 + patch * 0.34) continue;
    const kind =
      i < 3
        ? 'rock_' + (i % 2 ? 'a' : 'b')
        : i === 3 && cover > 0.5
          ? 'fallen_log'
          : i < 8 && cover > 0.3
            ? 'pine_sapling'
            : i % 9 === 0 && cover > 0.2
              ? 'fern_' + (i % 2 ? 'a' : 'b')
              : i % 7 === 0
                ? 'grass_tall'
                : 'grass_short';
    entries.push({
      x,
      z,
      y: groundHeight(x, z),
      kind,
      angle: rng() * Math.PI * 2,
      scale: kind.startsWith('grass')
        ? 2 + rng()
        : kind.startsWith('fern')
          ? 1.2 + rng()
          : kind === 'pine_sapling'
            ? 0.45 + rng() * 0.4
            : 0.65 + rng() * 0.85,
    });
  }
  return entries;
}
