import * as THREE from 'three';

// All geometry and surface detail in this file is authored for Pinewatch.
// Actor transforms belong to the caller; animation lives one level below them.
const UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;

function materialsFor(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) {
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value?.isTexture) textures.add(value);
        }
      }
    }
  });
  root.removeFromParent();
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

function surfaceTexture(kind) {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  let seed = 8351;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = seed / 4294967296;
      const grain = Math.sin(x * 0.64 + Math.sin(y * 0.046) * 2.2);
      const value =
        kind === 'wood'
          ? 162 + grain * 35 + noise * 27
          : 185 + noise * 54 + Math.sin(x * 2.5 + y * 0.15) * 14;
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.repeat.set(kind === 'wood' ? 2 : 3, kind === 'wood' ? 1 : 3);
  texture.needsUpdate = true;
  return texture;
}

function ellipsoid(parent, material, position, scale, name = '') {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function taperedBone(parent, material, a, b, r1, r2, sides = 10) {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(r2, r1, direction.length(), sides, 1),
    material,
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// Smooth cross-section lofts keep muscles, neck and muzzle in a continuous skin.
// Rings contain [axis coordinate, center offset, first radius, second radius].
function organicLoft(material, rings, axis = 'x', shadeMode = 'body') {
  const ordered = [...rings].sort((a, b) => a[0] - b[0]);
  const centers = new THREE.CatmullRomCurve3(
    ordered.map(([along, center]) => new THREE.Vector3(along, center, 0)),
    false,
    'centripetal',
  );
  const radii = new THREE.CatmullRomCurve3(
    ordered.map(([along, , a, b]) => new THREE.Vector3(along, a, b)),
    false,
    'centripetal',
  );
  const steps = (ordered.length - 1) * 5;
  const sides = 24;
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const center = centers.getPoint(t);
    const radius = radii.getPoint(t);
    const a = Math.max(0.001, radius.y);
    const b = Math.max(0.001, radius.z);
    for (let j = 0; j <= sides; j++) {
      const angle = (j / sides) * Math.PI * 2;
      const vertical = Math.sin(angle);
      const front = Math.cos(angle);
      if (axis === 'x')
        positions.push(center.x, center.y + vertical * a, front * b);
      else positions.push(center.y + front * a, center.x, vertical * b);
      let shade = 0.97 - Math.max(vertical, 0) * 0.055;
      if (shadeMode === 'body') shade += Math.sin(t * 6.2) * 0.02;
      if (shadeMode === 'neck')
        shade += Math.max(front, 0) ** 3 * Math.sin(t * Math.PI) * 0.15;
      if (shadeMode === 'leg') shade = 0.89 + t * 0.08;
      colors.push(shade, shade * 0.985, shade * 0.96);
      uvs.push(j / sides, t * 2.5);
      if (i < steps && j < sides) {
        const aIndex = i * (sides + 1) + j;
        const bIndex = aIndex + sides + 1;
        indices.push(
          aIndex,
          bIndex,
          aIndex + 1,
          bIndex,
          bIndex + 1,
          aIndex + 1,
        );
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function bodyMesh(material) {
  const mesh = organicLoft(material, [
    [-0.84, 1.09, 0.007, 0.007],
    [-0.76, 1.07, 0.2, 0.145],
    [-0.62, 1.065, 0.28, 0.235],
    [-0.43, 1.08, 0.26, 0.23],
    [-0.23, 1.105, 0.24, 0.207],
    [-0.03, 1.1, 0.275, 0.216],
    [0.18, 1.09, 0.327, 0.22],
    [0.34, 1.115, 0.327, 0.204],
    [0.48, 1.155, 0.263, 0.165],
    [0.57, 1.205, 0.17, 0.108],
    [0.64, 1.235, 0.065, 0.048],
  ]);
  mesh.name = 'deer-vitals';
  return mesh;
}

function branch(parent, material, points, radius) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((point) => new THREE.Vector3(...point)),
  );
  const frames = curve.computeFrenetFrames(18, false);
  const positions = [];
  const indices = [];
  for (let i = 0; i <= 18; i++) {
    const center = curve.getPointAt(i / 18);
    const r = radius * (1 - i / 18) ** 0.8 + 0.001;
    for (let j = 0; j <= 7; j++) {
      const angle = (j / 7) * Math.PI * 2;
      const vertex = center
        .clone()
        .addScaledVector(frames.normals[i], Math.cos(angle) * r)
        .addScaledVector(frames.binormals[i], Math.sin(angle) * r);
      positions.push(vertex.x, vertex.y, vertex.z);
      if (i < 18 && j < 7) {
        const a = i * 8 + j;
        indices.push(a, a + 1, a + 8, a + 8, a + 1, a + 9);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

export function createDeer() {
  const group = new THREE.Group();
  group.name = 'woodland-buck';
  const collapsePivot = new THREE.Group();
  collapsePivot.position.y = 1.05;
  group.add(collapsePivot);
  const rig = new THREE.Group();
  rig.position.y = -1.05;
  collapsePivot.add(rig);
  const fur = surfaceTexture('fur');
  const coat = new THREE.MeshPhysicalMaterial({
    color: '#a98a65',
    roughness: 0.96,
    sheen: 0.65,
    sheenColor: '#b9a582',
    sheenRoughness: 0.9,
    emissive: '#554934',
    emissiveIntensity: 0.045,
    bumpMap: fur,
    bumpScale: 0.007,
  });
  const bodyCoat = coat.clone();
  bodyCoat.vertexColors = true;
  const cream = coat.clone();
  cream.color.set('#c3b496');
  const earInner = new THREE.MeshStandardMaterial({
    color: '#837565',
    roughness: 1,
  });
  const horn = new THREE.MeshStandardMaterial({
    color: '#b7aa86',
    roughness: 0.74,
    bumpMap: fur,
    bumpScale: 0.013,
  });
  const hoof = new THREE.MeshStandardMaterial({
    color: '#383329',
    roughness: 0.68,
  });
  const noseMaterial = new THREE.MeshStandardMaterial({
    color: '#28261f',
    roughness: 0.45,
  });
  const eyeMaterial = new THREE.MeshStandardMaterial({
    color: '#100d08',
    roughness: 0.12,
  });

  const body = bodyMesh(bodyCoat);
  rig.add(body);
  const tail = new THREE.Group();
  tail.position.set(-0.77, 1.16, 0);
  tail.rotation.z = -0.4;
  rig.add(tail);
  ellipsoid(tail, coat, [-0.04, -0.07, 0], [0.07, 0.16, 0.065]);
  ellipsoid(tail, cream, [-0.074, -0.083, 0], [0.043, 0.125, 0.047]);

  const neckPivot = new THREE.Group();
  neckPivot.position.set(0.43, 1.22, 0);
  rig.add(neckPivot);
  const neck = organicLoft(
    bodyCoat,
    [
      [-0.23, -0.035, 0.16, 0.151],
      [-0.1, 0.005, 0.172, 0.158],
      [0.065, 0.076, 0.159, 0.147],
      [0.23, 0.157, 0.128, 0.118],
      [0.355, 0.233, 0.1, 0.095],
      [0.44, 0.271, 0.059, 0.074],
    ],
    'y',
    'neck',
  );
  neck.name = 'deer-neck';
  neckPivot.add(neck);
  const headRig = new THREE.Group();
  headRig.position.set(0.25, 0.405, 0);
  neckPivot.add(headRig);
  const skull = organicLoft(
    bodyCoat,
    [
      [-0.093, 0.005, 0.025, 0.03],
      [-0.025, 0.003, 0.093, 0.089],
      [0.077, -0.002, 0.105, 0.102],
      [0.165, -0.022, 0.082, 0.081],
      [0.255, -0.049, 0.057, 0.067],
      [0.365, -0.066, 0.035, 0.056],
      [0.399, -0.064, 0.024, 0.047],
    ],
    'x',
    'head',
  );
  skull.name = 'deer-head';
  headRig.add(skull);
  ellipsoid(headRig, noseMaterial, [0.392, -0.064, 0], [0.031, 0.031, 0.055]);
  const ears = [];
  for (const sign of [-1, 1]) {
    ellipsoid(
      headRig,
      cream,
      [0.08, 0.025, sign * 0.096],
      [0.035, 0.031, 0.011],
    );
    ellipsoid(
      headRig,
      eyeMaterial,
      [0.093, 0.025, sign * 0.105],
      [0.02, 0.016, 0.009],
    );
    // The teardrop ears are thin in X; their inset picks up soft side light.
    const ear = new THREE.Group();
    ear.position.set(-0.032, 0.073, sign * 0.087);
    ear.rotation.x = sign * 0.61;
    ear.rotation.z = 0.38;
    headRig.add(ear);
    ellipsoid(ear, coat, [0, 0.12, 0], [0.042, 0.155, 0.065]);
    ellipsoid(ear, earInner, [0.032, 0.122, 0], [0.012, 0.125, 0.047]);
    ears.push(ear);
    const mirror = (points) => points.map(([x, y, z]) => [x, y, z * sign]);
    branch(
      headRig,
      horn,
      mirror([
        [-0.025, 0.103, 0.052],
        [-0.09, 0.23, 0.1],
        [-0.19, 0.36, 0.19],
        [-0.23, 0.49, 0.28],
        [-0.13, 0.59, 0.325],
        [0.025, 0.64, 0.3],
      ]),
      0.031,
    );
    branch(
      headRig,
      horn,
      mirror([
        [-0.075, 0.235, 0.101],
        [0.035, 0.32, 0.13],
        [0.075, 0.43, 0.14],
      ]),
      0.022,
    );
    branch(
      headRig,
      horn,
      mirror([
        [-0.181, 0.356, 0.187],
        [-0.15, 0.515, 0.17],
        [-0.12, 0.645, 0.165],
      ]),
      0.021,
    );
    branch(
      headRig,
      horn,
      mirror([
        [-0.218, 0.483, 0.27],
        [-0.265, 0.605, 0.245],
        [-0.235, 0.728, 0.225],
      ]),
      0.019,
    );
    ellipsoid(
      headRig,
      horn,
      [-0.033, 0.119, sign * 0.06],
      [0.043, 0.034, 0.04],
    );
  }

  const legs = [];
  for (const rear of [false, true]) {
    for (const sign of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(rear ? -0.56 : 0.4, 1.04, sign * 0.155);
      rig.add(leg);
      const kneeX = rear ? 0.12 : -0.025;
      const hockX = rear ? -0.065 : -0.012;
      const upperLeg = organicLoft(
        bodyCoat,
        rear
          ? [
              [-0.425, kneeX, 0.032, 0.031],
              [-0.33, 0.114, 0.054, 0.043],
              [-0.18, 0.063, 0.096, 0.071],
              [0.015, -0.008, 0.125, 0.092],
              [0.13, -0.033, 0.09, 0.073],
            ]
          : [
              [-0.425, kneeX, 0.027, 0.027],
              [-0.3, -0.018, 0.035, 0.032],
              [-0.15, -0.012, 0.061, 0.049],
              [0.015, -0.011, 0.083, 0.065],
              [0.15, -0.035, 0.058, 0.051],
            ],
        'y',
        'leg',
      );
      leg.add(upperLeg);
      const lower = new THREE.Group();
      lower.position.set(kneeX, -0.39, 0);
      leg.add(lower);
      const lowerLeg = organicLoft(
        bodyCoat,
        [
          [-0.58, hockX - kneeX + 0.025, 0.018, 0.019],
          [-0.47, hockX - kneeX + 0.018, 0.019, 0.017],
          [-0.3, hockX - kneeX, 0.022, 0.023],
          [-0.255, hockX - kneeX, 0.029, 0.026],
          [-0.17, (hockX - kneeX) * 0.68, 0.025, 0.025],
          [0.0, 0, 0.034, 0.03],
          [0.025, 0, 0.029, 0.027],
        ],
        'y',
        'leg',
      );
      lower.add(lowerLeg);
      const foot = ellipsoid(
        lower,
        hoof,
        [hockX - kneeX + 0.055, -0.615, 0],
        [0.07, 0.046, 0.038],
      );
      // A fine dark cleft reads as a cloven hoof when the animal is close.
      taperedBone(
        lower,
        noseMaterial,
        [hockX - kneeX + 0.114, -0.631, 0],
        [hockX - kneeX + 0.109, -0.604, 0],
        0.0025,
        0.0025,
        5,
      );
      legs.push({ upper: leg, lower, foot, rear, sign });
    }
  }
  let collapse = 0;
  return {
    group,
    hitMeshes: [body, neck, skull],
    animate({
      time = 0,
      speed = 0,
      alert = false,
      down = false,
      dt = 1 / 60,
    } = {}) {
      collapse = THREE.MathUtils.damp(
        collapse,
        down ? 1 : 0,
        down ? 5 : 12,
        dt,
      );
      const stride = Math.min(Math.abs(speed) / 2, 1);
      const phase = time * (Math.abs(speed) > 2 ? 10 : 5.4);
      collapsePivot.position.y =
        1.05 + Math.sin(phase * 2) * stride * 0.028 - collapse * 0.73;
      collapsePivot.rotation.x = collapse * 1.48;
      rig.rotation.z = Math.sin(time * 1.8) * 0.006 * (1 - collapse);
      neckPivot.rotation.z = down
        ? -collapse * 0.35
        : (alert ? -0.07 : 0.08) + Math.sin(time * 1.3) * 0.025;
      headRig.rotation.y = down
        ? 0
        : Math.sin(time * 0.42) * (alert ? 0.11 : 0.055);
      headRig.rotation.z = Math.sin(time * 0.84) * 0.035 * (1 - collapse);
      tail.rotation.z = -0.4 + (alert ? 0.8 : 0) + Math.sin(time * 2.1) * 0.045;
      ears.forEach((ear, index) => {
        ear.rotation.y = Math.sin(time * 1.4 + index * 2.3) * 0.14;
      });
      legs.forEach(({ upper, lower, rear, sign }) => {
        const offset = (rear ? Math.PI : 0) + (sign < 0 ? Math.PI : 0);
        upper.rotation.z =
          Math.sin(phase + offset) * 0.48 * stride +
          collapse * (rear ? 0.48 : -0.32);
        lower.rotation.z =
          Math.max(0, Math.cos(phase + offset)) * 0.5 * stride + collapse * 0.7;
      });
    },
    dispose() {
      materialsFor(group);
    },
  };
}

// Flat, laminated limbs: a rounded eight-sided cross section, tapering to tips.
function bowLimb(parent, material, sign, inset = 0) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, sign * 0.055, 0.004 + inset),
    new THREE.Vector3(0, sign * 0.19, -0.032 + inset),
    new THREE.Vector3(0, sign * 0.35, -0.098 + inset),
    new THREE.Vector3(0, sign * 0.49, -0.005 + inset),
    new THREE.Vector3(0, sign * 0.535, -0.022 + inset),
  ]);
  const positions = [];
  const uvs = [];
  const indices = [];
  const sections = 28;
  for (let i = 0; i <= sections; i++) {
    const t = i / sections;
    const center = curve.getPoint(t);
    const width = 0.017 * (1 - t * 0.67);
    const thickness = inset ? 0.0022 : 0.0075 * (1 - t * 0.55);
    for (let j = 0; j <= 8; j++) {
      const a = (j / 8) * Math.PI * 2;
      positions.push(
        center.x + Math.cos(a) * width,
        center.y,
        center.z + Math.sin(a) * thickness,
      );
      uvs.push(j / 8, t * 2);
      if (i < sections && j < 8) {
        const v = i * 9 + j;
        if (sign > 0) {
          indices.push(v, v + 9, v + 1, v + 9, v + 10, v + 1);
        } else {
          indices.push(v, v + 1, v + 9, v + 9, v + 1, v + 10);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  parent.add(mesh);
  return mesh;
}

export function createBow(camera) {
  const group = new THREE.Group();
  group.name = 'pinewatch-recurve-bow';
  group.scale.set(0.82, 0.82, 0.88);
  const bowFill = new THREE.PointLight('#ffe5bb', 0.42, 1.25, 2);
  bowFill.position.set(-0.16, 0.27, 0.4);
  group.add(bowFill);
  // Use the camera only for metadata; the game owns adding/removing the group.
  group.userData.cameraNear = camera?.near ?? 0.08;
  const woodTexture = surfaceTexture('wood');
  const wood = new THREE.MeshStandardMaterial({
    color: '#ad7840',
    emissive: '#795832',
    emissiveIntensity: 0.12,
    map: woodTexture,
    bumpMap: woodTexture,
    bumpScale: 0.0015,
    roughness: 0.4,
  });
  const lamination = new THREE.MeshStandardMaterial({
    color: '#dfc491',
    emissive: '#aa8951',
    emissiveIntensity: 0.1,
    roughness: 0.46,
  });
  const leather = new THREE.MeshStandardMaterial({
    color: '#655447',
    emissive: '#5e5041',
    emissiveIntensity: 0.1,
    roughness: 0.87,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: '#b29559',
    roughness: 0.39,
    metalness: 0.65,
  });
  const stringMaterial = new THREE.MeshBasicMaterial({ color: '#d6c9a6' });
  const feather = new THREE.MeshStandardMaterial({
    color: '#dad3b6',
    roughness: 0.94,
    side: THREE.DoubleSide,
  });
  const darkFeather = new THREE.MeshStandardMaterial({
    color: '#61705c',
    roughness: 0.94,
    side: THREE.DoubleSide,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: '#737674',
    roughness: 0.3,
    metalness: 0.8,
  });
  const riser = new THREE.Group();
  group.add(riser);
  for (const sign of [-1, 1]) {
    bowLimb(riser, wood, sign);
    bowLimb(riser, lamination, sign, 0.0065);
    ellipsoid(riser, leather, [0, sign * 0.53, -0.022], [0.009, 0.018, 0.009]);
  }
  const grip = ellipsoid(
    riser,
    leather,
    [0.006, -0.018, 0.001],
    [0.028, 0.093, 0.023],
  );
  grip.rotation.z = -0.07;
  for (let i = 0; i < 12; i++) {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.024, 0.0018, 4, 14),
      i % 3 === 0 ? wood : leather,
    );
    band.rotation.x = Math.PI / 2;
    band.scale.set(1.03, 0.91, 1);
    band.position.set(0.006, -0.084 + i * 0.012, 0.001);
    riser.add(band);
  }
  for (const sign of [-1, 1]) {
    taperedBone(
      riser,
      brass,
      [0, sign * 0.101, 0],
      [0, sign * 0.106, -0.001],
      0.024,
      0.024,
      14,
    );
  }
  // A quiet maker's inlay is visible in raking light above the leather grip.
  const inlay = new THREE.Mesh(new THREE.PlaneGeometry(0.005, 0.035), brass);
  inlay.position.set(0, 0.145, -0.009);
  riser.add(inlay);

  // A compact continuous glove and cuff give the bow a believable grip.
  const glove = new THREE.MeshStandardMaterial({
    color: '#89745c',
    roughness: 0.88,
    emissive: '#665541',
    emissiveIntensity: 0.08,
  });
  const sleeve = new THREE.MeshStandardMaterial({
    color: '#58635a',
    roughness: 1,
    emissive: '#3d483c',
    emissiveIntensity: 0.07,
  });
  const palm = organicLoft(
    glove,
    [
      [-0.12, 0.047, 0.025, 0.024],
      [-0.09, 0.03, 0.036, 0.028],
      [-0.052, 0.02, 0.04, 0.029],
      [-0.012, 0.02, 0.041, 0.028],
      [0.018, 0.024, 0.031, 0.023],
    ],
    'y',
  );
  palm.position.z = 0.023;
  group.add(palm);
  for (let i = 0; i < 4; i++) {
    const y = -0.082 + i * 0.022;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.047, y, 0.025),
      new THREE.Vector3(0.02, y, 0.052),
      new THREE.Vector3(-0.01, y, 0.044),
      new THREE.Vector3(-0.027, y, 0.018),
      new THREE.Vector3(-0.021, y, -0.009),
    ]);
    group.add(
      new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.009, 7, false), glove),
    );
  }
  branch(
    group,
    glove,
    [
      [0.052, -0.029, 0.021],
      [0.049, 0.007, 0.039],
      [0.021, 0.035, 0.041],
      [-0.002, 0.03, 0.02],
    ],
    0.017,
  );
  const forearm = organicLoft(
    sleeve,
    [
      [-0.31, 0.185, 0.066, 0.062],
      [-0.2, 0.124, 0.059, 0.053],
      [-0.075, 0.052, 0.045, 0.04],
      [0.0, 0.012, 0.033, 0.032],
    ],
    'y',
  );
  forearm.rotation.x = -0.54;
  forearm.position.set(0.03, -0.113, 0.025);
  group.add(forearm);

  const stringGeometry = new THREE.BufferGeometry();
  stringGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(new Float32Array(9), 3),
  );
  const string = new THREE.Line(stringGeometry, stringMaterial);
  group.add(string);
  const arrow = new THREE.Group();
  group.add(arrow);
  const shaft = taperedBone(
    arrow,
    wood,
    [0.017, 0.005, 0],
    [0.017, 0.005, -0.73],
    0.003,
    0.0028,
    8,
  );
  shaft.name = 'nocked-arrow';
  taperedBone(
    arrow,
    brass,
    [0.017, 0.005, -0.721],
    [0.017, 0.005, -0.748],
    0.0042,
    0.0042,
    8,
  );
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.045, 4), steel);
  tip.rotation.x = -Math.PI / 2;
  tip.position.set(0.017, 0.005, -0.766);
  arrow.add(tip);
  for (let i = 0; i < 3; i++) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0.067, 0.002);
    shape.quadraticCurveTo(0.054, 0.024, 0.01, 0.019);
    shape.lineTo(0, 0);
    const vane = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      i === 0 ? darkFeather : feather,
    );
    vane.rotation.y = Math.PI / 2;
    vane.rotation.z = (i / 3) * Math.PI * 2;
    const holder = new THREE.Group();
    holder.rotation.z = (i / 3) * Math.PI * 2;
    holder.position.set(0.017, 0.005, -0.018);
    vane.rotation.z = 0;
    holder.add(vane);
    arrow.add(holder);
  }
  taperedBone(
    arrow,
    brass,
    [0.017, 0.005, -0.005],
    [0.017, 0.005, 0.012],
    0.004,
    0.004,
    8,
  );
  group.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = false;
      object.receiveShadow = false;
      object.frustumCulled = false;
    }
  });
  return {
    group,
    update({ draw = 0, aiming = false, time = 0, moving = false } = {}) {
      const tension = clamp(draw, 0, 1);
      const sway = moving ? 0.009 : 0.0018;
      group.position.set(
        (aiming ? 0.31 : 0.42) + Math.sin(time * (moving ? 7 : 1.5)) * sway,
        (aiming ? -0.23 : -0.32) +
          Math.cos(time * (moving ? 14 : 1.9)) * sway * 0.7,
        aiming ? -0.92 : -0.87,
      );
      group.rotation.set(0.03, aiming ? -0.43 : -0.5, aiming ? -0.08 : -0.19);
      const nock = 0.016 + tension * 0.29;
      const positions = stringGeometry.attributes.position;
      positions.setXYZ(0, 0, -0.532, -0.021);
      positions.setXYZ(1, 0.017, 0.005, nock);
      positions.setXYZ(2, 0, 0.532, -0.021);
      positions.needsUpdate = true;
      stringGeometry.computeBoundingSphere();
      arrow.position.z = nock;
      riser.scale.z = 1 - tension * 0.25;
    },
    dispose() {
      materialsFor(group);
    },
  };
}
