import * as T from 'three';

// Irregular unit meshes are shared by instances; silhouettes, not texture grids,
// carry the natural forms. Shapes fit the same conservative unit envelopes.
export function createBasaltSpire(variant = 0) {
  const vertices = [],
    colors = [];
  const sides = 24;
  const levels = [
    [0, 1],
    [0.11, 0.96],
    [0.19, 0.86],
    [0.37, 0.85],
    [0.45, 0.73],
    [0.63, 0.76],
    [0.7, 0.63],
    [0.89, 0.66],
    [1, 0.48],
  ];
  function point(row, side) {
    const [t, profile] = levels[row];
    const a = (side / sides) * Math.PI * 2 + Math.sin(t * 7 + variant) * 0.085;
    const lobe =
      0.81 +
      0.08 * Math.cos(a * 3 + variant) +
      0.06 * Math.sin(a * 5 - variant) +
      0.025 * Math.cos(a * 11 + t * 4);
    const cleft =
      1 - 0.14 * Math.exp(-((Math.sin(a - variant + t * 0.5) / 0.22) ** 2));
    const radius = profile * lobe * cleft;
    return [
      Math.cos(a) * radius + Math.sin(t * 2.6 + variant) * t * t * 0.16,
      t -
        0.5 -
        t ** 4 *
          (0.08 + 0.04 * Math.sin(a * 2 + variant) + 0.025 * Math.cos(a * 5)),
      Math.sin(a) * radius + Math.cos(t * 3.1 - variant) * t * t * 0.11,
    ];
  }
  function tri(a, b, c, shade) {
    vertices.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) colors.push(shade, shade, shade);
  }
  for (let row = 0; row < levels.length - 1; row++)
    for (let side = 0; side < sides; side++) {
      const a = point(row, side),
        b = point(row, side + 1),
        c = point(row + 1, side),
        d = point(row + 1, side + 1);
      const shade =
        0.74 +
        0.1 * Math.sin(side * 2.17 + variant) +
        0.035 * Math.cos(row * 2 + side);
      tri(a, c, b, shade);
      tri(b, c, d, shade);
    }
  for (let side = 0; side < sides; side++) {
    tri([0, -0.5, 0], point(0, side), point(0, side + 1), 0.65);
    tri(
      point(levels.length - 1, side),
      [0, 0.31, 0],
      point(levels.length - 1, side + 1),
      0.84,
    );
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// Closed low volcanic shoulders: broad shelves and broken retreating scarps.
export function createBasaltShelf(variant = 0) {
  const vertices = [],
    colors = [];
  const sides = 24;
  const levels = [
    [0, 1],
    [0.12, 0.96],
    [0.22, 0.86],
    [0.47, 0.84],
    [0.56, 0.72],
    [0.83, 0.69],
    [1, 0.57],
  ];
  function point(row, side) {
    const [t, radius] = levels[row];
    const a = (side / sides) * Math.PI * 2;
    const outline =
      0.87 +
      0.08 * Math.sin(a * 3 + variant) +
      0.045 * Math.cos(a * 7 - variant);
    const cleft = 1 - 0.17 * Math.exp(-((Math.sin(a - variant) / 0.2) ** 2));
    return [
      Math.cos(a) * radius * outline * cleft,
      t - 0.5 - t ** 4 * (0.04 + 0.035 * Math.sin(a * 3 + variant)),
      Math.sin(a) * radius * outline,
    ];
  }
  function triangle(a, b, c, shade) {
    vertices.push(...a, ...b, ...c);
    for (let n = 0; n < 3; n++) colors.push(shade, shade, shade);
  }
  for (let row = 0; row < levels.length - 1; row++)
    for (let side = 0; side < sides; side++) {
      const a = point(row, side),
        b = point(row, side + 1);
      const c = point(row + 1, side),
        d = point(row + 1, side + 1);
      const shade =
        0.69 + 0.1 * Math.sin(side * 1.7 + variant) + (row % 2 ? 0.06 : 0);
      triangle(a, c, b, shade);
      triangle(b, c, d, shade);
    }
  for (let side = 0; side < sides; side++) {
    triangle([0, -0.5, 0], point(0, side), point(0, side + 1), 0.63);
    triangle(
      point(levels.length - 1, side),
      [0, 0.43, 0],
      point(levels.length - 1, side + 1),
      0.84,
    );
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// A broad closed shoulder carries the two near-field reef caps into sediment.
// Its upper rock stays wide at the junction instead of converging to a tip.
export function createReefRoot() {
  const positions = [],
    colors = [];
  const sides = 16;
  const rings = [
    [-0.5, 0.96],
    [-0.31, 0.99],
    [-0.12, 0.91],
    [0.09, 0.94],
    [0.31, 0.89],
    [0.5, 0.88],
  ];
  function point(row, side) {
    const [height, radius] = rings[row];
    const angle =
      ((side % sides) / sides) * Math.PI * 2 + Math.sin(height * 5.1) * 0.02;
    const outline =
      0.97 +
      0.02 * Math.sin(angle * 3 + 0.4) +
      0.01 * Math.cos(angle * 5 - 0.7);
    const split =
      (height + 0.5) ** 4 * 0.005 * (0.5 + 0.5 * Math.sin(angle * 5 + 0.6));
    return [
      Math.cos(angle) * radius * outline,
      height - split,
      Math.sin(angle) * radius * outline,
    ];
  }
  function triangle(a, b, c, shade) {
    positions.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) colors.push(shade, shade, shade);
  }
  for (let row = 0; row < rings.length - 1; row++)
    for (let side = 0; side < sides; side++) {
      const a = point(row, side),
        b = point(row, side + 1),
        c = point(row + 1, side),
        d = point(row + 1, side + 1);
      const shade =
        (side % 4 === 0 ? 0.7 : 0.86 + 0.07 * Math.sin(side * 1.7)) +
        0.025 * Math.cos(row * 2 + side);
      triangle(a, c, b, shade);
      triangle(b, c, d, shade);
    }
  for (let side = 0; side < sides; side++) {
    triangle([0, -0.5, 0], point(0, side), point(0, side + 1), 0.61);
    triangle(
      point(rings.length - 1, side),
      [0, 0.5, 0],
      point(rings.length - 1, side + 1),
      0.89,
    );
  }
  const geometry = new T.BufferGeometry();
  geometry.name = 'Nacre / broad rooted reef shoulder';
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.userData.unitEnvelope = { min: [-1, -0.5, -1], max: [1, 0.5, 1] };
  return geometry;
}

export function createReefRock(variant = 0) {
  const geometry = new T.IcosahedronGeometry(1, 1);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const weathering =
      0.78 +
      0.12 *
        Math.sin(x * 5.2 + y * 3.1 + variant) *
        Math.cos(z * 4.7 - variant) +
      0.07 * Math.cos(y * 7.1 + z * 2.3);
    p.setXYZ(i, x * weathering, y * (0.82 + weathering * 0.15), z * weathering);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// One connected encrusting colony: unequal fleshy lobes surround deep oscula.
// The thick rolled rims and cavity walls are geometry, not painted dark spots.
export function createReefSponge() {
  const positions = [],
    colors = [],
    indices = [];
  const sides = 24;
  const rings = [0.12, 0.25, 0.37, 0.49, 0.61, 0.73, 0.86, 1];
  const mouths = [
    { x: 0.49, z: 0, radius: 0.22, depth: 0.51 },
    {
      x: -0.245,
      z: 0.49 * Math.sin((Math.PI * 2) / 3),
      radius: 0.18,
      depth: 0.43,
    },
    {
      x: 0.61 * Math.cos((17 * Math.PI) / 12),
      z: 0.61 * Math.sin((17 * Math.PI) / 12),
      radius: 0.16,
      depth: 0.37,
    },
  ];
  function top(x, z) {
    const radius = Math.hypot(x, z);
    let flesh = 0,
      recess = 0,
      lip = 0;
    for (const mouth of mouths) {
      const distance = Math.hypot(x - mouth.x, z - mouth.z);
      flesh = Math.max(
        flesh,
        0.24 * Math.exp(-((distance / (mouth.radius * 2.5)) ** 2)),
      );
      recess +=
        mouth.depth * Math.exp(-((distance / (mouth.radius * 0.73)) ** 4));
      const roll = (distance - mouth.radius) / 0.055;
      lip += 0.11 * Math.exp(-roll * roll);
    }
    return {
      height:
        0.18 +
        0.4 * Math.max(0, 1 - radius * radius) ** 0.55 +
        flesh +
        lip -
        recess,
      shade: T.MathUtils.clamp(
        0.77 + lip * 1.55 + flesh * 0.3 - recess * 0.88,
        0.32,
        1,
      ),
    };
  }
  function vertex(x, z, angle, base = false) {
    const outline =
      0.82 +
      0.1 * Math.cos(angle * 3 + 0.3) +
      0.055 * Math.sin(angle * 5 - 0.8);
    const { height, shade } = top(x, z);
    positions.push(x * outline, base ? -0.08 : height, z * outline * 0.92);
    const tone = base ? 0.56 : shade;
    colors.push(tone * 0.94, tone, tone * 0.91);
    return positions.length / 3 - 1;
  }
  vertex(0, 0, 0);
  for (const radius of rings)
    for (let side = 0; side < sides; side++) {
      const angle = (side / sides) * Math.PI * 2;
      vertex(Math.cos(angle) * radius, Math.sin(angle) * radius, angle);
    }
  for (let side = 0; side < sides; side++)
    indices.push(0, 1 + ((side + 1) % sides), 1 + side);
  for (let ring = 0; ring < rings.length - 1; ring++)
    for (let side = 0; side < sides; side++) {
      const a = 1 + ring * sides + side,
        b = 1 + ring * sides + ((side + 1) % sides);
      const c = a + sides,
        d = b + sides;
      indices.push(a, b, c, b, d, c);
    }
  const foot = positions.length / 3;
  for (let side = 0; side < sides; side++) {
    const angle = (side / sides) * Math.PI * 2;
    vertex(Math.cos(angle), Math.sin(angle), angle, true);
  }
  const underside = positions.length / 3;
  positions.push(0, -0.08, 0);
  colors.push(0.47, 0.5, 0.45);
  const rim = 1 + (rings.length - 1) * sides;
  for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides;
    indices.push(
      rim + side,
      rim + next,
      foot + side,
      rim + next,
      foot + next,
      foot + side,
    );
    indices.push(underside, foot + side, foot + next);
  }
  const geometry = new T.BufferGeometry();
  geometry.name = 'Nacre / connected porous reef colony';
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.userData.unitEnvelope = { min: [-1, -0.08, -1], max: [1, 1, 1] };
  return geometry;
}

// Unequal branching veins make a living lattice with actual open cells.
export function createSeaFan(rays = 12, steps = 4) {
  const positions = [],
    normals = [],
    colors = [];
  const branches = Math.min(
    9,
    Math.max(5, Math.round(rays / 3) + (steps >= 4 ? 1 : 0)),
  );
  const rootColor = new T.Color('#6c9684'),
    tipColor = new T.Color('#b3ceaf');
  const point = (angle, radius) =>
    new T.Vector3(
      Math.sin(angle) * radius * 0.94,
      0.08 + Math.cos(angle) * radius,
      Math.sin(angle * 2.4) * radius * 0.1 +
        Math.sin(radius * 3 + angle) * 0.025,
    );
  function branch(start, end, r0, r1) {
    const axis = end.clone().sub(start).normalize();
    const side = axis
      .clone()
      .cross(new T.Vector3(0, 0, 1))
      .normalize();
    const normal = axis.clone().cross(side).normalize();
    const ring = (p, r) =>
      Array.from({ length: 3 }, (_, i) =>
        p
          .clone()
          .addScaledVector(side, Math.cos((i * Math.PI * 2) / 3) * r)
          .addScaledVector(normal, Math.sin((i * Math.PI * 2) / 3) * r * 0.85),
      );
    const vertices = [...ring(start, r0), ...ring(end, r1)];
    const faces = [
      [0, 2, 1],
      [3, 4, 5],
      [0, 1, 4],
      [0, 4, 3],
      [1, 2, 5],
      [1, 5, 4],
      [2, 0, 3],
      [2, 3, 5],
    ];
    for (const [faceIndex, face] of faces.entries())
      for (const index of face) {
        const p = vertices[index];
        positions.push(p.x, Math.max(0, p.y), p.z);
        const n =
          faceIndex < 2
            ? axis.clone().multiplyScalar(faceIndex ? 1 : -1)
            : p
                .clone()
                .sub(index < 3 ? start : end)
                .normalize();
        normals.push(n.x, n.y, n.z);
        rootColor
          .clone()
          .lerp(tipColor, T.MathUtils.clamp(p.y * 0.9, 0, 1))
          .toArray(colors, colors.length);
      }
  }
  const fork = new T.Vector3(0, 0.2, 0),
    mids = [],
    shoulders = [];
  branch(new T.Vector3(0, 0.015, 0), fork, 0.065, 0.055);
  for (let i = 0; i < branches; i++) {
    const angle =
      -1.13 + (2.26 * i) / (branches - 1) + Math.sin(i * 2.3) * 0.035;
    const radius = 0.9 + Math.sin(i * 2.1) * 0.065 + Math.cos(i * 0.77) * 0.025;
    const middle = point(
      angle + Math.sin(i) * 0.06,
      0.43 + Math.sin(i * 1.7) * 0.035,
    );
    const tip = point(angle, radius);
    mids.push(middle);
    shoulders.push(middle.clone().lerp(tip, 0.57));
    branch(fork, middle, 0.06, 0.05);
    branch(middle, tip, 0.05, 0.023);
    if (i < branches - 1 && i % 2 === 0) {
      const split = point(angle + (i % 2 ? -0.16 : 0.17), radius * 0.88);
      branch(middle.clone().lerp(tip, 0.46), split, 0.033, 0.014);
    }
  }
  for (let i = 0; i < branches - 1; i++) {
    branch(mids[i], mids[i + 1], 0.039, 0.033);
    if (i % 2 === 1) branch(shoulders[i], shoulders[i + 1], 0.028, 0.023);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  return geometry;
}

// Three terminal polyps replace the uninterrupted luminous paper perimeter.
export function createFanEdge() {
  const positions = [];
  for (const i of [0, 4, 8]) {
    const angle = -1.13 + (2.26 * i) / 8 + Math.sin(i * 2.3) * 0.035;
    const radius = 0.9 + Math.sin(i * 2.1) * 0.065 + Math.cos(i * 0.77) * 0.025;
    const center = new T.Vector3(
      Math.sin(angle) * radius * 0.94,
      0.08 + Math.cos(angle) * radius,
      Math.sin(angle * 2.4) * radius * 0.1 +
        Math.sin(radius * 3 + angle) * 0.025,
    );
    const polyp = new T.OctahedronGeometry(0.019, 0);
    const p = polyp.attributes.position;
    for (let j = 0; j < p.count; j++)
      positions.push(
        p.getX(j) + center.x,
        p.getY(j) + center.y,
        p.getZ(j) + center.z,
      );
    polyp.dispose();
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// Unequal attached fleshy leaflets replace the solid repeated ribbon silhouette.
export function createReefRibbon() {
  const positions = [];
  const center = (t) =>
    new T.Vector3(
      Math.sin(t * 2.7) * 0.29,
      t,
      0.018 + Math.sin(t * 4.1) * 0.15 + t * t * 0.13,
    );
  function branch(start, end, r0, r1) {
    const axis = end.clone().sub(start).normalize();
    const side = axis
      .clone()
      .cross(new T.Vector3(0, 0, 1))
      .normalize();
    const normal = axis.clone().cross(side).normalize();
    const vertices = [];
    for (const [p, r] of [
      [start, r0],
      [end, r1],
    ])
      for (let i = 0; i < 3; i++)
        vertices.push(
          p
            .clone()
            .addScaledVector(side, Math.cos((i * Math.PI * 2) / 3) * r)
            .addScaledVector(
              normal,
              Math.sin((i * Math.PI * 2) / 3) * r * 0.35,
            ),
        );
    for (const face of [
      [0, 2, 1],
      [3, 4, 5],
      [0, 1, 4],
      [0, 4, 3],
      [1, 2, 5],
      [1, 5, 4],
      [2, 0, 3],
      [2, 3, 5],
    ])
      for (const i of face)
        positions.push(
          vertices[i].x,
          Math.max(0, Math.min(1, vertices[i].y)),
          vertices[i].z,
        );
  }
  const levels = [0.015, 0.25, 0.5, 0.75, 0.99];
  for (let i = 0; i < levels.length - 1; i++)
    branch(
      center(levels[i]),
      center(levels[i + 1]),
      0.055 - i * 0.009,
      0.046 - i * 0.009,
    );
  for (const [t, x, y, z] of [
    [0.25, 0.025, 0.45, 0.095],
    [0.5, 0.485, 0.69, 0.17],
    [0.75, 0.075, 0.89, 0.09],
    [0.75, 0.395, 0.955, 0.13],
  ]) {
    const start = center(t),
      end = new T.Vector3(x, y, z);
    const axis = end.clone().sub(start).normalize();
    const side = axis
      .clone()
      .cross(new T.Vector3(0, 0, 1))
      .normalize();
    const middle = start.clone().lerp(end, 0.58);
    const width = start.distanceTo(end) * 0.32;
    const vertices = [
      start,
      end,
      middle.clone().addScaledVector(side, width),
      middle.clone().addScaledVector(new T.Vector3(0, 0, 1), 0.014),
      middle.clone().addScaledVector(side, -width),
      middle.clone().addScaledVector(new T.Vector3(0, 0, 1), -0.014),
    ];
    for (const face of [
      [0, 2, 3],
      [0, 3, 4],
      [0, 4, 5],
      [0, 5, 2],
      [1, 3, 2],
      [1, 4, 3],
      [1, 5, 4],
      [1, 2, 5],
    ])
      for (const i of face) positions.push(...vertices[i].toArray());
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
