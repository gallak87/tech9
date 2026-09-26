import * as THREE from 'three';
import {
  mesh,
  ball,
  tube,
  loft,
  panel,
  graphic,
  batch,
  setBeam,
} from './VehicleGeometry.js';

const clamp = THREE.MathUtils.clamp;
const Y = new THREE.Vector3(0, 1, 0);

// Ring sections describe an authored garment or anatomical volume, not a stack
// of cylinders. Each section is [height, halfWidth, halfDepth, depthOffset].
function form(parent, material, sections, segments = 24) {
  const positions = [],
    uv = [],
    indices = [];
  for (let i = 0; i < sections.length; i++) {
    const [y, rx, rz, cz = 0] = sections[i];
    for (let j = 0; j <= segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      positions.push(Math.sin(a) * rx, y, Math.cos(a) * rz + cz);
      uv.push(j / segments, i / (sections.length - 1));
    }
  }
  for (let i = 0; i < sections.length - 1; i++)
    for (let j = 0; j < segments; j++) {
      const a = i * (segments + 1) + j,
        b = a + segments + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  for (const [row, flip] of [
    [0, true],
    [sections.length - 1, false],
  ]) {
    const [y, , , z = 0] = sections[row];
    const center = positions.length / 3;
    positions.push(0, y, z);
    uv.push(0.5, 0.5);
    for (let j = 0; j < segments; j++) {
      const a = row * (segments + 1) + j;
      indices.push(...(flip ? [center, a + 1, a] : [center, a, a + 1]));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return mesh(parent, geometry, material);
}

// Cloth is shaped over the anatomy, with broad contrasting cut panels and
// compression folds. Color follows the authored fabric cuts, rather than
// independent floating strips on an otherwise uniform capsule.
function tailored(parent, p, sections, kind, side = 1) {
  const profile = new THREE.CatmullRomCurve3(
    sections.map(([y, rx, rz]) => new THREE.Vector3(rx, y, rz)),
    false,
    'catmullrom',
    0.3,
  );
  const rows = kind === 'torso' ? 52 : 34;
  const segments = kind === 'torso' ? 48 : 36;
  const dense = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows,
      v = profile.getPoint(t),
      f = t * (sections.length - 1),
      k = Math.min(sections.length - 2, Math.floor(f));
    const cz = THREE.MathUtils.lerp(
      sections[k][3] || 0,
      sections[k + 1][3] || 0,
      f - k,
    );
    dense.push([v.y, v.x, v.z, cz]);
  }
  const source = kind === 'trousers' ? p.trousers : p.jacket;
  const material = source.clone();
  material.color.set(0xffffff);
  material.vertexColors = true;
  const object = form(parent, material, dense, segments);
  const positions = object.geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const row = Math.min(rows, Math.floor(i / (segments + 1)));
    const t = row / rows,
      a = ((i % (segments + 1)) / segments) * Math.PI * 2;
    const y = positions.getY(i),
      sx = Math.sin(a),
      cz = Math.cos(a);
    const core = i < (rows + 1) * (segments + 1);
    const envelope =
      Math.exp(-(((t - 0.19) / 0.17) ** 2)) +
      0.8 * Math.exp(-(((t - 0.72) / 0.16) ** 2));
    const phase = t * (kind === 'torso' ? 47 : 39) + sx * 1.6 + side * 0.37;
    const fold =
      (kind === 'torso' ? 0.0045 : 0.0028) * envelope * Math.sin(phase);
    if (core) {
      positions.setX(
        i,
        positions.getX(i) + sx * fold + side * Math.sin(t * Math.PI) * 0.0018,
      );
      positions.setZ(
        i,
        positions.getZ(i) +
          cz * fold +
          (kind === 'torso' ? 0 : 0.005 * Math.sin(t * Math.PI)),
      );
    }
    let dark,
      accent = false,
      seam;
    if (kind === 'torso') {
      // A low-profile shoulder yoke leaves the front of the neck open. The
      // earlier continuous dark upper chest read as an oversized neck brace.
      const cut =
        cz > 0 ? 0.169 - Math.abs(sx) * 0.03 : 0.235 - Math.abs(sx) * 0.069;
      dark = y > cut || Math.abs(sx) > 0.9 || y < -0.209;
      seam = Math.abs(y - cut) < 0.003 || Math.abs(Math.abs(sx) - 0.9) < 0.016;
      accent = y > cut - 0.012 && y < cut - 0.007 && Math.abs(sx) < 0.88;
    } else if (kind === 'upper') {
      const cut = 0.24 + 0.18 * sx * side;
      dark = t < cut || (cz > 0.7 && t > 0.43);
      seam = Math.abs(t - cut) < 0.025;
      accent = t > cut + 0.022 && t < cut + 0.055 && cz < 0.2;
    } else if (kind === 'forearm') {
      const cut = 0.1 + t * 0.45;
      dark = cz > cut || t > 0.84;
      seam = Math.abs(cz - cut) < 0.045 || (t > 0.8 && t < 0.825);
      accent = t > 0.67 && t < 0.695 && cz > 0.7;
    } else {
      dark = cz > 0.3 || t > 0.84;
      seam = Math.abs(cz - 0.3) < 0.035;
    }
    color.copy(dark ? p.clothDark.color : source.color);
    if (seam) color.lerp(p.seam.color, 0.3);
    if (accent) color.copy(p.accent.color);
    color.multiplyScalar(0.88 + 0.08 * Math.cos(phase) * envelope);
    color.toArray(colors, i * 3);
  }
  object.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  object.geometry.computeVertexNormals();
  return object;
}

function sleeve(parent, p, upper, side) {
  const group = new THREE.Group();
  parent.add(group);
  tailored(
    group,
    p,
    upper
      ? [
          [-0.5, 0.051, 0.054],
          [-0.4, 0.068, 0.066],
          [-0.17, 0.074, 0.069],
          [0.12, 0.064, 0.059, 0.006],
          [0.38, 0.055, 0.051, 0.005],
          [0.52, 0.048, 0.045],
        ]
      : [
          [-0.52, 0.047, 0.046],
          [-0.33, 0.053, 0.047],
          [-0.02, 0.05, 0.039],
          [0.29, 0.037, 0.031],
          [0.5, 0.032, 0.029],
        ],
    upper ? 'upper' : 'forearm',
    side,
  );
  group.name = upper ? 'tailored-upper-sleeve' : 'creased-forearm-and-cuff';
  if (!upper) {
    form(group, p.clothDark, [
      [0.38, 0.036, 0.031],
      [0.46, 0.034, 0.031],
      [0.52, 0.032, 0.029],
    ]);
    const tab = panel(
      group,
      p.glove,
      [
        [-0.014, -0.023],
        [0.016, -0.023],
        [0.02, 0.025],
        [-0.015, 0.025],
      ],
      0.002,
      [0, 0.416, 0.032],
      [0, 0, side * 0.16],
      0.002,
    );
    tab.name = 'cuff-adjustment-tab';
  }
  batch(group);
  return group;
}

function glove(parent, p, side) {
  const group = new THREE.Group();
  group.name = 'articulated-gripping-glove';
  parent.add(group);
  // A low, tapered palm leaves individual knuckles readable from the cockpit.
  const palm = form(
    group,
    p.glove,
    [
      [-0.033, 0.026, 0.018],
      [-0.025, 0.034, 0.023],
      [0.007, 0.041, 0.022],
      [0.031, 0.034, 0.017],
    ],
    24,
  );
  palm.rotation.x = Math.PI / 2;
  palm.position.set(0, 0.026, 0.026);
  for (let i = 0; i < 4; i++) {
    const x = -0.027 + i * 0.018;
    const lift = (1 - Math.abs(i - 1.5) / 2) * 0.004;
    tube(
      group,
      p.glove,
      [
        [x, 0.03 + lift, 0.025],
        [x, 0.036 + lift, -0.005],
        [x, 0.02, -0.025],
        [x, -0.006, -0.026],
        [x, -0.018, -0.009],
      ],
      0.0087 - Math.abs(1.5 - i) * 0.0006,
      14,
    );
    ball(
      group,
      p.clothDark,
      1,
      [x, 0.041 + lift, 0.002],
      [0.0072, 0.006, 0.011],
    );
    tube(
      group,
      p.seam,
      [
        [x, 0.044 + lift, 0.019],
        [x, 0.046 + lift, 0.005],
      ],
      0.0011,
      4,
    );
  }
  tube(
    group,
    p.glove,
    [
      [-side * 0.028, 0.02, 0.036],
      [-side * 0.046, 0.006, 0.021],
      [-side * 0.041, -0.016, 0.003],
      [-side * 0.024, -0.023, -0.002],
    ],
    0.011,
    14,
  );
  // Flexible wrist closure, with a narrow fabric tab instead of a rigid oval pad.
  const strap = panel(
    group,
    p.clothDark,
    [
      [-0.025, -0.013],
      [0.022, -0.013],
      [0.026, 0.012],
      [-0.022, 0.014],
    ],
    0.002,
    [0, 0.046, 0.043],
    [-Math.PI / 2, 0, 0],
    0.002,
  );
  strap.name = 'glove-wrist-closure';
  tube(
    group,
    p.accent,
    [
      [-0.012, 0.05, 0.043],
      [0.014, 0.05, 0.043],
    ],
    0.0015,
    4,
  );
  batch(group);
  return group;
}

function ridingBoot(parent, p, side) {
  const group = new THREE.Group();
  group.name = 'formed-motocross-boot';
  parent.add(group);
  // A planted, shaped foot and a separately articulated cuff: the shin enters
  // its opening, instead of cutting through the side of a vertical boot tube.
  loft(
    group,
    p.black,
    [
      [-0.202, 0.031, -0.114, -0.095],
      [-0.17, 0.062, -0.114, -0.088],
      [-0.105, 0.068, -0.114, -0.086],
      [0.006, 0.061, -0.114, -0.087],
      [0.074, 0.051, -0.114, -0.089],
    ],
    { bevel: 0.28 },
  );
  loft(
    group,
    p.boot,
    [
      [-0.196, 0.028, -0.094, -0.057],
      [-0.166, 0.058, -0.093, -0.024],
      [-0.102, 0.064, -0.091, -0.012],
      [-0.014, 0.055, -0.089, 0.017],
      [0.07, 0.047, -0.09, 0.009],
    ],
    { bevel: 0.34 },
  );
  // Separate toe protection and stitched instep provide broad material planes.
  loft(
    group,
    p.plastic,
    [
      [-0.191, 0.027, -0.059, -0.052],
      [-0.164, 0.053, -0.029, -0.021],
      [-0.119, 0.057, -0.02, -0.012],
    ],
    { bevel: 0.31 },
  );
  for (const z of [-0.092, -0.07, -0.048])
    tube(
      group,
      p.clothDark,
      [
        [-0.049, -0.018, z],
        [0, 0.002, z - 0.001],
        [0.049, -0.018, z],
      ],
      0.0028,
      12,
    );
  for (const outer of [-1, 1]) {
    tube(
      group,
      p.seam,
      [
        [outer * 0.029, -0.067, -0.193],
        [outer * 0.062, -0.065, -0.151],
        [outer * 0.063, -0.063, -0.095],
        [outer * 0.054, -0.058, 0.045],
      ],
      0.0018,
      20,
    );
    for (const z of [-0.145, -0.092, -0.039, 0.014, 0.054])
      tube(
        group,
        p.boot,
        [
          [outer * 0.052, -0.109, z],
          [outer * 0.063, -0.095, z],
        ],
        0.003,
        4,
      );
  }
  const upper = new THREE.Group();
  upper.name = 'shin-aligned-boot-cuff';
  upper.position.set(0, 0.007, 0.004);
  group.add(upper);
  form(
    upper,
    p.boot,
    [
      [-0.02, 0.045, 0.046],
      [0.025, 0.048, 0.048],
      [0.078, 0.052, 0.049],
      [0.137, 0.056, 0.051],
      [0.176, 0.056, 0.051],
    ],
    28,
  );
  form(
    upper,
    p.clothDark,
    [
      [0.15, 0.057, 0.052],
      [0.18, 0.058, 0.053],
    ],
    28,
  );
  panel(
    upper,
    p.plastic,
    [
      [-0.031, 0.037],
      [0.031, 0.037],
      [0.041, 0.145],
      [0.027, 0.172],
      [-0.028, 0.172],
      [-0.041, 0.145],
    ],
    0.008,
    [0, 0, -0.05],
    [0, Math.PI, 0],
    0.006,
  );
  for (const h of [0.03, 0.086, 0.145]) {
    tube(
      upper,
      p.clothDark,
      [
        [-0.045, h, -0.032],
        [0, h, -0.06],
        [0.045, h, -0.032],
      ],
      0.007,
      12,
    );
    panel(
      upper,
      p.silver,
      [
        [-0.014, -0.007],
        [0.014, -0.007],
        [0.014, 0.007],
        [-0.014, 0.007],
      ],
      0.003,
      [side * 0.051, h, -0.031],
      [0, (side * Math.PI) / 2, 0],
      0.002,
    );
  }
  batch(upper);
  batch(group);
  group.upper = upper;
  return group;
}

function shellSurface(parent, p) {
  // Front aperture is genuinely absent from the shell. The dome closes above
  // the goggles; the separate jaw connects side cheeks to the projecting chin.
  const segments = 40,
    rows = [
      [-0.096, 0.102, 0.105, 0.86],
      [-0.054, 0.141, 0.137, 1.0],
      [0.018, 0.156, 0.155, 1.02],
      [0.084, 0.151, 0.153, 0.83],
      [0.119, 0.136, 0.141, 0],
      [0.157, 0.103, 0.109, 0],
      [0.182, 0.054, 0.061, 0],
      [0.19, 0.002, 0.002, 0],
    ];
  const vertices = [],
    uv = [],
    index = [];
  for (let r = 0; r < rows.length; r++) {
    const [y, rx, rz, cut] = rows[r];
    for (let j = 0; j <= segments; j++) {
      const a = cut + (j / segments) * (Math.PI * 2 - cut * 2);
      vertices.push(Math.sin(a) * rx, y, -Math.cos(a) * rz + 0.013);
      uv.push(j / segments, r / (rows.length - 1));
    }
  }
  for (let r = 0; r < rows.length - 1; r++)
    for (let j = 0; j < segments; j++) {
      const a = r * (segments + 1) + j,
        b = a + segments + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  mesh(parent, geo, p.helmet);
}

function goggle(parent, p) {
  function lens(mat, w, h, depth) {
    const points = [],
      idx = [],
      uv = [];
    const cols = 20;
    for (let row = 0; row < 2; row++)
      for (let i = 0; i <= cols; i++) {
        const x = ((i / cols) * 2 - 1) * w;
        const edge = Math.pow(Math.abs(x / w), 4);
        points.push(
          x,
          0.039 + (row ? 1 : -1) * h * (1 - edge * 0.3),
          depth + (x / w) ** 2 * 0.036,
        );
        uv.push(i / cols, row);
      }
    for (let i = 0; i < cols; i++)
      idx.push(i, i + cols + 1, i + 1, i + 1, i + cols + 1, i + cols + 2);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(points, 3),
    );
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(idx);
    geometry.computeVertexNormals();
    mesh(parent, geometry, mat);
  }
  lens(p.black, 0.12, 0.047, -0.153);
  lens(p.visor, 0.106, 0.034, -0.158);
  for (const side of [-1, 1]) {
    tube(
      parent,
      p.clothDark,
      [
        [side * 0.105, 0.043, -0.11],
        [side * 0.154, 0.04, 0.005],
        [side * 0.129, 0.041, 0.099],
        [side * 0.071, 0.042, 0.15],
        [0, 0.043, 0.164],
      ],
      0.015,
      20,
    );
    tube(
      parent,
      p.accent,
      [
        [side * 0.157, 0.043, -0.005],
        [side * 0.153, 0.043, 0.04],
        [side * 0.137, 0.043, 0.084],
      ],
      0.004,
      9,
    );
  }
}

function helmet(parent, p) {
  const group = new THREE.Group();
  group.name = 'full-face-helmet-and-neck';
  parent.add(group);
  form(group, p.clothDark, [
    [-0.144, 0.052, 0.049],
    [-0.112, 0.059, 0.055],
    [-0.081, 0.067, 0.062],
  ]);
  ball(group, p.skin, 1, [0, -0.045, -0.002], [0.097, 0.096, 0.085]);
  shellSurface(group, p);
  goggle(group, p);
  // Chin protector flows back into shaped cheek plates on both sides.
  loft(
    group,
    p.helmet,
    [
      [-0.207, 0.071, -0.098, -0.046],
      [-0.18, 0.094, -0.112, -0.038],
      [-0.138, 0.117, -0.105, -0.048],
    ],
    { bevel: 0.29 },
  );
  for (const side of [-1, 1]) {
    panel(
      group,
      p.helmet,
      [
        [-0.147, -0.098],
        [-0.158, -0.045],
        [-0.104, -0.027],
        [-0.051, 0.01],
        [0.026, -0.027],
        [0.035, -0.084],
        [-0.025, -0.114],
      ],
      0.026,
      [side * 0.112, 0, 0],
      [0, -Math.PI / 2, 0],
      0.01,
    );
    tube(
      group,
      p.black,
      [
        [side * 0.081, -0.113, -0.175],
        [side * 0.12, -0.111, -0.1],
        [side * 0.13, -0.094, -0.018],
      ],
      0.008,
      14,
    );
    ball(group, p.steel, 0.015, [side * 0.15, 0.09, -0.022], [0.28, 1, 1]);
    tube(
      group,
      p.black,
      [
        [side * 0.102, 0.136, 0.022],
        [side * 0.087, 0.158, 0.06],
        [side * 0.063, 0.174, 0.066],
      ],
      0.007,
      10,
    );
  }
  // Formed, raised peak with a dark underside rather than a flat slab brim.
  loft(
    group,
    p.black,
    [
      [-0.284, 0.089, 0.114, 0.119],
      [-0.232, 0.136, 0.13, 0.137],
      [-0.157, 0.156, 0.152, 0.16],
      [-0.059, 0.145, 0.165, 0.171],
    ],
    { bevel: 0.3 },
  );
  loft(
    group,
    p.helmet,
    [
      [-0.284, 0.085, 0.119, 0.125],
      [-0.231, 0.132, 0.137, 0.146],
      [-0.156, 0.152, 0.159, 0.17],
      [-0.059, 0.14, 0.17, 0.179],
    ],
    { bevel: 0.3 },
  );
  for (const side of [-1, 1]) {
    tube(
      group,
      p.accent,
      [
        [side * 0.051, 0.129, -0.275],
        [side * 0.069, 0.149, -0.214],
        [side * 0.074, 0.174, -0.13],
        [side * 0.059, 0.19, -0.044],
        [side * 0.048, 0.188, 0.05],
        [side * 0.05, 0.155, 0.113],
      ],
      0.007,
      24,
    );
  }
  panel(
    group,
    p.black,
    [
      [-0.035, -0.013],
      [0.035, -0.013],
      [0.042, 0.006],
      [0.024, 0.012],
      [-0.024, 0.012],
      [-0.042, 0.006],
    ],
    0.002,
    [0, -0.072, -0.211],
    [0, Math.PI, 0],
    0.003,
  );
  for (const x of [-0.018, 0, 0.018])
    tube(
      group,
      p.steel,
      [
        [x, -0.08, -0.214],
        [x, -0.063, -0.214],
      ],
      0.0018,
      4,
    );
  graphic(group, 'NC', {
    position: [0, 0.061, 0.163],
    width: 0.075,
    height: 0.034,
    color: '#e4ddd0',
  });
  batch(group);
  return group;
}

function jacket(parent, p) {
  const group = new THREE.Group();
  group.name = 'tailored-jacket-and-pelvis';
  parent.add(group);
  tailored(
    group,
    p,
    [
      [-0.245, 0.142, 0.093, 0.013],
      [-0.196, 0.153, 0.105, 0.009],
      [-0.077, 0.151, 0.119],
      [0.041, 0.171, 0.122, -0.004],
      [0.139, 0.187, 0.114, -0.016],
      [0.203, 0.176, 0.088, -0.024],
      [0.25, 0.089, 0.062, -0.026],
    ],
    'torso',
  );
  form(group, p.clothDark, [
    [0.227, 0.067, 0.056, -0.019],
    [0.251, 0.063, 0.053, -0.02],
    [0.266, 0.06, 0.05, -0.018],
  ]);
  // The zipper and small pocket welt sit on cloth; broad garment cuts are
  // colored directly into its deformed mesh and never float like pipes.
  tube(
    group,
    p.clothDark,
    [
      [0, 0.215, -0.075],
      [0, 0.121, -0.128],
      [0, -0.012, -0.128],
      [0, -0.171, -0.103],
    ],
    0.0022,
    24,
  );
  for (const side of [-1, 1])
    tube(
      group,
      p.clothDark,
      [
        [side * 0.08, -0.061, -0.111],
        [side * 0.112, -0.099, -0.091],
      ],
      0.0025,
      8,
    );
  const lettering = p.jacket.color.r > 0.5 ? '#34433f' : '#e0d9c6';
  graphic(group, 'NORTH CASCADE', {
    position: [0, 0.042, 0.132],
    width: 0.21,
    height: 0.031,
    color: lettering,
    font: '700',
  });
  graphic(group, 'TRAIL DIVISION', {
    position: [0, 0.001, 0.129],
    width: 0.13,
    height: 0.02,
    color: lettering,
    font: '500',
  });
  const pelvis = form(
    group,
    p.trousers,
    [
      [-0.351, 0.13, 0.079, 0.025],
      [-0.298, 0.164, 0.1, 0.025],
      [-0.233, 0.163, 0.104, 0.016],
      [-0.198, 0.145, 0.096, 0.015],
    ],
    28,
  );
  pelvis.name = 'formed-pelvis';
  batch(group);
  return group;
}

/** Attached rider assets share the vehicle material/resource lifetime. */
export function createRider(parent, kind, p) {
  const group = new THREE.Group();
  group.name = 'attached-rider';
  parent.add(group);
  const isJeep = kind === 'jeep';
  const hip = isJeep
    ? [-0.44, 1.14, 0.27]
    : kind === 'bike'
      ? [0, 1.23, 0.31]
      : [0, 1.06, 0.32];
  const torso = jacket(group, p);
  const head = helmet(group, p);
  torso.userData.hideInDriverView = true;
  head.userData.hideInDriverView = true;
  const limbs = [];
  for (const side of [-1, 1]) {
    const upperArm = sleeve(group, p, true, side);
    upperArm.userData.hideInDriverView = true;
    const forearm = sleeve(group, p, false, side);
    const forearmSurfaces = [];
    forearm.traverse((part) => {
      if (part.geometry)
        forearmSurfaces.push({
          geometry: part.geometry,
          base: part.geometry.getAttribute('position').array.slice(),
        });
    });
    const hand = glove(group, p, side);
    const thigh = new THREE.Group();
    group.add(thigh);
    tailored(
      thigh,
      p,
      [
        [-0.5, 0.07, 0.078],
        [-0.34, 0.084, 0.086],
        [-0.09, 0.083, 0.082],
        [0.22, 0.069, 0.067],
        [0.42, 0.057, 0.055],
        [0.53, 0.053, 0.05],
      ],
      'trousers',
      side,
    );
    const shin = new THREE.Group();
    group.add(shin);
    tailored(
      shin,
      p,
      [
        [-0.53, 0.056, 0.053],
        [-0.34, 0.065, 0.057, 0.004],
        [-0.05, 0.06, 0.055, 0.004],
        [0.27, 0.048, 0.047],
        [0.5, 0.044, 0.042],
      ],
      'trousers',
      side,
    );
    const kneePad = new THREE.Group();
    group.add(kneePad);
    ball(kneePad, p.trousers, 1, [0, 0, 0], [0.056, 0.051, 0.054]);
    panel(
      kneePad,
      p.plastic,
      [
        [-0.036, -0.043],
        [0.032, -0.043],
        [0.043, -0.014],
        [0.04, 0.031],
        [0.024, 0.044],
        [-0.026, 0.044],
        [-0.042, 0.02],
      ],
      0.008,
      [0, 0, -0.052],
      [0, Math.PI, 0],
      0.006,
    );
    batch(kneePad);
    const elbowJoint = ball(
      group,
      p.jacket,
      1,
      [0, 0, 0],
      [0.046, 0.047, 0.044],
    );
    elbowJoint.userData.hideInDriverView = true;
    const boot = ridingBoot(group, p, side);
    batch(thigh);
    batch(shin);
    limbs.push({
      side,
      upperArm,
      forearm,
      forearmSurfaces,
      hand,
      thigh,
      shin,
      boot,
      kneePad,
      elbowJoint,
    });
  }
  let posture = 0;
  let driverView = false;
  const update = (snapshot, dt, controls) => {
    const rough = ['rock', 'rough', 'rocky'].includes(snapshot.surface?.kind);
    const desired = isJeep
      ? 0
      : clamp(
          (snapshot.airborne ? 0.17 : 0) +
            Math.abs(snapshot.pitch || 0) * 0.17 +
            (rough ? 0.075 : 0),
          0,
          0.22,
        );
    posture += (desired - posture) * (1 - Math.exp(-dt * 7));
    const lean = clamp(
      (snapshot.steer || 0) * (isJeep ? 0.035 : 0.11),
      -0.09,
      0.09,
    );
    const hips = [hip[0] + lean, hip[1] + posture, hip[2] - posture * 0.35];
    const center = [hips[0], hips[1] + 0.23, hips[2] - (isJeep ? 0.025 : 0.13)];
    torso.position.set(...center);
    torso.rotation.x = isJeep ? -0.07 : -0.32 - posture * 0.35;
    torso.rotation.z = -lean * 0.45;
    torso.updateMatrix();
    head.position.set(0, 0.336, -0.029).applyMatrix4(torso.matrix);
    head.rotation.set(
      isJeep ? 0.015 : 0.035 - posture * 0.12,
      -(snapshot.steer || 0) * 0.16,
      -lean * 0.25,
    );
    controls.updateMatrix();
    for (const {
      side,
      upperArm,
      forearm,
      hand,
      thigh,
      shin,
      boot,
      kneePad,
      elbowJoint,
    } of limbs) {
      const shoulder = new THREE.Vector3(side * 0.18, 0.158, -0.018)
        .applyMatrix4(torso.matrix)
        .toArray();
      const grip = new THREE.Vector3(
        isJeep ? side * 0.18 : side * (kind === 'bike' ? 0.355 : 0.415),
        isJeep ? 0.065 : 0.035,
        isJeep ? 0 : 0.09,
      )
        .applyMatrix4(controls.matrix)
        .toArray();
      const elbow = [
        center[0] + side * (isJeep ? 0.23 : 0.29),
        center[1] - (isJeep ? 0.075 : 0.025),
        center[2] - 0.19,
      ];
      const knee = [
        hip[0] + side * (isJeep ? 0.135 : 0.2),
        isJeep
          ? 0.9
          : kind === 'bike'
            ? 0.85 + posture * 0.25
            : 0.76 + posture * 0.25,
        isJeep ? -0.14 : -0.035,
      ];
      const foot = [
        hip[0] + side * (isJeep ? 0.135 : kind === 'bike' ? 0.25 : 0.43),
        isJeep ? 0.73 : kind === 'bike' ? 0.623 : 0.593,
        isJeep ? -0.36 : 0.15,
      ];
      setBeam(upperArm, shoulder, elbow);
      // A first-person view sees through the hidden torso. Continue the sleeve
      // behind that camera so its cut upper end never floats over the dashboard;
      // the wrist/grip anchor and third-person arm stay physically unchanged.
      const sleeveOrigin = driverView
        ? [
            hip[0] + side * (isJeep ? 0.28 : 0.38),
            center[1] - 0.35,
            hip[2] + (isJeep ? 0.02 : -0.12),
          ]
        : elbow;
      setBeam(forearm, sleeveOrigin, grip);
      elbowJoint.position.set(...elbow);
      hand.position.set(...grip);
      hand.quaternion.copy(controls.quaternion);
      if (isJeep) hand.rotateZ(-side * 0.35);
      setBeam(thigh, [hips[0] + side * 0.105, hips[1] - 0.015, hips[2]], knee);
      setBeam(shin, knee, foot);
      kneePad.position.set(...knee);
      const kneeDirection = new THREE.Vector3(...foot)
        .sub(new THREE.Vector3(...knee))
        .normalize();
      kneePad.quaternion.setFromUnitVectors(Y, kneeDirection);
      boot.position.set(...foot);
      boot.rotation.set(0, side * (isJeep ? 0.025 : 0.075), 0);
      const cuffDirection = new THREE.Vector3(...knee)
        .sub(new THREE.Vector3(...foot))
        .normalize()
        .applyQuaternion(boot.quaternion.clone().invert());
      boot.upper.quaternion.setFromUnitVectors(Y, cuffDirection);
    }
  };
  return {
    group,
    head,
    torso,
    limbs,
    update,
    setDriverView(value) {
      driverView = Boolean(value);
      for (const { forearmSurfaces } of limbs)
        for (const { geometry, base } of forearmSurfaces) {
          const position = geometry.getAttribute('position');
          for (let i = 0; i < position.count; i++) {
            const t = clamp(base[i * 3 + 1] + 0.5, 0, 1);
            const bend = driverView
              ? Math.sin(t * Math.PI) * (1 - t * 0.3) * 0.041
              : 0;
            position.setXYZ(
              i,
              base[i * 3],
              base[i * 3 + 1],
              base[i * 3 + 2] + bend,
            );
          }
          position.needsUpdate = true;
          geometry.computeVertexNormals();
          geometry.computeBoundingBox();
          geometry.computeBoundingSphere();
        }
    },
  };
}
