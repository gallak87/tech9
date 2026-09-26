/** Authored metre-scale park. Rendering, route rules and contact consume this file. */
export const bounds = Object.freeze({
  minX: -295,
  maxX: 295,
  minZ: -295,
  maxZ: 295,
  minY: -30,
  maxY: 150,
});
export const TERRAIN_SIZE = 600;
export const TERRAIN_RESOLUTION = 300;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (v) => {
  const t = clamp(v, 0, 1);
  return t * t * (3 - 2 * t);
};
const gaussian = (x, z, cx, cz, sx, sz) =>
  Math.exp(-(((x - cx) / sx) ** 2) - ((z - cz) / sz) ** 2);

export function createRandom(seed = 89472) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function spline(anchors) {
  const result = [];
  const at = (i) => anchors[(i + anchors.length) % anchors.length];
  for (let i = 0; i < anchors.length; i++) {
    const a = at(i - 1),
      b = at(i),
      c = at(i + 1),
      d = at(i + 2);
    const count = Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / 3);
    for (let j = 0; j < count; j++) {
      const t = j / count,
        t2 = t * t,
        t3 = t2 * t;
      const point = (axis) =>
        0.5 *
        (2 * b[axis] +
          (-a[axis] + c[axis]) * t +
          (2 * a[axis] - 5 * b[axis] + 4 * c[axis] - d[axis]) * t2 +
          (-a[axis] + 3 * b[axis] - 3 * c[axis] + d[axis]) * t3);
      result.push({ x: point(0), z: point(1) });
    }
  }
  result.push({ ...result[0] });
  return result;
}

function createRoute(spec) {
  const points = spline(spec.anchors);
  const distances = [0];
  for (let i = 1; i < points.length; i++)
    distances.push(
      distances[i - 1] +
        Math.hypot(
          points[i].x - points[i - 1].x,
          points[i].z - points[i - 1].z,
        ),
    );
  const length = distances.at(-1);
  const sample = (s) => {
    let i = 1;
    while (i < distances.length - 1 && distances[i] < s) i++;
    const a = points[i - 1],
      b = points[i],
      t = clamp(
        (s - distances[i - 1]) / (distances[i] - distances[i - 1]),
        0,
        1,
      );
    return {
      x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t,
      heading: Math.atan2(b.x - a.x, -(b.z - a.z)),
    };
  };
  const gateCount = Math.ceil((length - 20) / 80) + 1;
  const gates = Array.from({ length: gateCount }, (_, i) =>
    Object.freeze({
      ...sample(8 + ((length - 20) * i) / (gateCount - 1)),
      width: 15,
    }),
  );
  const first = gates[0];
  const spawn = {
    x: first.x - Math.sin(first.heading) * 8,
    z: first.z + Math.cos(first.heading) * 8,
    heading: first.heading,
  };
  const details = { ...spec };
  delete details.anchors;
  return Object.freeze({
    ...details,
    length,
    points: Object.freeze(points.map(Object.freeze)),
    gates: Object.freeze(gates),
    spawn: Object.freeze(spawn),
  });
}

export const ROUTES = Object.freeze([
  createRoute({
    id: 'woodland',
    name: 'Fernwood Loop',
    subtitle: 'FLOW / FOREST',
    color: '#d8a445',
    description:
      'A flowing dirt ribbon through tall pines. Carry speed, brake before the bends.',
    medals: { jeep: [99, 118, 145], atv: [91, 110, 136], bike: [86, 105, 132] },
    anchors: [
      [-25, 220],
      [-45, 163],
      [-115, 130],
      [-198, 82],
      [-221, 0],
      [-194, -77],
      [-123, -115],
      [-98, -176],
      [-155, -219],
      [-220, -171],
      [-260, -72],
      [-248, 54],
      [-211, 160],
      [-134, 217],
      [-57, 242],
    ],
  }),
  createRoute({
    id: 'granite',
    name: 'Granite Switchbacks',
    subtitle: 'TECHNICAL / CLIMB',
    color: '#d87b59',
    description:
      'Climb loose stone and a chain of deliberate switchbacks. Find traction, then unwind.',
    medals: {
      jeep: [116, 133, 157],
      atv: [107, 125, 150],
      bike: [102, 122, 146],
    },
    anchors: [
      [0, 220],
      [1, 166],
      [51, 113],
      [130, 98],
      [167, 57],
      [91, 28],
      [58, -13],
      [146, -53],
      [172, -103],
      [96, -122],
      [14, -163],
      [-14, -208],
      [51, -239],
      [125, -218],
      [207, -156],
      [236, -56],
      [215, 73],
      [164, 154],
      [92, 208],
    ],
  }),
  createRoute({
    id: 'ridge',
    name: 'Skyline Run',
    subtitle: 'FAST / RIDGE',
    color: '#7eb9b4',
    description:
      'Open views, fast sweepers and three rolling crests. Settle the landing before the next turn.',
    medals: {
      jeep: [106, 125, 150],
      atv: [98, 116, 143],
      bike: [91, 109, 137],
    },
    anchors: [
      [25, 220],
      [83, 185],
      [167, 185],
      [239, 123],
      [270, 35],
      [251, -79],
      [225, -195],
      [150, -263],
      [35, -266],
      [-62, -240],
      [-43, -173],
      [-7, -115],
      [43, -66],
      [4, -5],
      [-42, 69],
      [-7, 144],
    ],
  }),
]);

// Insert segments in a bounded 24 m spatial grid, including the whole road shoulder.
const cells = new Map();
const segments = [];
for (const route of ROUTES)
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1],
      b = route.points[i];
    const item = { a, b, route: route.id, dx: b.x - a.x, dz: b.z - a.z };
    item.lengthSquared = item.dx * item.dx + item.dz * item.dz;
    const id = segments.push(item) - 1;
    for (
      let x = Math.floor((Math.min(a.x, b.x) - 18) / 24);
      x <= Math.floor((Math.max(a.x, b.x) + 18) / 24);
      x++
    ) {
      for (
        let z = Math.floor((Math.min(a.z, b.z) - 18) / 24);
        z <= Math.floor((Math.max(a.z, b.z) + 18) / 24);
        z++
      ) {
        const key = `${x}:${z}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(id);
      }
    }
  }

export function trailSample(x, z) {
  let distanceSquared = 32 * 32,
    route = null;
  for (const id of cells.get(`${Math.floor(x / 24)}:${Math.floor(z / 24)}`) ||
    []) {
    const s = segments[id];
    const t = clamp(
      ((x - s.a.x) * s.dx + (z - s.a.z) * s.dz) / s.lengthSquared,
      0,
      1,
    );
    const d = (x - s.a.x - s.dx * t) ** 2 + (z - s.a.z - s.dz * t) ** 2;
    if (d < distanceSquared) {
      distanceSquared = d;
      route = s.route;
    }
  }
  return { distance: Math.sqrt(distanceSquared), route };
}

const CRESTS = [
  { x: 260, z: -24, axisX: -0.15, axisZ: -0.989, rise: 1.35, span: 6.4 },
  { x: 225, z: -193, axisX: -0.48, axisZ: -0.877, rise: 1.2, span: 6.1 },
  { x: 100, z: -269, axisX: -0.999, axisZ: 0.03, rise: 1.5, span: 7 },
];

function authoredHeight(x, z) {
  const hill =
    6 +
    35 * gaussian(x, z, 155, -153, 165, 150) +
    12 * gaussian(x, z, -135, -175, 115, 105) +
    7 * gaussian(x, z, -165, 60, 130, 145);
  const rolls =
    1.1 * Math.sin(x * 0.022 + z * 0.011) + 0.75 * Math.cos(z * 0.027);
  const quarry = gaussian(x, z, 95, 0, 105, 95);
  const ripple =
    quarry * (0.1 * Math.sin(x * 0.73 + z * 0.49) + 0.12 * Math.sin(z * 0.61));
  let y = hill + rolls + ripple;
  for (const crest of CRESTS) {
    const dx = x - crest.x,
      dz = z - crest.z;
    const along = dx * crest.axisX + dz * crest.axisZ,
      across = dx * crest.axisZ - dz * crest.axisX;
    y +=
      crest.rise * Math.exp(-((along / crest.span) ** 2) - (across / 13) ** 4);
  }
  const apron = 1 - smooth((Math.hypot(x, z - 250) - 25) / 34);
  return y * (1 - apron) + 6.5 * apron;
}

// Query the exact triangular mesh surface, including its diagonal; no floating wheels.
const gridCount = TERRAIN_RESOLUTION + 1;
const grid = new Float32Array(gridCount * gridCount);
for (let iz = 0; iz < gridCount; iz++)
  for (let ix = 0; ix < gridCount; ix++)
    grid[iz * gridCount + ix] = authoredHeight(ix * 2 - 300, iz * 2 - 300);
export function height(x, z) {
  const gx = clamp((x + 300) / 2, 0, TERRAIN_RESOLUTION - 0.000001),
    gz = clamp((z + 300) / 2, 0, TERRAIN_RESOLUTION - 0.000001);
  const ix = Math.floor(gx),
    iz = Math.floor(gz),
    u = gx - ix,
    v = gz - iz;
  const a = grid[iz * gridCount + ix],
    b = grid[iz * gridCount + ix + 1],
    c = grid[(iz + 1) * gridCount + ix],
    d = grid[(iz + 1) * gridCount + ix + 1];
  // PlaneGeometry's triangles use the b-c diagonal after rotating onto XZ.
  return u + v <= 1
    ? a + (b - a) * u + (c - a) * v
    : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

const firm = Object.freeze({ kind: 'trail', grip: 1, roughness: 0.04 });
const gravel = Object.freeze({ kind: 'gravel', grip: 0.74, roughness: 0.16 });
const rough = Object.freeze({ kind: 'rough', grip: 0.64, roughness: 0.36 });
export function surface(x, z) {
  if (Math.hypot(x, z - 250) < 30) return gravel;
  const trail = trailSample(x, z);
  if (trail.distance > 6.6) return rough;
  return trail.route === 'granite' || (trail.route === 'ridge' && z < 20)
    ? gravel
    : firm;
}

const random = createRandom(498756);
const authoredSolids = [];
for (let i = 0, tries = 0; i < 880 && tries < 9000; tries++) {
  const x = random() * 566 - 283,
    z = random() * 566 - 283;
  const road = trailSample(x, z);
  if (road.distance < 11 || Math.hypot(x, z - 249) < 46) continue;
  // The eastern high ridge opens up, while the western loop stays beneath a canopy.
  if (x > 185 && z < 140 && random() < 0.72) continue;
  const scale = 0.82 + random() * 0.78;
  if (
    authoredSolids.some(
      (p) => p.kind === 'tree' && (p.x - x) ** 2 + (p.z - z) ** 2 < 45,
    )
  )
    continue;
  authoredSolids.push({
    id: `tree-${i}`,
    kind: 'tree',
    prototype: ['pine_a', 'pine_b', 'pine_c'][i % 3],
    x,
    z,
    scale,
    rotation: random() * Math.PI * 2,
    radius: 0.57 * scale,
  });
  i++;
}
for (let i = 0, tries = 0; i < 175 && tries < 4000; tries++) {
  const x = random() * 560 - 280,
    z = random() * 555 - 285,
    scale = 0.65 + random() * 1.45;
  if (
    trailSample(x, z).distance < 10 + scale * 1.5 ||
    Math.hypot(x, z - 249) < 45
  )
    continue;
  authoredSolids.push({
    id: `rock-${i}`,
    kind: 'rock',
    prototype: i % 2 ? 'rock_a' : 'rock_b',
    x,
    z,
    scale,
    rotation: random() * 6.28,
    radius: 1.6 * scale,
  });
  i++;
}
export const placements = Object.freeze(authoredSolids.map(Object.freeze));
const builtColliders = placements.map(({ id, kind, x, z, radius }) => ({
  id,
  kind,
  x,
  z,
  radius,
}));
// The garage canopy posts and the ranger kiosk share these exact coordinates in the renderer.
export const GARAGE_POSTS = Object.freeze(
  [
    [-11, 249],
    [11, 249],
    [-11, 266],
    [11, 266],
  ].map(Object.freeze),
);
GARAGE_POSTS.forEach(([x, z], i) =>
  builtColliders.push({
    id: `garage-post-${i}`,
    kind: 'barrier',
    x,
    z,
    radius: 0.42,
  }),
);
builtColliders.push({
  id: 'ranger-kiosk',
  kind: 'barrier',
  x: -28,
  z: 249,
  radius: 2.1,
});
for (let i = 0; i < 5; i++)
  builtColliders.push({
    id: `garage-back-${i}`,
    kind: 'barrier',
    x: -10 + i * 5,
    z: 269,
    radius: 2.55,
  });
for (const [i, x] of [5.5, 8.5, -8, -5.5].entries())
  builtColliders.push({
    id: `garage-equipment-${i}`,
    kind: 'barrier',
    x,
    z: 266,
    radius: 1.2,
  });
for (const dx of [-3, 3])
  for (const dz of [-2, 2])
    builtColliders.push({
      id: `lookout-post-${dx}-${dz}`,
      kind: 'barrier',
      x: 191 + dx,
      z: -248 + dz,
      radius: 0.2,
    });
for (const dx of [-1.5, 1.5])
  builtColliders.push({
    id: `lookout-bench-${dx}`,
    kind: 'barrier',
    x: 191 + dx,
    z: -246.4,
    radius: 1.5,
  });
for (const route of ROUTES)
  for (let i = 0; i < route.gates.length; i++) {
    const gate = route.gates[i];
    for (const side of [-1, 1])
      builtColliders.push({
        id: `${route.id}-post-${i}-${side}`,
        kind: 'barrier',
        x: gate.x + Math.cos(gate.heading) * (gate.width / 2 + 0.45) * side,
        z: gate.z + Math.sin(gate.heading) * (gate.width / 2 + 0.45) * side,
        radius: 0.17,
      });
  }
/** Tall route signage is shared by the scenery layer and contact solver. */
export const SIGNPOSTS = Object.freeze(
  ROUTES.flatMap((route) =>
    route.gates.flatMap((gate, gateIndex) => {
      if (gateIndex % 4 !== 0) return [];
      const x = gate.x + Math.cos(gate.heading) * 9.6,
        z = gate.z + Math.sin(gate.heading) * 9.6;
      if (trailSample(x, z).distance < 8) return [];
      return [
        Object.freeze({
          id: `${route.id}-sign-${gateIndex}`,
          routeId: route.id,
          gateIndex,
          x,
          z,
          heading: gate.heading,
          radius: 0.18,
        }),
      ];
    }),
  ),
);
for (const post of SIGNPOSTS)
  builtColliders.push({
    id: post.id,
    kind: 'barrier',
    x: post.x,
    z: post.z,
    radius: post.radius,
  });
export const colliders = Object.freeze(builtColliders.map(Object.freeze));
export const parkData = Object.freeze({ height, surface, colliders, bounds });
