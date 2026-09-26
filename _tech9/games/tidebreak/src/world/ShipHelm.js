import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Local authored helm. Borrowed materials and all created resources belong to the ship. */
export function createShipHelm({
  profile,
  helmX,
  helmZ,
  quarterY,
  own,
  materials: m,
}) {
  const group = new THREE.Group();
  group.name = `${profile.name} working helm`;
  const fittings = new THREE.Group();
  const captain = new THREE.Group();
  captain.name = 'Captain head and torso';
  const arms = new THREE.Group();
  const wheelMount = new THREE.Group();
  const wheel = new THREE.Group();
  wheel.name = 'Eight spoke turned mahogany wheel';
  const grips = new THREE.Group();
  grips.name = 'Independent fitted wheel grips';
  group.add(fittings, captain, arms, wheelMount);
  wheelMount.position.set(helmX, quarterY + 1.02, helmZ);
  wheelMount.rotation.x = -0.09;
  wheelMount.add(wheel, grips);
  const up = new THREE.Vector3(0, 1, 0);
  const forward = new THREE.Vector3(0, 0, 1);
  const direction = new THREE.Vector3();
  const worldQuaternion = new THREE.Quaternion();
  const armLinks = [];
  let wheelAngle = 0;
  let captainMode = false;

  const localMaterial = (color, roughness = 0.7, metalness = 0) =>
    own(new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  const brass = localMaterial('#b7954c', 0.3, 0.78);
  const engraved = localMaterial('#273538', 0.77);
  const parchment = localMaterial('#dfd2af', 0.75);
  const red = localMaterial('#953f31', 0.69);
  const leather = localMaterial('#302c25', 0.65);
  const nails = localMaterial('#b89c82', 0.85);
  const darkCloth = own(m.coat.clone());
  darkCloth.color.multiplyScalar(0.75);
  const sleeveCloth = own(m.coat.clone());
  Object.assign(sleeveCloth, {
    bumpMap: null,
    normalMap: null,
    roughnessMap: null,
    bumpScale: 0,
    roughness: 0.97,
    flatShading: false,
    envMapIntensity: 0.12,
  });
  const binnacleLacquer = own(m.paint.clone());
  Object.assign(binnacleLacquer, {
    map: null,
    bumpMap: null,
    normalMap: null,
    roughnessMap: null,
    bumpScale: 0,
    roughness: 0.48,
    metalness: 0.1,
    vertexColors: true,
  });
  // The hull's per-plank wear shader has no meaning on this curved painted drum.
  binnacleLacquer.onBeforeCompile = () => {};
  binnacleLacquer.customProgramCacheKey = () => 'binnacle-lacquer-v1';
  const mesh = (geometry, material, parent = fittings) => {
    const item = new THREE.Mesh(own(geometry), material);
    item.castShadow = false;
    item.receiveShadow = true;
    parent.add(item);
    return item;
  };
  const ellipsoid = (x, y, z, sx, sy, sz, material, parent = fittings) => {
    const item = mesh(new THREE.SphereGeometry(1, 20, 14), material, parent);
    item.position.set(x, y, z);
    item.scale.set(sx, sy, sz);
    return item;
  };
  const box = (
    w,
    h,
    d,
    x,
    y,
    z,
    material,
    parent = fittings,
    radius = 0.02,
  ) => {
    const item = mesh(
      new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 3, h / 3, d / 3)),
      material,
      parent,
    );
    item.position.set(x, y, z);
    return item;
  };
  const rod = (a, b, radius, material, parent = fittings) => {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b);
    const delta = end.clone().sub(start);
    const item = mesh(
      new THREE.CylinderGeometry(radius, radius, delta.length(), 12),
      material,
      parent,
    );
    item.position.copy(start.add(end).multiplyScalar(0.5));
    item.quaternion.setFromUnitVectors(up, delta.normalize());
    return item;
  };
  const torus = (
    radius,
    tube,
    x,
    y,
    z,
    material,
    parent = fittings,
    arc = Math.PI * 2,
  ) => {
    const item = mesh(
      new THREE.TorusGeometry(radius, tube, 10, 48, arc),
      material,
      parent,
    );
    item.position.set(x, y, z);
    return item;
  };
  const turned = (points, material, parent) =>
    mesh(
      new THREE.LatheGeometry(
        points.map(([radius, y]) => new THREE.Vector2(radius, y)),
        20,
      ),
      material,
      parent,
    );

  // The axle passes through a tapered timber standard with actual base and bearing collars.
  box(0.48, 0.12, 0.52, helmX, quarterY + 0.07, helmZ - 0.22, m.darkWood);
  const standard = turned(
    [
      [0.19, 0],
      [0.19, 0.08],
      [0.145, 0.12],
      [0.11, 0.69],
      [0.15, 0.75],
      [0.15, 0.89],
    ],
    m.timber,
    fittings,
  );
  standard.position.set(helmX, quarterY + 0.12, helmZ - 0.23);
  rod(
    [helmX, quarterY + 1.02, helmZ - 0.38],
    [helmX, quarterY + 1.02, helmZ + 0.02],
    0.069,
    brass,
  );
  for (const x of [-0.15, 0.15])
    for (const z of [-0.16, 0.16])
      ellipsoid(
        helmX + x,
        quarterY + 0.136,
        helmZ - 0.22 + z,
        0.014,
        0.007,
        0.014,
        brass,
      );

  // Eight separate rim felloes leave fine scarf joints; grain UVs run along each arc.
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const felloe = torus(
      0.4,
      0.033,
      0,
      0,
      0,
      m.wheelWood,
      wheel,
      Math.PI / 4 - 0.009,
    );
    felloe.rotation.z = angle + 0.0045;
    const spoke = turned(
      [
        [0.036, 0.085],
        [0.036, 0.12],
        [0.025, 0.15],
        [0.018, 0.22],
        [0.018, 0.31],
        [0.024, 0.36],
        [0.026, 0.424],
        [0.02, 0.447],
        [0.03, 0.473],
        [0.028, 0.504],
        [0.018, 0.529],
        [0.006, 0.54],
        [0, 0.542],
      ],
      m.wheelWood,
      wheel,
    );
    spoke.rotation.z = angle - Math.PI / 2;
    const c = Math.cos(angle),
      s = Math.sin(angle);
    const collar = torus(0.025, 0.005, c * 0.437, s * 0.437, 0, brass, wheel);
    collar.quaternion.setFromUnitVectors(forward, new THREE.Vector3(c, s, 0));
    ellipsoid(c * 0.4, s * 0.4, 0.032, 0.008, 0.008, 0.004, brass, wheel);
    ellipsoid(c * 0.093, s * 0.093, 0.066, 0.006, 0.006, 0.004, brass, wheel);
  }
  const hub = turned(
    [
      [0, -0.058],
      [0.089, -0.058],
      [0.108, -0.042],
      [0.108, 0.035],
      [0.092, 0.056],
      [0, 0.056],
    ],
    m.wheelWood,
    wheel,
  );
  hub.rotation.x = Math.PI / 2;
  torus(0.083, 0.009, 0, 0, 0.058, brass, wheel);
  ellipsoid(0, 0, 0.061, 0.043, 0.043, 0.012, brass, wheel);
  box(0.025, 0.003, 0.004, 0, 0, 0.074, engraved, wheel, 0.001);

  // A gimballed compass has a proper rose, lubber line, degree ticks and N/E/S/W.
  const compassX = helmX - 0.68,
    compassZ = helmZ - 0.17,
    compassY = quarterY + 1.09;
  const binnacle = turned(
    [
      [0.19, 0],
      [0.19, 0.09],
      [0.13, 0.14],
      [0.135, 0.72],
      [0.2, 0.78],
      [0.2, 0.9],
    ],
    binnacleLacquer,
    fittings,
  );
  const binnacleColors = [];
  const binnaclePositions = binnacle.geometry.attributes.position;
  for (let i = 0; i < binnaclePositions.count; i++) {
    const y = binnaclePositions.getY(i);
    const edge = Math.max(Math.exp(-y * 60), Math.exp(-Math.abs(y - 0.9) * 75));
    const polish = 0.97 + edge * 0.1;
    binnacleColors.push(polish, polish, polish);
  }
  binnacle.geometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(binnacleColors, 3),
  );
  binnacle.position.set(compassX, quarterY + 0.08, compassZ);
  const cradle = torus(
    0.235,
    0.014,
    compassX,
    compassY - 0.03,
    compassZ,
    brass,
  );
  cradle.rotation.x = Math.PI / 2;
  rod(
    [compassX - 0.255, compassY - 0.03, compassZ],
    [compassX + 0.255, compassY - 0.03, compassZ],
    0.017,
    brass,
  );
  const bowl = turned(
    [
      [0.065, -0.12],
      [0.14, -0.1],
      [0.2, -0.04],
      [0.205, 0.025],
      [0.194, 0.032],
    ],
    brass,
    fittings,
  );
  bowl.position.set(compassX, compassY, compassZ);
  const card = new THREE.Group();
  card.name = 'Magnetic compass card';
  card.position.set(compassX, compassY + 0.027, compassZ);
  group.add(card);
  const dial = mesh(new THREE.CircleGeometry(0.19, 64), parchment, card);
  dial.rotation.x = -Math.PI / 2;
  for (let i = 0; i < 72; i++) {
    const angle = (i / 72) * Math.PI * 2;
    const radius = i % 6 === 0 ? 0.16 : 0.17;
    rod(
      [Math.sin(angle) * radius, 0.002, -Math.cos(angle) * radius],
      [Math.sin(angle) * 0.182, 0.002, -Math.cos(angle) * 0.182],
      i % 6 === 0 ? 0.002 : 0.001,
      engraved,
      card,
    );
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2,
      radius = i % 2 ? 0.065 : 0.105;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          0,
          0.004,
          0,
          Math.sin(a + Math.PI / 2) * 0.015,
          0.004,
          -Math.cos(a + Math.PI / 2) * 0.015,
          Math.sin(a) * radius,
          0.004,
          -Math.cos(a) * radius,
        ],
        3,
      ),
    );
    geo.computeVertexNormals();
    mesh(geo, i === 0 ? red : engraved, card);
  }
  const glyphs = {
    N: [
      [
        [-0.5, 0.5],
        [-0.5, -0.5],
        [0.5, 0.5],
        [0.5, -0.5],
      ],
    ],
    E: [
      [
        [0.5, -0.5],
        [-0.5, -0.5],
        [-0.5, 0.5],
        [0.5, 0.5],
      ],
      [
        [-0.5, 0],
        [0.35, 0],
      ],
    ],
    S: [
      [
        [0.5, -0.5],
        [-0.5, -0.5],
        [-0.5, 0],
        [0.5, 0],
        [0.5, 0.5],
        [-0.5, 0.5],
      ],
    ],
    W: [
      [
        [-0.6, -0.5],
        [-0.35, 0.5],
        [0, 0],
        [0.35, 0.5],
        [0.6, -0.5],
      ],
    ],
  };
  for (const [letter, x, z] of [
    ['N', 0, -0.135],
    ['E', 0.135, 0],
    ['S', 0, 0.135],
    ['W', -0.135, 0],
  ])
    for (const stroke of glyphs[letter])
      for (let i = 1; i < stroke.length; i++)
        rod(
          [x + stroke[i - 1][0] * 0.031, 0.004, z + stroke[i - 1][1] * 0.036],
          [x + stroke[i][0] * 0.031, 0.004, z + stroke[i][1] * 0.036],
          0.0017,
          letter === 'N' ? red : engraved,
          card,
        );
  const rim = torus(0.192, 0.011, compassX, compassY + 0.032, compassZ, brass);
  rim.rotation.x = Math.PI / 2;
  rod(
    [compassX, compassY + 0.044, compassZ - 0.184],
    [compassX, compassY + 0.044, compassZ - 0.155],
    0.0025,
    red,
  );

  // Tailored long coat, collar and boots are hidden only in the captain's own view.
  const bodyZ = helmZ + 1.18;
  ellipsoid(helmX, quarterY + 1.13, bodyZ, 0.24, 0.33, 0.155, m.coat, captain);
  box(
    0.4,
    0.36,
    0.22,
    helmX,
    quarterY + 0.86,
    bodyZ + 0.01,
    m.coat,
    captain,
    0.055,
  );
  for (const sign of [-1, 1]) {
    box(
      0.16,
      0.32,
      0.12,
      helmX + sign * 0.1,
      quarterY + 0.66,
      bodyZ + 0.11,
      darkCloth,
      captain,
      0.04,
    );
    const lapel = box(
      0.105,
      0.29,
      0.024,
      helmX + sign * 0.078,
      quarterY + 1.31,
      bodyZ - 0.15,
      darkCloth,
      captain,
      0.008,
    );
    lapel.rotation.z = sign * 0.22;
    for (let i = 0; i < 4; i++)
      ellipsoid(
        helmX + sign * 0.058,
        quarterY + 0.99 + i * 0.092,
        bodyZ - 0.151,
        0.009,
        0.009,
        0.004,
        brass,
        captain,
      );
    rod(
      [helmX + sign * 0.105, quarterY + 0.73, bodyZ],
      [helmX + sign * 0.13, quarterY + 0.12, bodyZ + 0.025],
      0.081,
      darkCloth,
      captain,
    );
    box(
      0.16,
      0.16,
      0.31,
      helmX + sign * 0.13,
      quarterY + 0.095,
      bodyZ - 0.025,
      leather,
      captain,
      0.055,
    );
  }
  ellipsoid(
    helmX,
    quarterY + 1.465,
    bodyZ - 0.015,
    0.084,
    0.065,
    0.085,
    m.shirt,
    captain,
  );
  ellipsoid(
    helmX,
    quarterY + 1.61,
    bodyZ - 0.025,
    0.116,
    0.158,
    0.122,
    m.skin,
    captain,
  );
  ellipsoid(
    helmX,
    quarterY + 1.7,
    bodyZ + 0.004,
    0.12,
    0.096,
    0.123,
    m.hair,
    captain,
  );
  ellipsoid(
    helmX,
    quarterY + 1.604,
    bodyZ - 0.149,
    0.025,
    0.031,
    0.025,
    m.skin,
    captain,
  );
  for (const sign of [-1, 1])
    ellipsoid(
      helmX + sign * 0.044,
      quarterY + 1.648,
      bodyZ - 0.132,
      0.015,
      0.009,
      0.004,
      m.hair,
      captain,
    );
  const hat = new THREE.Shape();
  hat.moveTo(0, -0.27);
  hat.quadraticCurveTo(0.1, -0.12, 0.245, 0.115);
  hat.quadraticCurveTo(0, 0.065, -0.245, 0.115);
  hat.quadraticCurveTo(-0.1, -0.12, 0, -0.27);
  const brim = mesh(
    new THREE.ExtrudeGeometry(hat, {
      depth: 0.025,
      bevelEnabled: true,
      bevelSize: 0.008,
      bevelThickness: 0.007,
      bevelSegments: 2,
      steps: 1,
    }),
    darkCloth,
    captain,
  );
  brim.rotation.x = Math.PI / 2;
  brim.position.set(helmX, quarterY + 1.75, bodyZ);
  ellipsoid(
    helmX,
    quarterY + 1.795,
    bodyZ - 0.018,
    0.135,
    0.07,
    0.13,
    darkCloth,
    captain,
  );

  function finger(points, radius, parent) {
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(...p)),
    );
    mesh(new THREE.TubeGeometry(curve, 14, radius, 8, false), m.skin, parent);
    const tip = points.at(-1);
    ellipsoid(...tip, radius, radius, radius, m.skin, parent);
  }
  function palm() {
    // A single tapered palm/wrist surface avoids the overlapping rounded lumps
    // of a sphere-built hand. Its back is flatter than its side silhouette.
    const profile = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.09, 0),
      new THREE.Vector3(0.025, -0.076, 0.017),
      new THREE.Vector3(0.028, -0.041, 0.017),
      new THREE.Vector3(0.038, -0.014, 0.019),
      new THREE.Vector3(0.043, 0.02, 0.02),
      new THREE.Vector3(0.039, 0.03, 0.015),
      new THREE.Vector3(0.029, 0.037, 0.01),
      new THREE.Vector3(0, 0.04, 0),
    ]);
    const positions = [],
      uvs = [],
      indices = [];
    const rings = 28,
      sides = 20;
    for (let ring = 0; ring <= rings; ring++) {
      const t = ring / rings,
        section = profile.getPoint(t);
      for (let side = 0; side <= sides; side++) {
        const angle = (side / sides) * Math.PI * 2;
        positions.push(
          Math.max(0, section.x) * Math.cos(angle),
          section.y,
          0.057 - t * 0.008 + Math.max(0, section.z) * Math.sin(angle),
        );
        uvs.push(side / sides, t);
        if (ring < rings && side < sides) {
          const a = ring * (sides + 1) + side,
            b = a + sides + 1;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
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
    return geometry;
  }
  for (const sign of [-1, 1]) {
    const angle = sign < 0 ? (Math.PI * 5) / 6 : Math.PI / 6;
    const hand = new THREE.Group();
    hand.name =
      sign < 0 ? 'Left hand fitted around rim' : 'Right hand fitted around rim';
    hand.position.set(Math.cos(angle) * 0.4, Math.sin(angle) * 0.4, 0);
    hand.rotation.z = angle - Math.PI / 2;
    grips.add(hand);
    mesh(palm(), m.skin, hand);
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 0.022;
      const short = Math.abs(i - 1.4) * 0.004;
      finger(
        [
          [x, 0.033, 0.062],
          [x, 0.065 - short, 0.041],
          [x, 0.034, -0.018],
          [x, -0.007, -0.032],
          [x, -0.025 + short, -0.005],
        ],
        i === 3 ? 0.008 : 0.0095,
        hand,
      );
      ellipsoid(x, -0.018 + short, -0.021, 0.006, 0.009, 0.002, nails, hand);
    }
    finger(
      [
        [-sign * 0.03, -0.017, 0.061],
        [-sign * 0.049, 0.003, 0.054],
        [-sign * 0.038, 0.024, 0.025],
        [-sign * 0.018, 0.026, 0.01],
      ],
      0.0125,
      hand,
    );
    const sleeve = (radii, curved = false) => {
      if (!curved)
        return turned(
          radii.map(([y, r]) => [r, y - 0.5]),
          m.coat,
          arms,
        );
      const outline = new THREE.CatmullRomCurve3(
        radii.map(([y, radius]) => new THREE.Vector3(radius, y - 0.5, 0)),
      );
      const geometry = new THREE.LatheGeometry(
        outline.getPoints(48).map((p) => new THREE.Vector2(p.x, p.y)),
        36,
      );
      const positions = geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i),
          y = positions.getY(i),
          z = positions.getZ(i);
        const t = Math.max(0, Math.min(1, y + 0.5));
        const bend = Math.sin(t * Math.PI);
        const angle = Math.atan2(x, z);
        // A shaped sleeve follows the forearm instead of reading as a straight
        // pipe. Three broad, oblique cloth folds soften its tapered silhouette.
        const fold =
          1 + 0.07 * Math.sin(t * Math.PI * 6 + Math.sin(angle) * 0.9) * bend;
        positions.setXYZ(
          i,
          x * fold + sign * 0.062 * bend,
          y,
          z * fold + 0.022 * bend,
        );
      }
      geometry.computeVertexNormals();
      // Derive normals across the continuous circular surface rather than
      // allowing triangulation diagonals or the duplicated UV seam to show.
      const normals = geometry.attributes.normal;
      const rows = 49,
        sides = 36;
      const around = new THREE.Vector3(),
        along = new THREE.Vector3();
      const a = new THREE.Vector3(),
        b = new THREE.Vector3(),
        normal = new THREE.Vector3();
      for (let side = 0; side <= sides; side++)
        for (let row = 0; row < rows; row++) {
          a.fromBufferAttribute(positions, ((side + 1) % sides) * rows + row);
          b.fromBufferAttribute(
            positions,
            ((side + sides - 1) % sides) * rows + row,
          );
          around.copy(a).sub(b);
          a.fromBufferAttribute(
            positions,
            side * rows + Math.min(rows - 1, row + 1),
          );
          b.fromBufferAttribute(positions, side * rows + Math.max(0, row - 1));
          along.copy(a).sub(b);
          normal.crossVectors(around, along).normalize();
          normals.setXYZ(side * rows + row, normal.x, normal.y, normal.z);
        }
      return mesh(geometry, sleeveCloth, arms);
    };
    const upper = sleeve([
      [0, 0.094],
      [0.09, 0.103],
      [0.2, 0.094],
      [0.45, 0.088],
      [0.7, 0.075],
      [0.9, 0.079],
      [1, 0.07],
    ]);
    const lower = sleeve(
      [
        [0, 0.081],
        [0.12, 0.085],
        [0.25, 0.078],
        [0.43, 0.071],
        [0.58, 0.063],
        [0.81, 0.048],
        [0.9, 0.049],
        [1, 0.043],
      ],
      true,
    );
    const elbow = ellipsoid(0, 0, 0, 0.078, 0.074, 0.079, m.coat, arms);
    const shoulderCap = ellipsoid(
      helmX + sign * 0.225,
      quarterY + 1.37,
      bodyZ - 0.015,
      0.098,
      0.097,
      0.091,
      m.coat,
      arms,
    );
    const cuff = torus(0.036, 0.007, 0, 0, 0, darkCloth, arms);
    const shirtCuff = mesh(
      new THREE.CylinderGeometry(0.031, 0.034, 0.035, 32, 1, true),
      m.shirt,
      arms,
    );
    shirtCuff.name = `${sign < 0 ? 'Left' : 'Right'} cream shirt cuff`;
    const wrist = ellipsoid(0, 0, 0, 0.026, 0.043, 0.022, m.skin, arms);
    upper.name = `${sign < 0 ? 'Left' : 'Right'} external upper sleeve`;
    shoulderCap.name = `${sign < 0 ? 'Left' : 'Right'} external shoulder`;
    lower.name = `${sign < 0 ? 'Left' : 'Right'} continuous forearm sleeve`;
    armLinks.push({
      sign,
      hand,
      upper,
      lower,
      elbow,
      shoulderCap,
      cuff,
      shirtCuff,
      wrist,
      shoulder: new THREE.Vector3(
        helmX + sign * 0.225,
        quarterY + 1.37,
        bodyZ - 0.015,
      ),
      handPoint: new THREE.Vector3(),
      bend: new THREE.Vector3(),
      cuffPoint: new THREE.Vector3(),
    });
  }

  // Keep rich small fittings cheap to draw without losing local wheel/card articulation.
  function batch(parent) {
    const batches = new Map();
    for (const item of [...parent.children]) {
      if (!item.isMesh || item.material.transparent) continue;
      item.updateMatrix();
      const source = item.geometry.index
        ? own(item.geometry.toNonIndexed())
        : item.geometry;
      const geo = own(source.clone().applyMatrix4(item.matrix));
      for (const key of Object.keys(geo.attributes))
        if (
          ![
            'position',
            'normal',
            'uv',
            ...(item.material.vertexColors ? ['color'] : []),
          ].includes(key)
        )
          geo.deleteAttribute(key);
      if (!geo.attributes.uv) {
        const uv = new Float32Array(geo.attributes.position.count * 2);
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      }
      if (!batches.has(item.material)) batches.set(item.material, []);
      batches.get(item.material).push(geo);
      parent.remove(item);
    }
    for (const [material, geometries] of batches)
      mesh(mergeGeometries(geometries), material, parent);
  }
  for (const parent of [fittings, wheel, card, captain, ...grips.children])
    batch(parent);

  function fit(item, a, b) {
    direction.copy(b).sub(a);
    item.position.copy(a).add(b).multiplyScalar(0.5);
    item.scale.y = direction.length();
    item.quaternion.setFromUnitVectors(up, direction.normalize());
  }
  function update(dt, steer) {
    wheelAngle +=
      (Math.max(-1, Math.min(1, steer)) * 2.05 - wheelAngle) *
      (1 - Math.exp(-Math.max(0, dt) * 8));
    wheel.rotation.z = -wheelAngle;
    // Hands slide a short distance along their own side of the rim; never cross.
    grips.rotation.z = -Math.tanh(wheelAngle * 0.6) * 0.16;
    grips.updateMatrix();
    wheelMount.updateMatrix();
    for (const arm of armLinks) {
      arm.hand.updateMatrix();
      arm.handPoint
        .set(0, -0.079, 0.06)
        .applyMatrix4(arm.hand.matrix)
        .applyMatrix4(grips.matrix)
        .applyMatrix4(wheelMount.matrix);
      if (captainMode) {
        // View arms start below the near frame; the continuous tapered sleeves
        // run into the wrists, without presenting shoulders or elbow balls.
        arm.bend.set(helmX + arm.sign * 0.47, quarterY + 0.52, helmZ + 1.0);
      } else {
        arm.bend.copy(arm.shoulder).lerp(arm.handPoint, 0.58);
        arm.bend.x += arm.sign * 0.065;
        arm.bend.y = quarterY + 0.91;
        arm.bend.z += 0.05;
      }
      direction.copy(arm.bend).sub(arm.handPoint).normalize();
      arm.cuffPoint.copy(arm.handPoint).addScaledVector(direction, 0.046);
      fit(arm.upper, arm.shoulder, arm.bend);
      fit(arm.lower, arm.bend, arm.cuffPoint);
      arm.elbow.position.copy(arm.bend);
      direction.copy(arm.handPoint).sub(arm.bend).normalize();
      arm.cuff.position.copy(arm.cuffPoint);
      arm.cuff.quaternion.setFromUnitVectors(forward, direction);
      arm.shirtCuff.position
        .copy(arm.cuffPoint)
        .addScaledVector(direction, 0.026);
      arm.shirtCuff.quaternion.setFromUnitVectors(up, direction);
      arm.wrist.position.copy(arm.handPoint).lerp(arm.cuffPoint, 0.45);
      arm.wrist.quaternion.setFromUnitVectors(up, direction);
    }
    group.getWorldQuaternion(worldQuaternion);
    direction.set(0, 0, -1).applyQuaternion(worldQuaternion);
    card.rotation.y = -Math.atan2(-direction.x, -direction.z);
    return wheelAngle;
  }
  update(0, 0);
  return {
    group,
    eye: new THREE.Vector3(helmX, quarterY + 1.8, helmZ + 1.8),
    target: new THREE.Vector3(helmX, quarterY + 0.8, helmZ - 10),
    update,
    setCameraMode(mode) {
      captainMode = mode === 'captain';
      captain.visible = !captainMode;
      for (const arm of armLinks) {
        arm.upper.visible = !captainMode;
        arm.shoulderCap.visible = !captainMode;
        arm.elbow.visible = !captainMode;
      }
      update(0, 0);
    },
    reset() {
      wheelAngle = 0;
      update(0, 0);
    },
  };
}
