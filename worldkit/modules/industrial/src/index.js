import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Concrete machinery assemblies in metres. Placement, clocks and collision belong to the game. */
export function createIndustrialKit({ finish = null } = {}) {
  const materials = {
    shell: new T.MeshPhysicalMaterial({
      name: 'Worldkit / enamel machine casings',
      color: '#c7c4af',
      roughness: 0.24,
      clearcoat: 0.72,
      clearcoatRoughness: 0.2,
      metalness: 0.06,
    }),
    steel: new T.MeshStandardMaterial({
      name: 'Worldkit / working steel',
      color: '#76868e',
      roughness: 0.34,
      metalness: 0.82,
    }),
    dark: new T.MeshStandardMaterial({
      name: 'Worldkit / graphite machine interiors',
      color: '#53616a',
      roughness: 0.54,
      metalness: 0.38,
    }),
    cast: new T.MeshStandardMaterial({
      name: 'Worldkit / rough cast bearing bodies',
      color: '#626a63',
      roughness: 0.84,
      metalness: 0.36,
    }),
    machined: new T.MeshStandardMaterial({
      name: 'Worldkit / exposed machined alloy',
      color: '#bac8cc',
      roughness: 0.28,
      metalness: 0.86,
    }),
    amber: new T.MeshStandardMaterial({
      name: 'Worldkit / machinery caution enamel',
      color: '#c98c2b',
      roughness: 0.64,
      metalness: 0.25,
    }),
  };
  for (const key of ['shell', 'steel', 'dark', 'cast'])
    finish?.bind(materials[key], key);
  finish?.bind(materials.machined, 'machined', 'part');
  const geometries = new Set(),
    prototypes = {};
  function assembly(name, build) {
    const batches = {};
    const add = (key, geometry, position, rotation = null) => {
      // Retain the lathe axis before the part is rotated/placed into its assembly.
      if (key === 'machined')
        geometry.setAttribute(
          'industrialCoord',
          geometry.attributes.position.clone(),
        );
      geometry.applyMatrix4(
        new T.Matrix4().compose(
          new T.Vector3(...position),
          rotation ?? new T.Quaternion(),
          new T.Vector3(1, 1, 1),
        ),
      );
      if (geometry.index) {
        const flat = geometry.toNonIndexed();
        geometry.dispose();
        geometry = flat;
      }
      (batches[key] ??= []).push(geometry);
    };
    const box = (key, size, position) =>
      add(
        key,
        new RoundedBoxGeometry(
          ...size,
          1,
          Math.min(1.6, Math.min(...size) * 0.08),
        ),
        position,
      );
    const cylinder = (key, radius, length, position) =>
      add(key, new T.CylinderGeometry(radius, radius, length, 12), position);
    const beam = (key, a, b, width) => {
      const from = new T.Vector3(...a),
        to = new T.Vector3(...b),
        delta = to.clone().sub(from);
      add(
        key,
        new T.BoxGeometry(width, delta.length(), width),
        from.add(to).multiplyScalar(0.5).toArray(),
        new T.Quaternion().setFromUnitVectors(
          new T.Vector3(0, 1, 0),
          delta.normalize(),
        ),
      );
    };
    // Removable casing with a gasket, raised lid, retainers and recessed vents.
    const panel = (x, y, z, w, h, sign = -1, vent = false) => {
      box('dark', [w + 2, h + 2, 1.6], [x, y, z]);
      box('shell', [w, h, 1.8], [x, y, z + sign * 1.4]);
      for (const dx of [-w / 2 + 2, w / 2 - 2])
        for (const dy of [-h / 2 + 2, h / 2 - 2])
          add(
            'steel',
            new T.CylinderGeometry(0.9, 0.9, 1, 6),
            [x + dx, y + dy, z + sign * 2.7],
            new T.Quaternion().setFromAxisAngle(
              new T.Vector3(1, 0, 0),
              Math.PI / 2,
            ),
          );
      if (vent) {
        box('dark', [w * 0.65, h * 0.55, 1], [x, y, z + sign * 2.5]);
        for (let dy = -h * 0.2; dy < h * 0.25; dy += 4)
          box('steel', [w * 0.61, 1.3, 2], [x, y + dy, z + sign * 3.5]);
      }
    };
    const pipe = (points, radius = 2.2) => {
      const path = new T.CatmullRomCurve3(
        points.map((p) => new T.Vector3(...p)),
        false,
        'centripetal',
      );
      add(
        'dark',
        new T.TubeGeometry(path, points.length * 5, radius, 8, false),
        [0, 0, 0],
      );
      for (const t of [0, 1]) {
        const q = new T.Quaternion().setFromUnitVectors(
          new T.Vector3(0, 1, 0),
          path.getTangent(t),
        );
        add(
          'steel',
          new T.CylinderGeometry(radius * 1.8, radius * 1.8, radius * 1.1, 12),
          path.getPoint(t).toArray(),
          q,
        );
      }
    };
    build({ box, cylinder, beam, add, panel, pipe });
    prototypes[name] = Object.entries(batches).map(([key, parts]) => {
      const geometry = mergeGeometries(parts, false);
      geometry.name = `Worldkit / ${name} / ${key}`;
      parts.forEach((part) => part.dispose());
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      geometries.add(geometry);
      return { geometry, material: materials[key] };
    });
  }
  assembly('transferBed', ({ box, add, panel, pipe }) => {
    for (const x of [-28, 28]) box('dark', [9, 12, 154], [x, -5, 0]);
    for (const z of [-65, 0, 65]) box('steel', [86, 8, 10], [0, -5, z]);
    for (const x of [-39, 39]) {
      box('shell', [10, 16, 150], [x, 5, 0]);
      box('steel', [14, 4, 154], [x, 15, 0]);
    }
    const axle = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 0, 1),
      Math.PI / 2,
    );
    for (let z = -60; z <= 60; z += 20) {
      add('machined', new T.CylinderGeometry(8, 8, 70, 20), [0, 22, z], axle);
      for (const x of [-45, 45]) {
        box('shell', [12, 23, 16], [x, 17, z]);
        add('dark', new T.CylinderGeometry(10, 10, 7, 20), [x, 22, z], axle);
        add('machined', new T.CylinderGeometry(5, 5, 11, 16), [x, 22, z], axle);
        for (const dz of [-6, 6]) box('steel', [15, 4, 3], [x, 7, z + dz]);
      }
    }
    box('shell', [58, 26, 26], [0, 10, -83]);
    panel(0, 10, -97, 44, 18, -1, true);
    pipe(
      [
        [-45, 22, -60],
        [-52, 22, -60],
        [-52, 22, 60],
        [-45, 22, 60],
      ],
      3,
    );
    for (const z of [-54, 54]) box('steel', [90, 11, 14], [0, -14, z]);
    box('amber', [50, 8, 18], [0, 36, 70]);
    for (const z of [-50, 0, 50]) {
      box('dark', [14, 12, 30], [55, 14, z]);
      panel(55, 14, z - 16, 11, 8, -1, false);
    }
    add(
      'machined',
      new T.CylinderGeometry(2, 2, 135, 12),
      [55, 14, 0],
      new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2),
    );
    box('shell', [24, 27, 34], [55, 22, -84]);
    add('steel', new T.CylinderGeometry(10, 10, 25, 20), [55, 43, -84], axle);
    for (const z of [-68, 0, 68]) box('steel', [114, 7, 12], [7, -18, z]);
  });
  assembly('counterweightGuide', ({ box, add, beam }) => {
    box('cast', [72, 14, 64], [0, -28, 0]);
    for (const x of [-26, 26]) {
      box('dark', [6, 180, 23], [x, 63, 0]);
      for (const z of [-12, 12]) box('steel', [12, 180, 3], [x, 63, z]);
      box('shell', [17, 9, 44], [x, -16, 0]);
      for (const y of [18, 74, 128]) box('cast', [12, 8, 30], [x, y, 0]);
      beam('dark', [x, -17, 18], [x, 137, 28], 4);
    }
    box('cast', [74, 16, 62], [0, 157, 0]);
    box('shell', [80, 5, 66], [0, 168, 0]);
    const axle = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 0, 1),
      Math.PI / 2,
    );
    for (const x of [-8, 8]) {
      add('steel', new T.CylinderGeometry(12, 12, 5, 24), [x, 145, 0], axle);
      for (const dx of [-3, 3])
        add(
          'dark',
          new T.CylinderGeometry(14, 14, 1.5, 24),
          [x + dx, 145, 0],
          axle,
        );
    }
    add('machined', new T.CylinderGeometry(3, 3, 70, 16), [0, 145, 0], axle);
    for (const x of [-28, 28]) box('cast', [9, 17, 22], [x, 141, 0]);
  });
  assembly('counterweight', ({ box, add }) => {
    for (const y of [-16, -5, 6, 17]) box('cast', [28, 9, 32], [0, y, 0]);
    for (const x of [-11, 11]) box('steel', [4, 45, 36], [x, 0, 0]);
    box('shell', [32, 5, 38], [0, -24, 0]);
    box('amber', [30, 3, 35], [0, 24, 0]);
    for (const x of [-8, 8]) {
      box('steel', [5, 8, 7], [x, 27, -12]);
      add(
        'dark',
        new T.CylinderGeometry(2.5, 2.5, 9, 12),
        [x, 27, -12],
        new T.Quaternion().setFromAxisAngle(
          new T.Vector3(0, 0, 1),
          Math.PI / 2,
        ),
      );
    }
  });
  assembly('louverPanel', ({ box, add }) => {
    box('dark', [66, 74, 8], [0, 0, 4]);
    for (const x of [-35, 35]) box('shell', [5, 82, 17], [x, 0, 0]);
    for (const y of [-39, 39]) box('shell', [74, 5, 17], [0, y, 0]);
    for (let y = -31; y <= 31; y += 9)
      add(
        'steel',
        new T.BoxGeometry(64, 3, 14),
        [0, y, -4],
        new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), 0.48),
      );
    for (const x of [-31, 31])
      for (const y of [-35, 35]) box('machined', [3, 3, 3], [x, y, -10]);
  });
  assembly('driveGearbox', ({ box, add, panel, pipe }) => {
    box('dark', [46, 8, 70], [0, -27, 0]);
    box('cast', [34, 42, 58], [0, -3, 0]);
    box('steel', [40, 4, 64], [0, 20, 0]);
    const axle = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 0, 1),
      Math.PI / 2,
    );
    for (const x of [-20, 20]) {
      add('dark', new T.CylinderGeometry(14, 14, 8, 24), [x, 0, 0], axle);
      add('machined', new T.CylinderGeometry(7, 7, 19, 20), [x, 0, 0], axle);
    }
    for (const z of [-30, 30]) panel(0, -3, z, 25, 28, Math.sign(z), true);
    for (const z of [-21, 21]) box('steel', [42, 8, 8], [0, -19, z]);
    add('steel', new T.CylinderGeometry(12, 12, 25, 20), [0, 35, 0], axle);
    for (let x = -10; x <= 10; x += 4)
      add('dark', new T.CylinderGeometry(13, 13, 1.4, 20), [x, 35, 0], axle);
    pipe(
      [
        [12, 35, 0],
        [26, 32, 0],
        [26, 7, 0],
        [20, 0, 0],
      ],
      2.3,
    );
  });
  assembly('hydraulicBank', ({ box, add, panel, pipe }) => {
    box('dark', [48, 8, 82], [0, 0, 0]);
    box('shell', [40, 26, 58], [0, 17, 6]);
    box('steel', [44, 4, 62], [0, 32, 6]);
    panel(0, 17, -24, 30, 17, -1, false);
    const horizontal = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(1, 0, 0),
      Math.PI / 2,
    );
    add(
      'dark',
      new T.CylinderGeometry(10, 10, 30, 20),
      [-8, 45, 2],
      horizontal,
    );
    for (let z = -11; z <= 14; z += 5)
      add(
        'steel',
        new T.CylinderGeometry(11, 11, 1.7, 20),
        [-8, 45, z],
        horizontal,
      );
    add(
      'machined',
      new T.CylinderGeometry(5, 5, 9, 16),
      [-8, 45, -19],
      horizontal,
    );
    box('amber', [17, 18, 17], [-8, 45, -31]);
    box('dark', [11, 14, 26], [15, 40, 6]);
    for (const z of [-1, 8, 17]) {
      add('machined', new T.CylinderGeometry(2.4, 2.4, 5, 12), [15, 50, z]);
      pipe(
        [
          [15, 47, z],
          [28, 47, z],
          [28, 20, z],
          [19, 20, z],
        ],
        1.3,
      );
    }
    pipe(
      [
        [-8, 39, -31],
        [-8, 26, -40],
        [15, 26, -40],
        [15, 39, -5],
      ],
      2.2,
    );
    pipe(
      [
        [8, 33, 21],
        [8, 55, 21],
        [16, 58, 21],
        [24, 58, 21],
      ],
      2.5,
    );
    for (const z of [-29, 29]) box('steel', [50, 4, 9], [0, -5, z]);
  });
  assembly('serviceDeck', ({ box, cylinder, beam }) => {
    for (const x of [-5, 5]) box('steel', [1.8, 4, 140], [x, -1, 0]);
    box('dark', [10, 1.2, 140], [0, 0.6, 0]);
    for (let z = -65; z <= 65; z += 10)
      box('steel', [10, 0.3, 1.2], [0, 1.35, z]);
    for (const x of [-5.8, 5.8]) {
      for (const z of [-68, -34, 0, 34, 68])
        cylinder('steel', 0.45, 3.6, [x, 2.5, z]);
      for (const y of [2.4, 4.1]) beam('steel', [x, y, -70], [x, y, 70], 0.65);
      box('amber', [0.7, 0.7, 140], [x, 1.4, 0]);
    }
    for (const z of [-58, 0, 58]) {
      box('steel', [17, 3, 5], [0, -4, z]);
      beam('dark', [-8, -4, z], [0, -15, z], 2);
      beam('dark', [8, -4, z], [0, -15, z], 2);
    }
  });
  assembly('driveBearing', ({ box, add }) => {
    box('dark', [14, 5, 22], [0, -21, 0]);
    box('cast', [10, 13, 16], [0, -12, 0]);
    const axle = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 0, 1),
      Math.PI / 2,
    );
    add('dark', new T.CylinderGeometry(8, 8, 8, 24, 1, true), [0, 0, 0], axle);
    for (const x of [-4.5, 4.5])
      add(
        'machined',
        new T.TorusGeometry(6.6, 1.9, 8, 24),
        [x, 0, 0],
        new T.Quaternion().setFromAxisAngle(
          new T.Vector3(0, 1, 0),
          Math.PI / 2,
        ),
      );
    for (const z of [-8, 8])
      for (const x of [-4.5, 4.5]) box('steel', [2, 2.5, 2], [x, -17.5, z]);
  });
  assembly('dieJaw', ({ box, add, panel, pipe }) => {
    box('dark', [56, 12, 100], [0, -5, 0]);
    box('shell', [48, 72, 84], [0, 36, 0]);
    for (const z of [-34, 34]) {
      box('steel', [62, 9, 15], [0, 18, z]);
      box('steel', [62, 9, 15], [0, 62, z]);
      add('steel', new T.CylinderGeometry(6, 6, 90, 16), [0, 66, z]);
      add('dark', new T.CylinderGeometry(9, 9, 12, 16), [0, 97, z]);
    }
    box('dark', [30, 46, 58], [-29, 38, 0]);
    for (const y of [24, 50]) box('steel', [17, 16, 62], [-42, y, 0]);
    box('amber', [56, 10, 100], [0, 104, 0]);
    panel(0, 39, -43, 34, 34, -1, true);
    pipe(
      [
        [20, 70, -20],
        [34, 84, -20],
        [34, 105, -20],
        [0, 111, -20],
      ],
      3.2,
    );
  });
  assembly('feedRoll', ({ box, add, panel, pipe }) => {
    const axle = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 0, 1),
      Math.PI / 2,
    );
    add('machined', new T.CylinderGeometry(18, 18, 154, 32), [0, 72, 0], axle);
    for (let x = -66; x <= 66; x += 22)
      add(
        'dark',
        new T.CylinderGeometry(18.6, 18.6, 2.5, 32),
        [x, 72, 0],
        axle,
      );
    for (const side of [-1, 1]) {
      box('dark', [44, 18, 62], [side * 92, -10, 0]);
      // Cast bearing cheeks expose the web and anchoring feet below the roll.
      const cheek = new T.Shape(
        [
          [-22, -3],
          [22, -3],
          [17, 53],
          [10, 67],
          [-10, 67],
          [-17, 53],
        ].map(([x, y]) => new T.Vector2(x, y)),
      );
      cheek.holes.push(
        new T.Path(
          [
            [-8, 12],
            [-8, 43],
            [0, 54],
            [8, 43],
            [8, 12],
          ].map(([x, y]) => new T.Vector2(x, y)),
        ),
      );
      for (const z of [-20, 12])
        add(
          'cast',
          new T.ExtrudeGeometry(cheek, {
            depth: 8,
            bevelEnabled: true,
            bevelSize: 1,
            bevelThickness: 1,
            bevelSegments: 1,
            steps: 1,
          }),
          [side * 92, 0, z],
        );
      box('dark', [17, 45, 15], [side * 92, 25, 0]);
      for (const x of [-17, 17])
        box('steel', [5, 7, 56], [side * 92 + x, -2, 0]);
      add(
        'cast',
        new T.CylinderGeometry(26, 26, 27, 24),
        [side * 92, 72, 0],
        axle,
      );
      add(
        'dark',
        new T.CylinderGeometry(19, 19, 31, 24),
        [side * 92, 72, 0],
        axle,
      );
      add(
        'steel',
        new T.CylinderGeometry(9, 9, 48, 24),
        [side * 92, 72, 0],
        axle,
      );
      panel(side * 92, 28, -24, 26, 32, -1, true);
      pipe(
        [
          [side * 92, 52, -25],
          [side * 113, 45, -25],
          [side * 113, 3, -25],
          [side * 95, -1, -25],
        ],
        2.6,
      );
      box('amber', [40, 6, 55], [side * 92, 98, 0]);
    }
  });
  assembly('pressFrame', ({ box, cylinder, panel, pipe, add }) => {
    for (const x of [-54, 54]) {
      box('dark', [19, 8, 42], [x, -5, 0]);
      const upright = new T.Shape(
        [
          [-10, -4],
          [10, -4],
          [10, 7],
          [7, 18],
          [7, 61],
          [12, 71],
          [-12, 71],
          [-7, 61],
          [-7, 18],
          [-10, 7],
        ].map(([a, b]) => new T.Vector2(a, b)),
      );
      upright.holes.push(
        new T.Path(
          [
            [-3.5, 18],
            [-3.5, 54],
            [0, 60],
            [3.5, 54],
            [3.5, 18],
          ].map(([a, b]) => new T.Vector2(a, b)),
        ),
      );
      for (const z of [-15, 7])
        add(
          'cast',
          new T.ExtrudeGeometry(upright, {
            depth: 8,
            bevelEnabled: true,
            bevelSize: 0.6,
            bevelThickness: 0.6,
            bevelSegments: 1,
            steps: 1,
          }),
          [x, 0, z],
        );
      box('dark', [6, 48, 4], [x, 34, 10]);
      cylinder('steel', 3.7, 62, [x, 33, -18]);
      box('amber', [18, 3, 35], [x, 68, 0]);
      for (const y of [16, 48]) panel(x, y, -16, 12, 23);
      for (const y of [7, 59]) cylinder('dark', 5.7, 6, [x, y, -18]);
    }
    for (const y of [71.5, 84.5]) box('cast', [124, 5, 40], [0, y, 0]);
    for (const x of [-54, 54]) box('cast', [16, 18, 40], [x, 78, 0]);
    box('dark', [98, 12, 5], [0, 78, 15]);
    pipe(
      [
        [-44, 78, -8],
        [44, 78, -8],
      ],
      2.1,
    );
    box('dark', [88, 8, 30], [0, 66, 0]);
    box('steel', [130, 3, 48], [0, 90, 0]);
    for (const x of [-51, 51]) panel(x, 78, -21, 19, 13);
    for (const x of [-30, 30]) cylinder('steel', 8, 16, [x, 96, 0]);
    for (const side of [-1, 1]) {
      box('dark', [16, 34, 22], [side * 72, 14, 0]);
      panel(side * 72, 14, -12, 13, 24, -1, true);
      for (const z of [-7, 7])
        pipe(
          [
            [side * 72, 28, z],
            [side * 73, 85, z],
            [side * 62, 102, z],
            [side * 30, 104, z],
          ],
          2.4,
        );
    }
  });
  assembly('gantry', ({ box, beam, add, panel }) => {
    for (const x of [-77, 77]) {
      box('dark', [5, 228, 19], [x, 104, 0]);
      for (const z of [-10, 10]) box('steel', [17, 228, 3], [x, 104, z]);
      box('shell', [28, 10, 38], [x, -8, 0]);
      for (const y of [15, 75, 135, 195]) box('steel', [16, 3, 21], [x, y, 0]);
      box('amber', [25, 8, 34], [x, 213, 0]);
    }
    box('dark', [174, 22, 5], [0, 221, 0]);
    for (const y of [208, 234]) box('amber', [180, 5, 34], [0, y, 0]);
    for (let x = -72; x <= 72; x += 24) box('steel', [3, 22, 27], [x, 221, 0]);
    for (const x of [-55, 55])
      beam('dark', [Math.sign(x) * 77, 172, 0], [x, 207, 0], 7);
    box('dark', [44, 14, 40], [12, 202, 0]);
    box('amber', [48, 5, 46], [12, 211, 0]);
    panel(12, 202, -22, 38, 12);
    const axle = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(1, 0, 0),
      Math.PI / 2,
    );
    for (const x of [-4, 28])
      add('steel', new T.CylinderGeometry(7, 7, 38, 20), [x, 192, 0], axle);
    for (const x of [4, 20]) box('dark', [1.1, 38, 1.1], [x, 173, 0]);
    box('steel', [24, 6, 10], [12, 153, 0]);
  });
  assembly('serviceTower', ({ box, cylinder, add }) => {
    const body = new T.Shape(
      [
        [-20, -10],
        [20, -10],
        [20, 80],
        [12, 108],
        [-12, 108],
        [-20, 80],
      ].map(([x, y]) => new T.Vector2(x, y)),
    );
    body.holes.push(
      new T.Path(
        [
          [-10, 12],
          [-10, 76],
          [10, 76],
          [10, 12],
        ].map(([x, y]) => new T.Vector2(x, y)),
      ),
    );
    add(
      'shell',
      new T.ExtrudeGeometry(body, {
        depth: 34,
        bevelEnabled: true,
        bevelThickness: 1,
        bevelSize: 1,
        bevelSegments: 1,
        steps: 1,
      }),
      [0, 0, -17],
    );
    box('dark', [25, 88, 12], [0, 41, 12]);
    box('steel', [48, 12, 52], [0, -8, 0]);
    box('amber', [27, 8, 40], [0, 83, 0]);
    cylinder('steel', 6, 103, [25, 44, 8]);
    box('shell', [48, 12, 52], [0, 108, 0]);
  });
  assembly('motor', ({ box, cylinder }) => {
    box('dark', [26, 10, 40], [0, 0, 0]);
    box('shell', [22, 19, 32], [0, 13, 0]);
    for (let z = -12; z <= 12; z += 6) box('steel', [24, 2, 3], [0, 23, z]);
    cylinder('steel', 5, 16, [0, 31, 0]);
    box('amber', [24, 2, 34], [0, 5, 0]);
  });

  assembly('factoryBay', ({ box, cylinder, add, panel }) => {
    for (const side of [-1, 1]) {
      const frame = new T.Shape(
        [
          [-25, -16],
          [25, -16],
          [25, 88],
          [15, 128],
          [-15, 128],
          [-25, 88],
        ].map(([x, y]) => new T.Vector2(x, y)),
      );
      frame.holes.push(
        new T.Path(
          [
            [-12, 8],
            [-12, 89],
            [-7, 106],
            [7, 106],
            [12, 89],
            [12, 8],
          ].map(([x, y]) => new T.Vector2(x, y)),
        ),
      );
      add(
        'dark',
        new T.ExtrudeGeometry(frame, {
          depth: 14,
          bevelEnabled: true,
          bevelThickness: 1,
          bevelSize: 1,
          bevelSegments: 1,
          steps: 1,
        }),
        [side * 85, 0, -7],
      );
      box('dark', [30, 111, 8], [side * 85, 50, 20]);
      // The outer flange clears the bevelled web by 2 m; coincident faces shimmer in banks.
      for (const edge of [-23, 23])
        box('shell', [10, 97, 48], [side * 85 + edge, 35, 0]);
      for (const y of [-9, 113]) box('steel', [56, 10, 56], [side * 85, y, 0]);
      box('steel', [58, 13, 70], [side * 85, -17, 0]);
      for (const y of [18, 62, 101])
        box('steel', [24, 9, 68], [side * 76, y, 0]);
      cylinder('steel', 4.5, 105, [side * 59, 48, 0]);
      box('amber', [22, 5, 44], [side * 85, 113, -2]);
      for (const z of [-23, 23])
        for (const y of [31, 74]) panel(side * 103, y, z, 12, 27, Math.sign(z));
      for (const y of [7, 95]) cylinder('dark', 7, 8, [side * 59, y, 0]);
    }
    box('dark', [185, 21, 14], [0, 131, 0]);
    for (const y of [118, 144]) box('shell', [190, 5, 58], [0, y, 0]);
    for (const x of [-85, 85]) box('steel', [12, 25, 54], [x, 131, 0]);
    box('dark', [135, 10, 36], [0, 116, 0]);
    for (const z of [-9, 9])
      for (const x of [-64, -32, 0, 32, 64])
        panel(x, 132, z, 28, 15, Math.sign(z), true);
  });
  assembly('rollerBank', ({ box, add, panel }) => {
    box('dark', [34, 22, 76], [0, 0, 0]);
    for (const z of [-39, 39]) panel(0, 0, z, 28, 17, Math.sign(z));
    const rot = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 0, 1),
      Math.PI / 2,
    );
    for (const z of [-24, 0, 24]) {
      add('steel', new T.CylinderGeometry(9, 9, 34, 24), [0, 13, z], rot);
      for (const x of [-19, 19]) {
        box('shell', [7, 25, 18], [x, 6, z]);
        add('steel', new T.CylinderGeometry(7.3, 7.3, 4, 16), [x, 13, z], rot);
        for (const dz of [-6, 6]) box('steel', [9, 2, 2], [x, -4, z + dz]);
        add(
          'amber',
          new T.CylinderGeometry(5, 5, 3, 12),
          [x * 1.18, 13, z],
          rot,
        );
      }
    }
  });
  assembly('driveWheel', ({ box, add }) => {
    const rot = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 0, 1),
      Math.PI / 2,
    );
    add(
      'steel',
      new T.TorusGeometry(21, 3, 6, 40),
      [0, 0, 0],
      new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 2),
    );
    add('amber', new T.CylinderGeometry(7, 7, 11, 24), [0, 0, 0], rot);
    add('steel', new T.CylinderGeometry(4, 4, 32, 16), [0, 0, 0], rot);
    for (const x of [-6, 6]) {
      add('steel', new T.CylinderGeometry(8, 8, 1.6, 24), [x, 0, 0], rot);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        add(
          'dark',
          new T.CylinderGeometry(0.8, 0.8, 2.2, 6),
          [x, Math.cos(a) * 6, Math.sin(a) * 6],
          rot,
        );
      }
    }
    for (let i = 0; i < 32; i++) {
      const a = (i * Math.PI) / 16;
      add(
        'steel',
        new T.BoxGeometry(4, 2.4, 2.4),
        [0, Math.cos(a) * 24, Math.sin(a) * 24],
        new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), a),
      );
    }
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      add(
        'dark',
        new T.BoxGeometry(4, 17, 4),
        [0, Math.cos(a) * 11, Math.sin(a) * 11],
        new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), a),
      );
      box('shell', [7, 3, 5], [0, Math.cos(a) * 23, Math.sin(a) * 23]);
    }
  });
  assembly('ejectorHousing', ({ box, cylinder }) => {
    box('dark', [46, 35, 60], [0, 10, 0]);
    for (const z of [-25, 25]) {
      box('shell', [52, 44, 9], [0, 12, z]);
      box('amber', [50, 4, 10], [0, 30, z]);
      box('steel', [65, 6, 16], [0, -12, z]);
    }
    box('shell', [43, 8, 60], [0, 35, 0]);
    for (const x of [-15, 15]) cylinder('steel', 4, 30, [x, 48, 0]);
    box('dark', [52, 5, 64], [0, -17, 0]);
  });

  assembly('channelCassette', ({ box, cylinder }) => {
    box('dark', [10, 28, 72], [0, 0, 0]);
    for (const z of [-26, 0, 26]) {
      box('shell', [11, 22, 22], [-1, 2, z]);
      box('steel', [13, 3, 22], [-1, 14, z]);
      box('dark', [1, 8, 14], [-7, 3, z]);
      for (const y of [0, 3, 6]) box('steel', [1.2, 0.7, 12], [-7.6, y, z]);
      for (const dz of [-9, 9]) box('amber', [1, 3, 2], [-7, -6, z + dz]);
    }
    for (const z of [-38, 38]) {
      box('steel', [16, 36, 4], [0, 0, z]);
      cylinder('dark', 3, 30, [0, 0, z]);
    }
  });
  assembly('coolingBank', ({ box, cylinder, add, panel, pipe }) => {
    box('dark', [52, 92, 112], [0, 24, 0]);
    for (const z of [-58, 58]) {
      const outline = new T.Shape(
        [
          [-39, -32],
          [39, -32],
          [39, 59],
          [27, 98],
          [-27, 98],
          [-39, 59],
        ].map(([x, y]) => new T.Vector2(x, y)),
      );
      const opening = new T.Path();
      opening.absarc(0, 31, 25, 0, Math.PI * 2, true);
      outline.holes.push(opening);
      add(
        'shell',
        new T.ExtrudeGeometry(outline, {
          depth: 12,
          bevelEnabled: true,
          bevelThickness: 1,
          bevelSize: 1,
          bevelSegments: 1,
          steps: 1,
        }),
        [0, 0, z - 6],
      );
      add('steel', new T.TorusGeometry(26, 3.5, 8, 32), [
        0,
        31,
        z + (z > 0 ? 7 : -7),
      ]);
      const face = z + (z > 0 ? 7 : -7);
      add(
        'dark',
        new T.CylinderGeometry(9, 9, 9, 24),
        [0, 31, face],
        new T.Quaternion().setFromAxisAngle(
          new T.Vector3(1, 0, 0),
          Math.PI / 2,
        ),
      );
      for (let i = 0; i < 6; i++) {
        const blade = new T.Shape();
        blade.moveTo(6, -3);
        blade.quadraticCurveTo(14, -9, 23, -6);
        blade.lineTo(24, 2);
        blade.quadraticCurveTo(17, 2, 8, 7);
        blade.closePath();
        add(
          'machined',
          new T.ExtrudeGeometry(blade, {
            depth: 2.2,
            bevelEnabled: true,
            bevelSize: 0.6,
            bevelThickness: 0.6,
            bevelSegments: 1,
            steps: 1,
          }),
          [0, 31, face],
          new T.Quaternion().setFromAxisAngle(
            new T.Vector3(0, 0, 1),
            (i * Math.PI) / 3,
          ),
        );
      }
      add('machined', new T.TorusGeometry(22.5, 1.2, 6, 32), [
        0,
        31,
        face + Math.sign(z) * 3,
      ]);
      box('steel', [84, 12, 24], [0, -29, z]);
      panel(0, 77, z + Math.sign(z) * 8, 40, 22, Math.sign(z), true);
      for (const x of [-22, 22])
        panel(x, -12, z + Math.sign(z) * 8, 26, 16, Math.sign(z));
    }
    for (let z = -48; z <= 48; z += 12) box('steel', [63, 83, 3], [0, 24, z]);
    box('shell', [55, 16, 116], [0, 88, 0]);
    box('dark', [88, 19, 150], [0, -36, 0]);
    box('steel', [94, 6, 158], [0, -25, 0]);
    cylinder('steel', 11, 28, [0, 108, 0]);
    box('shell', [32, 7, 35], [0, 123, 0]);
    for (const side of [-1, 1]) {
      pipe(
        [
          [0, 112, 0],
          [side * 44, 111, 0],
          [side * 47, 80, 0],
          [side * 47, -10, 0],
          [side * 29, -19, 0],
        ],
        4,
      );
      for (const y of [0, 54, 97]) box('steel', [12, 5, 10], [side * 44, y, 0]);
      pipe(
        [
          [side * 29, -19, -48],
          [side * 40, -19, -38],
          [side * 40, -19, 38],
          [side * 29, -19, 48],
        ],
        5.5,
      );
      for (const z of [-34, 34]) box('dark', [13, 11, 7], [side * 40, -19, z]);
    }
  });
  let disposed = false;
  return {
    prototypes,
    materials,
    createAssembly(name) {
      if (disposed || !prototypes[name])
        throw new Error('Unknown or disposed industrial assembly: ' + name);
      const group = new T.Group();
      group.name = 'Worldkit / ' + name;
      for (const part of prototypes[name]) {
        const mesh = new T.Mesh(part.geometry, part.material);
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
      }
      return group;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      geometries.forEach((g) => g.dispose());
      Object.values(materials).forEach((m) => m.dispose());
    },
  };
}
