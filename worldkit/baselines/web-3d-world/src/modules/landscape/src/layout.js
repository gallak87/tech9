const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, value) => {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Default continuous natural-valley height query. */
export function defaultGroundHeight(x, z) {
  const valley = smooth(350, 1750, Math.abs(x));
  const ridge = 0.65 + 0.35 * Math.sin(z * 0.0027 + x * 0.0018);
  const hills =
    valley * (130 + 230 * ridge) + smooth(1500, 2750, Math.abs(z)) * 170;
  const rolling =
    7 +
    11 * Math.sin(x * 0.005) * Math.cos(z * 0.004) +
    5 * Math.sin(x * 0.013 + z * 0.008);
  const ridgeDetail =
    valley *
    (12 * Math.sin(x * 0.021 + z * 0.004) * Math.cos(z * 0.019) +
      5 * Math.sin(x * 0.044 - z * 0.025));
  return hills + ridgeDetail + Math.max(0, rolling);
}

export function randomSequence(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function defaultForestCover(x, z) {
  const grove =
    Math.sin(x * 0.005 + Math.cos(z * 0.003) * 2) *
      Math.cos(z * 0.004 - x * 0.001) +
    0.2 *
      Math.sin(x * 0.023 + Math.cos(z * 0.017) * 2) *
      Math.cos(z * 0.029 - x * 0.009) +
    0.09 * Math.sin(x * 0.067 + z * 0.037) * Math.cos(z * 0.051);
  return 1 - smooth(0.05, 0.85, grove);
}
export const DEFAULT_BOUNDS = Object.freeze({
  minX: -2400,
  maxX: 2400,
  minZ: -2400,
  maxZ: 2400,
});
export const DEFAULT_TRAIL = Object.freeze({
  offset: 0,
  amplitude: 40,
  frequency: 0.004,
  detailAmplitude: 18,
  detailFrequency: 0.014,
});

/** Finite, deterministic landscape queries. No airport, markers or game rules. */
export function createLandscapeLayout({
  bounds = DEFAULT_BOUNDS,
  seed = 81733,
  groundHeight = defaultGroundHeight,
  forestCover = defaultForestCover,
  trail = DEFAULT_TRAIL,
  excludeDetail = () => false,
  mown = () => false,
} = {}) {
  for (const key of ['minX', 'maxX', 'minZ', 'maxZ'])
    if (!Number.isFinite(bounds[key]))
      throw new RangeError('Landscape bounds must be finite.');
  for (const [a, b] of [
    ['minX', 'maxX'],
    ['minZ', 'maxZ'],
  ])
    if (bounds[b] - bounds[a] < 64 || bounds[b] - bounds[a] > 4800)
      throw new RangeError('Landscape dimensions must be 64–4800 metres.');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new RangeError('Seed must be an unsigned 32-bit integer.');
  for (const fn of [groundHeight, forestCover, excludeDetail, mown])
    if (typeof fn !== 'function')
      throw new TypeError('Landscape queries must be functions.');
  const heightQuery = groundHeight,
    coverQuery = forestCover;
  groundHeight = (x, z) => {
    const height = heightQuery(x, z);
    if (!Number.isFinite(height))
      throw new TypeError('Ground height must be finite.');
    return height;
  };
  forestCover = (x, z) => {
    const cover = coverQuery(x, z);
    if (!Number.isFinite(cover))
      throw new TypeError('Forest cover must be finite.');
    return clamp(cover, 0, 1);
  };
  groundHeight(bounds.minX, bounds.minZ);
  bounds = Object.freeze({ ...bounds });
  const path =
    trail === false ? null : Object.freeze({ ...DEFAULT_TRAIL, ...trail });
  if (path && !Object.values(path).every(Number.isFinite))
    throw new TypeError('Trail parameters must be finite.');
  const trailDistance = (x, z) =>
    path
      ? Math.abs(
          x -
            (path.offset +
              path.amplitude * Math.sin(z * path.frequency) +
              path.detailAmplitude * Math.sin(z * path.detailFrequency)),
        )
      : Infinity;
  const canopyBounds = {
    minX: bounds.minX - 400,
    maxX: bounds.maxX + 400,
    minZ: bounds.minZ - 400,
    maxZ: bounds.maxZ + 400,
  };
  const terrainBounds = Object.freeze({
    minX: bounds.minX - 800,
    maxX: bounds.maxX + 800,
    minZ: bounds.minZ - 800,
    maxZ: bounds.maxZ + 800,
  });
  const trees = [];
  const treeCells = new Map();
  const random = randomSequence(seed);
  for (
    let gx = Math.floor(canopyBounds.minX / 14);
    gx < Math.ceil(canopyBounds.maxX / 14);
    gx++
  ) {
    for (
      let gz = Math.floor(canopyBounds.minZ / 14);
      gz < Math.ceil(canopyBounds.maxZ / 14);
      gz++
    ) {
      const x = (gx + 0.05 + random() * 0.9) * 14;
      const z = (gz + 0.05 + random() * 0.9) * 14;
      if (random() > forestCover(x, z) * 0.88 || trailDistance(x, z) < 4)
        continue;
      const mature =
        0.5 +
        0.5 * Math.sin(x * 0.009 + Math.cos(z * 0.007)) * Math.cos(z * 0.008);
      const height = 14 + random() * 13 + mature * 13;
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
  function detailTile(cx, cz) {
    const rng = randomSequence(
      (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ seed ^ 92151) >>> 0,
    );
    const entries = [];
    for (let i = 0; i < 2200; i++) {
      const x = (cx + rng()) * 32,
        z = (cz + rng()) * 32;
      if (
        x < terrainBounds.minX ||
        x > terrainBounds.maxX ||
        z < terrainBounds.minZ ||
        z > terrainBounds.maxZ ||
        excludeDetail(x, z) ||
        trailDistance(x, z) < 1.4
      )
        continue;
      const cover = forestCover(x, z);
      const trimmed = mown(x, z);
      const patch =
        Math.sin(x * 0.19 + Math.cos(z * 0.16)) * Math.cos(z * 0.23);
      if (i >= 8 && rng() > (trimmed ? 0.32 : 0.64) + patch * 0.34) continue;
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
          ? (2 + rng()) * (trimmed ? 0.42 : 1)
          : kind.startsWith('fern')
            ? 1.2 + rng()
            : kind === 'pine_sapling'
              ? 0.45 + rng() * 0.4
              : 0.65 + rng() * 0.85,
      });
    }
    return entries;
  }

  function obstacle(x, y, z, radius = 3.2) {
    for (
      let ix = Math.floor((x - 12 - radius) / 80);
      ix <= Math.floor((x + 12 + radius) / 80);
      ix++
    )
      for (
        let iz = Math.floor((z - 12 - radius) / 80);
        iz <= Math.floor((z + 12 + radius) / 80);
        iz++
      )
        for (const t of treeCells.get(`${ix},${iz}`) ?? []) {
          const h = y - t.y;
          if (h < -radius || h > t.height + radius) continue;
          const r =
            h < t.height * 0.2
              ? 0.65
              : t.radius * clamp(1.35 - h / t.height, 0.1, 1);
          if ((x - t.x) ** 2 + (z - t.z) ** 2 < (r + radius) ** 2)
            return { id: 'tree', name: 'a tree' };
        }
    return null;
  }
  function sampleSurface(x, z) {
    if (
      x < terrainBounds.minX ||
      x > terrainBounds.maxX ||
      z < terrainBounds.minZ ||
      z > terrainBounds.maxZ
    )
      return null;
    const y = groundHeight(x, z),
      dx = groundHeight(x - 0.5, z) - groundHeight(x + 0.5, z),
      dz = groundHeight(x, z - 0.5) - groundHeight(x, z + 0.5),
      n = Math.hypot(dx, 1, dz);
    let coverHeight = y,
      exposure = 1;
    for (
      let ix = Math.floor((x - 12) / 80);
      ix <= Math.floor((x + 12) / 80);
      ix++
    )
      for (
        let iz = Math.floor((z - 12) / 80);
        iz <= Math.floor((z + 12) / 80);
        iz++
      )
        for (const t of treeCells.get(`${ix},${iz}`) ?? [])
          if (Math.hypot(x - t.x, z - t.z) < t.radius) {
            coverHeight = Math.max(coverHeight, t.y + t.height * 0.9);
            exposure = 0.3;
          }
    return {
      position: [x, y, z],
      normal: [dx / n, 1 / n, dz / n],
      exposure,
      coverHeight,
      snowRetention: trailDistance(x, z) < 2 ? 0.4 : 1,
      puddle: 0.35,
    };
  }
  return {
    bounds,
    canopyBounds,
    terrainBounds,
    trail: path,
    trees,
    treeCells,
    groundHeight,
    forestCover,
    detailTile,
    trailDistance,
    obstacle,
    sampleSurface,
  };
}
