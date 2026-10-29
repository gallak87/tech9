import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createIndustrialKit } from '@worldkit/environment/industrial';
import { createDispatchTerrain } from './terrain.js';
import { createDispatchTerminal } from './terminal.js';
import { createDispatchCarrier } from './carrier.js';
import { createDispatchCooling } from './cooling.js';
import { createDispatchGalleries } from './galleries.js';
import { foldedExchangerFin } from './cooling-finish.js';

// Dispatch presentation is a fresh mission owner. The original Eliminator
// district, road, industrial finish and physics remain independent.
export function createInterceptorEnvironment(context) {
  const { track, road } = context;
  const group = new T.Group();
  group.name = 'Crucible Dispatch / connected process districts';
  const terrain = createDispatchTerrain(context);
  group.add(terrain.group);
  const kit = createIndustrialKit({ finish: road?.finish });
  const materials = new Set();
  const geometries = new Set();
  const parts = new Map();
  const clearanceBoxes = [];
  const hero = new T.Group();
  hero.name = 'Dispatch / exchanger and seated service hall';
  const mat = (settings, finish, coated = false) => {
    const Material = coated ? T.MeshPhysicalMaterial : T.MeshStandardMaterial;
    const material = new Material(settings);
    materials.add(material);
    if (finish) road?.finish?.bind(material, finish);
    return material;
  };
  // Large role changes carry the palette: coated shell, cool structural steel,
  // heat-cycled copper and dark recessed process interiors.
  kit.materials.shell.color.set('#d0d6d0');
  kit.materials.shell.roughness = 0.29;
  kit.materials.shell.clearcoat = 0.55;
  kit.materials.cast.color.set('#3e5058');
  kit.materials.cast.roughness = 0.57;
  kit.materials.cast.metalness = 0.48;
  kit.materials.machined.roughness = 0.3;
  kit.materials.machined.envMapIntensity = 0.85;
  kit.materials.machined.metalness = 0.9;
  kit.materials.dark.color.set('#2d414b');
  kit.materials.steel.color.set('#667c88');
  const copper = mat(
    {
      name: 'Dispatch / copper exchanger cartridges',
      color: '#bd7b47',
      roughness: 0.29,
      metalness: 0.86,
    },
    'steel',
  );
  const foundation = mat(
    {
      name: 'Dispatch / cast mineral plinths',
      color: '#7d8078',
      roughness: 0.9,
      metalness: 0.02,
    },
    'cast',
  );
  const cavity = mat(
    {
      name: 'Dispatch / recessed blue graphite',
      color: '#21323c',
      roughness: 0.53,
      metalness: 0.54,
    },
    'dark',
  );
  const warm = mat({
    name: 'Dispatch / occupied service galleries',
    color: '#e4bf83',
    emissive: '#d59643',
    emissiveIntensity: 0.65,
    roughness: 0.5,
    metalness: 0.08,
  });
  const cladding = mat(
    {
      name: 'Dispatch / graphite enamel service cores',
      color: '#6d828d',
      roughness: 0.34,
      metalness: 0.24,
      clearcoat: 0.3,
      clearcoatRoughness: 0.33,
    },
    'shell',
    true,
  );
  const warmCladding = mat(
    {
      name: 'Dispatch / warm kiln enamel service cores',
      color: '#ac9373',
      roughness: 0.37,
      metalness: 0.18,
      clearcoat: 0.3,
      clearcoatRoughness: 0.33,
    },
    'shell',
    true,
  );
  const coolCladding = mat(
    {
      name: 'Dispatch / cool induction enamel service cores',
      color: '#476c83',
      roughness: 0.33,
      metalness: 0.29,
      clearcoat: 0.3,
      clearcoatRoughness: 0.33,
    },
    'shell',
    true,
  );
  const glazing = mat({
    name: 'Dispatch / seated smoked control glazing',
    color: '#193748',
    roughness: 0.24,
    metalness: 0.54,
    emissive: '#10232b',
    emissiveIntensity: 0.1,
  });
  const rotorMetal = mat(
    {
      name: 'Dispatch / satin machined impellers',
      color: '#6f7d85',
      roughness: 0.4,
      metalness: 0.78,
      envMapIntensity: 0.75,
    },
    'steel',
  );
  const up = new T.Vector3(0, 1, 0);
  const identity = new T.Quaternion();
  function add(
    geometry,
    material,
    position = [0, 0, 0],
    rotation = identity,
    name = 'Process structure',
  ) {
    if (material === kit.materials.machined)
      geometry.setAttribute(
        'industrialCoord',
        geometry.attributes.position.clone(),
      );
    geometry.applyMatrix4(
      new T.Matrix4().compose(
        new T.Vector3(...position),
        rotation,
        new T.Vector3(1, 1, 1),
      ),
    );
    geometry.computeBoundingBox();
    clearanceBoxes.push(geometry.boundingBox.clone());
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    (
      parts.get(material) ?? (parts.set(material, []), parts.get(material))
    ).push(flat);
    flat.name = name;
  }
  function box(material, size, position, rotation = identity, bevel = 1.2) {
    add(
      new RoundedBoxGeometry(
        ...size,
        1,
        Math.min(bevel, Math.min(...size) * 0.12),
      ),
      material,
      position,
      rotation,
    );
  }
  function beam(material, a, b, width, depth = width) {
    const start = new T.Vector3(...a),
      end = new T.Vector3(...b),
      delta = end.clone().sub(start);
    box(
      material,
      [width, delta.length(), depth],
      start.add(end).multiplyScalar(0.5).toArray(),
      new T.Quaternion().setFromUnitVectors(up, delta.normalize()),
      0.7,
    );
  }
  function lathe(material, profile, angle = 0, arc = Math.PI * 2) {
    const points = profile.map(([radius, y]) => new T.Vector2(radius, y));
    const curved = new T.LatheGeometry(
      points,
      Math.ceil((arc / (Math.PI * 2)) * 96),
      angle,
      arc,
    );
    if (arc >= Math.PI * 2 - 0.001) {
      add(curved, material);
      return;
    }
    // Actual thick end returns close the pressure shell's recesses; the
    // six exposed bays are openings between formed parts, not dark decals.
    const pieces = [curved];
    for (const [theta, reverse] of [
      [angle, false],
      [angle + arc, true],
    ]) {
      const cap = new T.ShapeGeometry(new T.Shape(points));
      cap.rotateY(theta - Math.PI / 2);
      if (reverse) {
        for (let i = 0; i < cap.index.count; i += 3) {
          const first = cap.index.getX(i);
          cap.index.setX(i, cap.index.getX(i + 2));
          cap.index.setX(i + 2, first);
        }
        const normals = cap.attributes.normal;
        for (let i = 0; i < normals.count; i++)
          normals.setXYZ(
            i,
            -normals.getX(i),
            -normals.getY(i),
            -normals.getZ(i),
          );
      }
      pieces.push(cap);
    }
    const geometry = mergeGeometries(pieces, false);
    pieces.forEach((part) => part.dispose());
    add(geometry, material);
  }
  function pipe(points, radius, material = kit.materials.steel) {
    const curve = new T.CatmullRomCurve3(
      points.map((point) => new T.Vector3(...point)),
      false,
      'centripetal',
    );
    add(
      new T.TubeGeometry(curve, points.length * 6, radius, 16, false),
      material,
    );
    for (const fraction of [0, 1]) {
      add(
        new T.CylinderGeometry(radius * 1.32, radius * 1.32, radius * 0.7, 24),
        kit.materials.machined,
        curve.getPoint(fraction).toArray(),
        new T.Quaternion().setFromUnitVectors(up, curve.getTangent(fraction)),
      );
    }
  }

  // One connected proof assembly. A low asymmetric apron ties its vessel,
  // open service wing, process risers and bearing shoes into the same site.
  box(foundation, [300, 24, 520], [0, -43, 110], identity, 3);
  box(kit.materials.dark, [235, 18, 450], [0, -23, 110], identity, 2);
  box(foundation, [202, 30, 210], [0, -2, 0], identity, 3);
  lathe(cavity, [
    [0, 10],
    [59, 10],
    [77, 36],
    [80, 80],
    [80, 442],
    [70, 488],
    [0, 510],
  ]);
  lathe(kit.materials.cast, [
    [70, 18],
    [92, 18],
    [99, 28],
    [99, 44],
    [87, 58],
    [83, 82],
    [70, 82],
    [70, 18],
  ]);
  const shellProfile = [
    [82, 80],
    [88, 80],
    [94, 95],
    [94, 230],
    [89, 252],
    [82, 252],
    [82, 80],
  ];
  const upperShellProfile = [
    [82, 334],
    [89, 334],
    [94, 349],
    [94, 407],
    [89, 430],
    [82, 430],
    [82, 334],
  ];
  for (let bay = 0; bay < 6; bay++) {
    const angle = (bay / 6) * Math.PI * 2;
    lathe(kit.materials.shell, shellProfile, angle + 0.19, Math.PI / 3 - 0.38);
    lathe(
      kit.materials.shell,
      upperShellProfile,
      angle + 0.19,
      Math.PI / 3 - 0.38,
    );
    const rotation = new T.Quaternion().setFromAxisAngle(up, angle);
    // Copper cassettes are seated twelve metres behind the shell's mouth.
    for (let y = 104; y <= 407; y += 17)
      add(
        foldedExchangerFin(),
        copper,
        [Math.sin(angle) * 82, y, Math.cos(angle) * 82],
        rotation,
      );
    for (const x of [-13.5, 13.5]) {
      const p = new T.Vector3(x, 257, 82).applyQuaternion(rotation);
      box(kit.materials.steel, [3, 320, 5], p.toArray(), rotation, 0.5);
    }
    const foot = [Math.sin(angle) * 85, 28, Math.cos(angle) * 85];
    const top = [Math.sin(angle) * 79, 140, Math.cos(angle) * 79];
    beam(kit.materials.cast, foot, top, 13, 18);
  }
  // A deep exposed manifold separates the lower pressure jackets from the
  // upper head. Broad collars and cartridge roots explain the load/flow path.
  for (const y of [261, 326])
    lathe(kit.materials.steel, [
      [79, y - 6],
      [94, y - 6],
      [98, y],
      [94, y + 7],
      [79, y + 7],
      [79, y - 6],
    ]);
  for (const y of [279, 308])
    lathe(copper, [
      [79, y - 5],
      [87, y - 5],
      [91, y],
      [87, y + 6],
      [79, y + 6],
      [79, y - 5],
    ]);
  for (const y of [87, 430]) {
    lathe(kit.materials.machined, [
      [80, y - 5],
      [96, y - 5],
      [100, y],
      [96, y + 5],
      [80, y + 5],
      [80, y - 5],
    ]);
    lathe(kit.materials.dark, [
      [80, y + 7],
      [103, y + 7],
      [103, y + 11],
      [80, y + 11],
      [80, y + 7],
    ]);
  }
  lathe(kit.materials.shell, [
    [0, 438],
    [82, 438],
    [96, 443],
    [96, 460],
    [80, 460],
    [80, 486],
    [61, 504],
    [61, 510],
    [0, 510],
  ]);
  lathe(kit.materials.dark, [
    [0, 506],
    [34, 506],
    [38, 514],
    [38, 529],
    [0, 529],
  ]);
  lathe(kit.materials.steel, [
    [0, 529],
    [42, 529],
    [42, 538],
    [0, 538],
  ]);
  // A readable flow header returns into a founded lower manifold.
  pipe(
    [
      [-75, 335, 0],
      [-113, 335, 0],
      [-137, 311, 0],
      [-137, 82, 0],
      [-119, 53, 0],
      [-80, 53, 0],
    ],
    13,
  );
  box(kit.materials.cast, [66, 43, 64], [-108, 35, 0], identity, 3);
  box(kit.materials.shell, [67, 9, 67], [-108, 61, 0], identity, 1.2);
  for (const y of [125, 275])
    beam(kit.materials.cast, [-136, y, 0], [-89, y, 0], 12, 15);
  add(
    new T.CylinderGeometry(27, 27, 40, 48, 1, true),
    cavity,
    [-94, 235, 0],
    new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI / 2),
  );
  add(
    new T.TorusGeometry(28, 5, 8, 48),
    kit.materials.machined,
    [-116, 235, 0],
    new T.Quaternion().setFromAxisAngle(up, Math.PI / 2),
  );
  add(
    new T.CircleGeometry(25, 48),
    cavity,
    [-76, 235, 0],
    new T.Quaternion().setFromAxisAngle(up, -Math.PI / 2),
  );

  // Hall construction is open at racing height. Deep slabs and two unequal
  // service bays are carried by visible piers instead of a giant flat box.
  box(foundation, [190, 28, 242], [12, -4, 219], identity, 3);
  box(cavity, [14, 348, 218], [86, 172, 219], identity, 1.5);
  for (const z of [111, 204, 324]) {
    box(kit.materials.cast, [27, 365, 25], [-66, 180, z], identity, 2);
    box(kit.materials.steel, [8, 348, 30], [-82, 183, z], identity, 0.8);
    box(kit.materials.shell, [35, 12, 36], [-66, 8, z], identity, 1);
    beam(kit.materials.cast, [-65, 240, z], [-15, 295, z], 16, 22);
  }
  for (const y of [32, 162, 292]) {
    box(kit.materials.steel, [166, 14, 240], [9, y, 219], identity, 1.3);
    box(kit.materials.shell, [7, 19, 232], [-77, y + 1, 219], identity, 1.1);
    box(warm, [2, 3, 70], [-81.1, y - 9, 151], identity, 0.25);
    box(warm, [2, 3, 83], [-81.1, y - 9, 266], identity, 0.25);
  }
  for (const [z, length, roofY] of [
    [151, 91, 367],
    [267, 126, 337],
  ]) {
    box(kit.materials.dark, [188, 17, length], [5, roofY - 8, z], identity, 2);
    box(
      kit.materials.shell,
      [193, 10, length + 5],
      [5, roofY + 5, z],
      identity,
      1.8,
    );
    for (const x of [-65, 70])
      box(
        kit.materials.cast,
        [14, 30, length],
        [x, roofY - 28, z],
        identity,
        0.8,
      );
  }
  // Occupied internal bays attach to the backing, leaving the gallery open.
  for (const [z, y] of [
    [147, 213],
    [266, 77],
    [267, 223],
  ]) {
    box(kit.materials.dark, [30, 59, 52], [64, y, z], identity, 1.4);
    box(kit.materials.shell, [8, 55, 48], [45, y, z], identity, 1.1);
    box(copper, [3, 37, 30], [39, y, z], identity, 0.5);
  }
  // Two proper elbowed flow circuits join the vessel to the seated hall.
  pipe(
    [
      [48, 121, 62],
      [49, 121, 101],
      [60, 129, 122],
      [68, 158, 135],
      [68, 306, 135],
    ],
    10.5,
  );
  pipe(
    [
      [36, 382, 68],
      [38, 382, 105],
      [63, 375, 121],
      [73, 340, 121],
      [73, 323, 121],
    ],
    7.5,
    copper,
  );
  for (const y of [165, 295]) {
    box(kit.materials.dark, [63, 14, 44], [17, y, 93], identity, 1);
    for (const x of [-16, 49])
      beam(kit.materials.cast, [x, y - 6, 80], [x, y - 38, 110], 7, 8);
    box(kit.materials.steel, [72, 5, 52], [17, y + 3, 93], identity, 0.6);
  }
  const cooling = kit.createAssembly('coolingBank');
  cooling.name = 'Dispatch / attached lower exchanger plant';
  cooling.position.set(-77, 35, 242);
  cooling.rotation.y = Math.PI / 2;
  cooling.scale.setScalar(0.7);
  hero.add(cooling);
  cooling.updateMatrixWorld(true);
  cooling.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry.computeBoundingBox();
    clearanceBoxes.push(
      object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld),
    );
  });

  for (const [material, source] of parts) {
    const geometry = mergeGeometries(source, false);
    source.forEach((part) => part.dispose());
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometries.add(geometry);
    const mesh = new T.Mesh(geometry, material);
    mesh.name = material.name || 'Dispatch / connected exchanger structure';
    mesh.castShadow = mesh.receiveShadow = true;
    hero.add(mesh);
  }
  parts.clear();
  const frame = track.sample(track.length * 0.4);
  const forward = frame.tangent.clone().setY(0).normalize();
  const right = up.clone().cross(forward);
  hero.quaternion.setFromRotationMatrix(
    new T.Matrix4().makeBasis(right, up, forward),
  );
  hero.quaternion.multiply(new T.Quaternion().setFromAxisAngle(up, Math.PI));
  group.add(hero);
  // Exclude the full banked race corridor in three dimensions, including
  // Goliath's long hull and camera allowance. Foundations may sit below it.
  const margin = new T.Vector3(42, 24, 42);
  const route = Array.from(
    { length: Math.ceil(track.length / 8) },
    (_, index) => track.sample(index * 8).position,
  );
  const expanded = clearanceBoxes.map((box) =>
    box.clone().expandByVector(margin),
  );
  let clear = false;
  for (const offset of [220, 250, 280]) {
    hero.position.copy(frame.position).addScaledVector(right, -offset);
    hero.position.y = -48;
    hero.updateMatrixWorld(true);
    const inverse = hero.matrixWorld.clone().invert();
    clear = !route.some((point) => {
      const local = point.clone().applyMatrix4(inverse);
      return expanded.some((box) => box.containsPoint(local));
    });
    if (clear) break;
  }
  if (!clear) {
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    kit.dispose();
    terrain.dispose();
    throw new Error(
      'Dispatch process district intersects the fixed racing corridor',
    );
  }
  hero.userData.clearanceVolumeCount = clearanceBoxes.length;
  // Stable inspection metadata only; gameplay identity and contacts are fixed.
  hero.userData.presentationVersion = 'dispatch-world-finish-r14';
  hero.userData.routeFraction = 0.4;
  terrain.seat({
    position: hero.position
      .clone()
      .add(new T.Vector3(0, 0, 110).applyQuaternion(hero.quaternion)),
    quaternion: hero.quaternion,
    width: 320,
    depth: 550,
    height: -104,
  });
  const terminal = createDispatchTerminal({
    track,
    terrain,
    kit,
    palette: { foundation, cavity, copper, warm },
  });
  group.add(terminal.group);
  const coolingDistrict = createDispatchCooling({
    track,
    terrain,
    kit,
    palette: { foundation, cavity, copper, warm, rotorMetal },
  });
  group.add(coolingDistrict.group);
  const galleries = createDispatchGalleries({
    track,
    terrain,
    kit,
    palette: {
      foundation,
      cladding,
      warmCladding,
      coolCladding,
      glazing,
      warm,
    },
  });
  group.add(galleries.group);
  const carrier = createDispatchCarrier({
    track,
    terrain,
    kit,
    palette: { foundation },
  });
  group.add(carrier.group);
  group.updateMatrixWorld(true);
  let disposed = false;
  return {
    group,
    ready: terrain.ready,
    setReflection(texture) {
      for (const material of [...materials, ...Object.values(kit.materials)]) {
        material.envMap = texture;
        material.needsUpdate = true;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      terminal.dispose();
      coolingDistrict.dispose();
      galleries.dispose();
      carrier.dispose();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      kit.dispose();
      terrain.dispose();
      group.clear();
      geometries.clear();
      materials.clear();
    },
  };
}
