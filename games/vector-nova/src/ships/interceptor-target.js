import * as T from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRivalPropulsion } from './rival-propulsion.js';
import { GOLIATH_HULL } from './interceptor-target-hull.js';

export const GOLIATH_SPECIFICATION = Object.freeze({
  id: 'goliath',
  name: 'Goliath',
  version: 1,
  role: 'Armored heavy courier',
  description:
    'A massive low courier with a connected pressure spine, seated ceramic armor and three recessed aft ion drives.',
  design: 'Forty-metre armored courier / twin integrated drive nacelles',
  propulsion: 'Two massive aft outlets and a central ion drive',
});

// Original source-authored target, not an enlargement of an approved player
// chassis. The principal rendered forms share the exact contact vertices.
export function createInterceptorTarget(settings = {}) {
  const group = new T.Group(),
    body = new T.Group();
  group.name = 'Goliath / armored AI courier';
  body.name = 'Goliath / manufactured chassis';
  group.add(body);
  const materials = new Set(),
    originals = new Set(),
    owned = new Set(),
    boxCache = new Map();
  const material = (name, options, physical = false) => {
    const m = physical
      ? new T.MeshPhysicalMaterial(options)
      : new T.MeshStandardMaterial(options);
    m.name = name;
    materials.add(m);
    return m;
  };
  const ceramic = material(
    'Goliath / coated pearl ceramic',
    {
      color: '#d9dace',
      roughness: 0.25,
      metalness: 0.06,
      clearcoat: 0.7,
      clearcoatRoughness: 0.23,
    },
    true,
  );
  const service = material(
    'Goliath / blue-grey service ceramic',
    {
      color: '#8296a5',
      roughness: 0.32,
      metalness: 0.07,
      clearcoat: 0.5,
      clearcoatRoughness: 0.3,
    },
    true,
  );
  const graphite = material(
    'Goliath / resin-coated structural graphite',
    { color: '#26343f', roughness: 0.33, metalness: 0.12, clearcoat: 0.45 },
    true,
  );
  const metal = material('Goliath / exposed machined retaining alloy', {
    color: '#b7c4ca',
    roughness: 0.25,
    metalness: 0.85,
  });
  const heat = material('Goliath / heat-treated pressure sleeve', {
    color: '#6d736e',
    roughness: 0.42,
    metalness: 0.7,
    side: T.DoubleSide,
  });
  const red = material(
    'Goliath / bonded vermilion identification',
    { color: '#a84131', roughness: 0.4, metalness: 0.08, clearcoat: 0.45 },
    true,
  );
  const glass = material(
    'Goliath / protected command glazing',
    {
      color: '#102831',
      roughness: 0.15,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.14,
    },
    true,
  );
  const ion = material('Goliath_Ion', {
    color: '#a7e7ff',
    emissive: '#289dff',
    emissiveIntensity: 2.4,
    roughness: 0.28,
    metalness: 0.05,
  });
  const axisX = new T.Vector3(1, 0, 0),
    axisZ = new T.Vector3(0, 0, 1);
  function add(
    geometry,
    m,
    position = [0, 0, 0],
    rotation = null,
    name = 'Goliath fitted assembly',
  ) {
    originals.add(geometry);
    const mesh = new T.Mesh(geometry, m);
    mesh.position.set(...position);
    if (rotation) mesh.quaternion.copy(rotation);
    mesh.name = name;
    body.add(mesh);
    return mesh;
  }
  function box(size, p, m, radius = 0.12, name = 'Seated armor cassette') {
    const key = size.join('/') + '/' + radius;
    if (!boxCache.has(key))
      boxCache.set(
        key,
        new RoundedBoxGeometry(
          ...size,
          1,
          Math.min(radius, Math.min(...size) * 0.18),
        ),
      );
    return add(boxCache.get(key), m, p, null, name);
  }
  const points = (vertices) =>
    Array.from({ length: vertices.length / 3 }, (_, i) =>
      new T.Vector3().fromArray(vertices, i * 3),
    );
  for (const part of GOLIATH_HULL.parts) {
    let geometry = new ConvexGeometry(points(part.vertices));
    if (part.id.includes('drive')) {
      // Remove the rear cap. The outlet is a real cavity closed by its recessed
      // emitter, not a painted disc on a solid outer hull face.
      const p = geometry.attributes.position,
        n = geometry.attributes.normal,
        positions = [],
        normals = [];
      for (let i = 0; i < p.count; i += 3) {
        if (
          [0, 1, 2].every(
            (j) => Math.abs(p.getZ(i + j) - part.bounds.min[2]) < 1e-5,
          )
        )
          continue;
        for (let j = 0; j < 3; j++) {
          positions.push(p.getX(i + j), p.getY(i + j), p.getZ(i + j));
          normals.push(n.getX(i + j), n.getY(i + j), n.getZ(i + j));
        }
      }
      geometry.dispose();
      geometry = new T.BufferGeometry();
      geometry.setAttribute(
        'position',
        new T.Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
    }
    const m = part.id.includes('glazing')
      ? glass
      : part.id.includes('fore-armor') || part.id.includes('drive')
        ? ceramic
        : part.id.includes('command')
          ? service
          : graphite;
    add(geometry, m, [0, 0, 0], null, part.id);
  }
  // Central cargo spine: thick independent covers seat inside broad graphite
  // returns, leaving actual shaded gaps and two exposed longitudinal carriers.
  for (const z of [-8, -3, 2]) {
    box(
      [6.6, 0.24, 4.2],
      [0, 4.39, z],
      heat,
      0.08,
      'Pressure-spine machined seat',
    );
    box(
      [6.15, 0.3, 3.8],
      [0, 4.65, z],
      service,
      0.14,
      'Removable cargo-spine cover',
    );
    for (const side of [-1, 1]) {
      box(
        [0.32, 0.42, 4.35],
        [side * 3.4, 4.46, z],
        metal,
        0.06,
        'Spine retaining carrier',
      );
      for (const dz of [-1.4, 1.4])
        box(
          [0.52, 0.12, 0.36],
          [side * 2.65, 4.88, z + dz],
          metal,
          0.04,
          'Seated service cleat',
        );
    }
  }
  for (const side of [-1, 1]) {
    // A deep side mouth has a ceramic surround, dark pressure wall and folded
    // metal vanes. The inlet is formed between components rather than decal.
    box(
      [0.28, 1.45, 6.6],
      [side * 5.36, 2.7, 4.8],
      graphite,
      0.06,
      'Recessed intake pressure wall',
    );
    for (const y of [1.93, 3.47])
      box(
        [0.44, 0.18, 7.05],
        [side * 5.55, y, 4.8],
        ceramic,
        0.07,
        'Formed ceramic intake lip',
      );
    for (const z of [1.35, 8.25])
      box(
        [0.44, 1.7, 0.28],
        [side * 5.55, 2.7, z],
        ceramic,
        0.07,
        'Intake seated end return',
      );
    for (let i = 0; i < 9; i++) {
      const blade = box(
        [0.3, 1.25, 0.18],
        [side * 5.58, 2.7, 1.8 + i * 0.72],
        metal,
        0.04,
        'Folded intake vane',
      );
      blade.rotation.y = side * 0.3;
    }
    // Low fore armor uses separate blue-grey saddles and livery, with enough
    // thickness to read at race distance and no aircraft wing geometry.
    for (const z of [5.3, 9.8]) {
      box(
        [2.55, 0.14, 3.4],
        [side * 3.5, 4.79, z],
        service,
        0.07,
        'Fore armor service saddle',
      );
      box(
        [0.46, 0.035, 3.15],
        [side * 3.65, 4.88, z],
        red,
        0.025,
        'Bonded fore identification band',
      );
    }
    for (const z of [-16.5, -12.2]) {
      box(
        [3.5, 0.18, 3.5],
        [side * 5.35, 4.89, z],
        service,
        0.09,
        'Drive nacelle removable cowling',
      );
      box(
        [0.7, 0.035, 3.25],
        [side * 5.55, 4.995, z],
        red,
        0.025,
        'Aft courier identification',
      );
      for (const dz of [-1.25, 1.25])
        box(
          [0.4, 0.13, 0.3],
          [side * 6.4, 5.02, z + dz],
          metal,
          0.04,
          'Nacelle panel keeper',
        );
    }
  }
  // Protected command coaming: dark glazing sits lower than its ceramic lip.
  box([3.8, 0.11, 5.1], [0, 5.49, 8.6], graphite, 0.16, 'Canopy bonded gasket');
  box(
    [3.45, 0.13, 4.7],
    [0, 5.57, 8.6],
    glass,
    0.15,
    'Low armored command glazing',
  );
  for (const side of [-1, 1])
    box(
      [0.2, 0.17, 4.9],
      [side * 1.85, 5.58, 8.6],
      metal,
      0.04,
      'Glazing machined keeper',
    );
  box([3.7, 0.16, 0.25], [0, 5.59, 6.17], ceramic, 0.05, 'Canopy aft seat');
  // Visible keel cleats and nose rim retain the structural silhouette.
  for (const side of [-1, 1]) {
    box(
      [0.4, 0.35, 5],
      [side * 4.45, 1.23, 12],
      metal,
      0.07,
      'Prow retaining rail',
    );
    box(
      [1.8, 0.24, 3.7],
      [side * 2.5, 1.3, 16],
      ceramic,
      0.1,
      'Nose ceramic seat',
    );
  }
  function nozzle(x, y, rear, radius, width, height, anchorName) {
    const shape = new T.Shape();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2,
        p = new T.Vector2(Math.cos(a) * width, Math.sin(a) * height);
      if (i === 0) shape.moveTo(p.x, p.y);
      else shape.lineTo(p.x, p.y);
    }
    shape.closePath();
    const hole = new T.Path();
    hole.absarc(0, 0, radius * 1.05, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    add(
      new T.ExtrudeGeometry(shape, {
        depth: 0.58,
        bevelEnabled: true,
        bevelThickness: 0.08,
        bevelSize: 0.08,
        bevelSegments: 1,
        steps: 1,
      }),
      metal,
      [x, y, rear + 0.1],
      null,
      'Formed nozzle retaining frame',
    );
    const turn = new T.Quaternion().setFromAxisAngle(axisX, Math.PI / 2);
    add(
      new T.CylinderGeometry(radius, radius, 2.2, 24, 1, true),
      heat,
      [x, y, rear + 1.2],
      turn,
      'Recessed pressure sleeve',
    );
    add(
      new T.TorusGeometry(radius * 0.93, 0.08, 6, 24),
      metal,
      [x, y, rear + 0.38],
      null,
      'Nozzle machined inner lip',
    );
    add(
      new T.CircleGeometry(radius * 0.76, 24),
      ion,
      [x, y, rear + 2.2],
      new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI),
      'Recessed ion emitter',
    );
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const baffle = box(
        [radius * 0.65, 0.11, 0.8],
        [
          x + Math.cos(a) * radius * 0.59,
          y + Math.sin(a) * radius * 0.59,
          rear + 1.7,
        ],
        graphite,
        0.035,
        'Pressure chamber supporting baffle',
      );
      baffle.quaternion.setFromAxisAngle(axisZ, a);
    }
    const anchor = new T.Group();
    anchor.name = anchorName;
    anchor.position.set(x, y, rear - 0.01);
    group.add(anchor);
  }
  nozzle(-5.4, 2.5, -19.98, 1.48, 2.42, 2.12, 'Exhaust_L');
  nozzle(5.4, 2.5, -19.98, 1.48, 2.42, 2.12, 'Exhaust_R');
  nozzle(0, 1.94, -18.98, 1.02, 1.58, 1.48, 'Exhaust_C');
  // Consolidate only this model's scalar-material assemblies. Named exhaust
  // anchors remain independent; contact and rendering retain identical scale.
  const batches = new Map();
  body.updateMatrixWorld(true);
  for (const mesh of body.children) {
    let geometry = mesh.geometry.clone();
    if (geometry.index) {
      const flat = geometry.toNonIndexed();
      geometry.dispose();
      geometry = flat;
    }
    geometry.deleteAttribute('uv');
    geometry.applyMatrix4(mesh.matrix);
    if (!batches.has(mesh.material)) batches.set(mesh.material, []);
    batches.get(mesh.material).push(geometry);
  }
  body.clear();
  for (const [m, parts] of batches) {
    const geometry = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    owned.add(geometry);
    const mesh = new T.Mesh(geometry, m);
    mesh.name = m.name;
    mesh.castShadow = mesh.receiveShadow = true;
    body.add(mesh);
  }
  originals.forEach((g) => g.dispose());
  originals.clear();
  boxCache.clear();
  const bounds = new T.Box3().setFromObject(body);
  group.userData = {
    rivalId: 'goliath',
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    source: 'source-authored-goliath-v1',
  };
  const propulsion = createRivalPropulsion(group, settings);
  let disposed = false;
  function update(frame = {}) {
    if (disposed) return;
    propulsion.update(frame);
    for (const plume of propulsion.group.children)
      plume.scale.multiply(new T.Vector3(3.8, 3.8, 2.4));
  }
  update();
  return {
    group,
    specification: GOLIATH_SPECIFICATION,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      propulsion.dispose();
      owned.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      group.removeFromParent();
      group.clear();
    },
  };
}
