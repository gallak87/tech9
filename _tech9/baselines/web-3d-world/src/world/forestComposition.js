import * as THREE from 'three';
import {
  placementCircle,
  placementCapsuleChain,
} from '../modules/placement-collisions/src/placementCollisions.js';
import {
  createRandom,
  pathCenter,
  pathDistance,
  pathWidth,
  terrainHeight,
  WORLD_HALF,
} from './terrain.js';
const UP = new THREE.Vector3(0, 1, 0);
function matrixAt(x, z, scale, rotation, yOffset = 0) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3(x, terrainHeight(x, z) + yOffset, z);
  const quaternion = new THREE.Quaternion().setFromAxisAngle(UP, rotation);
  matrix.compose(
    position,
    quaternion,
    typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : scale,
  );
  return matrix;
}

function treePlacements() {
  const random = createRandom(190724);
  const points = [];
  const hero = [
    [-7.5, 15, 1.1],
    [15, 22, 0.96],
    [-10, 27, 1.14],
    [21, 7, 0.93],
    [-6.5, -4, 0.87],
    [21, -19, 1.02],
    [-8, -27, 1.1],
    [17, -37, 0.99],
  ];
  for (const [x, z, scale] of hero)
    points.push({ x, z, scale, angle: random() * 6.28 });
  for (let attempt = 0; attempt < 5000 && points.length < 278; attempt++) {
    const range = points.length < 145 ? 44 : 77;
    const x = (random() * 2 - 1) * range;
    const z = (random() * 2 - 1) * range;
    if (pathDistance(x, z) < 3.6) continue;
    // A deliberate canopy break admits the morning key into the foreground path.
    if (
      x > 3 &&
      x < 24 &&
      z > -14 &&
      z < 23 &&
      Math.abs(x - (23 - z) * 0.5) < 6.2
    )
      continue;
    if (Math.hypot(x - 14, z + 24) < 7.4) continue;
    if (points.some((point) => Math.hypot(point.x - x, point.z - z) < 3.8))
      continue;
    points.push({
      x,
      z,
      scale: 0.61 + random() * 0.49,
      angle: random() * 6.28,
    });
  }
  for (const [centerX, centerZ] of [
    [-29, -51],
    [-16, -59],
    [-3, -57],
    [12, -60],
    [27, -54],
    [-42, -60],
    [39, -65],
  ]) {
    for (let i = 0; i < 4; i++) {
      const x = centerX + (random() - 0.5) * 10;
      const z = centerZ + (random() - 0.5) * 11;
      points.push({
        x,
        z,
        scale: 0.73 + random() * 0.4,
        angle: random() * 6.28,
      });
    }
  }
  const result = [[], [], []];
  for (const [index, point] of points.entries()) {
    const scale = new THREE.Vector3(
      point.scale * (0.83 + random() * 0.25),
      point.scale,
      point.scale * (0.83 + random() * 0.25),
    );
    result[[0, 1, 2, 0, 1][index % 5]].push({
      ...point,
      matrix: matrixAt(point.x, point.z, scale, point.angle, -0.06),
    });
  }
  return result;
}

function scatter(random, count, radius, filter, scaleRange, colorRange) {
  const entries = [];
  for (
    let attempt = 0;
    attempt < count * 12 && entries.length < count;
    attempt++
  ) {
    const x = (random() * 2 - 1) * radius;
    const z = (random() * 2 - 1) * radius;
    if (filter && !filter(x, z, random)) continue;
    const scale = scaleRange[0] + random() * (scaleRange[1] - scaleRange[0]);
    const entry = {
      x,
      z,
      matrix: matrixAt(x, z, scale, random() * Math.PI * 2),
    };
    if (colorRange)
      entry.color = colorRange[0].clone().lerp(colorRange[1], random());
    entries.push(entry);
  }
  return entries;
}

function groundcoverPlacements() {
  const random = createRandom(92151);
  const short = [],
    tall = [],
    tiny = [],
    ferns = [[], []],
    distant = [];
  const palette = [new THREE.Color('#f5f6ed'), new THREE.Color('#ffffff')];
  const colonies = [
    [-3.6, 23],
    [4, 22],
    [-3.9, 16],
    [5.3, 13],
    [-3.1, 7],
    [7.6, 3],
    [-2.8, -4],
    [9, -8],
    [-3.4, -15],
    [9.8, -23],
    [-5.2, -30],
    [10, -34],
    [-10.8, 27],
    [13.5, 23],
    [-13, 7],
    [17, -17],
    [-14, -28],
    [21, -39],
  ];
  function plantInColony(
    target,
    centerX,
    centerZ,
    radius,
    count,
    minScale,
    maxScale,
    allowEdge = false,
  ) {
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2;
      const spread = Math.sqrt(random()) * radius;
      const x = centerX + Math.cos(angle) * spread;
      const z = centerZ + Math.sin(angle) * spread * (0.7 + random() * 0.7);
      const threshold = pathWidth(z) - (allowEdge ? 0.45 : 0.1);
      if (pathDistance(x, z) < threshold) continue;
      const scale = minScale + random() * (maxScale - minScale);
      target.push({
        x,
        z,
        matrix: matrixAt(x, z, scale, random() * Math.PI * 2, -0.012),
        color: palette[0].clone().lerp(palette[1], random()),
      });
    }
  }
  for (const [index, [authoredX, z]] of colonies.entries()) {
    const side = index % 2 === 0 ? -1 : 1;
    const x =
      index < 12 ? pathCenter(z) + side * (3.15 + random() * 1.15) : authoredX;
    const radius = 1.75 + random() * 1.15;
    plantInColony(short, x, z, radius, 142, 2.3, 3.0, true);
    plantInColony(tall, x, z, radius + 0.3, 19, 1.05, 1.55);
    plantInColony(tiny, x, z, radius + 0.65, 72, 1.1, 2);
    plantInColony(
      ferns[index % 2],
      x + (x < pathCenter(z) ? -0.7 : 0.7),
      z + 0.7,
      radius * 0.86,
      18,
      1.35,
      2.05,
    );
  }
  // Offset counterparts close the visible banks without making a planted straight verge.
  for (let index = 0; index < 12; index++) {
    const side = index % 2 === 0 ? 1 : -1;
    const z = colonies[index][1] + (side < 0 ? -1.7 : 2.1);
    const x = pathCenter(z) + side * (3.25 + random() * 1.15);
    const radius = 2.0 + random() * 1.05;
    plantInColony(short, x, z, radius, 112, 2.35, 3.0, true);
    plantInColony(tall, x, z, radius + 0.3, 16, 1.1, 1.7);
    plantInColony(
      ferns[index % 2],
      x + side * 0.65,
      z - 0.5,
      radius * 0.88,
      17,
      1.4,
      2.1,
    );
  }
  for (let colony = 0; colony < 130; colony++) {
    const x = (random() * 2 - 1) * (colony < 95 ? 29 : 72);
    const z = colony < 95 ? random() * 89 - 55 : (random() * 2 - 1) * 72;
    if (pathDistance(x, z) < 4) continue;
    plantInColony(distant, x, z, 2.3 + random() * 2.0, 44, 2.2, 2.9);
    plantInColony(tiny, x, z, 3.3, 22, 1.0, 2.0);
    if (colony < 70) plantInColony(ferns[colony % 2], x, z, 2.4, 3, 0.8, 1.5);
  }
  // Ferns sit against boulder contacts and hummocks, not in parallel verge bands.
  for (const [index, [x, z]] of [
    [-5.8, 10],
    [6.7, 14.5],
    [-7, -3],
    [15, -12],
    [-4.5, -20],
    [-12, 25],
    [-11, -43],
    [11, -47],
  ].entries()) {
    plantInColony(ferns[index % 2], x, z, 1.85, 15, 1.25, 1.85);
  }
  function addReserve(entries) {
    const count = entries.length;
    for (let i = 0; i < count; i += 2) {
      const source = entries[i];
      const x = source.x + (random() - 0.5) * 0.7;
      const z = source.z + (random() - 0.5) * 0.7;
      const position = new THREE.Vector3(),
        quaternion = new THREE.Quaternion(),
        scale = new THREE.Vector3();
      source.matrix.decompose(position, quaternion, scale);
      entries.push({
        x,
        z,
        matrix: matrixAt(x, z, scale, random() * Math.PI * 2, -0.012),
        color: source.color,
        reserve: true,
      });
    }
  }
  [short, tall, tiny, distant, ...ferns].forEach(addReserve);
  return [
    {
      prototype: 'grass_short',
      entries: short,
      shadow: false,
      density: true,
      chunkSize: 32,
      color: true,
    },
    {
      prototype: 'grass_tall',
      entries: tall,
      shadow: false,
      density: true,
      chunkSize: 32,
      color: true,
    },
    {
      prototype: 'grass_tiny',
      entries: tiny,
      shadow: false,
      density: true,
      chunkSize: 32,
      color: true,
    },
    {
      prototype: 'fern_a',
      entries: ferns[0],
      shadow: true,
      density: true,
      chunkSize: 32,
      color: true,
    },
    {
      prototype: 'fern_b',
      entries: ferns[1],
      shadow: true,
      density: true,
      chunkSize: 32,
      color: true,
    },
    {
      prototype: 'grass_short_lod',
      entries: distant,
      shadow: false,
      density: true,
      chunkSize: 32,
      color: true,
    },
  ];
}

function debrisPlacements() {
  const random = createRandom(31199);
  const pebbles = scatter(
    random,
    1500,
    48,
    (x, z, rng) => pathDistance(x, z) < 3.8 || rng() < 0.15,
    [0.28, 1.15],
    [new THREE.Color('#aaa797'), new THREE.Color('#6c6758')],
  );
  const sticks = scatter(random, 540, 54, () => true, [0.4, 1.5]);
  return [
    { prototype: 'trail_pebble', entries: pebbles, density: true, color: true },
    { prototype: 'fallen_twig', entries: sticks, density: true },
  ];
}

function saplingPlacements() {
  const random = createRandom(88291);
  const entries = [];
  for (let i = 0; i < 104; i++) {
    const edge = i % 4;
    const along = random() * 146 - 73;
    const distance = 61 + random() * 15;
    const x = edge < 2 ? along : distance * (edge === 2 ? 1 : -1);
    const z = edge < 2 ? distance * (edge === 0 ? 1 : -1) : along;
    entries.push({
      x,
      z,
      matrix: matrixAt(x, z, 0.8 + random() * 0.95, random() * 6.28),
    });
  }
  for (const [centerX, centerZ] of [
    [-19, -13],
    [20, -28],
    [-15, -39],
    [23, 9],
    [-28, 24],
  ]) {
    for (let i = 0; i < 5; i++) {
      const x = centerX + (random() - 0.5) * 7;
      const z = centerZ + (random() - 0.5) * 7;
      entries.push({
        x,
        z,
        matrix: matrixAt(x, z, 0.7 + random() * 0.55, random() * 6.28),
      });
    }
  }
  for (const [centerX, centerZ] of [
    [-25, -44],
    [-15, -48],
    [-3, -51],
    [11, -50],
    [24, -49],
    [-35, -56],
    [35, -56],
  ]) {
    for (let i = 0; i < 8; i++) {
      const x = centerX + (random() - 0.5) * 9;
      const z = centerZ + (random() - 0.5) * 10;
      entries.push({
        x,
        z,
        matrix: matrixAt(x, z, 0.9 + random() * 0.8, random() * 6.28),
      });
    }
  }
  return entries;
}

function rockPlacements() {
  const random = createRandom(91824);
  const points = scatter(
    random,
    135,
    73,
    (x, z) => pathDistance(x, z) > pathWidth(z) + 1.0,
    [0.32, 1.23],
  );
  const hero = [
    [-5.8, 10, 0.64],
    [6.7, 14.5, 0.82],
    [-7, -3, 1.35],
    [15, -12, 0.78],
    [-4.5, -20, 1.2],
    [-10, 28, 1.5],
  ];
  for (const [x, z, scale] of hero)
    points.push({
      x,
      z,
      matrix: matrixAt(
        x,
        z,
        new THREE.Vector3(scale * 1.1, scale * 0.86, scale),
        random() * 6.28,
        -0.15,
      ),
    });
  return [
    points.filter((_, index) => index % 2 === 0),
    points.filter((_, index) => index % 2 === 1),
  ];
}

let placementCache;
/** Rendering and collision consume these exact immutable authored transforms. */
export function getForestPlacements() {
  if (!placementCache) {
    let nextId = 0;
    const freeze = (kind, entry) => {
      Object.freeze(entry.matrix.elements);
      Object.freeze(entry.matrix);
      return Object.freeze({ ...entry, kind, id: `${kind}-${nextId++}` });
    };
    const families = (kind, entries) =>
      Object.freeze(
        entries.map((family) =>
          Object.freeze(family.map((entry) => freeze(kind, entry))),
        ),
      );
    const trees = families('tree', treePlacements());
    const rocks = families('rock', rockPlacements());
    const deadfall = Object.freeze(
      [
        [-9.2, 5, 0.9, 0.38],
        [9.2, -24, 0.74, 2.1],
        [-16, -16, 1.03, 0.9],
        [16, 28, 0.85, 1.4],
        [23, -43, 0.8, 2.9],
      ].map(([x, z, scale, angle]) =>
        freeze('log', {
          x,
          z,
          matrix: matrixAt(x, z, scale, angle),
        }),
      ),
    );
    placementCache = Object.freeze({ trees, rocks, deadfall });
  }
  return placementCache;
}

let colliderCache;
/** Static horizontal proxies for walking experiments, not mesh-accurate physics. */
export function getForestColliders() {
  if (!colliderCache) {
    const circles = [];
    const { trees, rocks, deadfall } = getForestPlacements();
    for (const [kind, families, baseRadius] of [
      ['tree', trees, 0.48],
      ['rock', rocks, 1.45],
    ]) {
      for (const entries of families) {
        for (const entry of entries) {
          circles.push(
            placementCircle({ ...entry, kind }, { radius: baseRadius }),
          );
        }
      }
    }
    // Blender's local log centerline runs from 0 to 8 * .68 metres along X.
    // Radius includes its gentle bend; branch tips remain an approximation.
    for (const entry of deadfall)
      circles.push(
        ...placementCapsuleChain(entry, {
          start: [0, 0, 0],
          end: [5.44, 0, 0],
          radius: 0.4,
        }),
      );
    colliderCache = Object.freeze(circles);
  }
  return colliderCache;
}

/** Authored content only; canonical landscape owns materials, assets and rendering. */
export function createForestComposition() {
  const { trees, rocks, deadfall } = getForestPlacements();
  return {
    terrain: {
      bounds: {
        minX: -WORLD_HALF,
        maxX: WORLD_HALF,
        minZ: -WORLD_HALF,
        maxZ: WORLD_HALF,
      },
      segments: 256,
      groundHeight: terrainHeight,
      pathMask(x, z) {
        const noise =
          Math.sin(x * 4.7 + Math.cos(z * 2.4)) * Math.cos(z * 6.1) * 0.2;
        return THREE.MathUtils.clamp(
          (pathWidth(z) + 0.8 - pathDistance(x, z) + noise) / 1.6,
          0,
          1,
        );
      },
      tint(x, z) {
        const macro = Math.sin(x * 0.35 + z * 0.06) * Math.cos(z * 0.23) * 0.05;
        return [0.87 + macro, 0.89 + macro, 0.83 + macro];
      },
    },
    placements: [
      ...['pine_a', 'pine_b', 'pine_c'].map((prototype, i) => ({
        prototype,
        entries: trees[i],
        shadow: true,
      })),
      { prototype: 'pine_sapling', entries: saplingPlacements(), shadow: true },
      { prototype: 'rock_a', entries: rocks[0], shadow: true },
      { prototype: 'rock_b', entries: rocks[1], shadow: true },
      { prototype: 'fallen_log', entries: deadfall, shadow: true },
      ...groundcoverPlacements(),
      ...debrisPlacements(),
    ],
  };
}
