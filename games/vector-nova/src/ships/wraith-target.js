import * as T from 'three';
import { WRAITH_HULL } from './boss-hulls.js';
import { createBossFinish } from './boss-art-materials.js';
import { createBeveledBossPart } from './boss-art-geometry.js';
import { createRivalPropulsion } from './rival-propulsion.js';
import { fitBossPropulsion } from './boss-propulsion.js';
import { createBossLoft } from './boss-art-loft.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DEVICE_COLORS } from '../pickups/theme.js';

const specification = Object.freeze({
  id: 'wraith',
  name: 'Wraith',
  version: 11,
  role: 'Split-prong intercept cutter',
  description:
    'Two formed alloy blades feed a graphite command spine and twin recessed ion drives.',
  design: 'Eighteen-metre split-prong cutter / narrow raised command spine',
  propulsion: 'Two aft ion drives',
});

const bladeStations = [
  { z: -5.8, x: 2.8, width: 1.2, low: 0.05, high: 1.45 },
  { z: -3.7, x: 2.76, width: 1.1, low: 0.08, high: 1.4 },
  { z: -0.6, x: 2.59, width: 0.84, low: 0.1, high: 1.21 },
  { z: 1.2, x: 2.5, width: 0.7, low: 0.1, high: 1.05 },
  { z: 4.7, x: 2.34, width: 0.43, low: 0.18, high: 0.83 },
  { z: 7.4, x: 2.23, width: 0.23, low: 0.24, high: 0.67 },
  { z: 9, x: 2.2, width: 0.16, low: 0.28, high: 0.61 },
];
function profileFrame(stations, z) {
  let index = stations.findIndex((station) => station.z >= z);
  if (index === -1) return { ...stations.at(-1), z };
  if (index === 0) return { ...stations[0], z };
  const a = stations[index - 1],
    b = stations[index];
  const t = T.MathUtils.clamp((z - a.z) / (b.z - a.z), 0, 1),
    dz = b.z - a.z;
  const tangent = (i, key) => {
    const p = stations[Math.max(0, i - 1)],
      c = stations[i],
      n = stations[Math.min(stations.length - 1, i + 1)];
    const left = p === c ? 0 : (c[key] - p[key]) / (c.z - p.z),
      right = n === c ? 0 : (n[key] - c[key]) / (n.z - c.z);
    return left * right > 0 ? (2 * left * right) / (left + right) : 0;
  };
  return {
    z,
    ...Object.fromEntries(
      ['x', 'width', 'low', 'high'].map((key) => [
        key,
        (2 * t * t * t - 3 * t * t + 1) * a[key] +
          (t * t * t - 2 * t * t + t) * dz * tangent(index - 1, key) +
          (-2 * t * t * t + 3 * t * t) * b[key] +
          (t * t * t - t * t) * dz * tangent(index, key),
      ]),
    ),
  };
}
const bladeFrame = (z) => profileFrame(bladeStations, z);

// A fixed perimeter parameter gives fitted panels actual straight boundaries.
// Rounded corners use true circle arcs, with no singular superellipse normals.
function ductSection(width, height, radius, index) {
  const j = ((index % 64) + 64) % 64;
  const line = (a, b, t) =>
    new T.Vector2().lerpVectors(new T.Vector2(...a), new T.Vector2(...b), t);
  const arc = (cx, cy, start, t) =>
    new T.Vector2(
      cx + radius * Math.cos(start + (t * Math.PI) / 2),
      cy + radius * Math.sin(start + (t * Math.PI) / 2),
    );
  if (j < 4) return line([width, 0], [width, height - radius], j / 4);
  if (j < 12) return arc(width - radius, height - radius, 0, (j - 4) / 8);
  if (j < 20)
    return line(
      [width - radius, height],
      [-width + radius, height],
      (j - 12) / 8,
    );
  if (j < 28)
    return arc(-width + radius, height - radius, Math.PI / 2, (j - 20) / 8);
  if (j < 36)
    return line(
      [-width, height - radius],
      [-width, -height + radius],
      (j - 28) / 8,
    );
  if (j < 44)
    return arc(-width + radius, -height + radius, Math.PI, (j - 36) / 8);
  if (j < 52)
    return line(
      [-width + radius, -height],
      [width - radius, -height],
      (j - 44) / 8,
    );
  if (j < 60)
    return arc(width - radius, -height + radius, Math.PI * 1.5, (j - 52) / 8);
  return line([width, -height + radius], [width, 0], (j - 60) / 4);
}

function ductSurface(stations, start, end, from, to, offset = 0) {
  const positions = [],
    uv = [],
    indices = [],
    rows = 40,
    columns = Math.max(4, Math.ceil(to - from));
  for (let row = 0; row <= rows; row++) {
    const z = T.MathUtils.lerp(start, end, row / rows),
      frame = profileFrame(stations, z);
    const height = (frame.high - frame.low) / 2,
      center = (frame.high + frame.low) / 2;
    for (let col = 0; col <= columns; col++) {
      const j = T.MathUtils.lerp(from, to, col / columns);
      const p = ductSection(
        frame.width + offset,
        height + offset,
        0.18 + offset,
        j,
      );
      positions.push(frame.x + p.x, center + p.y, z);
      uv.push((j / 64) * 5, z);
    }
  }
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < columns; col++) {
      const a = row * (columns + 1) + col,
        b = a + columns + 1;
      indices.push(a, a + 1, b + 1, a, b + 1, b);
    }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function ductPoint(stations, z, j, offset = 0) {
  const frame = profileFrame(stations, z),
    height = (frame.high - frame.low) / 2;
  const p = ductSection(
    frame.width + offset,
    height + offset,
    0.18 + offset,
    j,
  );
  return new T.Vector3(frame.x + p.x, (frame.high + frame.low) / 2 + p.y, z);
}

// A panel's actual exposed edge connects two fitted perimeter profiles. The
// carrier, gasket, lip and recessed lid are separate depths, not colour masks.
function profilePanelEdge(sample, outer, inner, flip = false) {
  const positions = [],
    uv = [],
    indices = [],
    steps = 20;
  const edgePoint = (ring, edge, t) => {
    const z =
      edge === 0
        ? T.MathUtils.lerp(ring.start, ring.end, t)
        : edge === 2
          ? T.MathUtils.lerp(ring.end, ring.start, t)
          : edge === 1
            ? ring.end
            : ring.start;
    const a = typeof ring.from === 'function' ? ring.from(z) : ring.from;
    const b = typeof ring.to === 'function' ? ring.to(z) : ring.to;
    return [
      z,
      edge === 0
        ? a
        : edge === 2
          ? b
          : edge === 1
            ? T.MathUtils.lerp(a, b, t)
            : T.MathUtils.lerp(b, a, t),
    ];
  };
  for (let edge = 0; edge < 4; edge++) {
    const base = positions.length / 3;
    let lastPoint = null,
      distance = 0;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const pair = [];
      for (const ring of [outer, inner]) {
        const [z, j] = edgePoint(ring, edge, t);
        pair.push(sample(z, j, ring.offset));
      }
      if (lastPoint) distance += lastPoint.distanceTo(pair[0]);
      lastPoint = pair[0];
      positions.push(...pair[0].toArray(), ...pair[1].toArray());
      uv.push(distance, 0, distance, pair[0].distanceTo(pair[1]));
      if (i < steps) {
        const v = base + i * 2;
        indices.push(v, v + 1, v + 3, v, v + 3, v + 2);
      }
    }
  }
  if (flip)
    for (let i = 0; i < indices.length; i += 3)
      [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const ductPanelEdge = (stations, outer, inner) =>
  profilePanelEdge(
    (z, j, offset) => ductPoint(stations, z, j, offset),
    outer,
    inner,
  );

function joinSurfaces(parts) {
  const geometry = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  return geometry;
}

function ductBand(outer, inner) {
  const positions = [],
    indices = [],
    uv = [],
    count = 128;
  const planar = outer.z === inner.z;
  for (const ring of [outer, inner])
    for (let i = 0; i <= count; i++) {
      const p = ductSection(ring.w, ring.h, ring.r, (i / count) * 64);
      positions.push(p.x, p.y, ring.z);
      uv.push(...(planar ? [p.x, p.y] : [(i / count) * 5, ring.z]));
    }
  for (let i = 0; i < count; i++) {
    const a = i,
      b = i + count + 1;
    indices.push(a, b, b + 1, a, b + 1, a + 1);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  if (planar) {
    const normals = new Float32Array(positions.length);
    for (let vertex = 2; vertex < normals.length; vertex += 3)
      normals[vertex] = -1;
    geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  } else geometry.computeVertexNormals();
  return geometry;
}
function canopySurface(stations, start, end, from, to, offset = 0) {
  const positions = [],
    uv = [],
    indices = [],
    rows = 40,
    columns = 40;
  const signed = (value) => Math.sign(value) * Math.abs(value) ** 0.53;
  for (let row = 0; row <= rows; row++) {
    const z = T.MathUtils.lerp(start, end, row / rows),
      frame = profileFrame(stations, z);
    for (let col = 0; col <= columns; col++) {
      const a = T.MathUtils.lerp(from, to, col / columns);
      const x = frame.x + signed(Math.cos(a)) * (frame.width + offset);
      positions.push(
        x,
        (frame.high + frame.low) / 2 +
          signed(Math.sin(a)) * ((frame.high - frame.low) / 2 + offset),
        z,
      );
      uv.push(x, z);
    }
  }
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < columns; col++) {
      const a = row * (columns + 1) + col,
        b = a + columns + 1;
      indices.push(a, a + 1, b + 1, a, b + 1, b);
    }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
function openNose(geometry, z) {
  const source = geometry.toNonIndexed(),
    p = source.attributes.position,
    n = source.attributes.normal,
    uv = source.attributes.uv;
  const positions = [],
    normals = [],
    uvs = [];
  for (let face = 0; face < p.count; face += 3) {
    if ([0, 1, 2].every((offset) => Math.abs(p.getZ(face + offset) - z) < 1e-6))
      continue;
    for (let offset = 0; offset < 3; offset++) {
      const v = face + offset;
      positions.push(p.getX(v), p.getY(v), p.getZ(v));
      normals.push(n.getX(v), n.getY(v), n.getZ(v));
      uvs.push(uv.getX(v), uv.getY(v));
    }
  }
  source.dispose();
  geometry.dispose();
  const result = new T.BufferGeometry();
  result.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  result.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  result.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  return result;
}
function bladePoint(side, z, u, lift = 0) {
  const frame = bladeFrame(z),
    center = (frame.low + frame.high) / 2;
  const airfoil =
    center +
    ((frame.high - frame.low) / 2) * Math.pow(Math.max(0, 1 - u * u), 0.26);
  const radius = 0.18,
    width = frame.width - 0.02;
  const corner = Math.max(0, Math.abs(frame.width * u) - (width - radius));
  const engineCrown =
    frame.high -
    radius +
    Math.sqrt(Math.max(0, radius * radius - corner * corner));
  const t = T.MathUtils.clamp((z + 5.55) / 1.25, 0, 1),
    blend = t * t * (3 - 2 * t);
  return new T.Vector3(
    side * (frame.x + frame.width * u),
    T.MathUtils.lerp(engineCrown, airfoil, blend) + lift,
    z,
  );
}
// Rendering stays within the frozen collision envelope. Formed skins, their
// graphite carriers and the open drive throat are separate authored assemblies.
export function createWraithTarget(settings = {}) {
  const group = new T.Group(),
    body = new T.Group();
  group.name = 'Wraith / pursuit boss';
  body.name = 'Wraith / authored chassis';
  body.userData.role = 'boss-body';
  group.add(body);
  const finish = createBossFinish(settings);
  const geometries = new Set();
  const surface = (name, kind, options) =>
    finish.material(`Wraith / ${name}`, kind, options);
  const carbon = surface('resin graphite structure', 'carbon', {
    color: '#26333e',
    roughness: 0.29,
    clearcoat: 0.58,
    clearcoatRoughness: 0.16,
    normalScale: new T.Vector2(0.06, 0.06),
  });
  const shell = surface('cold titanium blade housings', 'darkalloy', {
    color: '#435b6c',
    roughness: 0.27,
  });
  const silver = surface('coated silver blade skins', 'ceramic', {
    color: '#b8c8d0',
    roughness: 0.27,
    clearcoat: 0.65,
    clearcoatRoughness: 0.14,
    roughnessMap: null,
  });
  const alloy = surface('machined retaining fittings', 'alloy', {
    color: '#c1d1d8',
    roughness: 0.2,
  });
  const service = surface(
    'solid satin blue graphite service cowlings',
    'service',
    {
      color: '#526c80',
      roughness: 0.4,
      metalness: 0.2,
      clearcoat: 0.08,
      clearcoatRoughness: 0.3,
      roughnessMap: null,
    },
  );
  const commandService = surface(
    'opaque satin command service ceramic',
    'service',
    {
      color: '#435965',
      roughness: 0.62,
      metalness: 0.015,
      clearcoat: 0,
      roughnessMap: null,
      specularIntensity: 0.28,
      envMapIntensity: 0.7,
    },
  );
  const driveCeramic = surface('satin silver drive ceramic', 'ceramic', {
    color: '#b8c8d0',
    roughness: 0.3,
    clearcoat: 0.42,
    clearcoatRoughness: 0.22,
    roughnessMap: null,
  });
  const driveFrame = surface('machined drive access frames', 'darkalloy', {
    color: '#516875',
    roughness: 0.34,
    metalness: 0.9,
    side: T.DoubleSide,
  });
  const coolerMetal = surface('folded heat exchanger titanium', 'darkalloy', {
    color: '#2b3741',
    roughness: 0.39,
    metalness: 0.78,
  });
  const serviceSeat = surface('moulded drive cassette carrier', 'carbon', {
    color: '#202b32',
    roughness: 0.46,
    metalness: 0.04,
    clearcoat: 0.14,
    clearcoatRoughness: 0.3,
    side: T.DoubleSide,
    normalScale: new T.Vector2(0.05, 0.05),
  });
  const gasket = surface('seated drive cowling elastomer', 'service', {
    color: '#111a20',
    roughness: 0.63,
    metalness: 0,
    clearcoat: 0,
    side: T.DoubleSide,
    roughnessMap: null,
  });
  const cyan = surface('cyan bonded blade inlay', 'paint', {
    color: '#15b2d2',
    roughness: 0.23,
    roughnessMap: null,
  });
  const violet = surface('lavender command identification', 'paint', {
    color: '#8585c6',
    roughness: 0.25,
  });
  const registration = surface('printed system registration', 'paint', {
    color: '#bdced6',
    roughness: 0.5,
    metalness: 0,
    clearcoat: 0,
    roughnessMap: null,
  });
  const arcRegistration = surface('Arc service marking', 'paint', {
    color: DEVICE_COLORS.arc,
    roughness: 0.44,
    metalness: 0,
    clearcoat: 0,
    roughnessMap: null,
  });
  const glass = surface('laminated command glazing', 'glass', {
    color: '#102f3b',
    roughness: 0.09,
  });
  const throat = surface('recessed pressure chamber', 'darkalloy', {
    color: '#233340',
    side: T.DoubleSide,
    roughness: 0.29,
  });
  const emitter = surface('ion chamber power', 'glass', {
    color: '#479acf',
    emissive: '#2589e4',
    emissiveIntensity: 1.5,
    roughness: 0.24,
  });
  emitter.name = 'Wraith_Ion';
  const add = (geometry, material, name, position) => {
    geometries.add(geometry);
    const mesh = new T.Mesh(geometry, material);
    mesh.name = `Wraith / ${name}`;
    if (position) mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true;
    body.add(mesh);
    return mesh;
  };
  const formed = (name, material, vertices, radius = 0.06, segments = 3) =>
    add(createBeveledBossPart(vertices, { radius, segments }), material, name);
  const loft = (name, material, stations, power = 0.7) =>
    add(
      createBossLoft(
        stations.map(([x, z, width, low, high]) => ({
          x,
          z,
          width,
          low,
          high,
        })),
        { radial: 32, steps: 6, power },
      ),
      material,
      name,
    );
  const tube = (name, material, points, radius = 0.035) =>
    add(
      new T.TubeGeometry(
        new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p))),
        Math.max(12, points.length * 8),
        radius,
        8,
        false,
      ),
      material,
      name,
    );

  const mainForms = {
    'wraith-keel': [
      carbon,
      [
        [0, -7, 1.4, -0.15, 0.48],
        [0, -4.8, 1.6, 0.05, 0.85],
        [0, -2, 1.8, 0.18, 1.02],
        [0, 0.1, 0.85, 0.14, 0.7],
        [0, 1.4, 0.42, 0.15, 0.58],
      ],
    ],
    'wraith-root-bridge': [
      carbon,
      [
        [0, -6.7, 2.9, 0.2, 0.78],
        [0, -4.6, 3.3, 0.24, 1.05],
        [0, -3.1, 2.2, 0.26, 0.82],
      ],
    ],
    'wraith-command-coaming': [
      carbon,
      [
        [0, -7.05, 0.53, 0.26, 0.73],
        [0, -6.15, 0.78, 0.38, 1.25],
        [0, -5.1, 1.1, 0.55, 1.65],
        [0, -3.8, 1.3, 0.38, 1.75],
        [0, -0.8, 0.75, 0.25, 1.37],
        [0, 1.25, 0.38, 0.2, 0.65],
      ],
    ],
    'wraith-glazed-command-spine': [
      glass,
      [
        [0, -5.6, 0.49, 1.15, 1.88],
        [0, -4.9, 0.73, 1.48, 2.85],
        [0, -4.2, 0.72, 1.5, 2.75],
        [0, -3.1, 0.65, 1.4, 2.43],
        [0, -1.5, 0.43, 1.18, 1.85],
        [0, -0.85, 0.3, 1.08, 1.56],
        [0, -0.4, 0.17, 0.92, 1.28],
      ],
    ],
  };
  for (const [id, [material, stations]] of Object.entries(mainForms)) {
    let mesh;
    if (/glazed/.test(id)) {
      const profile = stations.map(([x, z, width, low, high]) => ({
        x,
        z,
        width,
        low,
        high,
      }));
      const seam = -4.35,
        halfGap = 0.025;
      const rear = [
        ...profile.filter((station) => station.z < seam - halfGap),
        profileFrame(profile, seam - halfGap),
      ];
      const front = [
        profileFrame(profile, seam + halfGap),
        ...profile.filter((station) => station.z > seam + halfGap),
      ];
      add(
        createBossLoft(rear, { power: 0.53, radial: 32, steps: 6 }),
        commandService,
        'aft command service cowl',
      );
      for (const [start, end] of [
        [rear[0].z, rear[0].z + 0.065],
        [rear.at(-1).z - 0.065, rear.at(-1).z],
      ])
        add(
          canopySurface(rear, start, end, 0, Math.PI * 2, 0.012),
          gasket,
          'command service seated perimeter cuff',
        );
      for (const [start, end] of [
        [-0.08, 0.02],
        [Math.PI - 0.02, Math.PI + 0.08],
      ])
        add(
          canopySurface(
            rear,
            rear[0].z + 0.065,
            rear.at(-1).z - 0.065,
            start,
            end,
            0.018,
          ),
          shell,
          'command service loadbearing sill',
        );
      mesh = add(
        canopySurface(front, front[0].z, front.at(-1).z, -0.15, Math.PI + 0.15),
        glass,
        id,
      );
      add(
        canopySurface(
          front,
          front[0].z,
          front.at(-1).z,
          Math.PI + 0.15,
          Math.PI * 2 - 0.15,
        ),
        carbon,
        'loadbearing lower command frame',
      );
      for (const [start, end, label] of [
        [-0.23, -0.1, 'starboard'],
        [Math.PI + 0.1, Math.PI + 0.23, 'port'],
      ])
        add(
          canopySurface(front, front[0].z, front.at(-1).z, start, end, 0.035),
          shell,
          `${label} seated glazing sill`,
        );
    } else if (id === 'wraith-keel' || id === 'wraith-command-coaming') {
      const geometry = createBossLoft(
        stations.map(([x, z, width, low, high]) => ({
          x,
          z,
          width,
          low,
          high,
        })),
        { power: 0.3, radial: 32, steps: 6 },
      );
      mesh = add(openNose(geometry, stations.at(-1)[1]), material, id);
    } else mesh = loft(id, material, stations, 0.3);
    mesh.userData.contactPart = id;
  }
  const patch = (
    name,
    material,
    side,
    start,
    end,
    inner,
    outer,
    lift = 0.025,
  ) => {
    const positions = [],
      indices = [],
      uv = [];
    const rows = 42,
      columns = 12;
    for (let row = 0; row <= rows; row++) {
      const z = T.MathUtils.lerp(start, end, row / rows);
      const a = typeof inner === 'function' ? inner(z) : inner;
      const b = typeof outer === 'function' ? outer(z) : outer;
      for (let col = 0; col <= columns; col++) {
        const u = T.MathUtils.lerp(a, b, col / columns),
          p = bladePoint(side, z, u, lift);
        positions.push(p.x, p.y, p.z);
        uv.push(p.x, p.z);
      }
    }
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < columns; col++) {
        const a = row * (columns + 1) + col,
          b = a + columns + 1;
        indices.push(
          ...(side > 0
            ? [a, b, b + 1, a, b + 1, a + 1]
            : [a, a + 1, b + 1, a, b + 1, b]),
        );
      }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      'position',
      new T.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return add(geometry, material, name);
  };
  const ventEdge = (z, side) => {
    const keys = [
      [-5.55, 0],
      [-4.8, 0.43],
      [-0.2, 0.34],
      [1.2, 0],
    ];
    const i = keys.findIndex(([station]) => station >= z);
    const width =
      i <= 0
        ? 0
        : T.MathUtils.lerp(
            keys[i - 1][1],
            keys[i][1],
            (z - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]),
          );
    return 0.18 + side * width;
  };
  const wall = (name, side, edge) => {
    const positions = [],
      indices = [];
    for (let i = 0; i <= 42; i++) {
      const z = T.MathUtils.lerp(-5.55, 1.2, i / 42),
        p = bladePoint(side, z, ventEdge(z, edge), 0.02);
      positions.push(p.x, p.y, p.z, p.x, p.y - 0.43, p.z);
      if (i < 42) {
        const v = i * 2;
        indices.push(v, v + 1, v + 3, v, v + 3, v + 2);
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      'position',
      new T.Float32BufferAttribute(positions, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    add(geometry, throat, name);
  };
  const coverMark = (name, material, side, zStart, uStart, polygons) => {
    const positions = [],
      uv = [],
      indices = [];
    for (const polygon of polygons) {
      const contour = polygon.map(([z, x]) => new T.Vector2(z, x));
      for (const [a, b, c] of T.ShapeUtils.triangulateShape(contour, [])) {
        const A = contour[a],
          B = contour[b],
          C = contour[c],
          steps = 3;
        const point = (i, j) =>
          A.clone()
            .addScaledVector(B.clone().sub(A), i / steps)
            .addScaledVector(C.clone().sub(A), j / steps);
        const triangle = (corners) => {
          const first = positions.length / 3,
            points = [];
          for (const { x: z, y: x } of corners) {
            const station = zStart + z,
              p = bladePoint(
                side,
                station,
                uStart + x / bladeFrame(station).width,
                0.0065,
              );
            positions.push(...p.toArray());
            uv.push(z, x);
            points.push(p);
          }
          const up = points[1]
            .clone()
            .sub(points[0])
            .cross(points[2].clone().sub(points[0])).y;
          indices.push(
            first,
            first + (up < 0 ? 2 : 1),
            first + (up < 0 ? 1 : 2),
          );
        };
        for (let i = 0; i < steps; i++)
          for (let j = 0; j < steps - i; j++) {
            triangle([point(i, j), point(i + 1, j), point(i, j + 1)]);
            if (j < steps - i - 1)
              triangle([point(i + 1, j), point(i + 1, j + 1), point(i, j + 1)]);
          }
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      'position',
      new T.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    add(geometry, material, `${name} bonded cover marking`);
  };
  const registrationStrokes = {
    W: [
      [
        [0, 0],
        [0.18, 1],
        [0.5, 0.38],
        [0.82, 1],
        [1, 0],
      ],
    ],
    R: [
      [
        [0, 1],
        [0, 0],
        [0.65, 0],
        [0.85, 0.18],
        [0.85, 0.35],
        [0.65, 0.5],
        [0, 0.5],
      ],
      [
        [0.47, 0.5],
        [0.94, 1],
      ],
    ],
    '-': [
      [
        [0.18, 0.5],
        [0.82, 0.5],
      ],
    ],
    0: [
      [
        [0.16, 0.04],
        [0.72, 0.04],
        [0.86, 0.2],
        [0.86, 0.8],
        [0.72, 0.96],
        [0.16, 0.96],
        [0.04, 0.8],
        [0.04, 0.2],
        [0.16, 0.04],
      ],
    ],
    2: [
      [
        [0.04, 0.2],
        [0.2, 0.04],
        [0.72, 0.04],
        [0.86, 0.2],
        [0.86, 0.37],
        [0.08, 0.96],
        [0.9, 0.96],
      ],
    ],
  };
  const serialPolygons = [];
  for (const [letter, char] of [...'WR-02'].entries())
    for (const stroke of registrationStrokes[char])
      for (let i = 0; i < stroke.length - 1; i++) {
        const a = new T.Vector2(
          (letter * 1.25 + stroke[i][0]) * 0.085,
          stroke[i][1] * 0.115,
        );
        const b = new T.Vector2(
          (letter * 1.25 + stroke[i + 1][0]) * 0.085,
          stroke[i + 1][1] * 0.115,
        );
        const normal = new T.Vector2(-(b.y - a.y), b.x - a.x)
          .normalize()
          .multiplyScalar(0.0045);
        serialPolygons.push(
          [
            a.clone().add(normal),
            b.clone().add(normal),
            b.clone().sub(normal),
            a.clone().sub(normal),
          ].map((p) => p.toArray()),
        );
      }
  for (const side of [-1, 1]) {
    const label = side < 0 ? 'port' : 'starboard';
    const cutter = add(
      createBossLoft(
        bladeStations.map((station) => ({
          ...station,
          x: side * station.x,
          high: station.low + (station.high - station.low) * 0.46,
        })),
        { power: 0.8, radial: 32, steps: 6 },
      ),
      carbon,
      `${label} exposed loadbearing airfoil`,
    );
    cutter.userData.contactPart =
      side < 0 ? 'wraith-port-cutter' : 'wraith-starboard-cutter';
    patch(
      `${label} formed inner shoulder`,
      silver,
      side,
      -5.55,
      -0.45,
      -0.97,
      (z) => ventEdge(z, -1),
    );
    patch(
      `${label} inner shoulder ceramic channel edge`,
      silver,
      side,
      -0.45,
      1.2,
      -0.97,
      -0.93,
    );
    patch(
      `${label} inner shoulder ceramic crown`,
      silver,
      side,
      -0.45,
      1.2,
      -0.34,
      (z) => ventEdge(z, -1),
    );
    patch(
      `${label} aft outer shoulder ceramic seat`,
      silver,
      side,
      -5.55,
      -5.35,
      (z) => ventEdge(z, 1),
      0.97,
    );
    patch(
      `${label} cooling access inner ceramic seat`,
      silver,
      side,
      -5.35,
      -4.0,
      (z) => ventEdge(z, 1),
      (z) => ventEdge(z, 1) + 0.065,
    );
    patch(
      `${label} cooling access outer ceramic seat`,
      silver,
      side,
      -5.35,
      -4.0,
      0.94,
      0.97,
    );
    patch(
      `${label} forward outer shoulder ceramic seat`,
      silver,
      side,
      -4.0,
      1.2,
      (z) => ventEdge(z, 1),
      0.97,
    );
    patch(
      `${label} drawn forward blade inner ceramic edge`,
      silver,
      side,
      1.28,
      7.95,
      -0.97,
      -0.93,
      0.022,
    );
    patch(
      `${label} aft induction ceramic seat`,
      silver,
      side,
      1.28,
      1.6,
      -0.34,
      0.97,
      0.022,
    );
    patch(
      `${label} induction inner ceramic seat`,
      silver,
      side,
      1.6,
      3.03,
      -0.34,
      -0.02,
      0.022,
    );
    patch(
      `${label} induction outer ceramic seat`,
      silver,
      side,
      1.6,
      3.03,
      0.84,
      0.97,
      0.022,
    );
    patch(
      `${label} drawn forward blade ceramic crown`,
      silver,
      side,
      3.03,
      7.95,
      -0.34,
      0.97,
      0.022,
    );
    patch(
      `${label} closed forward ceramic blade tip`,
      silver,
      side,
      7.95,
      8.99,
      -0.97,
      0.97,
      0.022,
    );
    const seatCover = (name, opening, inner, face) => {
      const floor = { ...opening, offset: -0.105 };
      add(
        profilePanelEdge(
          (z, u, lift) => bladePoint(side, z, u, lift),
          opening,
          floor,
          side > 0,
        ),
        gasket,
        `${label} ${name} recessed seat walls`,
      );
      patch(
        `${label} ${name} carrier floor`,
        serviceSeat,
        side,
        floor.start,
        floor.end,
        floor.from,
        floor.to,
        floor.offset,
      );
      add(
        profilePanelEdge(
          (z, u, lift) => bladePoint(side, z, u, lift),
          opening,
          inner,
          side > 0,
        ),
        driveFrame,
        `${label} ${name} fitted perimeter`,
      );
      const base = { ...face, offset: -0.045 };
      add(
        profilePanelEdge(
          (z, u, lift) => bladePoint(side, z, u, lift),
          base,
          face,
          side > 0,
        ),
        service,
        `${label} ${name} formed service edge`,
      );
      patch(
        `${label} ${name} seated service cover`,
        service,
        side,
        face.start,
        face.end,
        face.from,
        face.to,
        face.offset,
      );
    };
    seatCover(
      'induction access',
      { start: 1.6, end: 3.03, from: -0.02, to: 0.84, offset: 0.026 },
      { start: 1.68, end: 2.95, from: 0.04, to: 0.78, offset: 0.026 },
      { start: 1.74, end: 2.89, from: 0.09, to: 0.73, offset: 0.004 },
    );
    coverMark(`${label} WR-02`, registration, side, 2.25, 0.25, serialPolygons);
    // The same lightning silhouette and blue identity as the shared Arc UI.
    const arcGlyph = [
      [13, 1],
      [5, 13],
      [12, 13],
      [11, 23],
      [19, 9],
      [12, 9],
    ];
    coverMark(`${label} Arc-system`, arcRegistration, side, 1.91, 0.25, [
      arcGlyph.map(([x, y]) => [((y - 1) / 22) * 0.23, ((x - 5) / 14) * 0.13]),
    ]);
    seatCover(
      'root cooling access',
      {
        start: -5.35,
        end: -4.0,
        from: (z) => ventEdge(z, 1) + 0.065,
        to: 0.94,
        offset: 0.032,
      },
      {
        start: -5.28,
        end: -4.07,
        from: (z) => ventEdge(z, 1) + 0.1,
        to: 0.905,
        offset: 0.032,
      },
      {
        start: -5.23,
        end: -4.12,
        from: (z) => ventEdge(z, 1) + 0.145,
        to: 0.86,
        offset: 0.01,
      },
    );
    patch(
      `${label} seated cooling access identification`,
      violet,
      side,
      -5.15,
      -4.94,
      0.73,
      0.84,
      0.016,
    );
    patch(
      `${label} deep cooling trench floor`,
      carbon,
      side,
      -5.55,
      1.2,
      (z) => ventEdge(z, -1),
      (z) => ventEdge(z, 1),
      -0.4,
    );
    wall(`${label} recessed inner trench wall`, side, -1);
    wall(`${label} recessed outer trench wall`, side, 1);
    patch(
      `${label} trench inner retaining rail`,
      alloy,
      side,
      -5.5,
      1.15,
      (z) => ventEdge(z, -1) - 0.035,
      (z) => ventEdge(z, -1) + 0.012,
      0.035,
    );
    patch(
      `${label} trench outer retaining rail`,
      shell,
      side,
      -5.5,
      1.15,
      (z) => ventEdge(z, 1) - 0.012,
      (z) => ventEdge(z, 1) + 0.035,
      0.035,
    );
    const channel = {
      start: -0.45,
      end: 7.95,
      from: -0.93,
      to: -0.34,
      offset: 0.018,
    };
    const channelFloor = { ...channel, offset: -0.115 };
    add(
      profilePanelEdge(
        (z, u, lift) => bladePoint(side, z, u, lift),
        channel,
        channelFloor,
        side > 0,
      ),
      serviceSeat,
      `${label} recessed induction channel walls`,
    );
    patch(
      `${label} composite induction channel floor`,
      serviceSeat,
      side,
      channel.start,
      channel.end,
      channel.from,
      channel.to,
      channelFloor.offset,
    );
    patch(
      `${label} embedded inner induction retaining lip`,
      alloy,
      side,
      channel.start,
      channel.end,
      -0.93,
      -0.9,
      -0.005,
    );
    patch(
      `${label} embedded outer induction retaining lip`,
      shell,
      side,
      channel.start,
      channel.end,
      -0.37,
      -0.34,
      -0.005,
    );
    const inlayBase = {
      start: -0.27,
      end: 7.76,
      from: -0.89,
      to: -0.38,
      offset: -0.035,
    };
    const inlayFace = {
      start: -0.22,
      end: 7.71,
      from: -0.875,
      to: -0.395,
      offset: 0.008,
    };
    add(
      profilePanelEdge(
        (z, u, lift) => bladePoint(side, z, u, lift),
        inlayBase,
        inlayFace,
        side > 0,
      ),
      cyan,
      `${label} fitted cyan induction insert edge`,
    );
    patch(
      `${label} protected cyan induction insert`,
      cyan,
      side,
      inlayFace.start,
      inlayFace.end,
      inlayFace.from,
      inlayFace.to,
      inlayFace.offset,
    );
    for (let i = 0; i < 9; i++) {
      const z = -4.8 + i * 0.58;
      const folds = [
        [-0.17, -0.42],
        [-0.1, -0.27],
        [0.08, -0.15],
        [0.14, -0.2],
      ];
      for (let fold = 0; fold < folds.length - 1; fold++) {
        const corners = [];
        for (const [dz, drop] of [folds[fold], folds[fold + 1]])
          for (const edge of [-1, 1]) {
            const u = ventEdge(z + dz, edge) - edge * 0.009,
              p = bladePoint(side, z + dz, u);
            p.y += drop;
            corners.push(p);
          }
        formed(
          `${label} folded cooling vane ${i + 1} section ${fold + 1}`,
          coolerMetal,
          [
            ...corners.flatMap((p) => p.toArray()),
            ...corners.flatMap((p) => [p.x, p.y - 0.027, p.z]),
          ],
          0.006,
          2,
        );
      }
    }
    // Silver steps above actual open graphite load paths, rather than a solid
    // dark slab painted under a bright roof. Three inclined ribs tie the skin.
    for (let i = 0; i < 3; i++) {
      const z = -3.7 + i * 1.6,
        f = bladeFrame(z),
        x = side * (f.x + f.width * 0.9),
        y = (f.low + f.high) / 2;
      const upper = [x, y + 0.1, z],
        lower = [x - side * 0.18, y - 0.26, z + 0.56];
      tube(
        `${label} inclined load brace ${i + 1}`,
        shell,
        [upper, lower],
        0.075,
      );
    }
    tube(
      `${label} formed lower silver step`,
      alloy,
      [
        [side * 3.73, 0.55, -4.7],
        [side * 3.47, 0.55, -2.8],
        [side * 3.12, 0.53, -0.3],
        [side * 2.89, 0.45, 1.8],
      ],
      0.065,
    );
    for (let i = 0; i < 3; i++)
      tube(
        `${label} lavender command insignia ${i + 1}`,
        violet,
        [
          [side * (1.13 - i * 0.075), 1.16, -3.3],
          [side * (1.03 - i * 0.075), 1.08, -2.8],
        ],
        0.022,
      );
    // Finned exchanger packs sit beside the engine neck and share its carrier.
    loft(
      `${label} radiator carrier`,
      carbon,
      [
        [side * 1.32, -8.63, 0.29, 0.24, 1.16],
        [side * 1.32, -6.55, 0.29, 0.24, 1.16],
      ],
      0.24,
    );
    for (let fin = 0; fin < 12; fin++) {
      const z = -8.55 + fin * 0.166;
      loft(
        `${label} heat exchanger fin ${fin + 1}`,
        shell,
        [
          [side * 1.32, z, 0.33, 0.18, 1.22],
          [side * 1.32, z + 0.045, 0.33, 0.18, 1.22],
        ],
        0.24,
      );
    }
    for (const y of [0.22, 1.19])
      loft(
        `${label} exchanger seated retaining rail ${y}`,
        shell,
        [
          [side * 1.32, -8.69, 0.35, y - 0.035, y + 0.035],
          [side * 1.32, -6.48, 0.35, y - 0.035, y + 0.035],
        ],
        0.28,
      );
  }
  add(
    openNose(
      createBossLoft(
        [
          { x: 0, z: -1.7, width: 0.48, low: 0.72, high: 1.47 },
          { x: 0, z: -0.4, width: 0.46, low: 0.55, high: 1.12 },
          { x: 0, z: 1.25, width: 0.32, low: 0.25, high: 0.58 },
        ],
        { power: 0.38, radial: 32, steps: 6 },
      ),
      1.25,
    ),
    carbon,
    'tapered command nose armor',
  );
  const noseRim = new T.Shape();
  noseRim.moveTo(-0.37, -0.19);
  noseRim.lineTo(0.37, -0.19);
  noseRim.lineTo(0.44, -0.12);
  noseRim.lineTo(0.44, 0.12);
  noseRim.lineTo(0.37, 0.19);
  noseRim.lineTo(-0.37, 0.19);
  noseRim.lineTo(-0.44, 0.12);
  noseRim.lineTo(-0.44, -0.12);
  noseRim.closePath();
  const noseOpening = new T.Path();
  noseOpening.moveTo(-0.29, -0.1);
  noseOpening.lineTo(-0.29, 0.1);
  noseOpening.lineTo(0.29, 0.1);
  noseOpening.lineTo(0.29, -0.1);
  noseOpening.closePath();
  noseRim.holes.push(noseOpening);
  add(
    new T.ExtrudeGeometry(noseRim, {
      depth: 0.1,
      bevelEnabled: true,
      bevelSize: 0.012,
      bevelThickness: 0.012,
      bevelSegments: 3,
    }),
    alloy,
    'machined forward command port',
    [0, 0.39, 1.27],
  );
  // A recessed real port floor, with its open front provided by the keel cut.
  const backplate = formed(
    'recessed command port backplate',
    throat,
    [
      -0.29, 0.29, 0.9, 0.29, 0.29, 0.9, 0.29, 0.49, 0.9, -0.29, 0.49, 0.9,
      -0.29, 0.29, 0.94, 0.29, 0.29, 0.94, 0.29, 0.49, 0.94, -0.29, 0.49, 0.94,
    ],
    0.01,
    2,
  );
  backplate.userData.role = 'command-port';
  for (let vane = 0; vane < 3; vane++) {
    const louver = add(
      new T.BoxGeometry(0.53, 0.022, 0.24),
      shell,
      `forward command port louver ${vane + 1}`,
      [0, 0.33 + vane * 0.06, 1.1],
    );
    louver.rotation.x = 0.2;
  }

  function drive(x, side) {
    const y = 0.8;
    const sign = Math.sign(x);
    const sections = [
      { z: -9, x, width: 0.8, low: 0, high: 1.6 },
      { z: -8.55, x, width: 0.8, low: 0.01, high: 1.59 },
      { z: -7.4, x: x + sign * 0.07, width: 0.85, low: 0.03, high: 1.56 },
      { z: -6.4, x: x + sign * 0.21, width: 1.01, low: 0.04, high: 1.5 },
      { z: -5.55, x: x + sign * 0.4, width: 1.18, low: 0.05, high: 1.45 },
    ];
    const from = sign > 0 ? 60 : 28,
      to = from + 8;
    const opening = {
      start: -8.36,
      end: -6.56,
      from: from + 0.8,
      to: to - 0.8,
      offset: 0,
    };
    const pod = add(
      joinSurfaces([
        ductSurface(sections, -9, -5.55, to, from + 64),
        ductSurface(sections, -9, opening.start, from, to),
        ductSurface(sections, opening.end, -5.55, from, to),
        ductSurface(sections, opening.start, opening.end, from, opening.from),
        ductSurface(sections, opening.start, opening.end, opening.to, to),
      ]),
      shell,
      `${side} continuous engine carrier with through-cut service seat`,
    );
    pod.userData.contactPart =
      side === 'L' ? 'wraith-port-drive' : 'wraith-starboard-drive';
    const crownSeat = {
      start: -8.62,
      end: -7.28,
      from: 5.8,
      to: 26.2,
      offset: 0.012,
    };
    const crownBase = {
      start: -8.59,
      end: -7.31,
      from: 6.1,
      to: 25.9,
      offset: 0.025,
    };
    const crownFace = {
      start: -8.57,
      end: -7.33,
      from: 6.25,
      to: 25.75,
      offset: 0.064,
    };
    add(
      ductSurface(
        sections,
        crownSeat.start,
        crownSeat.end,
        crownSeat.from,
        crownSeat.to,
        crownSeat.offset,
      ),
      gasket,
      `${side} continuous crown gasket`,
    );
    add(
      ductPanelEdge(sections, crownBase, crownFace),
      service,
      `${side} moulded radiator crown edge`,
    );
    add(
      ductSurface(
        sections,
        crownFace.start,
        crownFace.end,
        crownFace.from,
        crownFace.to,
        crownFace.offset,
      ),
      service,
      `${side} thick seated radiator service crown`,
    );
    add(
      ductSurface(sections, -7.25, -5.58, 6, 26, 0.025),
      driveCeramic,
      `${side} fitted silver nacelle crown`,
    );

    const outer = {
      start: -8.49,
      end: -6.43,
      from: from + 0.28,
      to: to - 0.28,
      offset: 0.012,
    };
    const frame = {
      start: -8.46,
      end: -6.46,
      from: from + 0.44,
      to: to - 0.44,
      offset: 0.048,
    };
    const inner = {
      start: -8.3,
      end: -6.62,
      from: from + 1.12,
      to: to - 1.12,
      offset: 0.048,
    };
    const well = { ...inner, offset: -0.19 };
    add(
      ductPanelEdge(sections, outer, frame),
      driveFrame,
      `${side} service frame outer bevel`,
    );
    add(
      ductPanelEdge(sections, frame, inner),
      driveFrame,
      `${side} machined service cassette surround`,
    );
    add(
      ductPanelEdge(sections, inner, well),
      gasket,
      `${side} recessed service seat walls`,
    );
    const floor = add(
      ductSurface(
        sections,
        well.start,
        well.end,
        well.from,
        well.to,
        well.offset,
      ),
      serviceSeat,
      `${side} deep service cassette carrier`,
    );
    floor.userData.role = 'service-bay-floor';

    const lidSeat = {
      start: -8.27,
      end: -7.14,
      from: inner.from + 0.16,
      to: inner.to - 0.16,
      offset: -0.112,
    };
    const lidBase = {
      start: -8.24,
      end: -7.17,
      from: inner.from + 0.28,
      to: inner.to - 0.28,
      offset: -0.085,
    };
    const lidFace = {
      start: -8.21,
      end: -7.2,
      from: inner.from + 0.4,
      to: inner.to - 0.4,
      offset: -0.038,
    };
    add(
      ductSurface(
        sections,
        lidSeat.start,
        lidSeat.end,
        lidSeat.from,
        lidSeat.to,
        lidSeat.offset,
      ),
      gasket,
      `${side} service lid captive gasket`,
    );
    add(
      ductPanelEdge(sections, lidBase, lidFace),
      service,
      `${side} service lid formed thickness`,
    );
    add(
      ductSurface(
        sections,
        lidFace.start,
        lidFace.end,
        lidFace.from,
        lidFace.to,
        lidFace.offset,
      ),
      service,
      `${side} inset solid service lid`,
    );
    add(
      ductSurface(sections, -7.13, -7.06, inner.from, inner.to, -0.06),
      driveFrame,
      `${side} service divider spine`,
    );
    for (let blade = 0; blade < 5; blade++) {
      const z = -7.01 + blade * 0.073;
      const lip = {
        start: z,
        end: z + 0.025,
        from: inner.from + 0.12,
        to: inner.to - 0.12,
        offset: -0.055,
      };
      const root = {
        start: z + 0.055,
        end: z + 0.075,
        from: inner.from + 0.12,
        to: inner.to - 0.12,
        offset: -0.17,
      };
      add(
        ductPanelEdge(sections, lip, root),
        driveFrame,
        `${side} inclined service heat discharge blade ${blade + 1}`,
      );
    }
    for (const z of [-8.35, -6.57])
      for (const j of [from + 0.78, to - 0.78]) {
        const p = ductPoint(sections, z, j, 0.06);
        const fastener = add(
          new T.CylinderGeometry(0.044, 0.044, 0.025, 16),
          alloy,
          `${side} captive service quarter-turn`,
          p.toArray(),
        );
        fastener.rotation.z = Math.PI / 2;
        const slot = add(
          new T.BoxGeometry(0.007, 0.009, 0.05),
          gasket,
          `${side} captive quarter-turn slot`,
          [p.x + sign * 0.016, p.y, p.z],
        );
        slot.rotation.x = 0.2;
      }
    add(
      ductSurface(sections, -8.2, -7.56, from + 0.51, from + 0.66, 0.055),
      cyan,
      `${side} inlaid cyan service identification`,
    );
    const rings = [
      { z: -8.74, w: 0.8, h: 0.8, r: 0.18 },
      { z: -8.95, w: 0.8, h: 0.8, r: 0.18 },
      { z: -8.99, w: 0.76, h: 0.76, r: 0.16 },
      { z: -8.99, w: 0.62, h: 0.62, r: 0.22 },
      { z: -8.91, w: 0.6, h: 0.6, r: 0.24 },
      { z: -8.58, w: 0.55, h: 0.55, r: 0.48 },
    ];
    // Each manufactured bend owns its normals. In particular, the broad aft
    // annulus is one true plane instead of averaging a distorted metal border.
    const surfaces = [shell, alloy, alloy, shell, throat];
    for (let band = 0; band < rings.length - 1; band++)
      add(
        ductBand(rings[band], rings[band + 1]),
        surfaces[band],
        `${side} collar surface ${band + 1}`,
        [x, y, 0],
      );
    const sleeve = new T.CylinderGeometry(0.55, 0.5, 0.82, 40, 1, true);
    sleeve.rotateX(Math.PI / 2);
    add(sleeve, throat, `${side} open pressure sleeve`, [x, y, -8.19]);
    add(
      new T.TorusGeometry(0.55, 0.035, 8, 40),
      shell,
      `${side} recessed chamber flange`,
      [x, y, -8.38],
    );
    const back = new T.CircleGeometry(0.5, 40);
    back.rotateY(Math.PI);
    add(back, throat, `${side} chamber backplate`, [x, y, -7.82]);
    const core = new T.CylinderGeometry(0.27, 0.22, 0.46, 32, 1, true);
    core.rotateX(Math.PI / 2);
    add(core, shell, `${side} chamber centerbody`, [x, y, -8.08]);
    const face = new T.CircleGeometry(0.16, 32);
    face.rotateY(Math.PI);
    add(face, emitter, `${side} recessed ion emitter`, [x, y, -8.05]);
    for (let band = 0; band < 3; band++)
      add(
        new T.TorusGeometry(0.235 + band * 0.009, 0.023, 6, 32),
        emitter,
        `${side} axial emitter band ${band + 1}`,
        [x, y, -8.21 + band * 0.11],
      );
    for (let blade = 0; blade < 12; blade++) {
      const angle = (blade * Math.PI) / 6;
      const vertices = [];
      for (const z of [-8.44, -8.18])
        for (const [radius, offset] of [
          [0.28, -0.04],
          [0.54, -0.02],
          [0.54, 0.055],
          [0.28, 0.02],
        ]) {
          const a = angle + offset + (z > -8.3 ? 0.13 : 0);
          vertices.push(x + Math.sin(a) * radius, y + Math.cos(a) * radius, z);
        }
      formed(
        `${side} swept thermal stator ${blade + 1}`,
        throat,
        vertices,
        0.009,
        2,
      );
    }
    const anchor = new T.Group();
    anchor.name = `Exhaust_${side}`;
    anchor.position.set(x, y, -9);
    group.add(anchor);
  }
  drive(-2.4, 'L');
  drive(2.4, 'R');

  // Bake only static fittings into material batches. Keep every authored
  // contact mass directly visible, and retain the existing UVs and normals.
  // In particular, the drive face's planar metal UVs must not be reprojected.
  body.updateMatrixWorld(true);
  const sourceMeshes = body.children.length,
    batches = new Map();
  for (const mesh of body.children) {
    if (mesh.userData.contactPart) continue;
    if (!batches.has(mesh.material)) batches.set(mesh.material, []);
    batches.get(mesh.material).push(mesh);
  }
  for (const [material, meshes] of batches) {
    if (meshes.length < 2) continue;
    const parts = meshes.map((mesh) => {
      const geometry = mesh.geometry.clone();
      geometry.applyMatrix4(mesh.matrix);
      if (!geometry.attributes.uv)
        geometry.setAttribute(
          'uv',
          new T.Float32BufferAttribute(
            new Float32Array(geometry.attributes.position.count * 2),
            2,
          ),
        );
      if (!geometry.index) {
        const indices = new Uint32Array(geometry.attributes.position.count);
        for (let i = 0; i < indices.length; i++) indices[i] = i;
        geometry.setIndex(new T.BufferAttribute(indices, 1));
      }
      return geometry;
    });
    const geometry = joinSurfaces(parts);
    const mesh = add(
      geometry,
      material,
      `batched static ${material.name.replace('Wraith / ', '')}`,
    );
    mesh.userData.authoredParts = meshes.map((part) => part.name);
    for (const part of meshes) {
      part.removeFromParent();
      geometries.delete(part.geometry);
      part.geometry.dispose();
    }
  }
  body.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(body);
  group.userData = {
    rivalId: 'wraith',
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    source: 'source-authored-wraith-v11',
    concept: 'docs/art/bosses/wraith-concept-v1.png',
    hullSha256: WRAITH_HULL.hullSha256,
    blockout: false,
    batching: { sourceMeshes, renderMeshes: body.children.length },
  };
  const propulsion = createRivalPropulsion(group, settings);
  const plumeScale = new T.Vector3(1.5, 1.5, 1.45);
  let disposed = false;
  const update = (frame = {}) => {
    if (disposed) return;
    propulsion.update(frame);
    fitBossPropulsion(propulsion, frame, plumeScale, [0.61, 0.61]);
  };
  update();
  return {
    group,
    specification,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      propulsion.dispose();
      geometries.forEach((geometry) => geometry.dispose());
      finish.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}
