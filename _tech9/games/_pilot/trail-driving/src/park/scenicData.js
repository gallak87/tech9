import {
  height,
  createRandom,
  trailSample,
  placements,
  ROUTES,
} from './parkData.js';

// The continuous apron stays low; independent distant ridgelines carry the peaks.
export const BACKDROP_RINGS = Object.freeze([300, 350, 470, 610]);

function ridgeHeight(x, z, ring) {
  const a = Math.atan2(x, z);
  const lowRoll = Math.sin(a * 5 + 0.3) * 2 + Math.sin(a * 11) * 1.4;
  if (ring === 0) return height(x, z) - 0.06;
  if (ring === 1) return height(x, z) * 0.44 - 4 + lowRoll;
  if (ring === 2) return -7 + lowRoll * 1.2;
  return -12 + lowRoll;
}

export function mountainSilhouettePoint(segment, layer, row, segments = 256) {
  const a = ((segment % segments) / segments) * Math.PI * 2;
  const peaks =
    layer === 0
      ? [
          [0.2, 76, 0.26],
          [1.25, 57, 0.19],
          [2.28, 94, 0.32],
          [3.64, 69, 0.25],
          [4.9, 86, 0.3],
          [5.71, 42, 0.14],
        ]
      : [
          [0.67, 136, 0.31],
          [1.95, 93, 0.27],
          [3.1, 128, 0.34],
          [4.14, 106, 0.25],
          [5.35, 150, 0.38],
        ];
  let summit = -3 + Math.sin(a * 9 + layer) * 4;
  for (const [angle, h, width] of peaks) {
    const delta = Math.abs(
      Math.atan2(Math.sin(a - angle), Math.cos(a - angle)),
    );
    summit += h * Math.max(0, 1 - delta / width) ** 0.82;
  }
  summit += Math.max(0, summit) * Math.sin(a * 39 + layer) * 0.08;
  const radial =
    (layer === 0 ? 690 : 940) +
    Math.sin(a * 7 + layer) * 18 +
    (row === 1 ? -21 : 0);
  return [
    Math.sin(a) * radial,
    row === 0 ? -35 : row === 1 ? summit * 0.36 - 11 : summit,
    Math.cos(a) * radial,
  ];
}

const treeCells = new Map();
for (const tree of placements) {
  if (tree.kind !== 'tree') continue;
  const key = `${Math.floor(tree.x / 24)}:${Math.floor(tree.z / 24)}`;
  if (!treeCells.has(key)) treeCells.set(key, []);
  treeCells.get(key).push(tree);
}

export function visualCanopyShade(x, z) {
  let distanceSquared = 200;
  const cx = Math.floor(x / 24),
    cz = Math.floor(z / 24);
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++)
      for (const tree of treeCells.get(`${cx + dx}:${cz + dz}`) || [])
        distanceSquared = Math.min(
          distanceSquared,
          (x - tree.x) ** 2 + (z - tree.z) ** 2,
        );
  return 1 - Math.exp(-distanceSquared / 42) * 0.44;
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
        const count =
          route.id === 'woodland'
            ? 8 + Math.floor(random() * 7)
            : route.id === 'ridge'
              ? 3 + Math.floor(random() * 4)
              : 3 + Math.floor(random() * 3);
        for (let j = 0; j < count; j++) {
          const x = cx + (random() - 0.5) * 5.5,
            z = cz + (random() - 0.5) * 5.5;
          if (!available(x, z)) continue;
          const fern =
            route.id === 'woodland'
              ? random() < 0.29
              : x < 110 && random() < 0.1;
          cover.push({
            x,
            z,
            scale: fern
              ? 1.35 + random() * 1.35
              : route.id === 'woodland'
                ? 1.7 + random() * 2.25
                : 1.1 + random() * 1.65,
            rotation: random() * 6.28,
            prototype: fern
              ? 'fern_a'
              : j % 4 === 0
                ? 'grass_tall'
                : 'grass_short_lod',
          });
        }
        if (
          random() < (route.id === 'woodland' ? 0.37 : 0.055) &&
          available(cx, cz, 10.8)
        )
          saplings.push({
            x: cx,
            z: cz,
            scale: 0.36 + random() * 0.58,
            rotation: random() * 6.28,
            prototype: 'pine_sapling',
          });
        if (route.id === 'granite' && random() < 0.66) {
          for (let n = 0; n < 3; n++) {
            const x = cx + (random() - 0.5) * 6,
              z = cz + (random() - 0.5) * 6;
            if (available(x, z, 7.9))
              stones.push({
                x,
                z,
                scale: 0.2 + random() * 0.5,
                vertical: 0.1,
                rotation: random() * 6.28,
                prototype: 'rock_a',
              });
          }
        } else if (
          route.id === 'ridge' &&
          random() < 0.22 &&
          available(cx, cz, 8)
        )
          stones.push({
            x: cx,
            z: cz,
            scale: 0.15 + random() * 0.3,
            vertical: 0.13,
            rotation: random() * 6.28,
            prototype: 'rock_a',
          });
      }
    }
  // Understory nests beside existing solid trees, never in the driving corridor.
  for (let i = 0; i < placements.length; i += 5) {
    const tree = placements[i];
    if (tree.kind !== 'tree' || (tree.x > 195 && tree.z < 80)) continue;
    for (let j = 0; j < (tree.x < -55 ? 4 : 1); j++) {
      const x = tree.x + (random() - 0.5) * 5,
        z = tree.z + (random() - 0.5) * 5;
      if (available(x, z, 10.5))
        saplings.push({
          x,
          z,
          scale: 0.33 + random() * 0.63,
          rotation: random() * 6.28,
          prototype: 'pine_sapling',
        });
    }
  }
  return { cover, saplings, stones };
}
