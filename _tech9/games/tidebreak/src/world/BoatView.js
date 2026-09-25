import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Local authored launch. Simulation is planar; visual heave, trim, and foam live here.
export function createBoatView(boat, rules) {
  const root = new THREE.Group();
  root.name = 'Tidebreak launch';
  const owned = new Set();
  const samples = [];
  const drops = [];
  const stats = {
    wakeSamples: 0,
    sprayParticles: 0,
    length: 5.6,
    beam: 2.1,
    cameraMode: 'chase',
    wheelAngle: 0,
  };
  const wheelMount = new THREE.Group();
  const wheelSpin = new THREE.Group();
  const gripRig = new THREE.Group();
  const pilotBody = new THREE.Group();
  const pilotArms = new THREE.Group();
  const dashboard = new THREE.Group();
  const movingRoots = new Set([wheelMount, pilotBody, pilotArms]);
  const articulatedArms = [];
  const instrumentNeedles = [];
  const eye = new THREE.Vector3(0.43, 1.64, 0.53);
  const look = new THREE.Vector3(0.43, 1.09, -3.3);
  let wheelAngle = 0;
  let context;
  let wake;
  let spray;
  let disposed = false;
  let lastX = boat.x;
  let lastZ = boat.z;
  let emitTime = 0;
  let sprayTime = 0;
  let visualTime = 0;
  let previousState = rules.state;
  let previousElapsed = rules.elapsed ?? 0;
  let roll = 0;
  let pitch = 0;
  const MAX_SAMPLES = 90;
  const MAX_DROPS = 128;
  const UP = new THREE.Vector3(0, 1, 0);
  const own = (resource) => {
    owned.add(resource);
    return resource;
  };
  const material = (color, roughness = 0.5, metalness = 0) =>
    own(new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  const mesh = (geometry, mat, x = 0, y = 0, z = 0, parent = root) => {
    const item = new THREE.Mesh(own(geometry), mat);
    item.position.set(x, y, z);
    // The island shadow map is static. Moving launch geometry only receives it.
    item.castShadow = false;
    item.receiveShadow = true;
    parent.add(item);
    return item;
  };
  const box = (w, h, d, mat, x, y, z) =>
    mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  const roundBox = (w, h, d, mat, x, y, z, radius = 0.04, parent = root) =>
    mesh(
      new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 2, h / 2, d / 2)),
      mat,
      x,
      y,
      z,
      parent,
    );
  const ellipsoid = (sx, sy, sz, mat, x, y, z, parent = root) => {
    const item = mesh(
      new THREE.SphereGeometry(1, 16, 12),
      mat,
      x,
      y,
      z,
      parent,
    );
    item.scale.set(sx, sy, sz);
    return item;
  };
  const rod = (a, b, radius, mat, parent = root) => {
    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);
    const delta = end.clone().sub(start);
    const item = mesh(
      new THREE.CylinderGeometry(radius, radius, delta.length(), 8),
      mat,
      0,
      0,
      0,
      parent,
    );
    item.position.copy(start.add(end).multiplyScalar(0.5));
    item.quaternion.setFromUnitVectors(UP, delta.normalize());
    return item;
  };
  const outline = [
    [0, -2.78],
    [0.37, -2.48],
    [0.72, -1.98],
    [0.96, -1.15],
    [1.035, -0.2],
    [1.025, 1.25],
    [0.96, 2.34],
    [0.81, 2.48],
    [-0.81, 2.48],
    [-0.96, 2.34],
    [-1.025, 1.25],
    [-1.035, -0.2],
    [-0.96, -1.15],
    [-0.72, -1.98],
    [-0.37, -2.48],
  ];
  function hullStrip(lowY, highY, lowScale, highScale, mat) {
    const positions = [];
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      const point = (p, scale, y) => [
        p[0] * scale,
        y + (p[1] < -1.4 ? (-p[1] - 1.4) * 0.065 : 0),
        p[1] * (0.85 + scale * 0.15),
      ];
      const a0 = point(a, lowScale, lowY);
      const b0 = point(b, lowScale, lowY);
      const a1 = point(a, highScale, highY);
      const b1 = point(b, highScale, highY);
      positions.push(...a0, ...a1, ...b0, ...a1, ...b1, ...b0);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.computeVertexNormals();
    mesh(geometry, mat);
  }
  function deck(points, y, mat, holes = []) {
    const shape = new THREE.Shape(
      points.map(([x, z]) => new THREE.Vector2(x, -z)),
    );
    for (const hole of holes)
      shape.holes.push(
        new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))),
      );
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    mesh(geometry, mat, 0, y, 0);
  }
  function woodTexture() {
    const width = 96,
      height = 384;
    const data = new Uint8Array(width * height * 4);
    let seed = 679;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const grain = Math.sin(
          x * 1.83 + Math.sin(y * 0.033 + x * 0.027) * 1.2,
        );
        const fine = seed / 4294967296;
        const shade = Math.round(235 + grain * 8 + fine * 10);
        const i = (y * width + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = shade;
        data[i + 3] = 255;
      }
    const texture = own(new THREE.DataTexture(data, width, height));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
  }
  function gaugeFace(label, maxValue) {
    // Text is authored locally; no downloaded texture or font dependency.
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#202e2e';
    ctx.fillRect(0, 0, 256, 256);
    ctx.translate(128, 128);
    for (let i = 0; i <= 30; i++) {
      const a = Math.PI * 0.75 + (i / 30) * Math.PI * 1.5;
      const major = i % 5 === 0;
      ctx.strokeStyle = i > 26 ? '#b97854' : '#d2d9c7';
      ctx.lineWidth = major ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(
        Math.cos(a) * (major ? 85 : 93),
        Math.sin(a) * (major ? 85 : 93),
      );
      ctx.lineTo(Math.cos(a) * 104, Math.sin(a) * 104);
      ctx.stroke();
      if (major) {
        ctx.fillStyle = '#d6decd';
        ctx.font = '500 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          String(Math.round((i / 30) * maxValue)),
          Math.cos(a) * 66,
          Math.sin(a) * 66,
        );
      }
    }
    ctx.fillStyle = '#b3c4b8';
    ctx.font = '500 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, 39);
    ctx.font = '600 11px sans-serif';
    ctx.fillText('TIDEBREAK', 0, -31);
    const texture = own(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }
  function buildBoat() {
    const ivory = material('#e4e0cd', 0.46);
    const teal = material('#284b49', 0.44);
    const rubber = material('#252e2e', 0.74);
    const wood = material('#a17d52', 0.74);
    const paleWood = material('#b2946c', 0.71);
    wood.map = paleWood.map = woodTexture();
    const orange = material('#ac7b58', 0.82);
    const piping = material('#cfb794', 0.9);
    const chrome = material('#bbc5ca', 0.53, 0.28);
    const frame = material('#87999e', 0.66, 0.08);
    const navy = material('#243c46', 0.85);
    const skin = material('#ac8665', 0.88);
    const shirt = material('#bbc5b9', 0.93);
    const glass = own(
      new THREE.MeshPhysicalMaterial({
        color: '#95b9b2',
        roughness: 0.16,
        metalness: 0.06,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    hullStrip(-0.29, 0.14, 0.57, 0.88, ivory);
    hullStrip(0.14, 0.55, 0.88, 0.992, teal);
    hullStrip(0.55, 0.72, 0.992, 1, ivory);
    hullStrip(0.61, 0.655, 1.007, 1.008, rubber);
    const cockpit = [
      [-0.79, -1.12],
      [0.79, -1.12],
      [0.84, 1.89],
      [0.73, 2.12],
      [-0.73, 2.12],
      [-0.84, 1.89],
    ];
    deck(outline, 0.73, ivory, [cockpit]);
    deck(cockpit, 0.435, wood);
    for (let i = -5; i <= 5; i++) {
      const x = i * 0.142;
      box(0.132, 0.019, 3.08, i % 3 === 0 ? paleWood : wood, x, 0.452, 0.45);
    }
    const bowWood = [
      [0, -2.5],
      [0.33, -2.24],
      [0.56, -1.79],
      [0.66, -1.3],
      [-0.66, -1.3],
      [-0.56, -1.79],
      [-0.33, -2.24],
    ];
    deck(bowWood, 0.752, paleWood);
    for (let i = -3; i <= 3; i++) {
      const x = i * 0.17;
      const length = 1.12 - Math.abs(i) * 0.2;
      box(0.012, 0.006, length, wood, x, 0.759, -1.33 - length / 2);
    }
    box(0.09, 0.25, 3.0, ivory, -0.865, 0.59, 0.38);
    box(0.09, 0.25, 3.0, ivory, 0.865, 0.59, 0.38);
    box(1.7, 0.24, 0.12, ivory, 0, 0.61, 2.13);
    roundBox(1.57, 0.25, 0.57, ivory, 0, 0.58, 1.67, 0.035);
    roundBox(1.55, 0.16, 0.6, orange, 0, 0.78, 1.65, 0.065);
    roundBox(1.55, 0.39, 0.15, orange, 0, 0.95, 1.93, 0.06);
    rod([-0.7, 1.104, 2.007], [0.7, 1.104, 2.007], 0.005, piping);
    for (const x of [-0.43, 0.43]) {
      mesh(
        new THREE.CylinderGeometry(0.12, 0.16, 0.27, 10),
        chrome,
        x,
        0.57,
        0.34,
      );
      roundBox(0.61, 0.15, 0.61, orange, x, 0.765, 0.34, 0.065);
      const back = roundBox(0.62, 0.53, 0.18, orange, x, 1.005, 0.6, 0.075);
      back.rotation.x = -0.11;
      rod([x - 0.28, 0.85, 0.64], [x - 0.28, 1.23, 0.61], 0.007, piping);
      rod([x + 0.28, 0.85, 0.64], [x + 0.28, 1.23, 0.61], 0.007, piping);
    }
    for (const x of [-0.56, 0, 0.56])
      rod([x, 0.865, 1.36], [x, 0.865, 1.9], 0.009, piping);
    roundBox(1.64, 0.48, 0.48, ivory, 0, 0.79, -0.81, 0.075);
    const dash = roundBox(1.53, 0.065, 0.38, teal, 0, 1.045, -0.66, 0.025);
    dash.rotation.x = 0.13;
    const screenGeometry = new THREE.BufferGeometry();
    screenGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          -0.78, 0.95, -0.95, 0.78, 0.95, -0.95, -0.68, 1.68, -0.71, 0.78, 0.95,
          -0.95, 0.68, 1.68, -0.71, -0.68, 1.68, -0.71, -0.78, 0.95, -0.95,
          -0.68, 1.68, -0.71, -0.88, 0.94, -0.17, -0.68, 1.68, -0.71, -0.8,
          1.31, -0.18, -0.88, 0.94, -0.17, 0.78, 0.95, -0.95, 0.88, 0.94, -0.17,
          0.68, 1.68, -0.71, 0.68, 1.68, -0.71, 0.88, 0.94, -0.17, 0.8, 1.31,
          -0.18,
        ],
        3,
      ),
    );
    screenGeometry.computeVertexNormals();
    const screen = mesh(screenGeometry, glass);
    screen.castShadow = false;
    rod([-0.68, 1.68, -0.71], [0.68, 1.68, -0.71], 0.012, frame);
    rod([0, 0.96, -0.95], [0, 1.68, -0.71], 0.009, frame);
    for (const s of [-1, 1]) {
      rod([s * 0.78, 0.95, -0.95], [s * 0.68, 1.68, -0.71], 0.012, frame);
      rod([s * 0.68, 1.68, -0.71], [s * 0.8, 1.31, -0.18], 0.011, frame);
      const railPoints = [
        [s * 0.92, 0.87, -0.89],
        [s * 0.84, 1.04, -1.49],
        [s * 0.47, 1.08, -2.22],
        [0, 1.075, -2.6],
      ];
      for (let i = 0; i < railPoints.length - 1; i++)
        rod(railPoints[i], railPoints[i + 1], 0.022, chrome);
      rod([s * 0.84, 0.76, -1.49], railPoints[1], 0.022, chrome);
      rod([s * 0.47, 0.8, -2.22], railPoints[2], 0.022, chrome);
      rod([s * 0.93, 0.765, 1.25], [s * 0.93, 0.765, 1.66], 0.025, chrome);
      rod([s * 0.93, 0.74, 1.46], [s * 0.93, 0.81, 1.46], 0.028, chrome);
    }
    buildHelm({ ivory, teal, rubber, chrome, navy, skin, shirt, piping });
    box(0.42, 0.23, 0.18, chrome, 0, 0.55, 2.51);
    const engine = roundBox(0.63, 0.69, 0.58, rubber, 0, 0.76, 2.74, 0.13);
    engine.rotation.x = -0.08;
    ellipsoid(0.316, 0.14, 0.29, teal, 0, 1.065, 2.715);
    roundBox(0.615, 0.035, 0.565, piping, 0, 0.97, 2.73, 0.012);
    for (let i = 0; i < 3; i++)
      roundBox(0.32, 0.022, 0.012, teal, 0, 0.77 + i * 0.06, 3.03, 0.006);
    box(0.2, 0.65, 0.27, rubber, 0, 0.13, 2.78);
    box(0.58, 0.055, 0.36, rubber, 0, -0.13, 2.79);
    roundBox(0.48, 0.024, 0.39, ivory, 0, 0.779, -1.62, 0.01);
    rod([-0.13, 0.84, -2.27], [0.13, 0.84, -2.27], 0.033, chrome);
    rod([0, 0.77, -2.27], [0, 0.84, -2.27], 0.025, chrome);
    batchBoat();
  }
  function buildHelm({
    ivory,
    teal,
    rubber,
    chrome,
    navy,
    skin,
    shirt,
    piping,
  }) {
    root.add(dashboard, wheelMount, pilotBody, pilotArms);
    dashboard.name = 'Instrument binnacle';
    dashboard.position.set(0, 1.085, -0.61);
    dashboard.rotation.x = -0.52;
    roundBox(1.45, 0.34, 0.075, rubber, 0, 0, 0, 0.05, dashboard);
    const needleMaterial = material('#d9aa72', 0.54);
    const faceMaterial = (label, max) => {
      const mat = material('#dce3d7', 0.82);
      const map = gaugeFace(label, max);
      if (map) {
        mat.color.set('#ffffff');
        mat.map = map;
      } else mat.color.set('#293d3b');
      return mat;
    };
    for (const [x, radius, label, max] of [
      [0.39, 0.135, 'KNOTS', 15],
      [0.04, 0.108, 'RPM ×1000', 6],
    ]) {
      mesh(
        new THREE.TorusGeometry(radius, 0.012, 7, 30),
        chrome,
        x,
        0.01,
        0.047,
        dashboard,
      );
      mesh(
        new THREE.CircleGeometry(radius - 0.009, 32),
        faceMaterial(label, max),
        x,
        0.01,
        0.048,
        dashboard,
      );
      const needle = new THREE.Group();
      needle.position.set(x, 0.01, 0.055);
      dashboard.add(needle);
      movingRoots.add(needle);
      rod(
        [0, -radius * 0.17, 0],
        [0, radius * 0.72, 0],
        0.006,
        needleMaterial,
        needle,
      );
      mesh(new THREE.SphereGeometry(0.019, 10, 7), chrome, 0, 0, 0.002, needle);
      instrumentNeedles.push({ group: needle, max, label });
    }
    // Chart repeater and physical switches remain legible at seated distance.
    const display = material('#335552', 0.62);
    display.emissive.set('#28413b');
    display.emissiveIntensity = 0.3;
    roundBox(0.29, 0.205, 0.025, chrome, -0.4, 0.017, 0.046, 0.016, dashboard);
    roundBox(0.257, 0.172, 0.012, display, -0.4, 0.02, 0.063, 0.012, dashboard);
    for (let i = 0; i < 4; i++)
      rod(
        [-0.5, -0.038 + i * 0.035, 0.073],
        [-0.32 + (i % 2) * 0.05, -0.038 + i * 0.035, 0.073],
        0.003,
        piping,
        dashboard,
      );
    for (const x of [-0.62, -0.13, 0.66]) {
      mesh(
        new THREE.CylinderGeometry(0.019, 0.022, 0.03, 10),
        rubber,
        x,
        -0.115,
        0.06,
        dashboard,
      ).rotation.x = Math.PI / 2;
      mesh(
        new THREE.SphereGeometry(0.008, 8, 6),
        needleMaterial,
        x,
        -0.075,
        0.055,
        dashboard,
      );
    }
    // Wheel orientation is fixed to its column; only the inner group spins.
    wheelMount.name = 'Steering wheel mount';
    wheelMount.position.set(0.43, 1.17, -0.21);
    wheelMount.rotation.x = -0.48;
    wheelMount.add(wheelSpin, gripRig);
    gripRig.name = 'Captain sliding grips';
    wheelSpin.name = 'Steering wheel and grips';
    rod([0, 0, -0.22], [0, 0, -0.015], 0.048, chrome, wheelMount);
    mesh(
      new THREE.TorusGeometry(0.222, 0.023, 9, 40),
      navy,
      0,
      0,
      0,
      wheelSpin,
    );
    mesh(
      new THREE.TorusGeometry(0.196, 0.008, 6, 32),
      chrome,
      0,
      0,
      -0.008,
      wheelSpin,
    );
    for (const angle of [Math.PI / 6, (Math.PI * 5) / 6, Math.PI * 1.5]) {
      const x = Math.cos(angle),
        y = Math.sin(angle);
      rod(
        [x * 0.057, y * 0.057, 0.008],
        [x * 0.197, y * 0.197, 0],
        0.016,
        chrome,
        wheelSpin,
      );
    }
    const hub = mesh(
      new THREE.CylinderGeometry(0.073, 0.073, 0.052, 24),
      ivory,
      0,
      0,
      0.014,
      wheelSpin,
    );
    hub.rotation.x = Math.PI / 2;
    rod([-0.033, 0.021, 0.045], [0.033, 0.021, 0.045], 0.006, teal, wheelSpin);
    rod([0, 0.021, 0.045], [0, -0.033, 0.045], 0.006, teal, wheelSpin);
    roundBox(0.022, 0.035, 0.044, piping, 0, 0.22, 0, 0.009, wheelSpin);
    // The upper body is hidden from its own eye; arms/grips remain separate.
    pilotBody.name = 'Captain head and torso';
    const torso = mesh(
      new THREE.CylinderGeometry(0.205, 0.157, 0.45, 16),
      shirt,
      0.43,
      1.18,
      0.3,
      pilotBody,
    );
    torso.scale.z = 0.74;
    ellipsoid(0.205, 0.105, 0.155, shirt, 0.43, 1.39, 0.3, pilotBody);
    mesh(
      new THREE.CylinderGeometry(0.067, 0.079, 0.14, 12),
      skin,
      0.43,
      1.48,
      0.28,
      pilotBody,
    );
    ellipsoid(0.128, 0.162, 0.139, skin, 0.43, 1.61, 0.24, pilotBody);
    ellipsoid(0.137, 0.069, 0.149, navy, 0.43, 1.74, 0.25, pilotBody);
    ellipsoid(0.13, 0.012, 0.093, navy, 0.43, 1.714, 0.12, pilotBody);
    ellipsoid(0.19, 0.12, 0.22, navy, 0.43, 0.86, 0.25);
    for (const sign of [-1, 1]) {
      rod(
        [0.43 + sign * 0.115, 0.84, 0.2],
        [0.43 + sign * 0.14, 0.72, -0.17],
        0.079,
        navy,
      );
      rod(
        [0.43 + sign * 0.14, 0.72, -0.17],
        [0.43 + sign * 0.14, 0.5, -0.16],
        0.067,
        navy,
      );
      const angle = sign < 0 ? (Math.PI * 5) / 6 : Math.PI / 6;
      const grip = new THREE.Vector3(
        Math.cos(angle) * 0.222,
        Math.sin(angle) * 0.222,
        0.019,
      );
      const palm = ellipsoid(
        0.036,
        0.047,
        0.028,
        skin,
        grip.x,
        grip.y,
        0.041,
        gripRig,
      );
      palm.rotation.z = angle - Math.PI / 2;
      const wrist = grip.clone();
      wrist.y -= 0.061;
      wrist.z += 0.035;
      ellipsoid(
        0.03,
        0.042,
        0.026,
        skin,
        grip.x,
        grip.y - 0.033,
        0.043,
        gripRig,
      );
      // Continuous fingers curve over the near rim and around its inner edge.
      const radial = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
      const tangent = new THREE.Vector2(-radial.y, radial.x);
      for (let finger = 0; finger < 4; finger++) {
        const offset = (finger - 1.5) * 0.02;
        const curve = new THREE.CatmullRomCurve3(
          [
            [0.03, 0.032],
            [0.015, 0.048],
            [-0.018, 0.04],
            [-0.029, 0.012],
            [-0.014, -0.02],
          ].map(
            ([r, z]) =>
              new THREE.Vector3(
                grip.x + radial.x * r + tangent.x * offset,
                grip.y + radial.y * r + tangent.y * offset,
                z,
              ),
          ),
        );
        mesh(
          new THREE.TubeGeometry(curve, 8, 0.009, 5, false),
          skin,
          0,
          0,
          0,
          gripRig,
        );
      }
      const thumb = ellipsoid(
        0.018,
        0.031,
        0.024,
        skin,
        grip.x - sign * 0.025,
        grip.y - 0.018,
        0.043,
        gripRig,
      );
      thumb.rotation.z = sign * 0.65;
      const upper = mesh(
        new THREE.CylinderGeometry(0.047, 0.043, 1, 12),
        shirt,
        0,
        0,
        0,
        pilotArms,
      );
      const lower = mesh(
        new THREE.CylinderGeometry(0.028, 0.037, 1, 12),
        skin,
        0,
        0,
        0,
        pilotArms,
      );
      const elbow = ellipsoid(0.044, 0.045, 0.043, shirt, 0, 0, 0, pilotArms);
      articulatedArms.push({
        sign,
        grip: wrist,
        upper,
        lower,
        elbow,
        shoulder: new THREE.Vector3(0.43 + sign * 0.177, 1.37, 0.29),
        hand: new THREE.Vector3(),
        bend: new THREE.Vector3(),
      });
    }
    // Single-lever engine control gives the right-hand console a useful shape.
    roundBox(0.12, 0.19, 0.21, teal, 0.79, 0.88, -0.12, 0.025);
    rod([0.79, 0.94, -0.12], [0.79, 1.13, -0.21], 0.019, chrome);
    ellipsoid(0.037, 0.034, 0.055, rubber, 0.79, 1.13, -0.21);
    pilotBody.visible = stats.cameraMode !== 'captain';
    batchRigidGroup(wheelSpin);
    batchRigidGroup(gripRig);
    batchRigidGroup(pilotBody);
    updateHelm(0);
  }
  const armDelta = new THREE.Vector3();
  function fitArm(item, a, b) {
    armDelta.copy(b).sub(a);
    item.position.copy(a).add(b).multiplyScalar(0.5);
    item.scale.y = armDelta.length();
    item.quaternion.setFromUnitVectors(UP, armDelta.normalize());
  }
  function updateHelm(dt) {
    wheelAngle +=
      ((boat.steer || 0) * 2.05 - wheelAngle) * (1 - Math.exp(-dt * 11));
    // Positive reported helm angle means starboard; the visible rim rotates clockwise.
    wheelSpin.rotation.z = -wheelAngle;
    wheelSpin.updateMatrix();
    // At full lock the palms slide/regrip on their own half of the wheel.
    // This keeps useful steering motion without crossed arms hiding the helm.
    gripRig.rotation.z = -Math.tanh(wheelAngle * 0.6) * 0.38;
    gripRig.updateMatrix();
    wheelMount.updateMatrix();
    for (const arm of articulatedArms) {
      arm.hand
        .copy(arm.grip)
        .applyMatrix4(gripRig.matrix)
        .applyMatrix4(wheelMount.matrix);
      arm.bend.copy(arm.shoulder).lerp(arm.hand, 0.52);
      arm.bend.x += arm.sign * 0.085;
      arm.bend.y = Math.min(arm.bend.y - 0.18, 1.1);
      arm.bend.z += 0.1;
      fitArm(arm.upper, arm.shoulder, arm.bend);
      fitArm(arm.lower, arm.bend, arm.hand);
      arm.elbow.position.copy(arm.bend);
    }
    for (const needle of instrumentNeedles) {
      const value =
        needle.label === 'KNOTS'
          ? Math.abs(boat.speed) * 1.94384
          : 0.9 + Math.abs(boat.speed) * 0.58;
      needle.group.rotation.z =
        Math.PI * 0.75 - Math.min(value / needle.max, 1) * Math.PI * 1.5;
    }
    stats.wheelAngle = wheelAngle;
  }
  function batchRigidGroup(group) {
    const batches = new Map();
    for (const item of [...group.children]) {
      if (!item.isMesh) continue;
      item.updateMatrix();
      const source = item.geometry.index
        ? own(item.geometry.toNonIndexed())
        : item.geometry;
      const geometry = own(source.clone().applyMatrix4(item.matrix));
      for (const key of Object.keys(geometry.attributes))
        if (!['position', 'normal'].includes(key))
          geometry.deleteAttribute(key);
      if (!batches.has(item.material)) batches.set(item.material, []);
      batches.get(item.material).push(geometry);
      item.removeFromParent();
    }
    for (const [mat, geometries] of batches)
      mesh(mergeGeometries(geometries), mat, 0, 0, 0, group);
  }
  function batchBoat() {
    const batches = new Map();
    root.updateMatrixWorld(true);
    const candidates = [];
    const collect = (object) => {
      if (movingRoots.has(object)) return;
      if (object.isMesh && !object.material.transparent)
        candidates.push(object);
      for (const child of object.children) collect(child);
    };
    collect(root);
    for (const item of candidates) {
      const source = item.geometry.index
        ? own(item.geometry.toNonIndexed())
        : item.geometry;
      const geometry = own(source.clone().applyMatrix4(item.matrixWorld));
      const keep = item.material.map
        ? ['position', 'normal', 'uv']
        : ['position', 'normal'];
      for (const name of Object.keys(geometry.attributes))
        if (!keep.includes(name)) geometry.deleteAttribute(name);
      if (item.material.map?.isDataTexture) {
        const position = geometry.attributes.position;
        const uv = new Float32Array(position.count * 2);
        for (let i = 0; i < position.count; i++) {
          uv[i * 2] = position.getX(i) * 3.4;
          uv[i * 2 + 1] = position.getZ(i) * 0.62;
        }
        geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      }
      if (!batches.has(item.material)) batches.set(item.material, []);
      batches.get(item.material).push(geometry);
      item.removeFromParent();
    }
    for (const [mat, geometries] of batches) {
      const merged = own(mergeGeometries(geometries));
      const item = new THREE.Mesh(merged, mat);
      // The island shadow map is static. Moving launch geometry only receives it.
      item.castShadow = false;
      item.receiveShadow = true;
      root.add(item);
    }
  }
  function buildWake() {
    // One footprint includes the diffuse centre wash and both spreading edges.
    // Three vertices across each row keep curved wakes continuous without rails.
    const geometry = own(new THREE.BufferGeometry());
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array(MAX_SAMPLES * 3 * 3),
        3,
      ).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute(
      'uv',
      new THREE.BufferAttribute(
        new Float32Array(MAX_SAMPLES * 3 * 2),
        2,
      ).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute(
      'aFade',
      new THREE.BufferAttribute(new Float32Array(MAX_SAMPLES * 3), 1).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    geometry.setAttribute(
      'aAge',
      new THREE.BufferAttribute(new Float32Array(MAX_SAMPLES * 3), 1).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    const indices = [];
    for (let i = 0; i < MAX_SAMPLES - 1; i++)
      for (let side = 0; side < 2; side++) {
        const a = i * 3 + side;
        indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
      }
    geometry.setIndex(indices);
    geometry.setDrawRange(0, 0);
    const foam = own(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true,
        uniforms: {
          ...THREE.UniformsLib.fog,
          tint: { value: new THREE.Color('#c3d8cf') },
        },
        vertexShader: `attribute float aFade; attribute float aAge;
        varying vec2 vUv; varying vec2 vWorld; varying float vFade; varying float vAge;
        #include <fog_pars_vertex>
        void main() { vUv=uv; vFade=aFade; vAge=aAge; vWorld=position.xz;
          vec4 mvPosition=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mvPosition;
          #include <fog_vertex>
        }`,
        fragmentShader: `uniform vec3 tint;
        varying vec2 vUv; varying vec2 vWorld; varying float vFade; varying float vAge;
        #include <fog_pars_fragment>
        float hash(vec2 p) {
          vec3 q=fract(vec3(p.xyx)*0.1031); q+=dot(q,q.yzx+33.33);
          return fract((q.x+q.y)*q.z);
        }
        float noise(vec2 p) {
          vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),
            mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
        }
        void main() {
          vec2 p=vWorld*2.6+vec2(vAge*0.13,-vAge*0.09);
          float broad=noise(p*0.31);
          float n=noise(p)*0.57+noise(p*2.07+17.8)*0.29+noise(p*4.13-9.2)*0.14;
          float crossWake=vUv.x*2.-1.;
          float edgeCentre=0.70+(broad-0.5)*0.22;
          float edgeDistance=abs(abs(crossWake)-edgeCentre);
          float edgeWidth=0.14+vAge*0.009;
          float edge=exp(-pow(edgeDistance/edgeWidth,2.)*1.6);
          // Broken soft foam patches, not a periodic weave along each strip.
          float breakup=smoothstep(0.37,0.72,n);
          float edgeFoam=edge*breakup*0.27;
          float metres=crossWake*(0.90+vAge*0.88);
          float centre=exp(-pow(metres/(0.40+vAge*0.24),2.)*1.6)*exp(-vAge*1.02);
          float wash=centre*(0.12+smoothstep(0.40,0.68,n)*0.62);
          float mist=(1.-smoothstep(0.2,1.,abs(crossWake)))*0.027*exp(-vAge*0.55);
          float outer=1.-smoothstep(0.86,1.,abs(crossWake));
          float sternFade=smoothstep(0.,0.12,vAge);
          gl_FragColor=vec4(tint,(edgeFoam+wash+mist)*vFade*outer*sternFade);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      }),
    );
    wake = new THREE.Mesh(geometry, foam);
    wake.name = 'World space propeller wake';
    wake.frustumCulled = false;
    wake.renderOrder = 2;
    context.scene.add(wake);
    const sprayGeometry = own(new THREE.BufferGeometry());
    sprayGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(MAX_DROPS * 3), 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    sprayGeometry.setAttribute(
      'aFade',
      new THREE.BufferAttribute(new Float32Array(MAX_DROPS), 1).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    sprayGeometry.setAttribute(
      'aSize',
      new THREE.BufferAttribute(new Float32Array(MAX_DROPS), 1).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    sprayGeometry.setDrawRange(0, 0);
    const sprayMaterial = own(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        fog: true,
        uniforms: { ...THREE.UniformsLib.fog },
        vertexShader: `attribute float aFade; attribute float aSize; varying float vFade;
        #include <fog_pars_vertex>
        void main(){vFade=aFade;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;gl_PointSize=clamp(aSize*650./-mvPosition.z,1.,16.);
          #include <fog_vertex>
        }`,
        fragmentShader: `varying float vFade;
        #include <fog_pars_fragment>
        void main(){
          vec2 p=(gl_PointCoord-0.5)*2.;float r=length(p);
          if(r>1.)discard;
          float soft=pow(1.-r,2.1);
          gl_FragColor=vec4(0.76,0.89,0.83,soft*vFade*0.36);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      }),
    );
    spray = new THREE.Points(sprayGeometry, sprayMaterial);
    spray.name = 'Fine bow spray';
    spray.frustumCulled = false;
    spray.renderOrder = 3;
    context.scene.add(spray);
  }
  // Seeded stochastic emission gives reproducible checks without periodic strings.
  let effectSeed = 14371;
  function random() {
    effectSeed = (Math.imul(effectSeed, 1664525) + 1013904223) >>> 0;
    return effectSeed / 4294967296;
  }
  function clearWake() {
    wheelAngle = 0;
    samples.length = 0;
    drops.length = 0;
    emitTime = 0;
    sprayTime = 0;
  }
  function updateWake(dt, speed) {
    const h = boat.heading;
    const forwardX = Math.sin(h);
    const forwardZ = -Math.cos(h);
    const rightX = Math.cos(h);
    const rightZ = Math.sin(h);
    for (const sample of samples) sample.age += dt;
    while (samples.length && samples[0].age > 5.2) samples.shift();
    emitTime += dt;
    if (dt > 0 && speed > 1.1 && emitTime > 0.065) {
      const direction = boat.speed < 0 ? -1 : 1;
      if (samples.length && samples.at(-1).direction !== direction)
        samples.length = 0;
      samples.push({
        x: boat.x - forwardX * 2.72,
        z: boat.z - forwardZ * 2.72,
        h,
        direction,
        age: 0,
        strength: Math.min(speed / 6, 1),
      });
      if (samples.length > MAX_SAMPLES) samples.shift();
      emitTime = 0;
    }
    const pos = wake.geometry.attributes.position;
    const uv = wake.geometry.attributes.uv;
    const fade = wake.geometry.attributes.aFade;
    const age = wake.geometry.attributes.aAge;
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      const width = 0.9 + sample.age * (0.55 + sample.strength * 0.33);
      const rx = Math.cos(sample.h);
      const rz = Math.sin(sample.h);
      for (let column = 0; column < 3; column++) {
        const j = i * 3 + column;
        const cross = (column - 1) * width;
        pos.setXYZ(j, sample.x + rx * cross, 0.072, sample.z + rz * cross);
        uv.setXY(j, column / 2, 0);
        age.setX(j, sample.age);
        fade.setX(
          j,
          Math.pow(Math.max(0, 1 - sample.age / 5.2), 1.55) * sample.strength,
        );
      }
    }
    pos.needsUpdate =
      uv.needsUpdate =
      fade.needsUpdate =
      age.needsUpdate =
        true;
    wake.geometry.setDrawRange(0, Math.max(0, samples.length - 1) * 12);
    sprayTime += dt;
    if (dt > 0 && speed > 2.6 && sprayTime > 0.028) {
      const count = 4 + Math.floor(random() * 3);
      for (let i = 0; i < count; i++) {
        const sign = random() < 0.5 ? -1 : 1;
        const fore = -0.65 + random() * 1.2;
        const cross = sign * (0.91 + random() * 0.15);
        const outward = sign * (0.25 + random() * 1.05);
        const carry = speed * (0.05 + random() * 0.18);
        drops.push({
          x: boat.x + forwardX * fore + rightX * cross,
          y: 0.1 + random() * 0.075,
          z: boat.z + forwardZ * fore + rightZ * cross,
          vx: rightX * outward + forwardX * carry,
          vz: rightZ * outward + forwardZ * carry,
          vy: 0.25 + random() * 0.55,
          age: 0,
          life: 0.24 + random() * 0.32,
          size: 0.025 + random() * 0.085,
          strength: (0.35 + random() * 0.5) * Math.min(1, speed / 6),
        });
      }
      sprayTime = random() * 0.012;
    }
    for (let i = drops.length - 1; i >= 0; i--) {
      const drop = drops[i];
      drop.age += dt;
      drop.x += drop.vx * dt;
      drop.z += drop.vz * dt;
      drop.vy -= dt * 3;
      drop.y = Math.max(0.082, drop.y + drop.vy * dt);
      if (drop.age > drop.life || drops.length > MAX_DROPS) drops.splice(i, 1);
    }
    const sp = spray.geometry.attributes.position;
    const sf = spray.geometry.attributes.aFade;
    const ss = spray.geometry.attributes.aSize;
    for (let i = 0; i < drops.length; i++) {
      const drop = drops[i];
      const life = drop.age / drop.life;
      sp.setXYZ(i, drop.x, drop.y, drop.z);
      sf.setX(i, Math.pow(1 - life, 1.6) * drop.strength);
      ss.setX(i, drop.size * (1 + life * 1.8));
    }
    sp.needsUpdate = sf.needsUpdate = ss.needsUpdate = true;
    spray.geometry.setDrawRange(0, drops.length);
    stats.wakeSamples = samples.length;
    stats.sprayParticles = drops.length;
  }
  return {
    id: 'boat-view',
    stats,
    setCameraMode(mode) {
      stats.cameraMode = mode === 'captain' ? 'captain' : 'chase';
      pilotBody.visible = stats.cameraMode !== 'captain';
    },
    getHelmPose() {
      root.updateMatrixWorld(true);
      return {
        position: root.localToWorld(eye.clone()).toArray(),
        target: root.localToWorld(look.clone()).toArray(),
        up: UP.clone().transformDirection(root.matrixWorld).toArray(),
      };
    },
    init(ctx) {
      context = ctx;
      buildBoat();
      buildWake();
      context.scene.add(root);
      root.position.set(boat.x, 0, boat.z);
      root.rotation.y = -boat.heading;
    },
    update(dt) {
      if (disposed) return;
      const state = rules.state;
      const running = state === 'running';
      const speed = Math.abs(boat.speed);
      const distance = Math.hypot(boat.x - lastX, boat.z - lastZ);
      const elapsed = rules.elapsed ?? 0;
      const restarted =
        elapsed < previousElapsed ||
        (state === 'running' && ['finished', 'ready'].includes(previousState));
      if (
        distance > 12 ||
        restarted ||
        (state === 'ready' && previousState !== 'ready')
      )
        clearWake();
      const activeDt = running || state === 'ready' ? dt : 0;
      visualTime += activeDt;
      const smoothing = 1 - Math.exp(-activeDt * 4);
      updateHelm(activeDt);
      roll +=
        (-(boat.steer || 0) * Math.min(speed / 10, 1) * 0.085 - roll) *
        smoothing;
      pitch += (Math.min(speed / 11, 1) * 0.055 - pitch) * smoothing;
      root.position.set(
        boat.x,
        Math.sin(visualTime * 1.9) * 0.025 +
          Math.sin(visualTime * 3.3 + 1.5) * 0.009,
        boat.z,
      );
      root.rotation.set(
        pitch + Math.sin(visualTime * 1.7) * 0.008,
        -boat.heading,
        roll + Math.sin(visualTime * 1.3) * 0.012,
        'YXZ',
      );
      updateWake(running ? dt : 0, speed);
      lastX = boat.x;
      lastZ = boat.z;
      previousState = state;
      previousElapsed = elapsed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      context?.scene.remove(root);
      if (wake) context?.scene.remove(wake);
      if (spray) context?.scene.remove(spray);
      for (const resource of owned) resource.dispose();
      owned.clear();
      root.clear();
      samples.length = drops.length = 0;
    },
  };
}
