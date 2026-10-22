import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Concrete machinery assemblies in metres. Placement, clocks and collision belong to the game. */
export function createIndustrialKit({ finish = null } = {}) {
  const materials = {
    shell: new T.MeshPhysicalMaterial({
      name: 'Worldkit / enamel machine casings',
      color: '#c7c4af',
      roughness: 0.36,
      clearcoat: 0.42,
      clearcoatRoughness: 0.3,
      metalness: 0.12,
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
    amber: new T.MeshStandardMaterial({
      name: 'Worldkit / machinery caution enamel',
      color: '#c98c2b',
      roughness: 0.64,
      metalness: 0.25,
    }),
  };
  for (const key of ['shell', 'steel', 'dark'])
    finish?.bind(materials[key], key);
  const geometries = new Set(),
    prototypes = {};
  function assembly(name, build) {
    const batches = {};
    const add = (key, geometry, position, rotation = null) => {
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
          Math.min(0.65, Math.min(...size) * 0.12),
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
    build({ box, cylinder, beam, add });
    prototypes[name] = Object.entries(batches).map(([key, parts]) => {
      const geometry = mergeGeometries(parts, false);
      parts.forEach((part) => part.dispose());
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      geometries.add(geometry);
      return { geometry, material: materials[key] };
    });
  }
  assembly('pressFrame', ({ box, cylinder }) => {
    for (const x of [-54, 54]) {
      box('dark', [19, 8, 42], [x, -5, 0]);
      box('shell', [14, 79, 30], [x, 35, 0]);
      box('dark', [7, 57, 32], [x, 33, 0]);
      cylinder('steel', 3.7, 62, [x, 33, -18]);
      box('amber', [18, 3, 35], [x, 68, 0]);
    }
    box('shell', [124, 18, 40], [0, 78, 0]);
    box('dark', [88, 8, 30], [0, 66, 0]);
    box('steel', [130, 3, 48], [0, 90, 0]);
  });
  assembly('gantry', ({ box, beam }) => {
    for (const x of [-77, 77]) {
      box('shell', [13, 228, 18], [x, 104, 0]);
      box('dark', [25, 8, 34], [x, -8, 0]);
      box('amber', [18, 5, 26], [x, 213, 0]);
    }
    box('shell', [170, 12, 22], [0, 225, 0]);
    box('steel', [170, 5, 26], [0, 207, 0]);
    for (let x = -72; x < 70; x += 24)
      beam('dark', [x, 208, 0], [x + 24, 224, 0], 3);
    box('amber', [28, 13, 31], [12, 209, 0]);
    for (const x of [4, 20]) box('steel', [0.9, 40, 0.9], [x, 184, 0]);
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

  assembly('factoryBay', ({ box, cylinder, add }) => {
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
        'shell',
        new T.ExtrudeGeometry(frame, {
          depth: 42,
          bevelEnabled: true,
          bevelThickness: 1,
          bevelSize: 1,
          bevelSegments: 1,
          steps: 1,
        }),
        [side * 85, 0, -21],
      );
      box('dark', [30, 111, 8], [side * 85, 50, 20]);
      box('steel', [58, 13, 70], [side * 85, -17, 0]);
      for (const y of [18, 62, 101])
        box('steel', [24, 9, 68], [side * 76, y, 0]);
      cylinder('steel', 4.5, 105, [side * 59, 48, 0]);
      box('amber', [22, 5, 44], [side * 85, 113, -2]);
    }
    box('shell', [185, 21, 52], [0, 131, 0]);
    box('dark', [135, 10, 36], [0, 116, 0]);
    box('steel', [190, 6, 58], [0, 145, 0]);
  });
  assembly('rollerBank', ({ box, add }) => {
    box('dark', [34, 22, 76], [0, 0, 0]);
    const rot = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 0, 1),
      Math.PI / 2,
    );
    for (const z of [-24, 0, 24]) {
      add('steel', new T.CylinderGeometry(9, 9, 34, 24), [0, 13, z], rot);
      for (const x of [-19, 19]) {
        box('shell', [7, 25, 18], [x, 6, z]);
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
    add('amber', new T.CylinderGeometry(5, 5, 10, 16), [0, 0, 0], rot);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      add(
        'dark',
        new T.BoxGeometry(5, 37, 3),
        [0, 0, 0],
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
  assembly('coolingBank', ({ box, cylinder, add }) => {
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
      for (let i = 0; i < 6; i++)
        add(
          'dark',
          new T.BoxGeometry(7, 43, 3),
          [0, 31, z + (z > 0 ? 5 : -5)],
          new T.Quaternion().setFromAxisAngle(
            new T.Vector3(0, 0, 1),
            (i * Math.PI) / 3,
          ),
        );
      box('steel', [84, 12, 24], [0, -29, z]);
    }
    for (let z = -48; z <= 48; z += 12) box('steel', [63, 83, 3], [0, 24, z]);
    box('shell', [55, 16, 116], [0, 88, 0]);
    box('dark', [88, 19, 150], [0, -36, 0]);
    box('steel', [94, 6, 158], [0, -25, 0]);
    cylinder('steel', 11, 28, [0, 108, 0]);
    box('shell', [32, 7, 35], [0, 123, 0]);
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
