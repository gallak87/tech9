import * as THREE from 'three';
import { VEHICLES } from '../driving/VehicleMotion.js';
import { createRider } from './RiderModel.js';
import {
  mesh,
  box,
  cylinder,
  ball,
  beam,
  setBeam,
  tube,
  ring,
  loft,
  panel,
  radialTire,
  bolt,
  grainTexture,
  graphic,
  batch,
} from './VehicleGeometry.js';

// Original, editable metre-scale assets. Forward -Z, axles X, origin ground.
const SPEC = {
  jeep: {
    wheelBase: 2.8,
    track: 1.65,
    radius: 0.43,
    width: 0.32,
    eye: [-0.46, 1.74, 0.64],
  },
  atv: {
    wheelBase: 1.55,
    track: 1.1,
    radius: 0.31,
    width: 0.29,
    eye: [0, 1.72, 0.3],
  },
  bike: {
    wheelBase: 1.48,
    track: 0,
    radius: 0.35,
    width: 0.14,
    eye: [0, 1.81, 0.36],
  },
};
const Y = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;
function material(color, roughness = 0.65, metalness = 0, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    ...extra,
  });
}
function palette(kind) {
  const grain = grainTexture(19),
    weave = grainTexture(7, true),
    rubberGrain = grainTexture(29);
  return {
    paint: new THREE.MeshPhysicalMaterial({
      color: kind === 'jeep' ? 0xb57927 : kind === 'atv' ? 0x086d65 : 0xe8e1ce,
      roughness: kind === 'jeep' ? 0.36 : 0.42,
      metalness: kind === 'jeep' ? 0.16 : 0.015,
      clearcoat: kind === 'jeep' ? 0.45 : 0.28,
      clearcoatRoughness: 0.24,
      roughnessMap: grain,
      bumpMap: grain,
      bumpScale: 0.0007,
    }),
    accent: new THREE.MeshPhysicalMaterial({
      color: kind === 'bike' ? 0xaf291b : kind === 'atv' ? 0xcd9560 : 0xdbd5bd,
      roughness: 0.34,
      metalness: 0.12,
      clearcoat: 0.4,
    }),
    rubber: material(0x15191b, 0.94, 0, {
      roughnessMap: rubberGrain,
      bumpMap: rubberGrain,
      bumpScale: 0.002,
    }),
    tread: material(0x242723, 0.9, 0, { roughnessMap: rubberGrain }),
    tireLetter: material(0x656762, 0.89),
    black: material(0x192027, 0.61, 0.34),
    plastic: material(0x1a2425, 0.74, 0, {
      roughnessMap: grain,
      bumpMap: grain,
      bumpScale: 0.0008,
    }),
    seat: material(0x272a27, 0.89, 0, {
      roughnessMap: weave,
      bumpMap: weave,
      bumpScale: 0.0012,
    }),
    glove: material(0x1f282a, 0.85, 0, { roughnessMap: weave }),
    boot: material(0x383e3c, 0.82, 0, { roughnessMap: grain }),
    silver: material(0xa6b1b4, 0.28, 0.88),
    steel: material(0x687478, 0.48, 0.78),
    machined: material(0xd4d9d5, 0.21, 0.92),
    dark: material(0x39413f, 0.73, 0.43),
    gold: material(0xb49048, 0.31, 0.76),
    spring: material(kind === 'bike' ? 0xb8231b : 0xc89136, 0.38, 0.42),
    lamp: new THREE.MeshPhysicalMaterial({
      color: 0xe5f0eb,
      emissive: 0xe3ecda,
      emissiveIntensity: 0.12,
      metalness: 0.27,
      roughness: 0.14,
      clearcoat: 1,
    }),
    lens: new THREE.MeshPhysicalMaterial({
      color: 0xb6c6bf,
      roughness: 0.15,
      metalness: 0.32,
      clearcoat: 0.9,
      clearcoatRoughness: 0.1,
    }),
    amber: material(0xbf6a12, 0.25, 0.2, {
      emissive: 0x60300a,
      emissiveIntensity: 0.15,
    }),
    red: material(0x9c241b, 0.22, 0.1, {
      emissive: 0x9d1406,
      emissiveIntensity: 0.08,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xc1d8d5,
      transparent: true,
      opacity: 0.055,
      roughness: 0.07,
      metalness: 0.15,
      clearcoat: 1,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    jacket: material(
      kind === 'jeep' ? 0x776c51 : kind === 'atv' ? 0xb16a37 : 0xd4d4bf,
      0.92,
      0,
      { roughnessMap: weave, bumpMap: weave, bumpScale: 0.001 },
    ),
    clothDark: material(kind === 'bike' ? 0x34403e : 0x323b39, 0.96, 0, {
      roughnessMap: weave,
      bumpMap: weave,
      bumpScale: 0.0012,
    }),
    trousers: material(0x303c3d, 0.96, 0, {
      roughnessMap: weave,
      bumpMap: weave,
      bumpScale: 0.001,
    }),
    skin: material(0xb88964, 0.87),
    helmet: new THREE.MeshPhysicalMaterial({
      color: kind === 'bike' ? 0xdce0d0 : 0x43514c,
      roughness: 0.31,
      clearcoat: 0.64,
      clearcoatRoughness: 0.2,
    }),
    visor: new THREE.MeshPhysicalMaterial({
      color: 0x172b32,
      roughness: 0.12,
      metalness: 0.56,
      clearcoat: 1,
    }),
    seam: material(0x777d6b, 0.92),
    dust: material(0x746446, 0.98),
  };
}

function wheel(parent, spec, p, x, z, front, bike) {
  const hub = new THREE.Group();
  hub.name = `${front ? 'front' : 'rear'}-${x < 0 ? 'left' : x > 0 ? 'right' : 'center'}-suspension`;
  hub.position.set(x, spec.radius, z);
  parent.add(hub);
  const steering = new THREE.Group();
  steering.name = 'steering';
  hub.add(steering);
  const spin = new THREE.Group();
  spin.name = 'wheel-rotation';
  steering.add(spin);
  const r = spec.radius,
    width = spec.width;
  radialTire(spin, p.rubber, r, width, bike);
  const rows = bike ? [-0.34, 0, 0.34] : [-0.34, 0, 0.34];
  const count = bike ? 34 : 30;
  for (let i = 0; i < count; i++)
    for (let j = 0; j < rows.length; j++) {
      const a = ((i + (j === 1 ? 0.44 : 0)) / count) * Math.PI * 2;
      const rad = r * (bike && j !== 1 ? 0.94 : 0.978);
      box(
        spin,
        p.tread,
        [width * (j === 1 ? 0.31 : 0.3), r * 0.054, r * (bike ? 0.087 : 0.092)],
        [rows[j] * width, Math.cos(a) * rad, Math.sin(a) * rad],
        r * 0.008,
        [a, 0, j === 1 ? 0.2 : (j - 1) * 0.25],
      );
    }
  const rim = r * (bike ? 0.655 : 0.58);
  for (const side of [-1, 1]) {
    const face = side * width * 0.43;
    ring(
      spin,
      p.rubber,
      r * 0.76,
      r * 0.007,
      [side * width * 0.53, 0, 0],
      [0, Math.PI / 2, 0],
      6,
      48,
    );
    ring(
      spin,
      p.tireLetter,
      r * 0.84,
      r * 0.0025,
      [side * width * 0.528, 0, 0],
      [0, Math.PI / 2, 0],
      5,
      48,
    );
    ring(
      spin,
      p.black,
      rim,
      r * (bike ? 0.035 : 0.038),
      [face, 0, 0],
      [0, Math.PI / 2, 0],
    );
    ring(
      spin,
      p.machined,
      rim * 0.94,
      r * 0.018,
      [face + side * 0.006, 0, 0],
      [0, Math.PI / 2, 0],
    );
    cylinder(
      spin,
      p.black,
      r * (bike ? 0.14 : 0.24),
      width * 0.83,
      [0, 0, 0],
      [0, 0, Math.PI / 2],
    );
    cylinder(spin, p.steel, r * 0.14, 0.04, [face, 0, 0], [0, 0, Math.PI / 2]);
    cylinder(
      spin,
      p.machined,
      r * 0.065,
      0.046,
      [face + side * 0.004, 0, 0],
      [0, 0, Math.PI / 2],
      8,
    );
    const spokeCount = bike ? 24 : 6;
    for (let i = 0; i < spokeCount; i++) {
      const a = (i / spokeCount) * Math.PI * 2;
      if (bike) {
        beam(
          spin,
          p.silver,
          [side * width * 0.22, Math.sin(a) * r * 0.14, Math.cos(a) * r * 0.14],
          [
            face,
            Math.sin(a + side * 0.26) * rim * 0.96,
            Math.cos(a + side * 0.26) * rim * 0.96,
          ],
          0.0038,
          6,
        );
      } else {
        const spoke = box(
          spin,
          p.black,
          [0.06, rim * 0.77, r * 0.09],
          [face, Math.cos(a) * rim * 0.51, Math.sin(a) * rim * 0.51],
          0.008,
          [a, 0, side * 0.08],
        );
        spoke.name = 'forged-spoke';
        box(
          spin,
          p.steel,
          [0.012, rim * 0.67, r * 0.025],
          [
            face + side * 0.034,
            Math.cos(a) * rim * 0.51,
            Math.sin(a) * rim * 0.51,
          ],
          0.002,
          [a, 0, side * 0.08],
        );
        bolt(
          spin,
          p.machined,
          [
            face + side * 0.039,
            Math.cos(a) * r * 0.185,
            Math.sin(a) * r * 0.185,
          ],
          0.012,
        );
      }
    }
    const studCount = bike ? 0 : 18;
    for (let i = 0; i < studCount; i++) {
      const a = (i * Math.PI * 2) / studCount;
      bolt(
        spin,
        p.machined,
        [face + side * 0.012, Math.sin(a) * rim, Math.cos(a) * rim],
        0.006,
      );
    }
    // Cast sidewall ribs catch grazing light without oversized lettering.
    for (let i = 0; i < 38; i++) {
      const a = (i * Math.PI * 2) / 38;
      box(
        spin,
        p.rubber,
        [0.003, r * 0.048, r * 0.009],
        [side * width * 0.531, Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78],
        0,
        [a, 0, 0],
      );
    }
  }
  const discX = -width * 0.36;
  cylinder(
    spin,
    p.steel,
    r * 0.37,
    0.009,
    [discX, 0, 0],
    [0, 0, Math.PI / 2],
    36,
  );
  ring(
    spin,
    p.machined,
    r * 0.345,
    r * 0.055,
    [discX - 0.006, 0, 0],
    [0, Math.PI / 2, 0],
    6,
    36,
  );
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    cylinder(
      spin,
      p.black,
      0.006,
      0.0015,
      [discX - 0.007, Math.cos(a) * r * 0.31, Math.sin(a) * r * 0.31],
      [0, 0, Math.PI / 2],
      6,
    );
  }
  box(
    steering,
    p.dark,
    [0.05, r * 0.24, r * 0.23],
    [discX - 0.025, r * 0.08, -r * 0.31],
    0.013,
  );
  batch(spin);
  batch(steering);
  return { hub, steering, spin, x, z, front };
}

function arch(parent, p, side, centerZ, kind) {
  const jeep = kind === 'jeep';
  const front = centerZ < 0;
  // Thin closed flares follow the body shoulder, with short folded ends. The
  // earlier deep U-shaped curtain hid lamps and read as unsupported pipework.
  const edgeX = side * (jeep ? 1.015 : 0.716);
  const innerX = side * (jeep ? 0.729 : 0.36);
  const points = jeep
    ? front
      ? [
          [-0.55, 0.975],
          [-0.42, 1.055],
          [-0.12, 1.092],
          [0.26, 1.085],
          [0.46, 0.965],
        ]
      : [
          [-0.52, 0.79],
          [-0.39, 1.034],
          [-0.17, 1.096],
          [0.24, 1.096],
          [0.49, 0.88],
        ]
    : [
        [-0.36, 0.727],
        [-0.26, 0.829],
        [-0.08, 0.859],
        [0.22, 0.838],
        [0.37, 0.721],
      ];
  const verts = [],
    indices = [],
    uv = [];
  for (let i = 0; i < points.length; i++) {
    const [dz, y] = points[i],
      z = centerZ + dz;
    // Inner/high and outer/low folded shell; all four edges are closed.
    verts.push(
      innerX,
      y + 0.012,
      z,
      edgeX,
      y - 0.017,
      z,
      edgeX,
      y - 0.039,
      z,
      innerX,
      y - 0.011,
      z,
    );
    uv.push(0, i / 4, 1, i / 4, 1, i / 4, 0, i / 4);
  }
  const face = (a, b, c, d) => {
    if (side > 0) indices.push(a, b, c, a, c, d);
    else indices.push(a, c, b, a, d, c);
  };
  for (let i = 0; i < points.length - 1; i++) {
    const a = i * 4,
      b = a + 4;
    face(a, b, b + 1, a + 1);
    face(a + 1, b + 1, b + 2, a + 2);
    face(a + 2, b + 2, b + 3, a + 3);
    face(a + 3, b + 3, b, a);
  }
  face(0, 1, 2, 3);
  const last = (points.length - 1) * 4;
  face(last + 3, last + 2, last + 1, last);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  mesh(parent, geometry, p.paint);
  tube(
    parent,
    p.plastic,
    points.map(([dz, y]) => [edgeX, y - 0.028, centerZ + dz]),
    jeep ? 0.012 : 0.009,
    30,
  );
  if (jeep && front) {
    // Apron behind the hood edge closes the engine bay while retaining the
    // wheel opening and attaching the flare to a real inner fender.
    const apron = new THREE.Group();
    apron.position.x = side * 0.715;
    apron.rotation.y = (side * Math.PI) / 2;
    parent.add(apron);
    panel(
      apron,
      p.black,
      [
        [-1.81, 0.91],
        [-0.56, 0.91],
        [-0.53, 1.19],
        [-1.73, 1.13],
      ].map(([z, y]) => [-side * z, y]),
      0.012,
      [0, 0, 0],
      undefined,
      0.008,
    );
  }
}

// A closed compound side shell. The deliberately bulged center and varying
// lateral edge stations produce designed plastic curvature, rather than an
// extruded flat polygon. Profile coordinates are [z, y, lateralWidth].
function sideShell(parent, mat, side, profile, center, thickness = 0.014) {
  const vertices = [],
    uv = [],
    indices = [],
    n = profile.length;
  for (const offset of [0, -thickness]) {
    for (const [z, y, x] of profile) {
      vertices.push(side * (x + offset), y, z);
      uv.push((z + 0.6) / 1.5, (y - 0.7) / 0.55);
    }
    vertices.push(side * (center[2] + offset), center[1], center[0]);
    uv.push((center[0] + 0.6) / 1.5, (center[1] - 0.7) / 0.55);
  }
  const triangle = (a, b, c) =>
    indices.push(...(side > 0 ? [a, c, b] : [a, b, c]));
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    triangle(n, i, next);
    triangle(2 * n + 1, n + 1 + next, n + 1 + i);
    triangle(i, n + 1 + i, n + 1 + next);
    triangle(i, n + 1 + next, next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return mesh(parent, geometry, mat);
}

function lamp(parent, p, position, radius = 0.12) {
  cylinder(
    parent,
    p.black,
    radius * 1.15,
    0.052,
    position,
    [Math.PI / 2, 0, 0],
    40,
  );
  cylinder(
    parent,
    p.silver,
    radius,
    0.06,
    [position[0], position[1], position[2] - 0.012],
    [Math.PI / 2, 0, 0],
    40,
  );
  ball(
    parent,
    p.lens,
    radius * 0.85,
    [position[0], position[1], position[2] - 0.028],
    [1, 1, 0.29],
  );
  ball(
    parent,
    p.lamp,
    radius * 0.29,
    [position[0], position[1], position[2] - 0.05],
    [1, 1, 0.26],
  );
  ring(
    parent,
    p.lamp,
    radius * 0.83,
    radius * 0.045,
    [position[0], position[1], position[2] - 0.052],
    [0, 0, 0],
    6,
    40,
  );
  for (let i = -3; i <= 3; i++) {
    const x = i * radius * 0.18,
      h = Math.sqrt(Math.max(0, radius * radius * 0.64 - x * x));
    beam(
      parent,
      p.silver,
      [position[0] + x, position[1] - h, position[2] - 0.051],
      [position[0] + x, position[1] + h, position[2] - 0.051],
      0.001,
      6,
    );
  }
}

function jeepBody(body, p) {
  // Tapered ladder chassis, formed tub, proper wheel openings and rising cowl.
  for (const side of [-1, 1]) {
    box(body, p.black, [0.1, 0.16, 3.5], [side * 0.48, 0.49, 0], 0.015);
    tube(
      body,
      p.black,
      [
        [side * 0.47, 0.54, -1.72],
        [side * 0.47, 0.64, -1.3],
        [side * 0.47, 0.51, -0.3],
        [side * 0.47, 0.51, 0.6],
        [side * 0.47, 0.62, 1.4],
      ],
      0.055,
      30,
    );
  }
  box(body, p.plastic, [1.42, 0.12, 2.07], [0, 0.78, 0.59], 0.025);
  loft(
    body,
    p.paint,
    [
      [-1.83, 0.63, 1.055, 1.19],
      [-1.59, 0.68, 1.06, 1.25],
      [-0.73, 0.72, 1.065, 1.32],
      [-0.51, 0.73, 1.07, 1.325],
    ],
    { bevel: 0.22 },
  );
  loft(
    body,
    p.paint,
    [
      [-0.54, 0.735, 0.82, 1.325],
      [-0.36, 0.755, 0.83, 1.32],
    ],
    { bevel: 0.13 },
  );
  // Narrow panel reveal around the bonnet and raised center pressing.
  loft(
    body,
    p.paint,
    [
      [-1.63, 0.3, 1.248, 1.264],
      [-1.35, 0.35, 1.275, 1.287],
      [-0.71, 0.41, 1.32, 1.338],
    ],
    { bevel: 0.32 },
  );
  tube(
    body,
    p.black,
    [
      [-0.675, 1.255, -1.6],
      [-0.71, 1.308, -0.78],
      [-0.728, 1.32, -0.56],
    ],
    0.0035,
    10,
  );
  tube(
    body,
    p.black,
    [
      [0.675, 1.255, -1.6],
      [0.71, 1.308, -0.78],
      [0.728, 1.32, -0.56],
    ],
    0.0035,
    10,
  );
  // Grille fascia and recessed slots with fine backing ribs.
  panel(
    body,
    p.paint,
    [
      [-0.73, -0.3],
      [0.73, -0.3],
      [0.77, 0.14],
      [0.64, 0.29],
      [-0.64, 0.29],
      [-0.77, 0.14],
    ],
    0.065,
    [0, 0.91, -1.8],
    [0, 0, 0],
    0.019,
  );
  for (let i = -3; i <= 3; i++) {
    box(body, p.black, [0.07, 0.34, 0.014], [i * 0.106, 0.937, -1.854], 0.025);
    for (let y = 0.8; y < 1.1; y += 0.036)
      box(body, p.dark, [0.062, 0.009, 0.003], [i * 0.106, y, -1.866]);
  }
  lamp(body, p, [-0.58, 1.015, -1.842], 0.126);
  lamp(body, p, [0.58, 1.015, -1.842], 0.126);
  for (const side of [-1, 1]) {
    arch(body, p, side, -1.4, 'jeep');
    arch(body, p, side, 1.4, 'jeep');
    // Continuous lowered door and raised rear quarter. Side polygon local X is Z.
    const sideGroup = new THREE.Group();
    sideGroup.position.x = side * 0.763;
    sideGroup.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    body.add(sideGroup);
    const outline = [
      [-0.5, 0.77],
      [0.8, 0.77],
      [0.83, 1.03],
      [0.37, 1.055],
      [0.25, 1.01],
      [-0.4, 1.01],
      [-0.5, 1.19],
    ];
    panel(
      sideGroup,
      p.paint,
      outline.map(([z, y]) => [-side * z, y]),
      0.08,
      [0, 0, 0],
      [0, 0, 0],
      0.016,
    );
    // Side panel orientation is symmetric through authored side coordinates.
    box(body, p.paint, [0.13, 0.38, 0.76], [side * 0.735, 1.08, 1.17], 0.025);
    box(
      body,
      p.black,
      [0.037, 0.065, 0.59],
      [side * 0.811, 1.273, 1.15],
      0.017,
    );
    tube(
      body,
      p.black,
      [
        [side * 0.79, 0.71, -0.62],
        [side * 0.94, 0.66, -0.5],
        [side * 0.94, 0.66, 0.77],
        [side * 0.79, 0.71, 0.86],
      ],
      0.036,
      20,
    );
    box(body, p.plastic, [0.2, 0.036, 0.67], [side * 0.87, 0.69, 0.13], 0.012);
    for (let z = -0.12; z < 0.4; z += 0.07)
      box(body, p.dark, [0.19, 0.007, 0.018], [side * 0.87, 0.713, z]);
    box(body, p.black, [0.038, 0.045, 0.19], [side * 0.826, 1.13, 0.73], 0.01);
    for (const z of [-0.46, -0.34]) {
      box(body, p.paint, [0.018, 0.09, 0.05], [side * 0.827, 0.935, z], 0.004);
      bolt(body, p.steel, [side * 0.839, 0.957, z], 0.01);
    }
    box(
      body,
      p.black,
      [0.035, 0.065, 0.052],
      [side * 0.713, 1.253, -1.47],
      0.01,
    );
    beam(
      body,
      p.steel,
      [side * 0.74, 1.23, -1.475],
      [side * 0.74, 1.29, -1.475],
      0.012,
    );
    // Bent structural cage has rounded bends, side gussets and padded upper bar.
    tube(
      body,
      p.black,
      [
        [side * 0.7, 0.89, 0.83],
        [side * 0.7, 2.04, 0.83],
        [side * 0.65, 2.17, 0.83],
        [side * 0.42, 2.185, 0.83],
      ],
      0.04,
      24,
    );
    tube(
      body,
      p.black,
      [
        [side * 0.7, 2.11, 0.82],
        [side * 0.76, 1.95, 1.11],
        [side * 0.76, 1.18, 1.5],
      ],
      0.034,
      16,
    );
    const roof = tube(
      body,
      p.black,
      [
        [side * 0.68, 2.15, 0.82],
        [side * 0.69, 2.155, 0.0],
        [side * 0.68, 2.105, -0.34],
      ],
      0.03,
      20,
    );
    roof.userData.dynamic = true;
    roof.userData.hideInDriverView = true;
    beam(
      body,
      p.paint,
      [side * 0.715, 1.32, -0.52],
      [side * 0.715, 2.1, -0.31],
      0.025,
    );
    beam(
      body,
      p.plastic,
      [side * 0.668, 1.355, -0.504],
      [side * 0.668, 2.06, -0.318],
      0.009,
    );
    tube(
      body,
      p.black,
      [
        [side * 0.72, 1.38, -0.48],
        [side * 0.91, 1.43, -0.5],
        [side * 0.94, 1.5, -0.48],
      ],
      0.016,
      12,
    );
    box(body, p.black, [0.16, 0.18, 0.038], [side * 0.952, 1.52, -0.48], 0.02, [
      0,
      side * 0.24,
      0,
    ]);
    box(
      body,
      p.machined,
      [0.133, 0.147, 0.004],
      [side * 0.952, 1.52, -0.458],
      0.012,
      [0, side * 0.24, 0],
    );
    box(body, p.black, [0.18, 0.16, 0.051], [side * 0.63, 1.06, 1.635], 0.018);
    box(body, p.red, [0.148, 0.11, 0.028], [side * 0.63, 1.077, 1.665], 0.012);
    box(body, p.lamp, [0.12, 0.024, 0.03], [side * 0.63, 1.017, 1.666], 0.003);
    box(body, p.amber, [0.15, 0.057, 0.028], [side * 0.82, 1.08, -1.62], 0.01, [
      0,
      side * 0.4,
      0,
    ]);
    graphic(body, 'RIDGE', {
      position: [side * 0.741, 1.174, -0.91],
      rotation: [0, (side * Math.PI) / 2, 0],
      width: 0.41,
      height: 0.12,
      color: '#302f27',
      small: '4 × 4 / FIELD SERIES',
    });
  }
  beam(body, p.black, [-0.65, 2.18, 0.83], [0.65, 2.18, 0.83], 0.044);
  beam(body, p.paint, [-0.735, 2.1, -0.31], [0.735, 2.1, -0.31], 0.025);
  beam(body, p.paint, [-0.724, 1.33, -0.52], [0.724, 1.33, -0.52], 0.017);
  const glass = box(
    body,
    p.glass,
    [1.346, 0.774, 0.012],
    [0, 1.717, -0.417],
    0,
    [0.265, 0, 0],
  );
  glass.castShadow = false;
  for (const x of [-0.32, 0.32]) {
    beam(
      body,
      p.black,
      [x - 0.06, 1.35, -0.539],
      [x + 0.09, 1.59, -0.461],
      0.007,
    );
    beam(
      body,
      p.black,
      [x - 0.055, 1.54, -0.481],
      [x + 0.22, 1.64, -0.448],
      0.009,
    );
  }
  // Armored bumpers with cut corners, winch, fairlead and recovery shackles.
  panel(
    body,
    p.black,
    [
      [-0.98, -0.058],
      [-0.8, -0.12],
      [0.8, -0.12],
      [0.98, -0.058],
      [0.95, 0.075],
      [-0.95, 0.075],
    ],
    0.22,
    [0, 0.66, -1.965],
    [0, 0, 0],
    0.028,
  );
  box(body, p.black, [1.87, 0.15, 0.18], [0, 0.65, 1.765], 0.026);
  box(body, p.dark, [0.55, 0.12, 0.22], [0, 0.8, -1.986], 0.028);
  cylinder(body, p.black, 0.078, 0.29, [0, 0.817, -1.98], [0, 0, Math.PI / 2]);
  for (let x = -0.12; x <= 0.12; x += 0.02)
    ring(
      body,
      p.steel,
      0.067,
      0.007,
      [x, 0.817, -1.98],
      [0, Math.PI / 2, 0],
      5,
      20,
    );
  box(body, p.silver, [0.25, 0.08, 0.028], [0, 0.75, -2.09], 0.024);
  box(body, p.black, [0.177, 0.024, 0.01], [0, 0.75, -2.111], 0.011);
  for (const side of [-1, 1]) {
    ring(
      body,
      p.accent,
      0.052,
      0.014,
      [side * 0.59, 0.618, -2.102],
      [0, 0, 0],
      8,
      24,
    );
    bolt(body, p.silver, [side * 0.59, 0.664, -2.111], 0.018, [
      Math.PI / 2,
      0,
      0,
    ]);
  }
  // Interior: sewn bucket seats, embossed cushions, dashboard recess and vents.
  box(body, p.plastic, [1.415, 0.23, 0.2], [0, 1.215, -0.43], 0.026);
  for (const x of [-0.45, 0.43]) {
    box(body, p.seat, [0.58, 0.13, 0.61], [x, 0.936, 0.26], 0.055);
    box(
      body,
      p.seat,
      [0.5, 0.64, 0.135],
      [x, 1.24, 0.555],
      0.04,
      [-0.105, 0, 0],
    );
    for (const side of [-1, 1]) {
      loft(
        body,
        p.seat,
        [
          [0.04, 0.055, 0.94, 1.04],
          [0.3, 0.055, 0.94, 1.05],
          [0.57, 0.04, 0.94, 1.01],
        ],
        { x: x + side * 0.265, bevel: 0.35 },
      );
      box(
        body,
        p.seat,
        [0.076, 0.6, 0.12],
        [x + side * 0.238, 1.242, 0.514],
        0.031,
        [-0.1, 0, side * 0.03],
      );
      tube(
        body,
        p.seam,
        [
          [x + side * 0.185, 0.99, 0.03],
          [x + side * 0.185, 1.01, 0.46],
          [x + side * 0.19, 1.53, 0.49],
        ],
        0.0026,
        18,
      );
    }
    box(body, p.seat, [0.285, 0.2, 0.145], [x, 1.66, 0.603], 0.03);
    for (let y = 1.07; y < 1.49; y += 0.065)
      beam(
        body,
        p.clothDark,
        [x - 0.185, y, 0.459],
        [x + 0.185, y, 0.459],
        0.003,
      );
  }
  box(body, p.seat, [1.27, 0.14, 0.43], [0, 1.11, 1.25], 0.045);
  box(body, p.seat, [1.27, 0.39, 0.11], [0, 1.35, 1.48], 0.045);
  box(body, p.plastic, [0.19, 0.2, 0.56], [0, 0.99, 0.075], 0.02);
  beam(body, p.black, [0.03, 1.07, 0.05], [0.03, 1.26, -0.005], 0.015);
  ball(body, p.black, 0.033, [0.03, 1.27, -0.006], [1, 0.8, 1]);
  for (const x of [-0.64, 0.14, 0.59]) {
    cylinder(
      body,
      p.black,
      0.047,
      0.01,
      [x, 1.24, -0.318],
      [Math.PI / 2, 0, 0],
    );
    for (let y = -0.022; y <= 0.023; y += 0.014)
      box(body, p.steel, [0.074, 0.004, 0.006], [x, 1.24 + y, -0.309]);
  }
  box(body, p.plastic, [0.21, 0.188, 0.115], [-0.47, 1.368, -0.373], 0.039);
  for (const [x, r, cy] of [
    [-0.47, 0.081, 1.37],
    [-0.27, 0.053, 1.28],
    [-0.1, 0.038, 1.28],
  ]) {
    cylinder(
      body,
      p.silver,
      r,
      0.015,
      [x, cy, -0.316],
      [Math.PI / 2, 0, 0],
      32,
    );
    cylinder(
      body,
      p.visor,
      r * 0.88,
      0.02,
      [x, cy, -0.303],
      [Math.PI / 2, 0, 0],
      32,
    );
    for (let i = 0; i < 12; i++) {
      const a = -0.6 + (i * Math.PI * 1.5) / 11;
      beam(
        body,
        p.accent,
        [x + Math.cos(a) * r * 0.63, cy + Math.sin(a) * r * 0.63, -0.29],
        [x + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78, -0.29],
        0.0018,
        6,
      );
    }
    beam(
      body,
      p.red,
      [x, cy, -0.287],
      [x - r * 0.43, cy + r * 0.5, -0.287],
      0.0022,
      6,
    );
  }
  box(body, p.paint, [1.4, 0.37, 0.08], [0, 1.1, 1.61], 0.02);
  const spare = new THREE.Group();
  body.add(spare);
  spare.position.set(0.03, 1.22, 1.8);
  spare.rotation.y = Math.PI / 2;
  wheel(spare, SPEC.jeep, p, 0, 0, false, false).hub.position.y = 0;
  box(body, p.dark, [0.26, 0.44, 0.18], [0.59, 1.12, 1.79], 0.03);
  tube(
    body,
    p.dark,
    [
      [0.51, 1.35, 1.79],
      [0.52, 1.405, 1.79],
      [0.66, 1.405, 1.79],
      [0.67, 1.35, 1.79],
    ],
    0.022,
    12,
  );
  for (const y of [1.02, 1.26])
    box(body, p.black, [0.29, 0.024, 0.203], [0.59, y, 1.79], 0.003);
  graphic(body, 'NCP 01', {
    position: [-0.53, 0.815, 1.668],
    rotation: [0, 0, 0],
    width: 0.31,
    height: 0.087,
    background: '#dcdac7',
    color: '#293331',
    border: true,
  });
}

function atvBody(body, p) {
  // A compact utility quad: sculpted central shell, raised wheel shoulders,
  // slim saddle and genuine open space beneath the fairings.
  for (const side of [-1, 1]) {
    tube(
      body,
      p.black,
      [
        [side * 0.24, 0.34, 0.78],
        [side * 0.26, 0.36, 0.1],
        [side * 0.22, 0.48, -0.61],
        [side * 0.17, 0.8, -0.46],
      ],
      0.031,
      22,
    );
    tube(
      body,
      p.black,
      [
        [side * 0.25, 0.36, 0.68],
        [side * 0.26, 0.72, 0.4],
        [side * 0.21, 0.77, -0.45],
      ],
      0.026,
      20,
    );
    arch(body, p, side, -0.775, 'atv');
    arch(body, p, side, 0.775, 'atv');
    loft(
      body,
      p.paint,
      [
        [-1.12, 0.13, 0.62, 0.74],
        [-0.88, 0.2, 0.67, 0.88],
        [-0.52, 0.18, 0.68, 0.875],
        [-0.28, 0.12, 0.54, 0.72],
      ],
      { x: side * 0.4, bevel: 0.2 },
    );
    loft(
      body,
      p.paint,
      [
        [0.31, 0.11, 0.56, 0.79],
        [0.53, 0.2, 0.66, 0.9],
        [0.92, 0.23, 0.7, 0.9],
        [1.08, 0.16, 0.7, 0.82],
      ],
      { x: side * 0.36, bevel: 0.24 },
    );
    const cheek = new THREE.Group();
    cheek.position.x = side * 0.292;
    cheek.rotation.y = (side * Math.PI) / 2;
    body.add(cheek);
    panel(
      cheek,
      p.plastic,
      [
        [-0.35, 0.45],
        [0.3, 0.42],
        [0.49, 0.7],
        [0.23, 0.84],
        [-0.25, 0.75],
      ].map(([z, y]) => [-side * z, y]),
      0.018,
      [0, 0, 0],
      undefined,
      0.014,
    );
    for (let z = -0.16; z < 0.1; z += 0.065)
      box(
        body,
        p.black,
        [0.019, 0.15, 0.025],
        [side * 0.31, 0.655, z],
        0.004,
        [0.3, 0, 0],
      );
    // Broad pierced foot platforms, attached to the lower frame.
    box(body, p.plastic, [0.3, 0.045, 0.58], [side * 0.45, 0.442, 0.14], 0.02);
    for (let z = -0.1; z < 0.37; z += 0.065)
      box(body, p.steel, [0.255, 0.013, 0.017], [side * 0.45, 0.472, z], 0.003);
    tube(
      body,
      p.black,
      [
        [side * 0.57, 0.41, -0.13],
        [side * 0.61, 0.47, -0.13],
        [side * 0.61, 0.47, 0.41],
        [side * 0.56, 0.4, 0.43],
      ],
      0.023,
      14,
    );
    // Headlights are inset angled clusters with separate reflectors and brows.
    const headlamp = new THREE.Group();
    headlamp.position.set(side * 0.3, 0.759, -1.167);
    headlamp.rotation.y = -side * 0.17;
    body.add(headlamp);
    panel(
      headlamp,
      p.black,
      [
        [-0.155, -0.053],
        [0.13, -0.053],
        [0.15, 0.045],
        [-0.115, 0.068],
      ],
      0.044,
      [0, 0, 0],
      undefined,
      0.016,
    );
    for (const x of [-0.075, 0.065]) {
      cylinder(
        headlamp,
        p.silver,
        0.039,
        0.007,
        [x, 0, -0.026],
        [Math.PI / 2, 0, 0],
      );
      cylinder(
        headlamp,
        p.lamp,
        0.027,
        0.009,
        [x, 0, -0.031],
        [Math.PI / 2, 0, 0],
      );
    }
    beam(
      headlamp,
      p.lamp,
      [-0.105, 0.041, -0.03],
      [0.12, 0.029, -0.03],
      0.006,
      8,
    );
    box(body, p.red, [0.16, 0.043, 0.026], [side * 0.41, 0.766, 1.094], 0.013);
    box(
      body,
      p.black,
      [0.195, 0.021, 0.031],
      [side * 0.41, 0.797, 1.088],
      0.004,
    );
    // Long stainless canister, recessed end cap and frame mount.
    cylinder(
      body,
      p.steel,
      0.055,
      0.45,
      [side * 0.26, 0.59, 0.65],
      [Math.PI / 2, 0, 0],
      24,
    );
    ring(body, p.black, 0.056, 0.01, [side * 0.26, 0.59, 0.74]);
    cylinder(
      body,
      p.black,
      0.027,
      0.015,
      [side * 0.26, 0.59, 0.883],
      [Math.PI / 2, 0, 0],
    );
    graphic(body, 'SCOUT', {
      position: [side * 0.605, 0.782, -0.7],
      rotation: [0, (side * Math.PI) / 2, 0],
      width: 0.34,
      height: 0.115,
      color: '#e7ce9d',
      small: '4WD / 700',
    });
  }
  loft(
    body,
    p.paint,
    [
      [-1.13, 0.25, 0.57, 0.77],
      [-0.87, 0.32, 0.65, 0.925],
      [-0.46, 0.24, 0.65, 0.985],
      [-0.23, 0.18, 0.63, 0.92],
      [0.07, 0.145, 0.61, 0.83],
    ],
    { bevel: 0.32 },
  );
  loft(
    body,
    p.plastic,
    [
      [-1.11, 0.13, 0.57, 0.731],
      [-0.87, 0.16, 0.93, 0.942],
      [-0.44, 0.115, 0.984, 1.006],
      [-0.28, 0.1, 0.96, 0.986],
    ],
    { bevel: 0.25 },
  );
  // Nose grille has depth and transverse cooling fins.
  box(body, p.black, [0.38, 0.145, 0.027], [0, 0.636, -1.142], 0.016);
  for (let y = 0.589; y < 0.7; y += 0.022)
    box(body, p.dark, [0.31, 0.006, 0.013], [0, y, -1.159]);
  loft(
    body,
    p.seat,
    [
      [-0.025, 0.13, 0.81, 0.956],
      [0.16, 0.185, 0.82, 0.969],
      [0.55, 0.193, 0.85, 1.005],
      [0.72, 0.165, 0.87, 0.999],
    ],
    { bevel: 0.4 },
  );
  for (const side of [-1, 1])
    tube(
      body,
      p.seam,
      [
        [side * 0.135, 0.951, 0],
        [side * 0.19, 0.97, 0.25],
        [side * 0.17, 0.999, 0.65],
      ],
      0.0027,
      18,
    );
  // Racks sit above the body on short brackets, with bent perimeter loops.
  for (const rear of [false, true]) {
    const z = rear ? 0.87 : -0.8,
      h = rear ? 0.944 : 0.956;
    tube(
      body,
      p.black,
      [
        [-0.52, h, z - 0.19],
        [-0.56, h, z - 0.14],
        [-0.56, h, z + 0.18],
        [-0.51, h, z + 0.21],
        [0.51, h, z + 0.21],
        [0.56, h, z + 0.18],
        [0.56, h, z - 0.14],
        [0.52, h, z - 0.19],
      ],
      0.015,
      48,
      true,
    );
    for (const x of [-0.35, -0.17, 0.17, 0.35])
      beam(body, p.black, [x, h, z - 0.18], [x, h, z + 0.2], 0.01);
    for (const x of [-0.45, 0.45])
      for (const dz of [-0.11, 0.12]) {
        beam(body, p.black, [x, h - 0.04, z + dz], [x, h, z + dz], 0.018);
        bolt(body, p.steel, [x, h + 0.008, z + dz], 0.012, undefined);
      }
  }
  tube(
    body,
    p.black,
    [
      [-0.51, 0.59, -1.16],
      [-0.4, 0.5, -1.2],
      [0.4, 0.5, -1.2],
      [0.51, 0.59, -1.16],
    ],
    0.027,
    24,
  );
  tube(
    body,
    p.black,
    [
      [-0.45, 0.53, -1.18],
      [-0.39, 0.73, -1.15],
      [0.39, 0.73, -1.15],
      [0.45, 0.53, -1.18],
    ],
    0.025,
    24,
  );
  cylinder(body, p.dark, 0.14, 0.38, [0, 0.49, 0.14], [0, 0, Math.PI / 2], 24);
  cylinder(
    body,
    p.steel,
    0.105,
    0.395,
    [0, 0.5, 0.14],
    [0, 0, Math.PI / 2],
    24,
  );
  for (let y = 0.55; y <= 0.71; y += 0.032)
    box(body, p.dark, [0.28, 0.013, 0.27], [0, y, -0.04], 0.008);
  cylinder(body, p.black, 0.037, 0.025, [0, 1.013, -0.34], undefined, 12);
  graphic(body, '02', {
    position: [0, 0.863, 1.082],
    width: 0.18,
    height: 0.07,
    background: '#d9d8bd',
    color: '#1d3632',
  });
}

function bikeBody(body, p) {
  // Open cradle chassis around a compact single-cylinder engine; long, narrow
  // saddle and radiused fenders establish a contemporary enduro silhouette.
  for (const side of [-1, 1]) {
    const x = side * 0.12;
    tube(
      body,
      p.accent,
      [
        [x, 0.91, 0.43],
        [x, 0.98, -0.42],
        [x, 0.88, -0.44],
        [x, 0.41, -0.15],
        [x, 0.4, 0.24],
        [x, 0.88, 0.44],
      ],
      0.021,
      35,
    );
    beam(body, p.accent, [x, 0.46, 0.18], [x, 0.94, -0.27], 0.025);
    beam(body, p.black, [x, 0.72, 0.13], [x, 1.075, 0.77], 0.019);
    beam(body, p.black, [x, 1.05, 0.1], [x, 1.075, 0.8], 0.019);
    // Formed radiator shrouds, tapered forward and cut away around the knee.
    sideShell(
      body,
      p.accent,
      side,
      [
        [-0.425, 1.102, 0.115],
        [-0.27, 0.803, 0.17],
        [0.015, 0.839, 0.139],
        [0.156, 1.059, 0.141],
        [-0.055, 1.157, 0.145],
      ],
      [-0.17, 1.035, 0.207],
    );
    sideShell(
      body,
      p.paint,
      side,
      [
        [0.13, 1.097, 0.129],
        [0.22, 0.867, 0.137],
        [0.56, 0.945, 0.119],
        [0.735, 1.055, 0.105],
        [0.58, 1.107, 0.138],
      ],
      [0.4, 1.037, 0.171],
      0.011,
    );
    tube(
      body,
      p.black,
      [
        [side * 0.146, 1.158, -0.045],
        [side * 0.149, 1.106, 0.11],
      ],
      0.003,
      8,
    );
    const radiator = box(
      body,
      p.dark,
      [0.052, 0.235, 0.15],
      [side * 0.15, 0.773, -0.25],
      0.012,
      [-0.16, 0, 0],
    );
    radiator.name = 'radiator';
    for (let y = 0.68; y < 0.87; y += 0.024)
      box(body, p.steel, [0.067, 0.005, 0.15], [side * 0.15, y, -0.25], 0.002);
    box(body, p.black, [0.15, 0.035, 0.085], [side * 0.225, 0.48, 0.18], 0.008);
    for (const z of [0.151, 0.18, 0.209])
      beam(
        body,
        p.silver,
        [side * 0.18, 0.503, z],
        [side * 0.28, 0.503, z],
        0.006,
      );
    graphic(body, '03', {
      position: [side * 0.174, 1.02, 0.42],
      rotation: [0, (side * Math.PI) / 2, 0],
      width: 0.23,
      height: 0.14,
      color: '#273630',
      small: 'SUMMIT',
    });
    graphic(body, 'S / 450', {
      position: [side * 0.209, 1.035, -0.18],
      rotation: [0, (side * Math.PI) / 2, 0],
      width: 0.25,
      height: 0.07,
      color: '#e5dcc6',
    });
  }
  loft(
    body,
    p.paint,
    [
      [-0.455, 0.07, 0.985, 1.1],
      [-0.34, 0.15, 0.86, 1.17],
      [-0.09, 0.177, 0.88, 1.19],
      [0.14, 0.115, 0.93, 1.12],
    ],
    { bevel: 0.34 },
  );
  loft(
    body,
    p.seat,
    [
      [-0.14, 0.092, 1.08, 1.162],
      [0.12, 0.12, 1.074, 1.152],
      [0.47, 0.14, 1.074, 1.153],
      [0.77, 0.112, 1.082, 1.178],
    ],
    { bevel: 0.38 },
  );
  for (const side of [-1, 1])
    tube(
      body,
      p.seam,
      [
        [side * 0.094, 1.154, -0.1],
        [side * 0.13, 1.148, 0.3],
        [side * 0.106, 1.171, 0.75],
      ],
      0.002,
      18,
    );
  for (let z = 0.23; z <= 0.69; z += 0.065)
    beam(body, p.plastic, [-0.119, 1.16, z], [0.119, 1.16, z], 0.004, 8);
  loft(
    body,
    p.accent,
    [
      [0.51, 0.11, 1.073, 1.103],
      [0.79, 0.15, 1.1, 1.132],
      [1.0, 0.125, 1.092, 1.121],
      [1.105, 0.065, 1.027, 1.05],
    ],
    { bevel: 0.35 },
  );
  box(body, p.red, [0.148, 0.032, 0.027], [0, 1.048, 1.089], 0.008);
  panel(
    body,
    p.black,
    [
      [-0.08, 0.04],
      [0.08, 0.04],
      [0.052, -0.12],
      [-0.052, -0.12],
    ],
    0.012,
    [0, 0.985, 1.07],
    [-0.28, 0, 0],
    0.006,
  );
  const frontAssembly = new THREE.Group();
  frontAssembly.name = 'bike-front-fairing';
  body.add(frontAssembly);
  // Raised front fender curves away at its tip instead of ending as a plank.
  loft(
    frontAssembly,
    p.paint,
    [
      [-1.18, 0.064, 0.855, 0.888],
      [-1.1, 0.109, 0.91, 0.945],
      [-0.91, 0.122, 0.935, 0.967],
      [-0.65, 0.1, 0.919, 0.95],
      [-0.45, 0.065, 0.855, 0.895],
    ],
    { bevel: 0.42 },
  );
  // Compact enduro mask: chamfered shoulders flow around a deep lamp aperture.
  loft(
    frontAssembly,
    p.paint,
    [
      [-0.721, 0.09, 1.033, 1.194],
      [-0.704, 0.13, 1.0, 1.265],
      [-0.645, 0.142, 1.008, 1.25],
      [-0.598, 0.105, 1.047, 1.222],
    ],
    { bevel: 0.28 },
  );
  panel(
    frontAssembly,
    p.black,
    [
      [-0.071, -0.075],
      [0.071, -0.075],
      [0.1, 0.06],
      [0.056, 0.086],
      [-0.056, 0.086],
      [-0.1, 0.06],
    ],
    0.012,
    [0, 1.134, -0.729],
    [0.16, 0, 0],
    0.009,
  );
  panel(
    frontAssembly,
    p.silver,
    [
      [-0.057, -0.061],
      [0.057, -0.061],
      [0.08, 0.048],
      [-0.08, 0.048],
    ],
    0.005,
    [0, 1.139, -0.744],
    [0.16, 0, 0],
    0.006,
  );
  cylinder(
    frontAssembly,
    p.black,
    0.04,
    0.014,
    [0, 1.153, -0.757],
    [Math.PI / 2 + 0.16, 0, 0],
    32,
  );
  cylinder(
    frontAssembly,
    p.lamp,
    0.032,
    0.021,
    [0, 1.153, -0.765],
    [Math.PI / 2 + 0.16, 0, 0],
    32,
  );
  beam(
    frontAssembly,
    p.lamp,
    [-0.058, 1.106, -0.751],
    [0.058, 1.106, -0.751],
    0.006,
    8,
  );
  for (const side of [-1, 1]) {
    box(
      frontAssembly,
      p.black,
      [0.021, 0.081, 0.004],
      [side * 0.098, 1.071, -0.722],
      0.004,
      [0.16, side * 0.18, side * 0.18],
    );
    bolt(frontAssembly, p.steel, [side * 0.12, 1.225, -0.699], 0.006, [
      Math.PI / 2,
      0,
      0,
    ]);
  }
  const forkPivot = new THREE.Vector3(0, 1.18, -0.5);
  frontAssembly.position.copy(forkPivot);
  for (const part of frontAssembly.children) part.position.sub(forkPivot);
  batch(frontAssembly);
  cylinder(body, p.black, 0.044, 0.023, [0, 1.206, -0.233], undefined, 16);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    bolt(
      body,
      p.steel,
      [Math.sin(a) * 0.035, 1.22, -0.233 + Math.cos(a) * 0.035],
      0.004,
      undefined,
    );
  }
  // Cast clutch and magneto covers, upper cylinder fins, oil line and skid plate.
  cylinder(
    body,
    p.steel,
    0.158,
    0.282,
    [0, 0.557, 0.135],
    [0, 0, Math.PI / 2],
    32,
  );
  cylinder(
    body,
    p.dark,
    0.116,
    0.317,
    [0, 0.553, 0.15],
    [0, 0, Math.PI / 2],
    32,
  );
  for (const side of [-1, 1]) {
    cylinder(
      body,
      p.silver,
      0.105,
      0.012,
      [side * 0.165, 0.553, 0.15],
      [0, 0, Math.PI / 2],
      32,
    );
    for (let i = 0; i < 7; i++) {
      const a = (i * Math.PI * 2) / 7;
      bolt(
        body,
        p.black,
        [side * 0.175, 0.553 + Math.cos(a) * 0.13, 0.135 + Math.sin(a) * 0.13],
        0.009,
      );
    }
  }
  cylinder(
    body,
    p.dark,
    0.093,
    0.192,
    [0, 0.723, -0.065],
    [-0.19, 0, 0],
    20,
    0.089,
  );
  for (let i = 0; i < 6; i++) {
    const y = 0.642 + i * 0.031;
    cylinder(
      body,
      p.steel,
      0.111,
      0.008,
      [0, y, -0.065 - (y - 0.723) * 0.19],
      [-0.19, 0, 0],
      24,
    );
  }
  cylinder(body, p.dark, 0.106, 0.051, [0, 0.846, -0.09], [-0.19, 0, 0], 12);
  box(
    body,
    p.steel,
    [0.179, 0.041, 0.151],
    [0, 0.878, -0.096],
    0.015,
    [-0.19, 0, 0],
  );
  for (const side of [-1, 1]) {
    bolt(body, p.black, [side * 0.071, 0.9, -0.047], 0.01, undefined);
    bolt(body, p.black, [side * 0.071, 0.876, -0.14], 0.01, undefined);
  }
  box(body, p.dark, [0.31, 0.033, 0.38], [0, 0.382, 0.043], 0.02, [0.1, 0, 0]);
  tube(
    body,
    p.steel,
    [
      [0.08, 0.786, -0.2],
      [0.2, 0.715, -0.31],
      [0.252, 0.602, -0.18],
      [0.228, 0.65, 0.19],
      [0.205, 0.816, 0.47],
    ],
    0.026,
    32,
  );
  const exhaust = new THREE.Group();
  exhaust.position.set(0.215, 0.892, 0.6);
  exhaust.rotation.x = Math.PI / 2 - 0.18;
  body.add(exhaust);
  cylinder(exhaust, p.steel, 0.075, 0.43, [0, 0, 0], undefined, 10, 0.067);
  for (const y of [-0.16, 0.14])
    ring(exhaust, p.black, 0.074, 0.009, [0, y, 0], [Math.PI / 2, 0, 0], 6, 24);
  cylinder(exhaust, p.black, 0.04, 0.027, [0, 0.226, 0], undefined, 16);
  cylinder(exhaust, p.dark, 0.025, 0.029, [0, 0.229, 0], undefined, 16);
  tube(
    body,
    p.black,
    [
      [-0.13, 0.84, -0.1],
      [-0.235, 0.72, -0.13],
      [-0.19, 0.63, 0.08],
    ],
    0.013,
    18,
  );
}

function steeringControl(parent, kind, p) {
  const group = new THREE.Group();
  group.name = 'driver-controls';
  parent.add(group);
  let instrument;
  if (kind === 'jeep') {
    group.position.set(-0.46, 1.35, -0.125);
    group.rotation.x = -0.48;
    ring(group, p.rubber, 0.194, 0.023);
    ring(group, p.dark, 0.183, 0.005, [0, 0, 0.013]);
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      const arm = new THREE.Group();
      arm.rotation.z = a;
      group.add(arm);
      panel(
        arm,
        p.black,
        [
          [-0.025, 0.025],
          [0.025, 0.025],
          [0.036, 0.176],
          [-0.036, 0.176],
        ],
        0.019,
        [0, 0, -0.009],
        undefined,
        0.009,
      );
      box(arm, p.steel, [0.025, 0.087, 0.006], [0, 0.108, 0.006], 0.004);
      for (const y of [0.074, 0.097])
        box(arm, p.black, [0.015, 0.003, 0.007], [0, y, 0.011]);
      batch(arm);
    }
    cylinder(
      group,
      p.plastic,
      0.066,
      0.046,
      [0, 0, 0.008],
      [Math.PI / 2, 0, 0],
      32,
    );
    graphic(group, 'N', {
      position: [0, 0, 0.034],
      width: 0.041,
      height: 0.039,
      color: '#c1b994',
    });
    beam(parent, p.black, [-0.46, 1.27, -0.41], [-0.46, 1.35, -0.125], 0.032);
    beam(parent, p.black, [-0.55, 1.28, -0.32], [-0.69, 1.32, -0.18], 0.011);
    box(parent, p.plastic, [0.07, 0.026, 0.035], [-0.69, 1.32, -0.18], 0.009);
  } else {
    const bike = kind === 'bike',
      w = bike ? 0.4 : 0.46;
    group.position.set(0, bike ? 1.3 : 1.21, -0.5);
    tube(
      group,
      p.steel,
      [
        [-w, 0.031, 0.088],
        [-0.28, 0.024, 0.057],
        [-0.21, -0.028, 0.015],
        [0.21, -0.028, 0.015],
        [0.28, 0.024, 0.057],
        [w, 0.031, 0.088],
      ],
      0.017,
      32,
    );
    for (const side of [-1, 1]) {
      const grip = side * (w - 0.044);
      cylinder(
        group,
        p.rubber,
        0.025,
        0.132,
        [grip, 0.032, 0.087],
        [0, 0, Math.PI / 2],
        24,
      );
      for (let i = -5; i <= 5; i++)
        ring(
          group,
          p.plastic,
          0.0255,
          0.0014,
          [grip + i * 0.01, 0.032, 0.087],
          [0, Math.PI / 2, 0],
          5,
          24,
        );
      cylinder(
        group,
        p.black,
        0.029,
        0.017,
        [side * (w + 0.025), 0.032, 0.087],
        [0, 0, Math.PI / 2],
        24,
      );
      ring(
        group,
        p.black,
        0.035,
        0.003,
        [side * (w - 0.118), 0.032, 0.087],
        [0, Math.PI / 2, 0],
        6,
        24,
      );
      box(
        group,
        p.plastic,
        [0.055, 0.07, 0.068],
        [side * (w - 0.155), 0.024, 0.087],
        0.012,
      );
      box(
        group,
        side < 0 ? p.red : p.amber,
        [0.024, 0.014, 0.017],
        [side * (w - 0.156), 0.065, 0.101],
        0.004,
      );
      cylinder(
        group,
        p.black,
        0.014,
        0.025,
        [side * (w - 0.126), 0.036, 0.023],
        undefined,
        16,
      );
      tube(
        group,
        p.silver,
        [
          [side * (w - 0.125), 0.035, 0.027],
          [side * (w - 0.067), 0.041, -0.003],
          [side * (w + 0.012), 0.044, -0.009],
        ],
        0.007,
        14,
      );
      ball(group, p.silver, 0.01, [side * (w + 0.012), 0.044, -0.009]);
      tube(
        group,
        p.black,
        [
          [side * (w - 0.147), 0.024, 0.066],
          [side * 0.22, -0.03, -0.09],
          [side * 0.105, -0.22, -0.018],
        ],
        0.004,
        20,
      );
      // Handguards are thin shaped shells, on a separate metal spine.
      tube(
        group,
        p.steel,
        [
          [side * (w + 0.035), 0.032, 0.086],
          [side * (w + 0.046), 0.035, -0.049],
          [side * (w - 0.12), 0.035, -0.12],
          [side * (w - 0.19), 0.02, -0.065],
        ],
        0.008,
        22,
      );
      loft(
        group,
        bike ? p.accent : p.paint,
        [
          [-0.125, 0.065, 0.013, 0.072],
          [-0.103, 0.13, -0.016, 0.075],
          [-0.075, 0.12, -0.02, 0.055],
        ],
        { x: side * (w - 0.02), bevel: 0.36 },
      );
      cylinder(
        group,
        p.silver,
        0.025,
        0.086,
        [side * 0.088, -0.062, 0.004],
        undefined,
        16,
      );
      box(
        group,
        p.black,
        [0.056, 0.035, 0.072],
        [side * 0.088, -0.022, 0.006],
        0.009,
      );
      for (const z of [-0.017, 0.028])
        bolt(group, p.silver, [side * 0.088, 0.001, z], 0.006, undefined);
    }
    box(
      group,
      p.plastic,
      [0.166, 0.109, 0.047],
      [0, 0.045, -0.037],
      0.023,
      [-0.47, 0, 0],
    );
    box(
      group,
      p.black,
      [0.13, 0.086, 0.011],
      [0, 0.055, -0.01],
      0.016,
      [-0.47, 0, 0],
    );
    beam(
      parent,
      p.black,
      [0, 0.9, -0.38],
      [0, bike ? 1.268 : 1.18, -0.496],
      0.027,
    );
    if (bike) {
      cylinder(group, p.silver, 0.11, 0.025, [0, -0.125, -0.018], undefined, 6);
      for (const side of [-1, 1]) {
        cylinder(
          group,
          p.gold,
          0.029,
          0.02,
          [side * 0.11, -0.102, -0.022],
          undefined,
          24,
        );
        bolt(group, p.silver, [side * 0.11, -0.087, -0.022], 0.016, undefined);
      }
    }
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = kind === 'jeep' ? 512 : 288;
    const context = canvas.getContext('2d');
    if (context) {
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const screenMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        toneMapped: false,
      });
      const screen =
        kind === 'jeep'
          ? mesh(
              parent,
              new THREE.CircleGeometry(0.068, 48),
              screenMaterial,
              [-0.47, 1.37, -0.286],
            )
          : mesh(
              group,
              new THREE.PlaneGeometry(0.116, 0.071),
              screenMaterial,
              [0, 0.057, -0.002],
              [-0.47, 0, 0],
            );
      screen.castShadow = false;
      screen.userData.dynamic = true;
      let lastSpeed = -1;
      instrument = {
        update(speed) {
          const kmh = Math.round(Math.abs(speed || 0) * 3.6);
          if (kmh === lastSpeed) return;
          lastSpeed = kmh;
          if (kind === 'jeep') {
            context.fillStyle = '#142021';
            context.fillRect(0, 0, 512, 512);
            context.save();
            context.translate(256, 256);
            for (let i = 0; i <= 24; i++) {
              const angle = Math.PI * 0.75 + (i * Math.PI * 1.5) / 24;
              context.strokeStyle = i > 20 ? '#b0684a' : '#d3d6be';
              context.lineWidth = i % 2 ? 4 : 7;
              context.beginPath();
              context.moveTo(Math.cos(angle) * 198, Math.sin(angle) * 198);
              context.lineTo(
                Math.cos(angle) * (i % 2 ? 183 : 167),
                Math.sin(angle) * (i % 2 ? 183 : 167),
              );
              context.stroke();
              if (i % 4 === 0) {
                context.font = '32px sans-serif';
                context.fillStyle = '#d3d6be';
                context.textAlign = 'center';
                context.textBaseline = 'middle';
                context.fillText(
                  String(i * 5),
                  Math.cos(angle) * 137,
                  Math.sin(angle) * 137,
                );
              }
            }
            const angle =
              Math.PI * 0.75 + (Math.min(kmh, 120) / 120) * Math.PI * 1.5;
            context.strokeStyle = '#d96743';
            context.lineWidth = 8;
            context.beginPath();
            context.moveTo(-Math.cos(angle) * 25, -Math.sin(angle) * 25);
            context.lineTo(Math.cos(angle) * 155, Math.sin(angle) * 155);
            context.stroke();
            context.fillStyle = '#354843';
            context.beginPath();
            context.arc(0, 0, 19, 0, Math.PI * 2);
            context.fill();
            context.font = '25px sans-serif';
            context.fillStyle = '#c7cbb6';
            context.textAlign = 'center';
            context.fillText('KM/H', 0, 87);
            context.restore();
          } else {
            context.fillStyle = '#132d2a';
            context.fillRect(0, 0, 512, 288);
            context.fillStyle = '#91b18e';
            context.fillRect(12, 13, 488, 3);
            context.font = 'bold 24px sans-serif';
            context.textAlign = 'left';
            context.fillText(
              kind === 'bike' ? 'SUMMIT / ENDURO' : 'SCOUT / 4WD',
              24,
              48,
            );
            context.fillStyle = '#e0e5c8';
            context.font = 'bold 139px monospace';
            context.textAlign = 'center';
            context.fillText(String(kmh).padStart(2, '0'), 252, 191);
            context.font = '24px sans-serif';
            context.fillStyle = '#8eae92';
            context.fillText('KM/H', 252, 229);
            context.fillStyle = '#c39552';
            context.fillRect(
              26,
              250,
              Math.max(10, Math.min(450, (kmh / 115) * 450)),
              10,
            );
          }
          texture.needsUpdate = true;
        },
      };
      instrument.update(0);
    }
  }
  group.userData.instrument = instrument;
  batch(group);
  return group;
}

function suspension(parent, wheelData, kind, p) {
  const { x, z, front } = wheelData;
  const assembly = new THREE.Group();
  assembly.name = `${kind}-${front ? 'front' : 'rear'}-running-gear`;
  parent.add(assembly);
  if (kind === 'bike') {
    if (front) {
      const stanchions = [-1, 1].map((side) => ({
        side,
        upper: beam(assembly, p.gold, [0, 0, 0], [0, 1, 0], 0.029),
        lower: beam(assembly, p.silver, [0, 0, 0], [0, 1, 0], 0.022),
        guard: beam(assembly, p.plastic, [0, 0, 0], [0, 1, 0], 0.037),
      }));
      const crown = beam(
        assembly,
        p.steel,
        [-0.13, 1.04, -0.547],
        [0.13, 1.04, -0.547],
        0.033,
      );
      const axle = beam(
        assembly,
        p.steel,
        [-0.16, 0.35, z],
        [0.16, 0.35, z],
        0.019,
      );
      return (low) => {
        const yaw = wheelData.steering.rotation.y,
          c = Math.cos(yaw),
          s = Math.sin(yaw);
        for (const { side, upper, lower, guard } of stanchions) {
          const off = side * 0.113;
          const start = [off * c, 1.187, -0.499 - off * s];
          const end = [low[0] + off * c, low[1], low[2] - off * s];
          const middle = start.map((v, i) => v * 0.43 + end[i] * 0.57);
          setBeam(upper, start, middle);
          setBeam(lower, middle, end);
          setBeam(
            guard,
            end.map((v, i) => v * 0.72 + start[i] * 0.28),
            end,
          );
        }
        setBeam(
          axle,
          [low[0] - 0.15 * c, low[1], low[2] + 0.15 * s],
          [low[0] + 0.15 * c, low[1], low[2] - 0.15 * s],
        );
        setBeam(
          crown,
          [-0.13 * c, 1.04, -0.547 + 0.13 * s],
          [0.13 * c, 1.04, -0.547 - 0.13 * s],
        );
      };
    }
    const arms = [-1, 1].map((side) => ({
      side,
      arm: box(assembly, p.steel, [0.054, 1, 0.055], [0, 0, 0], 0.008),
    }));
    const rearShock = beam(
      assembly,
      p.silver,
      [0, 0.9, 0.1],
      [0, 0.43, 0.41],
      0.021,
    );
    const spring = springMesh(assembly, p.spring, 0.043, 0.26, 8, 0.008);
    const chainUpper = beam(assembly, p.dark, [0, 0, 0], [0, 1, 0], 0.009),
      chainLower = beam(assembly, p.dark, [0, 0, 0], [0, 1, 0], 0.009);
    const sprocket = cylinder(
      assembly,
      p.steel,
      0.107,
      0.011,
      [-0.102, 0.35, z],
      [0, 0, Math.PI / 2],
      32,
    );
    return (low) => {
      for (const { side, arm } of arms)
        setBeam(
          arm,
          [side * 0.145, 0.53, 0.09],
          [low[0] + side * 0.133, low[1], low[2]],
        );
      const end = [0, low[1] * 0.5 + 0.27, low[2] * 0.5 + 0.05];
      setBeam(rearShock, [0, 0.91, 0.12], end);
      setBeam(spring, [0, 0.83, 0.17], end);
      setBeam(
        chainUpper,
        [-0.169, 0.54, 0.16],
        [low[0] - 0.111, low[1] + 0.103, low[2]],
      );
      setBeam(
        chainLower,
        [-0.169, 0.43, 0.16],
        [low[0] - 0.111, low[1] - 0.103, low[2]],
      );
      sprocket.position.set(low[0] - 0.109, low[1], low[2]);
    };
  }
  const jeep = kind === 'jeep';
  const upper = [x * 0.56, jeep ? 0.99 : 0.81, z + (front ? 0.08 : -0.06)];
  const shock = beam(assembly, p.silver, upper, [x, 0.4, z], 0.022);
  const spring = springMesh(
    assembly,
    p.spring,
    jeep ? 0.048 : 0.037,
    1,
    jeep ? 9 : 8,
    0.007,
  );
  const lowerA = beam(
    assembly,
    p.black,
    [0, 0, 0],
    [0, 1, 0],
    jeep ? 0.028 : 0.024,
  );
  const lowerB = beam(
    assembly,
    p.black,
    [0, 0, 0],
    [0, 1, 0],
    jeep ? 0.028 : 0.024,
  );
  const upperA = beam(assembly, p.steel, [0, 0, 0], [0, 1, 0], 0.018);
  const drive = beam(assembly, p.steel, [0, 0, 0], [0, 1, 0], 0.02);
  const boot = cylinder(
    assembly,
    p.rubber,
    0.05,
    0.12,
    [x * 0.9, 0.4, z],
    [0, 0, Math.PI / 2],
    18,
  );
  return (low) => {
    const lower = [low[0] * 0.86, low[1] + 0.04, low[2]];
    setBeam(shock, upper, lower);
    const end = upper.map((v, i) => v * 0.3 + lower[i] * 0.7);
    setBeam(spring, upper, end);
    setBeam(lowerA, [x * 0.31, jeep ? 0.42 : 0.35, z - 0.17], lower);
    setBeam(lowerB, [x * 0.31, jeep ? 0.42 : 0.35, z + 0.17], lower);
    setBeam(
      upperA,
      [x * 0.41, jeep ? 0.7 : 0.58, z + 0.12],
      [lower[0], lower[1] + 0.08, lower[2]],
    );
    setBeam(drive, [0, jeep ? 0.43 : 0.35, z], low);
    boot.position.set(low[0] * 0.84, low[1], low[2]);
  };
}

function springMesh(parent, mat, radius, length, coils, wire) {
  const points = [];
  for (let i = 0; i <= coils * 12; i++) {
    const t = i / (coils * 12),
      a = t * Math.PI * 2 * coils;
    points.push([
      Math.cos(a) * radius,
      (t - 0.5) * length,
      Math.sin(a) * radius,
    ]);
  }
  // Unit length by convention, so setBeam controls the attachment endpoints.
  const result = tube(parent, mat, points, wire, coils * 12);
  result.geometry.scale(1, 1 / length, 1);
  return result;
}
/** Owns all its geometry/materials; scene attachment is the caller's responsibility. */
export function createVehicleModel(kind = 'jeep') {
  if (!SPEC[kind]) throw new TypeError(`Unknown vehicle model: ${kind}`);
  const config = VEHICLES[kind];
  const spec = {
    ...SPEC[kind],
    wheelBase: config.dimensions.wheelBase,
    track: config.dimensions.track,
    radius: config.wheelRadius,
  };
  const p = palette(kind);
  const group = new THREE.Group();
  group.name = `${kind}-vehicle`;
  group.rotation.order = 'YXZ';
  const body = new THREE.Group();
  body.name = 'body';
  group.add(body);
  if (kind === 'jeep') jeepBody(body, p);
  else if (kind === 'atv') atvBody(body, p);
  else bikeBody(body, p);
  if (kind !== 'bike') {
    const axleY = kind === 'jeep' ? 0.43 : 0.35;
    for (const z of [-spec.wheelBase / 2, spec.wheelBase / 2]) {
      ball(
        body,
        p.dark,
        kind === 'jeep' ? 0.135 : 0.084,
        [0, axleY, z],
        [1.3, 1, 0.9],
      );
      cylinder(
        body,
        p.steel,
        kind === 'jeep' ? 0.083 : 0.052,
        0.017,
        [0, axleY, z + 0.1],
        [Math.PI / 2, 0, 0],
        10,
      );
    }
    beam(
      body,
      p.steel,
      [0, axleY, -spec.wheelBase / 2],
      [0, axleY, spec.wheelBase / 2],
      0.024,
    );
  }
  batch(body);
  const controls = steeringControl(group, kind, p);
  const person = createRider(group, kind, p);
  const wheels = [];
  for (const front of [true, false]) {
    for (const side of kind === 'bike' ? [0] : [-1, 1]) {
      wheels.push(
        wheel(
          group,
          spec,
          p,
          (side * spec.track) / 2,
          ((front ? -1 : 1) * spec.wheelBase) / 2,
          front,
          kind === 'bike',
        ),
      );
    }
  }
  const suspensionUpdaters = wheels.map((value) =>
    suspension(group, value, kind, p),
  );
  let spin = 0;
  let steering = 0;
  let driverView = false;
  let disposed = false;
  let verticalMotion = 0;
  const eye = new THREE.Vector3(...spec.eye);
  const forward = new THREE.Vector3();
  const up = new THREE.Vector3();
  const eyeWorld = new THREE.Vector3();
  const targetWorld = new THREE.Vector3();
  const inverse = new THREE.Matrix4();
  function update(snapshot, dt = 1 / 60) {
    if (disposed) return;
    const delta = clamp(dt, 0, 0.1);
    group.position.set(snapshot.x || 0, snapshot.y || 0, snapshot.z || 0);
    group.rotation.set(
      snapshot.pitch || 0,
      -(snapshot.heading || 0),
      (snapshot.roll || 0) + (snapshot.lean || 0),
      'YXZ',
    );
    steering = snapshot.steer || 0;
    spin = Number.isFinite(snapshot.wheelSpin)
      ? snapshot.wheelSpin
      : spin + ((snapshot.speed || 0) * delta) / spec.radius;
    group.updateMatrixWorld(true);
    inverse.copy(group.matrixWorld).invert();
    wheels.forEach((value, index) => {
      const contact = snapshot.contacts?.[index];
      if (contact && [contact.x, contact.y, contact.z].every(Number.isFinite)) {
        value.hub.position
          .set(contact.x, contact.y, contact.z)
          .applyMatrix4(inverse);
      } else {
        const compression = clamp(
          contact?.compression || 0,
          -config.suspension,
          config.suspension,
        );
        value.hub.position.set(value.x, spec.radius + compression, value.z);
      }
      value.steering.rotation.y = value.front ? -steering : 0;
      value.spin.rotation.x = -spin;
      suspensionUpdaters[index](value.hub.position.toArray());
    });
    if (kind === 'jeep') controls.rotation.z = steering * 1.7;
    else controls.rotation.y = -steering;
    const frontFairing = body.getObjectByName('bike-front-fairing');
    if (frontFairing) frontFairing.rotation.y = -steering;
    person.update(snapshot, delta, controls);
    controls.userData.instrument?.update(snapshot.speed);
    verticalMotion +=
      ((snapshot.airborne ? 0.07 : 0) - verticalMotion) *
      (1 - Math.exp(-delta * 6));
    group.updateMatrixWorld(true);
  }
  function mountedPose() {
    eyeWorld.copy(eye);
    eyeWorld.y += verticalMotion;
    eyeWorld.applyMatrix4(group.matrixWorld);
    // Moderate chassis tilt in the view keeps bumps readable without motion spikes.
    forward
      .set(Math.sin(steering * 0.12), -0.1, -1)
      .transformDirection(group.matrixWorld);
    targetWorld.copy(eyeWorld).addScaledVector(forward, 12);
    up.set(0, 1, 0).transformDirection(group.matrixWorld);
    up.lerp(Y, kind === 'bike' ? 0.68 : 0.3).normalize();
    return {
      position: eyeWorld.toArray(),
      target: targetWorld.toArray(),
      up: up.toArray(),
    };
  }
  function setDriverView(value) {
    driverView = Boolean(value);
    person.head.visible = !driverView;
    person.torso.visible = !driverView;
    group.traverse((part) => {
      if (part.userData.hideInDriverView) part.visible = !driverView;
    });
    for (const limb of person.limbs) limb.upperArm.visible = !driverView;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    const geometries = new Set(),
      materials = new Set(Object.values(p)),
      textures = new Set();
    group.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material)
        for (const mat of Array.isArray(object.material)
          ? object.material
          : [object.material])
          materials.add(mat);
    });
    for (const mat of materials)
      for (const [key, value] of Object.entries(mat)) {
        // The renderer supplies a shared PMREM environment; it is borrowed.
        if (key !== 'envMap' && value?.isTexture) textures.add(value);
      }
    geometries.forEach((geometry) => geometry.dispose());
    textures.forEach((texture) => texture.dispose());
    materials.forEach((mat) => mat.dispose());
    group.removeFromParent();
    group.clear();
  }
  update({ x: 0, y: 0, z: 0, speed: 0 }, 0);
  return { group, update, mountedPose, setDriverView, dispose };
}
