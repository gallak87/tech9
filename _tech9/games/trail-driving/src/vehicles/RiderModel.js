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

// A garment section is built in a normalized local limb frame. Its organic
// taper survives articulation; a group holds stitched panels and end cuffs.
function limb(parent, material, sections) {
  const group = new THREE.Group();
  parent.add(group);
  form(group, material, sections);
  return group;
}

function sleeve(parent, p, upper, side) {
  const group = limb(
    parent,
    p.jacket,
    upper
      ? [
          [-0.5, 0.053, 0.058],
          [-0.43, 0.071, 0.071],
          [-0.2, 0.077, 0.074],
          [0.09, 0.068, 0.063, 0.003],
          [0.36, 0.058, 0.054, 0.004],
          [0.5, 0.048, 0.048],
        ]
      : [
          [-0.5, 0.047, 0.045],
          [-0.36, 0.058, 0.05],
          [-0.03, 0.052, 0.044],
          [0.3, 0.042, 0.037],
          [0.5, 0.035, 0.033],
        ],
  );
  group.name = upper ? 'shaped-upper-sleeve' : 'shaped-forearm-and-cuff';
  if (upper) {
    // Elbow abrasion insert is curved with the sleeve, not a floating ball.
    const pad = ball(
      group,
      p.clothDark,
      1,
      [0, 0.36, 0.044],
      [0.052, 0.145, 0.02],
    );
    pad.rotation.z = side * 0.06;
    tube(
      group,
      p.seam,
      [
        [side * 0.051, -0.36, -0.027],
        [side * 0.059, -0.12, -0.03],
        [side * 0.05, 0.15, -0.025],
        [side * 0.04, 0.37, -0.022],
      ],
      0.0035,
      14,
    );
    tube(
      group,
      p.accent,
      [
        [side * 0.049, -0.3, 0.047],
        [side * 0.058, -0.2, 0.045],
        [side * 0.06, -0.07, 0.039],
      ],
      0.008,
      8,
    );
  } else {
    form(group, p.clothDark, [
      [0.34, 0.042, 0.037],
      [0.43, 0.04, 0.035],
      [0.5, 0.036, 0.034],
    ]);
    tube(
      group,
      p.seam,
      [
        [side * 0.045, -0.28, 0.026],
        [side * 0.043, 0.04, 0.023],
        [side * 0.034, 0.31, 0.02],
      ],
      0.003,
      12,
    );
  }
  batch(group);
  return group;
}

function glove(parent, p, side) {
  const group = new THREE.Group();
  group.name = 'articulated-gripping-glove';
  parent.add(group);
  ball(group, p.glove, 1, [0, 0.034, 0.024], [0.052, 0.034, 0.045]);
  ball(group, p.clothDark, 1, [0, 0.057, 0.027], [0.045, 0.013, 0.031]);
  // Fingers wrap around the grip axis (local X), with knuckles above it and
  // curled tips below; the thumb opposes them on the inner side.
  for (let i = 0; i < 4; i++) {
    const x = -0.034 + i * 0.022;
    tube(
      group,
      p.glove,
      [
        [x, 0.037, 0.024],
        [x, 0.043, -0.005],
        [x, 0.025, -0.03],
        [x, -0.006, -0.031],
        [x, -0.02, -0.011],
      ],
      0.0105 - Math.abs(1.5 - i) * 0.001,
      12,
    );
    ball(group, p.plastic, 1, [x, 0.05, 0.009], [0.009, 0.007, 0.014]);
    tube(
      group,
      p.seam,
      [
        [x - 0.003, 0.051, 0.027],
        [x - 0.003, 0.052, 0.013],
      ],
      0.0018,
      4,
    );
  }
  tube(
    group,
    p.glove,
    [
      [-side * 0.038, 0.025, 0.037],
      [-side * 0.056, 0.003, 0.025],
      [-side * 0.047, -0.022, 0.005],
      [-side * 0.023, -0.025, -0.002],
    ],
    0.014,
    14,
  );
  tube(
    group,
    p.accent,
    [
      [-0.028, 0.061, 0.039],
      [0, 0.066, 0.039],
      [0.025, 0.061, 0.039],
    ],
    0.004,
    8,
  );
  batch(group);
  return group;
}

function ridingBoot(parent, p, side) {
  const group = new THREE.Group();
  group.name = 'formed-motocross-boot';
  parent.add(group);
  form(
    group,
    p.boot,
    [
      [-0.106, 0.061, 0.111, -0.058],
      [-0.089, 0.075, 0.14, -0.061],
      [-0.06, 0.075, 0.143, -0.066],
      [-0.012, 0.066, 0.123, -0.048],
      [0.04, 0.056, 0.064, 0.002],
      [0.12, 0.061, 0.061, 0.003],
      [0.19, 0.062, 0.059, 0.008],
    ],
    24,
  );
  form(
    group,
    p.black,
    [
      [-0.114, 0.061, 0.113, -0.057],
      [-0.106, 0.078, 0.142, -0.064],
      [-0.085, 0.078, 0.145, -0.064],
    ],
    24,
  );
  // Curved shin armor, instep ribs and three functional closure straps.
  const armor = ball(
    group,
    p.plastic,
    1,
    [0, 0.116, -0.054],
    [0.047, 0.08, 0.014],
  );
  armor.rotation.x = -0.06;
  for (const h of [-0.002, 0.07, 0.15]) {
    tube(
      group,
      p.clothDark,
      [
        [-0.053, h, -0.046],
        [0, h, -0.065],
        [0.051, h, -0.046],
      ],
      0.01,
      10,
    );
    const buckle = panel(
      group,
      p.silver,
      [
        [-0.017, -0.008],
        [0.017, -0.008],
        [0.017, 0.008],
        [-0.017, 0.008],
      ],
      0.004,
      [side * 0.056, h, -0.032],
      [0, (side * Math.PI) / 2, 0],
      0.002,
    );
    buckle.name = 'boot-closure-buckle';
  }
  for (let i = 0; i < 3; i++)
    tube(
      group,
      p.seam,
      [
        [-0.049, -0.016 - i * 0.009, -0.103 - i * 0.015],
        [0, -0.003 - i * 0.009, -0.111 - i * 0.015],
        [0.049, -0.016 - i * 0.009, -0.103 - i * 0.015],
      ],
      0.0035,
      9,
    );
  batch(group);
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
    [-0.16, 0.066, 0.06],
    [-0.112, 0.077, 0.069],
    [-0.081, 0.078, 0.071],
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
  form(
    group,
    p.jacket,
    [
      [-0.245, 0.139, 0.1, 0.013],
      [-0.195, 0.154, 0.11, 0.009],
      [-0.088, 0.151, 0.119],
      [0.033, 0.173, 0.126, -0.004],
      [0.137, 0.194, 0.126, -0.009],
      [0.204, 0.183, 0.103, -0.003],
      [0.254, 0.103, 0.073, -0.002],
    ],
    32,
  );
  form(group, p.clothDark, [
    [-0.244, 0.14, 0.103, 0.012],
    [-0.213, 0.154, 0.113, 0.009],
  ]);
  form(group, p.clothDark, [
    [0.218, 0.092, 0.069],
    [0.263, 0.079, 0.063],
    [0.28, 0.073, 0.06],
  ]);
  // Shoulder yoke and ergonomically curved textile panels replace a backpack.
  for (const side of [-1, 1]) {
    tube(
      group,
      p.clothDark,
      [
        [side * 0.13, 0.184, 0.073],
        [side * 0.104, 0.156, 0.104],
        [side * 0.071, 0.137, 0.119],
        [0, 0.123, 0.128],
      ],
      0.02,
      18,
    );
    tube(
      group,
      p.seam,
      [
        [side * 0.143, 0.125, 0.091],
        [side * 0.122, 0.041, 0.098],
        [side * 0.111, -0.057, 0.094],
        [side * 0.103, -0.183, 0.081],
      ],
      0.004,
      18,
    );
    tube(
      group,
      p.accent,
      [
        [side * 0.17, 0.132, -0.076],
        [side * 0.139, 0.135, -0.1],
        [side * 0.079, 0.13, -0.123],
      ],
      0.007,
      14,
    );
    tube(
      group,
      p.clothDark,
      [
        [side * 0.163, 0.015, -0.039],
        [side * 0.155, -0.073, -0.044],
        [side * 0.14, -0.163, -0.026],
      ],
      0.019,
      14,
    );
    tube(
      group,
      p.seam,
      [
        [side * 0.089, -0.063, -0.106],
        [side * 0.114, -0.1, -0.087],
      ],
      0.004,
      8,
    );
  }
  tube(
    group,
    p.seam,
    [
      [0, 0.215, -0.082],
      [0, 0.123, -0.135],
      [0, -0.013, -0.127],
      [0, -0.172, -0.102],
    ],
    0.003,
    24,
  );
  graphic(group, 'NORTH CASCADE', {
    position: [0, 0.045, 0.133],
    width: 0.205,
    height: 0.033,
    color: '#dfd9c8',
    font: '700',
  });
  graphic(group, 'TRAIL DIVISION', {
    position: [0, 0.005, 0.129],
    width: 0.126,
    height: 0.023,
    color: '#afa99a',
    font: '500',
  });
  const pelvis = form(
    group,
    p.trousers,
    [
      [-0.35, 0.137, 0.083, 0.025],
      [-0.299, 0.176, 0.102, 0.025],
      [-0.234, 0.17, 0.106, 0.016],
      [-0.198, 0.147, 0.099, 0.015],
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
    const hand = glove(group, p, side);
    const thigh = limb(group, p.trousers, [
      [-0.5, 0.072, 0.082],
      [-0.34, 0.088, 0.09],
      [-0.09, 0.09, 0.088],
      [0.22, 0.075, 0.072],
      [0.42, 0.062, 0.059],
      [0.5, 0.055, 0.052],
    ]);
    tube(
      thigh,
      p.seam,
      [
        [side * 0.074, -0.33, -0.018],
        [side * 0.087, -0.07, -0.016],
        [side * 0.069, 0.24, -0.012],
      ],
      0.0035,
      15,
    );
    ball(thigh, p.clothDark, 1, [0, 0.36, -0.039], [0.06, 0.15, 0.031]);
    const shin = limb(group, p.trousers, [
      [-0.5, 0.059, 0.057],
      [-0.34, 0.071, 0.06, 0.004],
      [-0.05, 0.064, 0.058, 0.004],
      [0.27, 0.05, 0.05],
      [0.5, 0.046, 0.044],
    ]);
    tube(
      shin,
      p.seam,
      [
        [side * 0.062, -0.3, -0.021],
        [side * 0.053, 0.07, -0.025],
        [side * 0.043, 0.4, -0.018],
      ],
      0.003,
      14,
    );
    const kneePad = ball(group, p.plastic, 1, [0, 0, 0], [0.064, 0.071, 0.039]);
    const elbowJoint = ball(
      group,
      p.clothDark,
      1,
      [0, 0, 0],
      [0.05, 0.048, 0.05],
    );
    elbowJoint.userData.hideInDriverView = true;
    const boot = ridingBoot(group, p, side);
    batch(thigh);
    batch(shin);
    limbs.push({
      side,
      upperArm,
      forearm,
      hand,
      thigh,
      shin,
      boot,
      kneePad,
      elbowJoint,
    });
  }
  let posture = 0;
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
    torso.rotation.x = isJeep ? -0.07 : -0.25 - posture * 0.35;
    torso.rotation.z = -lean * 0.45;
    head.position.set(center[0], center[1] + 0.355, center[2] - 0.105);
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
      const shoulder = [
        center[0] + side * 0.181,
        center[1] + 0.16,
        center[2] - 0.02,
      ];
      const grip = new THREE.Vector3(
        isJeep ? side * 0.18 : side * (kind === 'bike' ? 0.355 : 0.415),
        isJeep ? 0.065 : 0.035,
        isJeep ? 0 : 0.09,
      )
        .applyMatrix4(controls.matrix)
        .toArray();
      const elbow = [
        center[0] + side * (isJeep ? 0.23 : 0.29),
        center[1] - 0.075,
        center[2] - 0.18,
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
        isJeep ? 0.73 : kind === 'bike' ? 0.57 : 0.52,
        isJeep ? -0.36 : 0.15,
      ];
      setBeam(upperArm, shoulder, elbow);
      setBeam(forearm, elbow, grip);
      elbowJoint.position.set(...elbow);
      hand.position.set(...grip);
      hand.quaternion.copy(controls.quaternion);
      if (isJeep) hand.rotateZ(-side * 0.35);
      setBeam(thigh, [hips[0] + side * 0.105, hips[1] - 0.015, hips[2]], knee);
      setBeam(shin, knee, foot);
      kneePad.position.set(knee[0], knee[1], knee[2] - 0.042);
      const kneeDirection = new THREE.Vector3(...foot)
        .sub(new THREE.Vector3(...knee))
        .normalize();
      kneePad.quaternion.setFromUnitVectors(Y, kneeDirection);
      boot.position.set(...foot);
      boot.rotation.set(0, side * (isJeep ? 0.025 : 0.075), 0);
    }
  };
  return { group, head, torso, limbs, update };
}
