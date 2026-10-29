import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  mergeGeometries,
  toCreasedNormals,
} from 'three/addons/utils/BufferGeometryUtils.js';
import {
  createRouteClearance,
  groundFrame,
} from '../../environment/placement.js';
import { finishThermalMaterial } from '../helion/environment/materials.js';

// Mission-owned infrastructure. The original thermal world and its cover remain
// authoritative; these outboard assemblies never add a driving surface.
export function createBreachArchitecture({ track }) {
  const group = new T.Group();
  group.name = 'Helion Breach / connected observatory infrastructure';
  const materials = {
    shell: new T.MeshPhysicalMaterial({
      name: 'Breach / fired ceramic shell',
      color: '#c2c7bb',
      roughness: 0.29,
      metalness: 0.08,
      clearcoat: 0.55,
      clearcoatRoughness: 0.17,
    }),
    graphite: new T.MeshStandardMaterial({
      name: 'Breach / deep structural graphite',
      color: '#23333e',
      roughness: 0.58,
      metalness: 0.5,
    }),
    alloy: new T.MeshStandardMaterial({
      name: 'Breach / cold pressure collars',
      color: '#7e9aa6',
      roughness: 0.3,
      metalness: 0.86,
    }),
    copper: new T.MeshStandardMaterial({
      name: 'Breach / heat exchange copper',
      color: '#b07848',
      roughness: 0.4,
      metalness: 0.74,
    }),
    window: new T.MeshPhysicalMaterial({
      name: 'Breach / recessed control glazing',
      color: '#102831',
      emissive: '#284653',
      emissiveIntensity: 0.04,
      roughness: 0.15,
      metalness: 0.02,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      ior: 1.5,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    }),
    amber: new T.MeshStandardMaterial({
      name: 'Breach / seated service light',
      color: '#e3b57a',
      emissive: '#e8a75c',
      emissiveIntensity: 0.8,
      roughness: 0.5,
    }),
  };
  for (const key of ['graphite', 'copper'])
    finishThermalMaterial(materials[key], key);
  const parts = new Map(),
    source = new Set(),
    placements = [];
  const clearance = createRouteClearance(track, {
    localVertical: [-15, 30],
    sidePadding: 13,
  });
  function mesh(
    parent,
    name,
    geometry,
    material,
    position = [0, 0, 0],
    rotation = null,
  ) {
    if (geometry.type === 'ExtrudeGeometry') {
      // Preserve true hard returns while joining adjacent curved/bevel faces;
      // the formed shell's highlights should not expose its tessellation.
      const formed = toCreasedNormals(geometry, Math.PI * 0.28);
      if (formed !== geometry) geometry.dispose();
      geometry = formed;
    }
    source.add(geometry);
    const object = new T.Mesh(geometry, materials[material]);
    object.name = name;
    object.position.set(...position);
    if (rotation) object.rotation.set(...rotation);
    parent.add(object);
    return object;
  }
  function box(
    parent,
    name,
    size,
    position,
    material = 'graphite',
    radius = 0.8,
  ) {
    return mesh(
      parent,
      name,
      new RoundedBoxGeometry(
        ...size,
        1,
        Math.min(radius, ...size.map((v) => v * 0.16)),
      ),
      material,
      position,
    );
  }
  function beam(parent, name, from, to, width = 3, material = 'graphite') {
    const a = new T.Vector3(...from),
      b = new T.Vector3(...to),
      d = b.clone().sub(a);
    const object = box(
      parent,
      name,
      [width, d.length(), width],
      a.add(b).multiplyScalar(0.5).toArray(),
      material,
      0.3,
    );
    object.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
  }
  function tube(parent, name, points, radius, material = 'copper') {
    const curve = new T.CatmullRomCurve3(
      points.map((p) => new T.Vector3(...p)),
      false,
      'centripetal',
    );
    mesh(
      parent,
      name,
      new T.TubeGeometry(curve, points.length * 8, radius, 20, false),
      material,
    );
    for (const t of [0.035, 0.965]) {
      const position = curve.getPointAt(t),
        tangent = curve.getTangentAt(t);
      const cuff = mesh(
        parent,
        'Seated pressure-line retaining flange',
        new T.TorusGeometry(radius * 1.2, radius * 0.13, 8, 32),
        'alloy',
        position.toArray(),
      );
      cuff.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), tangent);
      const seal = mesh(
        parent,
        'Pressure flange recessed thermal gasket',
        new T.TorusGeometry(radius * 1.08, radius * 0.08, 8, 32),
        'graphite',
        position
          .clone()
          .addScaledVector(tangent, radius * 0.2)
          .toArray(),
      );
      seal.quaternion.copy(cuff.quaternion);
    }
  }
  function vault(parent, z, width, length) {
    const arch = new T.Shape();
    arch.moveTo(-width / 2, 0);
    arch.lineTo(-width / 2, 17);
    arch.quadraticCurveTo(-width / 2, 39, -width * 0.18, 43);
    arch.quadraticCurveTo(0, 46, width * 0.18, 43);
    arch.quadraticCurveTo(width / 2, 39, width / 2, 17);
    arch.lineTo(width / 2, 0);
    arch.lineTo(width / 2 - 5, 0);
    arch.lineTo(width / 2 - 5, 17);
    arch.quadraticCurveTo(width / 2 - 5, 34, width * 0.18, 38);
    arch.quadraticCurveTo(0, 41, -width * 0.18, 38);
    arch.quadraticCurveTo(-width / 2 + 5, 34, -width / 2 + 5, 17);
    arch.lineTo(-width / 2 + 5, 0);
    arch.closePath();
    mesh(
      parent,
      'Curved pressure-vault shell',
      new T.ExtrudeGeometry(arch, {
        depth: length,
        bevelEnabled: true,
        bevelSize: 0.65,
        bevelThickness: 0.65,
        bevelSegments: 3,
        steps: 1,
        curveSegments: 24,
      }),
      'shell',
      [0, 0, z - length / 2],
    );
    const sealProfile = new T.Shape();
    sealProfile.moveTo(-width / 2 + 5, 0);
    sealProfile.lineTo(-width / 2 + 5, 17);
    sealProfile.quadraticCurveTo(-width / 2 + 5, 34, -width * 0.18, 38);
    sealProfile.quadraticCurveTo(0, 41, width * 0.18, 38);
    sealProfile.quadraticCurveTo(width / 2 - 5, 34, width / 2 - 5, 17);
    sealProfile.lineTo(width / 2 - 5, 0);
    sealProfile.lineTo(width / 2 - 6, 0);
    sealProfile.lineTo(width / 2 - 6, 17);
    sealProfile.quadraticCurveTo(width / 2 - 6, 33, width * 0.18, 37);
    sealProfile.quadraticCurveTo(0, 40, -width * 0.18, 37);
    sealProfile.quadraticCurveTo(-width / 2 + 6, 33, -width / 2 + 6, 17);
    sealProfile.lineTo(-width / 2 + 6, 0);
    sealProfile.closePath();
    mesh(
      parent,
      'Vault mouth narrow inset thermal seal',
      new T.ExtrudeGeometry(sealProfile, {
        depth: 0.6,
        bevelEnabled: true,
        bevelSize: 0.15,
        bevelThickness: 0.15,
        bevelSegments: 2,
        steps: 1,
        curveSegments: 24,
      }),
      'graphite',
      [0, 0, z - length / 2 - 0.8],
    );
    box(
      parent,
      'Open vault graphite working floor',
      [width + 14, 6, length + 12],
      [0, -3, z],
    );
    box(
      parent,
      'Closed pressure bulkhead',
      [width - 9, 32, 4],
      [0, 16, z + length / 2 - 3],
      'graphite',
    );
    box(
      parent,
      'Recessed dark exchange chamber',
      [width - 10, 29, 4],
      [0, 15, z - length / 2 + 7],
      'graphite',
    );
    for (let k = 0; k < 6; k++)
      box(
        parent,
        'Thick radiator mouth louver',
        [width - 15, 2.1, 6],
        [0, 4 + k * 4.3, z - length / 2 + 3],
        'copper',
        0.22,
      );
    for (const x of [-1, 1]) {
      box(
        parent,
        'Pressure-vault shoulder carrier',
        [8, 9, length + 8],
        [x * (width / 2 + 1), 6, z],
        'alloy',
      );
    }
    for (let k = 0; k < 6; k++)
      box(
        parent,
        'Deep seated exchanger bank',
        [width - 14, 2.2, 5],
        [0, 6 + k * 4.2, z - length * 0.18],
        k % 2 ? 'graphite' : 'copper',
        0.2,
      );
    for (const end of [-1, 1]) {
      beam(
        parent,
        'Diagonal vault end carrier',
        [-width / 2 - 3, -12, z + (end * length) / 2],
        [-width / 2 - 3, 27, z + end * (length / 2 - 12)],
        4,
        'alloy',
      );
      beam(
        parent,
        'Diagonal vault end carrier',
        [width / 2 + 3, -12, z + (end * length) / 2],
        [width / 2 + 3, 27, z + end * (length / 2 - 12)],
        4,
        'alloy',
      );
    }
  }
  function place(assembly, fraction, side, scale = 1, lift = -30, yaw = 0) {
    const frame = groundFrame(track, fraction * track.length);
    assembly.scale.setScalar(scale);
    assembly.rotation.y = Math.atan2(frame.tangent.x, frame.tangent.z) + yaw;
    for (let i = 0; i < 35; i++) {
      assembly.position
        .copy(frame.position)
        .addScaledVector(frame.right, side * (117 + i * 22));
      assembly.position.y += lift;
      assembly.updateMatrixWorld(true);
      const bounds = new T.Box3().setFromObject(assembly),
        center = bounds.getCenter(new T.Vector3()),
        size = bounds.getSize(new T.Vector3());
      if (
        clearance.clears(
          center.x,
          center.z,
          size.x,
          size.z,
          bounds.max.y,
          0,
          bounds.min.y,
        )
      ) {
        placements.push({
          name: assembly.name,
          fraction,
          side,
          min: bounds.min.toArray(),
          max: bounds.max.toArray(),
        });
        group.add(assembly);
        return;
      }
    }
    throw new Error(
      `Helion Breach infrastructure cannot clear the route: ${assembly.name}`,
    );
  }
  function hub(fraction, side, scale = 1) {
    const assembly = new T.Group();
    assembly.name = 'Breach / thermal instrument and pressure hub';
    vault(assembly, 0, 72, 74);
    vault(assembly, 108, 48, 52);
    box(
      assembly,
      'Continuous observatory foundation',
      [100, 18, 222],
      [0, -17, 48],
    );
    box(assembly, 'Staggered lower thermal keel', [62, 30, 258], [5, -39, 54]);
    for (const x of [-38, 38]) {
      box(
        assembly,
        'Deep lateral carrier girder',
        [7, 23, 250],
        [x, -20, 51],
        'alloy',
      );
      for (let z = -55; z <= 155; z += 42)
        beam(
          assembly,
          'Rooted diagonal compression leg',
          [x, -40, z - 18],
          [x, -6, z + 15],
          5,
        );
    }
    const gallerySide = -side;
    box(
      assembly,
      'Recessed instrument gallery backing',
      [4, 25, 150],
      [gallerySide * 45, 8, 31],
    );
    box(
      assembly,
      'Gallery sun hood',
      [21, 4, 160],
      [gallerySide * 51, 22, 31],
      'shell',
    );
    box(
      assembly,
      'Gallery lower ceramic plinth',
      [19, 4, 160],
      [gallerySide * 51, -5, 31],
      'shell',
    );
    for (let z = -35; z < 107; z += 17) {
      box(
        assembly,
        'Protected dark observation aperture',
        [1.5, 13, 13],
        [gallerySide * 56, 9, z],
        'window',
        0.1,
      );
      box(
        assembly,
        'Deep window mullion',
        [7, 18, 1.4],
        [gallerySide * 57, 9, z + 7.4],
        'alloy',
        0.1,
      );
      for (const y of [3, 10])
        box(
          assembly,
          'Actual recessed instrument-room floor',
          [7.5, 0.7, 12],
          [gallerySide * 51, y, z],
          'alloy',
          0.1,
        );
      box(
        assembly,
        'Instrument-room warm ceiling strip',
        [5, 0.4, 8],
        [gallerySide * 51, 16.8, z],
        'amber',
        0.05,
      );
    }
    tube(
      assembly,
      'Connected primary thermal transfer',
      [
        [-19, -9, -70],
        [-19, 8, -54],
        [-19, 14, 50],
        [-15, 19, 80],
        [-15, 3, 135],
      ],
      4.2,
    );
    box(
      assembly,
      'Primary manifold rooted valve seat',
      [15, 13, 13],
      [-19, -10, -70],
      'alloy',
    );
    tube(
      assembly,
      'Cold return manifold',
      [
        [25, -9, -72],
        [28, -9, -40],
        [28, -9, 142],
        [10, 1, 157],
      ],
      3.4,
      'alloy',
    );
    for (const z of [-45, 41, 142])
      box(assembly, 'Manifold saddle', [65, 6, 10], [0, -7, z], 'copper');
    box(assembly, 'Asymmetric command tower root', [35, 58, 40], [21, 21, 166]);
    box(
      assembly,
      'Command tower ceramic crown',
      [42, 11, 47],
      [21, 53, 166],
      'shell',
    );
    box(
      assembly,
      'Sheltered tower observation face',
      [30, 16, 1.5],
      [21, 34, 145],
      'window',
    );
    for (const x of [5, 37])
      box(
        assembly,
        'Tower seated vertical frame',
        [3, 35, 6],
        [x, 28, 143],
        'alloy',
      );
    box(
      assembly,
      'Tower thin service aperture',
      [24, 0.7, 0.7],
      [21, 50, 142],
      'amber',
      0.05,
    );
    place(assembly, fraction, side, scale);
  }
  function receiver(fraction, side) {
    const assembly = new T.Group();
    assembly.name = 'Breach / radiometric receiver and inhabited control drum';
    box(
      assembly,
      'Receiver lower structural plinth',
      [95, 18, 108],
      [0, -31, 15],
    );
    for (const x of [-31, 31])
      for (const z of [-23, 47]) {
        beam(
          assembly,
          'Deep receiver compression leg',
          [x * 1.25, -42, z],
          [x * 0.52, 37, z * 0.44],
          6,
          'alloy',
        );
        beam(
          assembly,
          'Receiver cross-braced carrier',
          [x, -17, z],
          [-x, 18, z],
          3.5,
        );
      }
    const coreProfile = [
      [0, -21],
      [20, -21],
      [20, -12],
      [17, -3],
      [12, 19],
      [12, 37],
      [15, 46],
      [18, 49],
      [16, 54],
      [16, 80],
      [0, 80],
    ].map((p) => new T.Vector2(...p));
    mesh(
      assembly,
      'Stepped pressure instrument core',
      new T.LatheGeometry(coreProfile, 64),
      'graphite',
      [0, 0, 8],
    );
    mesh(
      assembly,
      'Formed ceramic pressure sleeve',
      new T.CylinderGeometry(18, 22, 40, 48),
      'shell',
      [0, 1, 8],
    );
    for (const y of [21, 46, 75]) {
      mesh(
        assembly,
        'Machined receiver pressure collar',
        new T.TorusGeometry(16.3, 2.1, 8, 48),
        'alloy',
        [0, y, 8],
        [Math.PI / 2, 0, 0],
      );
    }
    for (let k = 0; k < 12; k++) {
      const angle = (k / 12) * Math.PI * 2;
      const room = new T.Group();
      room.position.z = 8;
      room.rotation.y = angle;
      box(room, 'Deep control-room pressure backing', [16, 19, 3], [0, 60, 23]);
      for (const sign of [-1, 1])
        box(
          room,
          'Thick recessed control-room side return',
          [2.5, 19, 8],
          [sign * 7.7, 60, 27],
          'alloy',
          0.2,
        );
      box(
        room,
        'Deep control-room upper return',
        [16, 3.2, 9],
        [0, 68.5, 27],
        'graphite',
        0.25,
      );
      box(
        room,
        'Deep control-room lower return',
        [16, 3.2, 9],
        [0, 51.5, 27],
        'alloy',
        0.25,
      );
      box(
        room,
        'Recessed segmented control glazing',
        [12.6, 13, 1.1],
        [0, 60, 27.4],
        'window',
        0.15,
      );
      for (const y of [54, 60.5]) {
        box(
          room,
          'Actual control-room floor behind glazing',
          [12, 0.65, 3.4],
          [0, y, 25.2],
          'alloy',
          0.1,
        );
        box(
          room,
          'Control-room inner service console',
          [6.5, 1.2, 1.6],
          [0, y + 1.1, 24.4],
          'graphite',
          0.15,
        );
      }
      box(
        room,
        'Recessed control-room ceiling light',
        [9, 0.35, 0.6],
        [0, 65.8, 25],
        'amber',
        0.05,
      );
      assembly.add(room);
      const a = angle - Math.PI / 12 + 0.006,
        b = angle + Math.PI / 12 - 0.006;
      for (const [y, radius, thickness] of [
        [48, 33, 4.5],
        [70, k >= 7 && k <= 10 ? 39 : 34, 5],
      ]) {
        const shape = new T.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(Math.sin(a) * radius, -Math.cos(a) * radius);
        shape.lineTo(Math.sin(b) * radius, -Math.cos(b) * radius);
        shape.closePath();
        mesh(
          assembly,
          'Individual formed control-room canopy cassette',
          new T.ExtrudeGeometry(shape, {
            depth: thickness,
            bevelEnabled: true,
            bevelSize: 0.65,
            bevelThickness: 0.65,
            bevelSegments: 2,
            steps: 1,
          }),
          'shell',
          [0, y, 8],
          [-Math.PI / 2, 0, 0],
        );
      }
    }
    for (const sign of [-1, 1])
      for (const end of [-1, 1])
        beam(
          assembly,
          'Control-gallery rooted diagonal pressure stay',
          [sign * 12, 23, 8 + end * 12],
          [sign * 25, 48, 8 + end * 19],
          3.5,
          'alloy',
        );
    const pod = new T.Shape(
      [
        [-24, -15],
        [20, -15],
        [24, -2],
        [15, 19],
        [-12, 22],
        [-24, 8],
      ].map((p) => new T.Vector2(...p)),
    );
    const opening = new T.Path(
      [
        [-14, -6],
        [-14, 10],
        [14, 10],
        [14, -6],
      ].map((p) => new T.Vector2(...p)),
    );
    pod.holes.push(opening);
    mesh(
      assembly,
      'Asymmetric pressure casing with through-cut service mouth',
      new T.ExtrudeGeometry(pod, {
        depth: 42,
        bevelEnabled: true,
        bevelSize: 1,
        bevelThickness: 1,
        bevelSegments: 3,
        steps: 1,
      }),
      'graphite',
      [-side * 27, 18, -23],
    );
    for (const outline of [
      [
        [-24, -15],
        [-17, -15],
        [-17, 10],
        [-12, 22],
        [-24, 8],
      ],
      [
        [16, -15],
        [20, -15],
        [24, -2],
        [15, 19],
        [13, 12],
      ],
    ]) {
      mesh(
        assembly,
        'Separate formed ceramic pressure-casing cheek',
        new T.ExtrudeGeometry(
          new T.Shape(outline.map((p) => new T.Vector2(...p))),
          {
            depth: 43,
            bevelEnabled: true,
            bevelSize: 0.6,
            bevelThickness: 0.6,
            bevelSegments: 2,
            steps: 1,
          },
        ),
        'shell',
        [-side * 27, 18, -23.5],
      );
    }
    box(
      assembly,
      'Recessed instrument-bay upper receiving lip',
      [28, 3.5, 5],
      [-side * 27, 30, -23],
      'alloy',
    );
    box(
      assembly,
      'Recessed instrument-bay lower receiving lip',
      [28, 3.5, 5],
      [-side * 27, 10.5, -23],
      'alloy',
    );
    box(
      assembly,
      'Deep instrument-bay pressure bulkhead',
      [28, 16, 3],
      [-side * 27, 20, 16],
      'graphite',
    );
    for (const x of [-9, 0, 9])
      box(
        assembly,
        'Large recessed instrument cooling cartridge',
        [4.8, 12, 22],
        [-side * 27 + x, 20, -6],
        'copper',
        0.4,
      );
    tube(
      assembly,
      'Instrument-bay seated pressure return',
      [
        [-side * 27, 5, -2],
        [-side * 39, -4, -2],
        [-side * 29, -20, 20],
        [0, -20, 38],
      ],
      3.8,
      'alloy',
    );
    mesh(
      assembly,
      'Pressure-bay large seated receiving cuff',
      new T.TorusGeometry(5, 0.8, 8, 32),
      'copper',
      [-side * 27, 5, -2],
      [Math.PI / 2, 0, 0],
    );
    // A single asymmetrical instrument sail seats into the pressure drum. Its
    // three broad leaves vary in reach and stay outboard of the road aperture.
    const outward = side;
    const pivot = [outward * 25, 28, 13];
    for (let k = 0; k < 3; k++) {
      const sail = new T.Group();
      sail.position.set(...pivot);
      sail.rotation.z = outward * (-0.4 + k * 0.24);
      const panel = new T.Shape([
        new T.Vector2(outward * 6, 0),
        new T.Vector2(outward * 13, 65 + k * 9),
        new T.Vector2(outward * 40, 91 - k * 8),
        new T.Vector2(outward * 45, 29),
      ]);
      mesh(
        sail,
        'Broad seated thermal receiver leaf',
        new T.ExtrudeGeometry(panel, {
          depth: 15,
          bevelEnabled: true,
          bevelSize: 0.65,
          bevelThickness: 0.65,
          bevelSegments: 2,
          steps: 1,
        }),
        'copper',
        [0, 0, k * 20 - 14],
      );
      beam(
        sail,
        'Sail structural graphite spar',
        [outward * 6, 0, k * 20 - 17],
        [outward * 28, 84 - k * 3, k * 20 - 17],
        4.5,
      );
      for (const y of [24, 48, 68])
        beam(
          sail,
          'Seated lateral receiver rib',
          [outward * 15, y, k * 20 - 17],
          [outward * 39, y + 7, k * 20 - 17],
          2.7,
          'alloy',
        );
      assembly.add(sail);
    }
    tube(
      assembly,
      'Instrument flow pipe into lower keel',
      [
        [outward * 29, 27, 17],
        [outward * 42, 13, 17],
        [outward * 37, -19, 23],
        [0, -21, 46],
      ],
      4.3,
    );
    tube(
      assembly,
      'Pressure return into instrument core',
      [
        [-outward * 8, -26, -31],
        [-outward * 28, -26, -31],
        [-outward * 27, 15, -13],
        [-outward * 12, 22, 8],
      ],
      3.4,
      'alloy',
    );
    box(
      assembly,
      'Receiver lower valve housing',
      [35, 24, 32],
      [0, -7, 46],
      'shell',
    );
    box(
      assembly,
      'Receiver rooted access gallery',
      [38, 14, 42],
      [-outward * 20, 14, -30],
    );
    box(
      assembly,
      'Protected access gallery glazing',
      [1.2, 8, 32],
      [-outward * 40, 16, -30],
      'window',
      0.1,
    );
    place(assembly, fraction, side, 1.35, -47);
  }
  function shieldStation(fraction, side) {
    const assembly = new T.Group();
    assembly.name = 'Breach / primary thermal control station';
    box(
      assembly,
      'Deep joined control-station raft',
      [145, 21, 246],
      [side * 16, -31, 0],
    );
    box(
      assembly,
      'Control-station pressure spine',
      [44, 40, 205],
      [side * 20, -12, 0],
    );
    for (const z of [-86, -24, 43, 91]) {
      beam(
        assembly,
        'Shield rooted compression buttress',
        [side * 48, -42, z],
        [side * 66, 107, z],
        8,
        'alloy',
      );
      beam(
        assembly,
        'Shield large diagonal return',
        [-side * 39, -25, z],
        [side * 68, 58, z],
        5,
      );
    }
    // Thick curved shield segments, separated by genuine service apertures.
    // The uneven crown gives a large silhouette without a flat tiled screen.
    for (const [a, b, height] of [
      [-0.78, -0.34, 130],
      [-0.27, 0.12, 171],
      [0.2, 0.76, 146],
    ]) {
      const curve = (angle, offset) =>
        new T.Vector2(
          side * (51 + (1 - Math.cos(angle)) * 140 + offset),
          -Math.sin(angle) * 140,
        );
      function section(from, to, near, far, bottom, extent, material, name) {
        const shape = new T.Shape();
        for (let i = 0; i <= 18; i++) {
          const p = curve(T.MathUtils.lerp(from, to, i / 18), near);
          if (i === 0) shape.moveTo(p.x, p.y);
          else shape.lineTo(p.x, p.y);
        }
        for (let i = 18; i >= 0; i--) {
          const p = curve(T.MathUtils.lerp(from, to, i / 18), far);
          shape.lineTo(p.x, p.y);
        }
        shape.closePath();
        mesh(
          assembly,
          name,
          new T.ExtrudeGeometry(shape, {
            depth: extent,
            steps: 1,
            bevelEnabled: true,
            bevelSize: 0.75,
            bevelThickness: 0.75,
            bevelSegments: 2,
          }),
          material,
          [0, bottom, 0],
          [-Math.PI / 2, 0, 0],
        );
      }
      section(
        a,
        b,
        19,
        26,
        -13,
        height,
        'graphite',
        'Deep recessed shield chamber bulkhead',
      );
      section(
        a,
        b,
        0,
        8,
        -13,
        41,
        'graphite',
        'Lower formed shield pressure shell',
      );
      section(
        a,
        b,
        0,
        8,
        81,
        height - 94,
        'graphite',
        'Upper formed shield pressure shell',
      );
      section(
        a,
        a + 0.065,
        0,
        24,
        28,
        53,
        'alloy',
        'Thick shield chamber side return',
      );
      section(
        b - 0.065,
        b,
        0,
        24,
        28,
        53,
        'alloy',
        'Thick shield chamber side return',
      );
      section(
        a,
        b,
        -1,
        10,
        7,
        8,
        'shell',
        'Formed pale lower reinforcement belt',
      );
      section(
        a,
        b,
        -1,
        10,
        height - 24,
        8,
        'shell',
        'Formed pale crown reinforcement belt',
      );
      for (const y of [35, 54, 73])
        section(
          a + 0.07,
          b - 0.07,
          10,
          18,
          y,
          4,
          'copper',
          'Recessed full-width heat exchanger header',
        );
      for (const angle of [a + 0.05, b - 0.05]) {
        const x = side * (51 + (1 - Math.cos(angle)) * 140 - 2),
          z = Math.sin(angle) * 140;
        tube(
          assembly,
          'Rooted shield heat-transfer jacket',
          [
            [x, height - 20, z],
            [x - side * 6, height * 0.5, z],
            [side * 39, -9, z],
          ],
          3.2,
        );
        box(
          assembly,
          'Large seated shield inlet',
          [15, 17, 16],
          [side * 39, -7, z],
          'alloy',
        );
      }
    }
    box(
      assembly,
      'Deep observation gallery structural body',
      [26, 38, 178],
      [-side * 15.5, 10, -7],
    );
    box(
      assembly,
      'Wide layered control gallery visor',
      [56, 6.5, 190],
      [-side * 27, 34, -7],
      'shell',
    );
    box(
      assembly,
      'Gallery connected lower sill',
      [52, 7, 190],
      [-side * 28, -9, -7],
      'shell',
    );
    for (let z = -82; z <= 71; z += 25.5) {
      box(
        assembly,
        'Deep control-room aperture',
        [1.8, 25, 21],
        [-side * 42, 11, z],
        'window',
        0.2,
      );
      box(
        assembly,
        'Gallery recessed structural pier',
        [10, 35, 3.3],
        [-side * 45, 11, z + 12.4],
        'alloy',
      );
      for (const y of [0, 8.5, 17]) {
        box(
          assembly,
          'Deep occupied gallery pressure floor',
          [13, 1.1, 22],
          [-side * 35, y, z],
          'alloy',
          0.15,
        );
        box(
          assembly,
          'Occupied gallery restrained interior light',
          [0.6, 0.4, 15],
          [-side * 34, y + 5.8, z],
          'amber',
          0.05,
        );
      }
    }
    tube(
      assembly,
      'Cold return collector seated in gallery',
      [
        [side * 32, -8, -106],
        [0, -8, -106],
        [-side * 15, 5, -106],
        [-side * 15, 17, -81],
      ],
      6,
      'alloy',
    );
    for (const z of [-82, -4, 74])
      box(
        assembly,
        'Control-station occupied deck seat',
        [112, 9, 17],
        [0, -19, z],
        'copper',
      );
    place(assembly, fraction, side, 1.05, -28, -side * 0.65);
  }
  function canopyRoots() {
    const coverClearance = createRouteClearance(track, {
      localVertical: [-15, 22],
      sidePadding: 10,
    });
    for (const zone of track.thermalZones ?? []) {
      if (!['shelter', 'flare', 'furnace'].includes(zone.kind)) continue;
      for (let s = zone.start + 15; s < zone.end; s += 110) {
        if (
          track.jumps.some(
            (jump) => s > jump.takeoff - 80 && s < jump.recovery + 70,
          )
        )
          continue;
        const frame = track.sample(s),
          root = new T.Group();
        root.position.copy(frame.position);
        root.quaternion.copy(frame.quaternion);
        const top =
          zone.id === 'wall-shade' ? 77 : zone.kind === 'furnace' ? 26 : 23;
        for (const sign of zone.kind === 'flare' ? [-1] : [-1, 1]) {
          box(
            root,
            'Shield canopy rooted outboard pier',
            [3.5, top + 32, 5],
            [sign * 35, (top - 32) / 2, 0],
            'alloy',
          );
          beam(
            root,
            'Canopy structural lower return',
            [sign * 19, -31, -7],
            [sign * 35, -11, 0],
            4,
          );
          const edge = zone.kind === 'flare' ? -14.5 : sign * 22;
          beam(
            root,
            'Physical shelter cantilever bracket',
            [sign * 35, top, 0],
            [edge, top, 0],
            2.8,
          );
          box(
            root,
            'Seated shelter receiving pad',
            [5, 2, 7],
            [edge, top, 0],
            'copper',
          );
        }
        root.updateMatrixWorld(true);
        const safe = [];
        let complete = true;
        root.traverse((object) => {
          if (!object.isMesh) return;
          const bounds = new T.Box3().setFromObject(object),
            center = bounds.getCenter(new T.Vector3()),
            size = bounds.getSize(new T.Vector3());
          if (
            coverClearance.clears(
              center.x,
              center.z,
              size.x,
              size.z,
              bounds.max.y,
              0,
              bounds.min.y,
            )
          )
            safe.push(object);
          else complete = false;
        });
        // Accept a complete rooted bracket assembly, never isolated surviving
        // posts whose header was excluded by another road branch.
        if (!complete) continue;
        for (const object of safe) {
          object.matrixWorld.decompose(
            object.position,
            object.quaternion,
            object.scale,
          );
          group.add(object);
        }
      }
    }
  }
  function carrierSpine(start, end) {
    const interval = 28;
    for (let s = start * track.length; s < end * track.length; s += interval) {
      const frame = track.sample(s),
        root = new T.Group();
      root.position.copy(frame.position);
      root.quaternion.copy(frame.quaternion);
      for (const side of [-1, 1]) {
        box(
          root,
          'Continuous lower observatory spine',
          [7, 11, interval + 5],
          [side * 19, -31, 0],
          'graphite',
          0.5,
        );
        box(
          root,
          'Seated carrier cap',
          [9, 2.4, interval + 5],
          [side * 19, -24.8, 0],
          'alloy',
          0.3,
        );
        beam(
          root,
          'Deep triangular road-keel web',
          [side * 19, -28, -10],
          [0, -50, 10],
          3.7,
        );
      }
      box(root, 'Lower cross-tie', [43, 5, 5], [0, -32, 0], 'copper', 0.4);
      root.updateMatrixWorld(true);
      const safe = [];
      root.traverse((object) => {
        if (!object.isMesh) return;
        const bounds = new T.Box3().setFromObject(object),
          center = bounds.getCenter(new T.Vector3()),
          size = bounds.getSize(new T.Vector3());
        if (
          clearance.clears(
            center.x,
            center.z,
            size.x,
            size.z,
            bounds.max.y,
            0,
            bounds.min.y,
          )
        )
          safe.push(object);
      });
      // Keep each accepted part's world transform while unparenting it.
      for (const object of safe) {
        object.matrix.copy(object.matrixWorld);
        object.matrix.decompose(
          object.position,
          object.quaternion,
          object.scale,
        );
        group.add(object);
      }
    }
  }
  function observatoryFoundation() {
    // The inherited plumb piers end at real foundation shoes, 155m below
    // datum. Tie those feet into an open load-bearing station frame rather
    // than a ground plane; the stellar void remains visible through its web.
    const footAt = (distance) => {
      const frame = track.sample(distance);
      const jumpSpan = track.jumps.some(
        (jump) =>
          distance >= jump.takeoff - 50 && distance <= jump.recovery + 70,
      );
      const foot = frame.position
        .clone()
        .addScaledVector(frame.right, jumpSpan ? -28 : 0)
        .addScaledVector(frame.up, -16);
      foot.y = track.groundY;
      return foot;
    };
    const count = Math.ceil(track.length / 28);
    for (let i = 0; i < count; i++) {
      const a = footAt((i * track.length) / count),
        b = footAt(((i + 1) * track.length) / count);
      const tangent = b.clone().sub(a).normalize(),
        up = new T.Vector3(0, 1, 0),
        right = new T.Vector3().crossVectors(up, tangent).normalize();
      const quaternion = new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(right, up, tangent),
      );
      for (const sign of [-1, 1]) {
        const center = a
          .clone()
          .add(b)
          .multiplyScalar(0.5)
          .addScaledVector(right, sign * 9);
        center.y -= 6;
        const rail = box(
          group,
          'Continuous deep observatory foundation rail',
          [9, 12, a.distanceTo(b) + 2],
          center.toArray(),
          'graphite',
          0.6,
        );
        rail.quaternion.copy(quaternion);
        center.y += 7;
        const cap = box(
          group,
          'Foundation shoe continuous receiving cap',
          [11, 2.8, a.distanceTo(b) + 2],
          center.toArray(),
          'alloy',
          0.3,
        );
        cap.quaternion.copy(quaternion);
        if (i % 2 === 0) {
          const from = a.clone().addScaledVector(right, sign * 9),
            to = b.clone().addScaledVector(right, -sign * 9);
          from.y -= 11;
          to.y -= 1;
          beam(
            group,
            'Open station foundation diagonal web',
            from.toArray(),
            to.toArray(),
            2.8,
          );
        }
      }
      if (i % 4 === 0) {
        const header = box(
          group,
          'Grouped pier-foot transverse pressure bed',
          [39, 8, 15],
          a
            .clone()
            .add(new T.Vector3(0, -3, 0))
            .toArray(),
          'alloy',
          0.7,
        );
        header.quaternion.copy(quaternion);
      }
    }
  }
  hub(0.52, 1, 1.35);
  receiver(0.69, 1);
  shieldStation(0.065, 1);
  carrierSpine(0, 1);
  canopyRoots();
  observatoryFoundation();
  group.updateMatrixWorld(true);
  group.traverse((object) => {
    if (!object.isMesh) return;
    const key = object.material.uuid;
    if (!parts.has(key))
      parts.set(key, { material: object.material, geometries: [] });
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    // Instanced/merged surfaces share metre-space material response.
    if (geometry.index) {
      const flat = geometry.toNonIndexed();
      geometry.dispose();
      parts.get(key).geometries.push(flat);
    } else parts.get(key).geometries.push(geometry);
  });
  group.clear();
  for (const geometry of source) geometry.dispose();
  const geometries = [];
  for (const { material, geometries: pieces } of parts.values()) {
    const geometry = mergeGeometries(pieces);
    pieces.forEach((piece) => piece.dispose());
    if (!geometry)
      throw new Error('Helion Breach infrastructure batching failed');
    geometries.push(geometry);
    const object = new T.Mesh(geometry, material);
    object.name = `Breach / connected hub / ${material.name}`;
    object.castShadow = material !== materials.window;
    object.receiveShadow = true;
    group.add(object);
  }
  let disposed = false;
  const metrics = {
    placements,
    meshes: group.children.length,
    triangles: geometries.reduce(
      (n, geometry) =>
        n + (geometry.index?.count ?? geometry.attributes.position.count) / 3,
      0,
    ),
  };
  group.userData.metrics = metrics;
  return {
    group,
    metrics,
    setReflection(texture) {
      for (const material of Object.values(materials)) {
        material.envMap = texture;
        material.envMapIntensity = 0.65;
        material.needsUpdate = true;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      geometries.forEach((geometry) => geometry.dispose());
      Object.values(materials).forEach((material) => material.dispose());
      group.clear();
    },
  };
}
