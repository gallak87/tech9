import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VEHICLES } from '../driving/VehicleMotion.js';

// Editable metre-scale models. Forward is -Z; wheel axles run along X.
const SPEC = {
  jeep: {
    wheelBase: 2.8,
    track: 1.65,
    radius: 0.43,
    width: 0.32,
    eye: [-0.46, 1.83, 0.5],
  },
  atv: {
    wheelBase: 1.55,
    track: 1.1,
    radius: 0.31,
    width: 0.26,
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

function material(color, roughness = 0.65, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function palette(kind) {
  return {
    paint: material(
      kind === 'jeep' ? 0xe2ad48 : kind === 'atv' ? 0x398e8b : 0xded5b7,
      0.34,
      0.28,
    ),
    accent: material(kind === 'bike' ? 0xb74630 : 0xdcd5b9, 0.42, 0.2),
    rubber: material(0x202326, 0.94),
    tread: material(0x303332, 0.97),
    black: material(0x283034, 0.6, 0.25),
    seat: material(0x34322d, 0.93),
    glove: material(0x202928, 0.91),
    boot: material(0x3d382a, 0.92),
    silver: material(0xaab4b4, 0.32, 0.83),
    steel: material(0x677477, 0.46, 0.68),
    dark: material(0x424944, 0.67, 0.35),
    spring: material(0xdba541, 0.43, 0.3),
    lamp: new THREE.MeshStandardMaterial({
      color: 0xffebbf,
      emissive: 0xffe1a0,
      emissiveIntensity: 0.3,
      roughness: 0.22,
    }),
    red: new THREE.MeshStandardMaterial({
      color: 0xb83928,
      emissive: 0x9d1406,
      emissiveIntensity: 0.08,
      roughness: 0.34,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x9abfc1,
      transparent: true,
      opacity: 0.15,
      roughness: 0.2,
      metalness: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    jacket: material(
      kind === 'jeep' ? 0xbfa578 : kind === 'atv' ? 0xb86d49 : 0xab996e,
      0.95,
    ),
    trousers: material(0x394d57, 0.95),
    skin: material(0xbd8a65, 0.95),
    helmet: material(kind === 'bike' ? 0xe7dfc6 : 0x4a5350, 0.5),
    visor: material(0x222e34, 0.23, 0.22),
  };
}

function mesh(
  parent,
  geometry,
  mat,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
) {
  const result = new THREE.Mesh(geometry, mat);
  result.position.set(...position);
  result.rotation.set(...rotation);
  result.castShadow = true;
  result.receiveShadow = true;
  parent.add(result);
  return result;
}
function box(parent, mat, dimensions, position, radius = 0, rotation) {
  const geo =
    radius > 0
      ? new RoundedBoxGeometry(...dimensions, 2, radius)
      : new THREE.BoxGeometry(...dimensions);
  return mesh(parent, geo, mat, position, rotation);
}
function cylinder(
  parent,
  mat,
  radius,
  length,
  position,
  rotation,
  segments = 14,
) {
  return mesh(
    parent,
    new THREE.CylinderGeometry(radius, radius, length, segments),
    mat,
    position,
    rotation,
  );
}
function ball(parent, mat, radius, position, scale) {
  const result = mesh(
    parent,
    new THREE.SphereGeometry(radius, 12, 9),
    mat,
    position,
  );
  if (scale) result.scale.set(...scale);
  return result;
}
function beam(parent, mat, start, end, radius = 0.03) {
  const result = cylinder(parent, mat, radius, 1);
  setBeam(result, start, end);
  return result;
}
function setBeam(result, start, end) {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  result.position.copy(a).add(b).multiplyScalar(0.5);
  const delta = b.sub(a);
  result.scale.y = delta.length();
  result.quaternion.setFromUnitVectors(Y, delta.normalize());
}
function ring(
  parent,
  mat,
  radius,
  thickness,
  position,
  rotation,
  radial = 8,
  tubular = 24,
) {
  return mesh(
    parent,
    new THREE.TorusGeometry(radius, thickness, radial, tubular),
    mat,
    position,
    rotation,
  );
}
function decal(parent, mat, text, position, scale = 1) {
  // Block lettering cut from primitive bars keeps labels editable and texture-free.
  const glyphs = {
    0: ['111', '101', '101', '101', '111'],
    1: ['010', '110', '010', '010', '111'],
    2: ['111', '001', '111', '100', '111'],
    3: ['111', '001', '111', '001', '111'],
    4: ['101', '101', '111', '001', '001'],
    5: ['111', '100', '111', '001', '111'],
    6: ['111', '100', '111', '101', '111'],
    7: ['111', '001', '010', '010', '010'],
    8: ['111', '101', '111', '101', '111'],
    9: ['111', '101', '111', '001', '111'],
  };
  const result = new THREE.Group();
  result.position.set(...position);
  parent.add(result);
  [...text].forEach((char, i) =>
    glyphs[char]?.forEach((line, row) =>
      [...line].forEach((pixel, col) => {
        if (pixel === '1')
          box(
            result,
            mat,
            [0.009, 0.028 * scale, 0.025 * scale],
            [
              0,
              (2 - row) * 0.03 * scale,
              (i * 4 + col - text.length * 2) * 0.03 * scale,
            ],
          );
      }),
    ),
  );
  batch(result);
  return result;
}

// Only direct static meshes are combined. Steering, wheels, suspension and rider
// stay as independently editable and animated transform groups.
function batch(group) {
  const byMaterial = new Map();
  for (const child of [...group.children]) {
    if (!child.isMesh || child.userData.dynamic) continue;
    child.updateMatrix();
    const transformed = child.geometry.index
      ? child.geometry.toNonIndexed()
      : child.geometry.clone();
    transformed.applyMatrix4(child.matrix);
    if (!byMaterial.has(child.material)) byMaterial.set(child.material, []);
    byMaterial.get(child.material).push(transformed);
    child.geometry.dispose();
    group.remove(child);
  }
  for (const [mat, geometries] of byMaterial) {
    const joined = mergeGeometries(geometries, false);
    geometries.forEach((geometry) => geometry.dispose());
    const combined = mesh(group, joined, mat);
    combined.castShadow = !mat.transparent;
  }
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
  const r = spec.radius;
  const tire = ring(
    spin,
    p.rubber,
    r * 0.76,
    r * 0.235,
    [0, 0, 0],
    [0, Math.PI / 2, 0],
    10,
    32,
  );
  tire.scale.z = spec.width / (r * 0.47);
  const blocks = bike ? 30 : 24;
  for (let i = 0; i < blocks; i++) {
    const angle = (i * Math.PI * 2) / blocks;
    for (const side of [-1, 1]) {
      box(
        spin,
        p.tread,
        [spec.width * 0.46, r * 0.19, r * 0.085],
        [
          side * spec.width * 0.245,
          Math.sin(angle) * r * 0.975,
          Math.cos(angle) * r * 0.975,
        ],
        0,
        [-angle, 0, side * 0.22],
      );
    }
  }
  for (const side of [-1, 1]) {
    const outer = side * spec.width * 0.37;
    ring(
      spin,
      p.silver,
      r * (bike ? 0.7 : 0.53),
      r * 0.035,
      [outer, 0, 0],
      [0, Math.PI / 2, 0],
    );
    cylinder(
      spin,
      p.dark,
      r * (bike ? 0.17 : 0.41),
      0.016,
      [outer, 0, 0],
      [0, 0, Math.PI / 2],
    );
    cylinder(
      spin,
      p.silver,
      r * 0.15,
      0.04,
      [outer + side * 0.014, 0, 0],
      [0, 0, Math.PI / 2],
    );
    for (let i = 0; i < (bike ? 14 : 6); i++) {
      const a = (i * Math.PI * 2) / (bike ? 14 : 6);
      beam(
        spin,
        p.silver,
        [outer, Math.sin(a) * r * 0.16, Math.cos(a) * r * 0.16],
        [
          outer,
          Math.sin(a + (bike ? 0.16 : 0)) * r * (bike ? 0.68 : 0.49),
          Math.cos(a + (bike ? 0.16 : 0)) * r * (bike ? 0.68 : 0.49),
        ],
        bike ? 0.007 : 0.019,
      );
    }
    if (!bike) {
      for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * 0.4;
        cylinder(
          spin,
          p.black,
          0.018,
          0.018,
          [outer + side * 0.03, Math.sin(a) * r * 0.25, Math.cos(a) * r * 0.25],
          [0, 0, Math.PI / 2],
          6,
        );
      }
    }
  }
  if (bike) {
    ring(
      spin,
      p.steel,
      r * 0.43,
      0.026,
      [-spec.width * 0.54, 0, 0],
      [0, Math.PI / 2, 0],
    );
    box(
      steering,
      p.black,
      [0.055, 0.12, 0.07],
      [-spec.width * 0.62, 0.06, -0.11],
      0.015,
    );
  }
  batch(spin);
  return { hub, steering, spin, x, z, front };
}

function jeepBody(body, p) {
  box(body, p.black, [1.52, 0.18, 3.57], [0, 0.51, 0.02], 0.06);
  box(body, p.paint, [1.66, 0.37, 1.85], [0, 0.92, 0.69], 0.05);
  box(body, p.paint, [1.45, 0.21, 1.45], [0, 1.22, -1.07], 0.035);
  box(body, p.paint, [1.58, 0.6, 0.12], [0, 0.98, -1.8], 0.025);
  box(body, p.black, [1.98, 0.17, 0.2], [0, 0.65, -1.98], 0.03);
  box(body, p.black, [1.98, 0.15, 0.18], [0, 0.65, 1.75], 0.025);
  for (const side of [-1, 1]) {
    // Door cutouts, sill, riveted side panels and wide separate wheel arches.
    box(body, p.paint, [0.11, 0.28, 1.15], [side * 0.79, 1.15, 0.92], 0.028);
    box(body, p.paint, [0.1, 0.19, 1.4], [side * 0.79, 0.94, -0.11], 0.026);
    box(body, p.black, [0.27, 0.07, 1.31], [side * 0.88, 0.65, 0.06], 0.025);
    for (const z of [-1.4, 1.4]) {
      box(body, p.black, [0.48, 0.12, 1.1], [side * 0.83, 1.0, z], 0.045);
      box(body, p.paint, [0.42, 0.095, 0.95], [side * 0.83, 1.08, z], 0.035);
      box(
        body,
        p.black,
        [0.42, 0.29, 0.1],
        [side * 0.83, 0.87, z + 0.53],
        0.015,
      );
    }
    box(body, p.paint, [0.1, 0.29, 0.24], [side * 0.78, 1.17, -0.59], 0.025);
    // Roll cage and the angled windshield frame.
    beam(
      body,
      p.black,
      [side * 0.74, 1.02, 0.84],
      [side * 0.74, 2.1, 0.86],
      0.046,
    );
    const roofRail = beam(
      body,
      p.black,
      [side * 0.74, 2.1, 0.86],
      [side * 0.72, 2.02, -0.36],
      0.033,
    );
    roofRail.userData.dynamic = true;
    roofRail.userData.hideInDriverView = true;
    beam(
      body,
      p.black,
      [side * 0.74, 2.07, 0.86],
      [side * 0.76, 1.1, 1.48],
      0.041,
    );
    beam(
      body,
      p.paint,
      [side * 0.72, 1.29, -0.65],
      [side * 0.72, 2.02, -0.36],
      0.041,
    );
    beam(
      body,
      p.steel,
      [side * 0.73, 1.47, -0.52],
      [side * 0.99, 1.5, -0.56],
      0.022,
    );
    box(body, p.black, [0.06, 0.19, 0.15], [side * 1.0, 1.53, -0.56], 0.025);
    box(
      body,
      p.silver,
      [0.005, 0.145, 0.11],
      [side * 1.034, 1.53, -0.56],
      0.015,
    );
    cylinder(
      body,
      p.black,
      0.145,
      0.035,
      [side * 0.57, 1.1, -1.881],
      [Math.PI / 2, 0, 0],
      24,
    );
    cylinder(
      body,
      p.lamp,
      0.117,
      0.042,
      [side * 0.57, 1.1, -1.903],
      [Math.PI / 2, 0, 0],
      24,
    );
    box(body, p.red, [0.16, 0.14, 0.025], [side * 0.68, 1.02, 1.63], 0.015);
    beam(
      body,
      p.steel,
      [side * 0.62, 0.72, -2.03],
      [side * 0.62, 0.88, -2.03],
      0.024,
    );
    for (let z = 0.48; z <= 1.55; z += 0.25)
      ball(body, p.steel, 0.016, [side * 0.853, 1.21, z]);
    box(body, p.black, [0.13, 0.035, 0.24], [side * 0.6, 1.339, -0.76], 0.01);
  }
  for (let i = -3; i <= 3; i++)
    box(body, p.black, [0.068, 0.31, 0.025], [i * 0.122, 1.04, -1.879], 0.025);
  beam(body, p.paint, [-0.74, 2.02, -0.36], [0.74, 2.02, -0.36], 0.038);
  beam(body, p.black, [-0.75, 2.1, 0.86], [0.75, 2.1, 0.86], 0.044);
  const glass = box(
    body,
    p.glass,
    [1.36, 0.69, 0.012],
    [0, 1.65, -0.5],
    0,
    [0.38, 0, 0],
  );
  glass.castShadow = false;
  beam(body, p.black, [0, 1.32, -0.65], [0, 2.0, -0.38], 0.018);
  for (const x of [-0.35, 0.35])
    beam(body, p.black, [x, 1.34, -0.67], [x + 0.18, 1.65, -0.54], 0.008);
  box(body, p.black, [1.43, 0.22, 0.24], [0, 1.24, -0.58], 0.035);
  for (const x of [-0.56, -0.37, -0.16]) {
    cylinder(
      body,
      p.silver,
      x === -0.37 ? 0.085 : 0.055,
      0.014,
      [x, 1.28, -0.444],
      [Math.PI / 2, 0, 0],
    );
    cylinder(
      body,
      p.visor,
      x === -0.37 ? 0.071 : 0.043,
      0.018,
      [x, 1.28, -0.437],
      [Math.PI / 2, 0, 0],
    );
  }
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * 0.22 + (i * Math.PI * 1.45) / 8;
    const cx = -0.37,
      cy = 1.28;
    beam(
      body,
      p.accent,
      [cx + Math.cos(a) * 0.05, cy + Math.sin(a) * 0.05, -0.424],
      [cx + Math.cos(a) * 0.061, cy + Math.sin(a) * 0.061, -0.424],
      0.0025,
    );
  }
  beam(body, p.red, [-0.37, 1.28, -0.419], [-0.395, 1.318, -0.419], 0.003);
  for (const x of [-0.44, 0.44]) {
    box(body, p.seat, [0.61, 0.15, 0.6], [x, 0.98, 0.29], 0.06);
    box(body, p.seat, [0.6, 0.69, 0.15], [x, 1.27, 0.59], 0.055, [-0.1, 0, 0]);
    box(body, p.black, [0.31, 0.24, 0.12], [x, 1.69, 0.65], 0.035);
  }
  box(body, p.seat, [1.39, 0.14, 0.54], [0, 1.17, 1.25], 0.05);
  box(body, p.seat, [1.36, 0.41, 0.12], [0, 1.41, 1.52], 0.04);
  box(body, p.black, [0.19, 0.16, 0.6], [0, 1.04, 0.01], 0.025);
  beam(body, p.steel, [0.08, 1.1, 0.05], [0.08, 1.34, -0.02], 0.015);
  ball(body, p.black, 0.04, [0.08, 1.35, -0.02]);
  // Rear-mounted full-size spare and expedition pack.
  const spare = new THREE.Group();
  body.add(spare);
  spare.position.set(0, 1.27, 1.85);
  spare.rotation.y = Math.PI / 2;
  const spareWheel = wheel(spare, SPEC.jeep, p, 0, 0, false, false);
  spareWheel.hub.position.y = 0;
  box(body, p.dark, [0.34, 0.5, 0.19], [0.59, 1.14, 1.79], 0.04);
  box(body, p.accent, [0.31, 0.055, 0.22], [0.59, 1.19, 1.79], 0.005);
  decal(body, p.black, '01', [-0.853, 1.18, 0.89], 1.4);
}

function atvBody(body, p) {
  box(body, p.black, [0.56, 0.18, 1.6], [0, 0.4, 0.02], 0.06);
  for (const side of [-1, 1]) {
    beam(
      body,
      p.black,
      [side * 0.3, 0.4, 0.75],
      [side * 0.3, 0.78, -0.65],
      0.042,
    );
    beam(
      body,
      p.black,
      [side * 0.3, 0.4, -0.65],
      [side * 0.3, 0.8, 0.55],
      0.035,
    );
    box(body, p.black, [0.29, 0.08, 0.53], [side * 0.48, 0.42, 0.07], 0.04);
    for (const z of [-0.78, 0.78]) {
      box(body, p.paint, [0.57, 0.12, 0.72], [side * 0.39, 0.74, z], 0.08);
      box(
        body,
        p.black,
        [0.61, 0.065, 0.73],
        [side * 0.39, 0.68, z + 0.005],
        0.065,
      );
      beam(
        body,
        p.black,
        [side * 0.56, 0.8, z - 0.3],
        [side * 0.56, 0.8, z + 0.3],
        0.021,
      );
    }
    box(body, p.lamp, [0.24, 0.105, 0.045], [side * 0.29, 0.82, -1.07], 0.025, [
      0,
      -side * 0.18,
      0,
    ]);
    box(body, p.red, [0.17, 0.07, 0.034], [side * 0.39, 0.77, 1.08], 0.018);
    cylinder(
      body,
      p.steel,
      0.055,
      0.48,
      [side * 0.29, 0.53, 0.76],
      [Math.PI / 2, 0, 0],
    );
    for (let z = -0.12; z < 0.32; z += 0.1)
      box(body, p.steel, [0.21, 0.018, 0.021], [side * 0.47, 0.469, z]);
  }
  box(body, p.paint, [0.52, 0.35, 0.8], [0, 0.75, -0.27], 0.11, [-0.12, 0, 0]);
  box(body, p.paint, [0.56, 0.22, 0.64], [0, 0.75, 0.56], 0.07);
  box(body, p.seat, [0.36, 0.14, 0.76], [0, 0.93, 0.32], 0.06);
  box(body, p.black, [0.5, 0.24, 0.13], [0, 0.78, -1.02], 0.035);
  beam(body, p.black, [-0.59, 0.56, -1.16], [0.59, 0.56, -1.16], 0.033);
  for (const x of [-0.44, 0.44])
    beam(body, p.black, [x, 0.55, -1.16], [x, 0.79, -1.02], 0.031);
  for (const z of [-0.9, -0.68, 0.76, 0.96]) {
    beam(body, p.black, [-0.57, 0.81, z], [0.57, 0.81, z], 0.019);
  }
  box(body, p.steel, [0.42, 0.31, 0.4], [0, 0.5, 0.13], 0.065);
  for (let y = 0.43; y < 0.63; y += 0.045)
    box(body, p.dark, [0.45, 0.016, 0.35], [0, y, 0.09], 0.009);
  decal(body, p.accent, '02', [-0.293, 0.79, -0.17], 1.1);
}

function bikeBody(body, p) {
  for (const side of [-1, 1]) {
    const x = side * 0.12;
    beam(body, p.accent, [x, 0.43, 0.25], [x, 1.03, -0.44], 0.038);
    beam(body, p.accent, [x, 1.03, -0.44], [x, 0.93, 0.59], 0.035);
    beam(body, p.accent, [x, 0.93, 0.59], [x, 0.43, 0.25], 0.028);
    beam(
      body,
      p.dark,
      [side * 0.18, 0.5, 0.1],
      [side * 0.18, 0.35, 0.74],
      0.041,
    );
    box(body, p.accent, [0.065, 0.27, 0.39], [side * 0.17, 0.91, 0.37], 0.035, [
      0.1,
      0,
      side * 0.16,
    ]);
    box(body, p.black, [0.15, 0.05, 0.1], [side * 0.235, 0.48, 0.16], 0.01);
    beam(
      body,
      p.silver,
      [side * 0.115, 0.66, -0.69],
      [side * 0.115, 1.14, -0.53],
      0.032,
    );
  }
  box(body, p.paint, [0.36, 0.32, 0.56], [0, 1.0, -0.18], 0.075, [-0.13, 0, 0]);
  box(body, p.seat, [0.28, 0.105, 0.81], [0, 1.125, 0.3], 0.04, [-0.06, 0, 0]);
  box(
    body,
    p.accent,
    [0.3, 0.064, 0.59],
    [0, 1.14, 0.76],
    0.035,
    [-0.18, 0, 0],
  );
  box(body, p.red, [0.18, 0.056, 0.035], [0, 1.1, 1.06], 0.01);
  box(body, p.paint, [0.25, 0.06, 0.7], [0, 0.91, -0.87], 0.035, [0.1, 0, 0]);
  box(body, p.paint, [0.31, 0.27, 0.1], [0, 1.18, -0.65], 0.035, [0.13, 0, 0]);
  box(
    body,
    p.lamp,
    [0.19, 0.11, 0.027],
    [0, 1.21, -0.709],
    0.027,
    [0.13, 0, 0],
  );
  cylinder(body, p.black, 0.039, 0.025, [0, 1.188, -0.28]);
  cylinder(body, p.steel, 0.16, 0.28, [0, 0.57, 0.14], [0, 0, Math.PI / 2], 18);
  box(
    body,
    p.steel,
    [0.28, 0.24, 0.22],
    [0, 0.74, -0.08],
    0.027,
    [-0.16, 0, 0],
  );
  for (let y = 0.65; y <= 0.84; y += 0.035)
    box(body, p.dark, [0.33, 0.012, 0.26], [0, y, -0.08], 0.005, [-0.16, 0, 0]);
  beam(body, p.steel, [0.17, 0.69, -0.16], [0.26, 0.58, -0.38], 0.031);
  beam(body, p.steel, [0.26, 0.58, -0.38], [0.25, 0.8, 0.55], 0.034);
  cylinder(
    body,
    p.silver,
    0.085,
    0.44,
    [0.25, 0.88, 0.61],
    [Math.PI / 2 - 0.2, 0, 0],
    16,
  );
  cylinder(
    body,
    p.black,
    0.042,
    0.08,
    [0.25, 0.93, 0.84],
    [Math.PI / 2 - 0.2, 0, 0],
    12,
  );
  beam(body, p.black, [-0.21, 0.39, 0.12], [-0.21, 0.43, 0.74], 0.014);
  beam(body, p.black, [-0.21, 0.39, 0.12], [-0.21, 0.27, 0.74], 0.014);
  decal(body, p.black, '03', [-0.211, 0.94, 0.37], 1.1);
}

function steeringControl(parent, kind, p) {
  const group = new THREE.Group();
  group.name = 'driver-controls';
  parent.add(group);
  if (kind === 'jeep') {
    group.position.set(-0.46, 1.35, -0.15);
    group.rotation.x = -0.48;
    ring(group, p.black, 0.2, 0.023, [0, 0, 0]);
    cylinder(group, p.dark, 0.06, 0.048, [0, 0, 0], [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      beam(
        group,
        p.steel,
        [0, 0, 0],
        [Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0],
        0.013,
      );
    }
  } else {
    group.position.set(0, kind === 'bike' ? 1.3 : 1.21, -0.5);
    const w = kind === 'bike' ? 0.4 : 0.46;
    beam(group, p.silver, [-w, 0.035, 0.09], [-0.2, 0, 0], 0.019);
    beam(group, p.silver, [-0.2, 0, 0], [0.2, 0, 0], 0.019);
    beam(group, p.silver, [0.2, 0, 0], [w, 0.035, 0.09], 0.019);
    for (const side of [-1, 1]) {
      cylinder(
        group,
        p.rubber,
        0.027,
        0.13,
        [side * (w - 0.045), 0.035, 0.09],
        [0, 0, Math.PI / 2],
      );
      beam(
        group,
        p.silver,
        [side * (w - 0.11), 0.035, 0.035],
        [side * w, 0.035, -0.004],
        0.009,
      );
      box(
        group,
        p.black,
        [0.07, 0.064, 0.07],
        [side * (w - 0.12), 0.035, 0.09],
        0.015,
      );
    }
    box(
      group,
      p.black,
      [0.14, 0.095, 0.09],
      [0, 0.04, -0.03],
      0.015,
      [-0.4, 0, 0],
    );
    box(
      group,
      p.glass,
      [0.09, 0.064, 0.008],
      [0, 0.06, 0.018],
      0,
      [-0.4, 0, 0],
    );
    beam(
      parent,
      p.black,
      [0, 0.8, -0.39],
      [0, kind === 'bike' ? 1.3 : 1.21, -0.5],
      0.034,
    );
  }
  if (kind !== 'jeep' && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 144;
    const context = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const screenMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      toneMapped: false,
    });
    const screen = mesh(
      group,
      new THREE.PlaneGeometry(0.096, 0.061),
      screenMaterial,
      [0, 0.062, 0.025],
      [-0.4, 0, 0],
    );
    screen.castShadow = false;
    screen.userData.dynamic = true;
    let lastSpeed = -1;
    group.userData.instrument = {
      dispose() {
        texture.dispose();
        screenMaterial.dispose();
      },
      update(speed) {
        const kmh = Math.round(Math.abs(speed || 0) * 3.6);
        if (kmh === lastSpeed) return;
        lastSpeed = kmh;
        context.fillStyle = '#142b29';
        context.fillRect(0, 0, 256, 144);
        context.strokeStyle = '#81a893';
        context.lineWidth = 4;
        context.strokeRect(5, 5, 246, 134);
        context.fillStyle = '#e5ebce';
        context.textAlign = 'center';
        context.font = 'bold 84px monospace';
        context.fillText(String(kmh).padStart(2, '0'), 128, 93);
        context.fillStyle = '#95b69d';
        context.font = '22px monospace';
        context.fillText('KM/H', 128, 125);
        texture.needsUpdate = true;
      },
    };
    group.userData.instrument.update(0);
  }
  batch(group);
  return group;
}

function rider(parent, kind, p) {
  const group = new THREE.Group();
  group.name = 'attached-rider';
  parent.add(group);
  const isJeep = kind === 'jeep';
  const hip = isJeep
    ? [-0.44, 1.14, 0.27]
    : kind === 'bike'
      ? [0, 1.23, 0.31]
      : [0, 1.06, 0.32];
  const torso = new THREE.Group();
  group.add(torso);
  box(torso, p.jacket, [isJeep ? 0.42 : 0.39, 0.46, 0.23], [0, 0, 0], 0.075);
  box(torso, p.dark, [0.29, 0.34, 0.04], [0, 0.015, 0.128], 0.04);
  beam(torso, p.accent, [-0.15, 0.18, -0.125], [-0.15, -0.16, -0.125], 0.019);
  beam(torso, p.accent, [0.15, 0.18, -0.125], [0.15, -0.16, -0.125], 0.019);
  const head = new THREE.Group();
  head.name = 'head-hidden-in-driver-view';
  group.add(head);
  ball(head, p.skin, 0.105, [0, -0.03, -0.016], [0.88, 1.1, 0.92]);
  ball(head, p.helmet, 0.14, [0, 0.043, 0], [1, 1.02, 1.08]);
  box(head, p.visor, [0.215, 0.074, 0.085], [0, 0.02, -0.112], 0.028);
  box(
    head,
    p.helmet,
    [0.28, 0.024, 0.23],
    [0, 0.12, -0.085],
    0.027,
    [0.1, 0, 0],
  );
  if (!isJeep) {
    box(head, p.helmet, [0.17, 0.07, 0.1], [0, -0.063, -0.09], 0.025);
    box(head, p.black, [0.11, 0.017, 0.025], [0, -0.063, -0.145], 0.004);
  }
  batch(torso);
  batch(head);
  const limbs = [];
  for (const side of [-1, 1]) {
    const upperArm = beam(group, p.jacket, [0, 0, 0], [0, 1, 0], 0.07);
    const forearm = beam(group, p.jacket, [0, 0, 0], [0, 1, 0], 0.056);
    const hand = ball(group, p.glove, 0.055, [0, 0, 0], [1, 1, 1.2]);
    const thigh = beam(group, p.trousers, [0, 0, 0], [0, 1, 0], 0.082);
    const shin = beam(group, p.trousers, [0, 0, 0], [0, 1, 0], 0.065);
    const boot = box(group, p.boot, [0.13, 0.14, 0.25], [0, 0, 0], 0.035);
    limbs.push({ side, upperArm, forearm, hand, thigh, shin, boot });
  }
  let posture = 0;
  const update = (snapshot, dt, controls) => {
    const desired = isJeep
      ? 0
      : clamp(
          (snapshot.airborne ? 0.17 : 0) +
            Math.abs(snapshot.pitch || 0) * 0.17 +
            (snapshot.surface?.kind === 'rock' ||
            snapshot.surface?.kind === 'rough' ||
            snapshot.surface?.kind === 'rocky'
              ? 0.075
              : 0),
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
    head.position.set(center[0], center[1] + 0.36, center[2] - 0.1);
    head.rotation.y = -(snapshot.steer || 0) * 0.16;
    controls.updateMatrix();
    for (const { side, upperArm, forearm, hand, thigh, shin, boot } of limbs) {
      const shoulder = [
        center[0] + side * 0.19,
        center[1] + 0.16,
        center[2] - 0.02,
      ];
      const elbow = [
        center[0] + side * (isJeep ? 0.24 : 0.31),
        center[1] - 0.1,
        center[2] - 0.17,
      ];
      const grip = new THREE.Vector3(
        isJeep ? side * 0.18 : side * (kind === 'bike' ? 0.355 : 0.415),
        isJeep ? 0.065 : 0.035,
        isJeep ? 0 : 0.09,
      )
        .applyMatrix4(controls.matrix)
        .toArray();
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
      hand.position.set(...grip);
      setBeam(thigh, [hips[0] + side * 0.1, hips[1], hips[2]], knee);
      setBeam(shin, knee, foot);
      boot.position.set(foot[0], foot[1] - 0.06, foot[2] - 0.075);
    }
  };
  return { group, head, torso, limbs, update };
}

function suspension(parent, wheelData, kind, p) {
  const { x, z } = wheelData;
  const isBike = kind === 'bike';
  const anchor = isBike
    ? [0.11, wheelData.front ? 0.82 : 0.85, wheelData.front ? z + 0.17 : 0.28]
    : [x * 0.54, kind === 'jeep' ? 0.77 : 0.65, z];
  const spring = beam(
    parent,
    p.spring,
    anchor,
    [x, 0.4, z],
    isBike ? 0.038 : 0.043,
  );
  const piston = beam(
    parent,
    p.silver,
    anchor,
    [x, 0.4, z],
    isBike ? 0.023 : 0.024,
  );
  const arm = beam(parent, p.dark, [x * 0.28, 0.43, z], [x, 0.43, z], 0.026);
  for (const part of [spring, piston, arm]) part.userData.dynamic = true;
  return (low) => {
    const mid = anchor.map((value, index) => value * 0.4 + low[index] * 0.6);
    setBeam(spring, anchor, mid);
    setBeam(piston, mid, low);
    if (isBike) setBeam(arm, [x, 0.5, 0.1], low);
    else setBeam(arm, [x * 0.27, 0.43, z], low);
  };
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
  batch(body);
  const controls = steeringControl(group, kind, p);
  const person = rider(group, kind, p);
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
    controls.userData.instrument?.dispose();
    const geometries = new Set();
    group.traverse((object) => {
      if (object.isMesh) geometries.add(object.geometry);
    });
    geometries.forEach((geometry) => geometry.dispose());
    Object.values(p).forEach((mat) => mat.dispose());
    group.removeFromParent();
    group.clear();
  }
  update({ x: 0, y: 0, z: 0, speed: 0 }, 0);
  return { group, update, mountedPose, setDriverView, dispose };
}
