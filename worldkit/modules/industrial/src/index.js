import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Concrete machinery assemblies in metres. Placement, clocks and collision belong to the game. */
export function createIndustrialKit() {
  const materials = {
    shell: new T.MeshStandardMaterial({ name: 'Worldkit / enamel machine casings', color: '#c7c4af', roughness: 0.52, metalness: 0.38 }),
    steel: new T.MeshStandardMaterial({ name: 'Worldkit / working steel', color: '#76868e', roughness: 0.34, metalness: 0.82 }),
    dark: new T.MeshStandardMaterial({ name: 'Worldkit / graphite machine interiors', color: '#252e35', roughness: 0.68, metalness: 0.5 }),
    amber: new T.MeshStandardMaterial({ name: 'Worldkit / machinery caution enamel', color: '#c98c2b', roughness: 0.64, metalness: 0.25 }),
  };
  for (const key of ['shell', 'steel', 'dark']) {
    const material = materials[key];
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 machinePosition;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nmachinePosition=position;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 machinePosition;')
        .replace('#include <map_fragment>', '#include <map_fragment>\nfloat wear=sin(machinePosition.x*.31+sin(machinePosition.z*.17))*sin(machinePosition.y*.19); float drip=smoothstep(.7,.95,sin(machinePosition.x*2.4+machinePosition.z*.4))*smoothstep(.0,.9,sin(machinePosition.y*.08)); diffuseColor.rgb*=1.+wear*.065-drip*.12;')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+wear*.06+drip*.08,.2,.95);');
    };
    material.customProgramCacheKey = () => 'worldkit-industrial-finish-v2';
  }
  const geometries = new Set(), prototypes = {};
  function assembly(name, build) {
    const batches = {};
    const add = (key, geometry, position, rotation = null) => {
      geometry.applyMatrix4(new T.Matrix4().compose(
        new T.Vector3(...position), rotation ?? new T.Quaternion(), new T.Vector3(1, 1, 1),
      ));
      if (geometry.index) { const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat; }
      (batches[key] ??= []).push(geometry);
    };
    const box = (key, size, position) => add(key, new RoundedBoxGeometry(...size, 1, Math.min(0.65, Math.min(...size) * 0.12)), position);
    const cylinder = (key, radius, length, position) => add(key, new T.CylinderGeometry(radius, radius, length, 12), position);
    const beam = (key, a, b, width) => {
      const from = new T.Vector3(...a), to = new T.Vector3(...b), delta = to.clone().sub(from);
      add(key, new T.BoxGeometry(width, delta.length(), width), from.add(to).multiplyScalar(0.5).toArray(),
        new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize()));
    };
    build({ box, cylinder, beam, add });
    prototypes[name] = Object.entries(batches).map(([key, parts]) => {
      const geometry = mergeGeometries(parts, false);
      parts.forEach((part) => part.dispose());
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
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
      box('shell', [13, 180, 18], [x, 80, 0]);
      box('dark', [25, 8, 34], [x, -8, 0]);
      box('amber', [18, 5, 26], [x, 165, 0]);
    }
    box('shell', [170, 12, 22], [0, 177, 0]);
    box('steel', [170, 5, 26], [0, 159, 0]);
    for (let x = -72; x < 70; x += 24) beam('dark', [x, 160, 0], [x + 24, 176, 0], 3);
    box('amber', [28, 13, 31], [12, 161, 0]);
    for (const x of [4, 20]) box('steel', [0.9, 75, 0.9], [x, 118, 0]);
  });
  assembly('serviceTower', ({ box, cylinder }) => {
    box('dark', [30, 110, 34], [0, 48, 0]);
    box('shell', [26, 30, 30], [0, 86, 0]);
    for (let y = 8; y < 88; y += 20) {
      box('steel', [39, 3, 41], [0, y, 0]);
      box('amber', [25, 1.2, 1], [0, y + 5, -21]);
    }
    cylinder('steel', 5, 103, [20, 49, 8]);
    box('shell', [46, 6, 43], [0, 105, 0]);
  });
  assembly('motor', ({ box, cylinder }) => {
    box('dark', [26, 10, 40], [0, 0, 0]);
    box('shell', [22, 19, 32], [0, 13, 0]);
    for (let z = -12; z <= 12; z += 6) box('steel', [24, 2, 3], [0, 23, z]);
    cylinder('steel', 5, 16, [0, 31, 0]);
    box('amber', [24, 2, 34], [0, 5, 0]);
  });

  assembly('factoryBay', ({ box, cylinder, beam }) => {
    for (const side of [-1, 1]) {
      box('dark', [38, 120, 50], [side * 85, 48, 0]);
      box('shell', [10, 110, 44], [side * 65, 45, 0]);
      for (const y of [16, 52, 88]) {
        box('steel', [26, 2, 56], [side * 75, y, 0]);
        for (const z of [-24, 0, 24]) box('amber', [0.7, 5, 0.7], [side * 62, y + 3.5, z]);
        box('amber', [0.7, 0.7, 52], [side * 62, y + 6, 0]);
        box('shell', [3, 22, 25], [side * 63, y + 16, 0]);
      }
      for (const z of [-18, 18]) cylinder('steel', 2.4, 110, [side * 59, 50, z]);
      for (let y = 10; y < 90; y += 8) box('dark', [2, 0.65, 18], [side * 57, y, 0]);
      box('steel', [27, 8, 64], [side * 77, -18, 0]);
    }
    for (const z of [-19, 19]) {
      box('dark', [178, 4, 5], [0, 107, z]);
      box('shell', [178, 4, 5], [0, 125, z]);
      for (let x = -84; x < 80; x += 28) beam('steel', [x, 108, z], [x + 28, 124, z], 2);
    }
  });
  assembly('rollerBank', ({ box, add }) => {
    box('dark', [34, 22, 76], [0, 0, 0]);
    const rot = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI / 2);
    for (const z of [-24, 0, 24]) {
      add('steel', new T.CylinderGeometry(9, 9, 34, 24), [0, 13, z], rot);
      for (const x of [-19, 19]) {
        box('shell', [7, 25, 18], [x, 6, z]);
        add('amber', new T.CylinderGeometry(5, 5, 3, 12), [x * 1.18, 13, z], rot);
      }
    }
  });
  assembly('driveWheel', ({ box, add }) => {
    const rot = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI / 2);
    add('steel', new T.TorusGeometry(21, 3, 6, 40), [0, 0, 0], new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 2));
    add('amber', new T.CylinderGeometry(5, 5, 10, 16), [0, 0, 0], rot);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      add('dark', new T.BoxGeometry(5, 37, 3), [0, 0, 0], new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), a));
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
  let disposed = false;
  return {
    prototypes, materials,
    createAssembly(name) {
      if (disposed || !prototypes[name]) throw new Error('Unknown or disposed industrial assembly: ' + name);
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
      if (disposed) return; disposed = true;
      geometries.forEach((g) => g.dispose());
      Object.values(materials).forEach((m) => m.dispose());
    },
  };
}
