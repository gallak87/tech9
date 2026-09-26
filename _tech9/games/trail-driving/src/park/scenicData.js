import {
  height,
  createRandom,
  trailSample,
  placements,
  ROUTES,
} from './parkData.js';

export const BACKDROP_RINGS = Object.freeze([300, 330, 420, 550, 740, 1000]);

function ridgeHeight(x, z, ring) {
  const a = Math.atan2(x, z);
  const noise =
    0.5 +
    0.22 * Math.sin(a * 3 + 0.3) +
    0.17 * Math.sin(a * 7) +
    0.11 * Math.cos(a * 13);
  const edge = height(x, z);
  if (ring === 0) return edge - 0.06;
  if (ring === 1) return edge * 0.86 - 2;
  if (ring === 2) return 4 + noise * 13;
  if (ring === 3) return 20 + noise * 31;
  if (ring === 4) return 58 + noise * 125;
  return 74 + noise * 156;
}

/** Square rings never overlap the drivable square, including its corners. */
export function backdropPoint(segment, ring, segments = 256) {
  const along = ((((segment % segments) + segments) % segments) / segments) * 4;
  const side = Math.floor(along),
    t = (along - side) * 2 - 1;
  const radius = BACKDROP_RINGS[ring];
  const [x, z] =
    side === 0
      ? [t * radius, -radius]
      : side === 1
        ? [radius, t * radius]
        : side === 2
          ? [-t * radius, radius]
          : [-radius, -t * radius];
  return [x, ridgeHeight(x, z, ring), z];
}

export function sceneryPlacements() {
  const random = createRandom(68124),
    cover = [],
    saplings = [],
    stones = [];
  const available = (x, z, clearance = 7.7) =>
    Math.abs(x) < 290 &&
    Math.abs(z) < 290 &&
    trailSample(x, z).distance > clearance &&
    Math.hypot(x, z - 250) > 36;
  for (const route of ROUTES)
    for (let i = 0; i < route.points.length - 1; i += 3) {
      const a = route.points[i],
        b = route.points[i + 1];
      const dx = b.x - a.x,
        dz = b.z - a.z,
        len = Math.hypot(dx, dz) || 1;
      for (const side of [-1, 1]) {
        // One irregular tuft cluster every nine metres, rather than isolated evenly spaced plants.
        const width = 8.1 + random() * 5;
        const cx = a.x - (dz / len) * width * side,
          cz = a.z + (dx / len) * width * side;
        const count = 4 + Math.floor(random() * 5);
        for (let j = 0; j < count; j++) {
          const x = cx + (random() - 0.5) * 5.5,
            z = cz + (random() - 0.5) * 5.5;
          if (!available(x, z)) continue;
          const fern = x < 110 && random() < 0.13;
          cover.push({
            x,
            z,
            scale: fern ? 1.1 + random() * 1.0 : 1.0 + random() * 1.7,
            rotation: random() * 6.28,
            prototype: fern
              ? 'fern_a'
              : j % 4 === 0
                ? 'grass_tall'
                : 'grass_short_lod',
          });
        }
        if (random() < 0.095 && available(cx, cz, 10.8))
          saplings.push({
            x: cx,
            z: cz,
            scale: 0.52 + random() * 0.36,
            rotation: random() * 6.28,
            prototype: 'pine_sapling',
          });
        if (route.id !== 'woodland' && random() < 0.22 && available(cx, cz, 8))
          stones.push({
            x: cx,
            z: cz,
            scale: 0.075 + random() * 0.13,
            rotation: random() * 6.28,
            prototype: 'rock_a',
          });
      }
    }
  // Understory nests beside existing solid trees, never in the driving corridor.
  for (let i = 0; i < placements.length; i += 5) {
    const tree = placements[i];
    if (tree.kind !== 'tree' || (tree.x > 195 && tree.z < 80)) continue;
    for (let j = 0; j < 2; j++) {
      const x = tree.x + (random() - 0.5) * 5,
        z = tree.z + (random() - 0.5) * 5;
      if (available(x, z, 10.5))
        saplings.push({
          x,
          z,
          scale: 0.48 + random() * 0.4,
          rotation: random() * 6.28,
          prototype: 'pine_sapling',
        });
    }
  }
  return { cover, saplings, stones };
}
