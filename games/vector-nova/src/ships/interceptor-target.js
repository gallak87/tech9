import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRivalPropulsion } from './rival-propulsion.js';
import { GOLIATH_HULL } from './interceptor-target-hull.js';
import { createBeveledBossPart } from './boss-art-geometry.js';
import { createBossFinish } from './boss-art-materials.js';
import { createBossLoft } from './boss-art-loft.js';
import { fitBossPropulsion } from './boss-propulsion.js';

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
  const finish = createBossFinish(settings);
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
  const cold = material(
    'Goliath / satin titanium cold cuffs',
    { color: '#87969b', metalness: 0.92, roughness: 0.245 },
    true,
  );
  finish.bind(cold, 'alloy', {
    color: '#a9b5bc',
    metalness: 0.88,
    roughness: 0.225,
    anisotropy: 0.22,
    clearcoat: 0.08,
    clearcoatRoughness: 0.12,
  });
  finish.bind(ceramic, 'ceramic', {
    color: '#bdc1b8',
    roughness: 0.235,
    clearcoat: 0.9,
    clearcoatRoughness: 0.075,
  });
  finish.bind(service, 'service', {
    color: '#6d8795',
    roughness: 0.33,
    clearcoat: 0.42,
    clearcoatRoughness: 0.18,
  });
  finish.bind(graphite, 'carbon', {
    color: '#1d2832',
    roughness: 0.34,
    clearcoat: 0.68,
    clearcoatRoughness: 0.12,
  });
  finish.bind(red, 'paint', {
    color: '#b7382c',
    clearcoat: 0.55,
    clearcoatRoughness: 0.14,
  });
  finish.bind(glass, 'glass', { color: '#07131c', roughness: 0.09 });
  finish.bind(metal, 'alloy');
  finish.bind(heat, 'darkalloy', {
    color: '#49565f',
    metalness: 0.62,
    roughness: 0.34,
    side: T.DoubleSide,
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
  for (const part of GOLIATH_HULL.parts) {
    // Visual skins follow the frozen compound contact hull, with formed crowns
    // and structural returns rather than extruding each collision proxy.
    if (part.id.includes('command') || part.id.includes('fore-armor')) continue;
    let geometry;
    if (part.id.includes('drive') && !part.id.includes('central')) {
      const side = part.id.includes('left') ? -1 : 1;
      geometry = createBossLoft(
        [
          { z: -19.1, x: side * 5.4, width: 2.05, low: 0.35, high: 4.35 },
          { z: -18.8, x: side * 5.4, width: 2.05, low: 0.25, high: 4.35 },
          { z: -11, x: side * 5.4, width: 2.05, low: 0.25, high: 4.35 },
          { z: -8, x: side * 5.35, width: 1.85, low: 0.5, high: 3.95 },
          { z: -5, x: side * 5.1, width: 1.45, low: 0.9, high: 3.35 },
        ],
        { radial: 64, power: 0.24 },
      );
    } else if (part.id.includes('cargo-spine')) {
      geometry = createBossLoft(
        [
          { z: -11, width: 4.6, low: 1.1, high: 3.9 },
          { z: -5, width: 4.45, low: 1.1, high: 4.15 },
          { z: 9, width: 4.45, low: 1.1, high: 4.15 },
          { z: 15.8, width: 2.6, low: 1.1, high: 1.65 },
        ],
        { radial: 40, power: 0.48 },
      );
    } else
      geometry = createBeveledBossPart(part.vertices, {
        radius: 0.18,
        segments: 4,
      });
    if (part.id.includes('drive')) {
      const openRear = part.id.includes('central') ? part.bounds.min[2] : -19.1;
      const positions = [],
        normals = [];
      const source = geometry.index ? geometry.toNonIndexed() : geometry;
      const sp = source.attributes.position,
        sn = source.attributes.normal;
      for (let i = 0; i < sp.count; i += 3) {
        if ([0, 1, 2].every((j) => Math.abs(sp.getZ(i + j) - openRear) < 1e-5))
          continue;
        for (let j = 0; j < 3; j++) {
          positions.push(sp.getX(i + j), sp.getY(i + j), sp.getZ(i + j));
          normals.push(sn.getX(i + j), sn.getY(i + j), sn.getZ(i + j));
        }
      }
      if (source !== geometry) source.dispose();
      geometry.dispose();
      geometry = new T.BufferGeometry();
      geometry.setAttribute(
        'position',
        new T.Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
    }
    const m = graphite;
    add(geometry, m, [0, 0, 0], null, part.id);
  }
  const refineRakedProfile = (source, maxSpan = 0.95) => {
    const p = source.attributes.position,
      n = source.attributes.normal,
      uv = source.attributes.uv;
    const positions = [],
      normals = [],
      coordinates = [];
    const vertex = (index) => [
      p.getX(index),
      p.getY(index),
      p.getZ(index),
      n.getX(index),
      n.getY(index),
      n.getZ(index),
      uv.getX(index),
      uv.getY(index),
    ];
    const emit = (triangle) => {
      for (const v of triangle) {
        positions.push(v[0], v[1], v[2]);
        normals.push(v[3], v[4], v[5]);
        coordinates.push(v[6], v[7]);
      }
    };
    for (let index = 0; index < p.count; index += 3) {
      const stack = [[vertex(index), vertex(index + 1), vertex(index + 2), 0]];
      while (stack.length) {
        const [a, b, c, depth] = stack.pop();
        const edges = [
          [a, b, c],
          [b, c, a],
          [c, a, b],
        ].sort(
          (left, right) =>
            Math.abs(right[0][0] - right[1][0]) -
            Math.abs(left[0][0] - left[1][0]),
        );
        const [u, v, opposite] = edges[0];
        if (Math.abs(u[0] - v[0]) <= maxSpan || depth >= 8) {
          emit([a, b, c]);
          continue;
        }
        const middle = u.map((value, component) => (value + v[component]) / 2);
        stack.push(
          [u, middle, opposite, depth + 1],
          [middle, v, opposite, depth + 1],
        );
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      'position',
      new T.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new T.Float32BufferAttribute(coordinates, 2));
    source.dispose();
    return geometry;
  };
  const loft = (stations, surface, name, power = 0.5) =>
    add(
      createBossLoft(stations, { radial: 40, power }),
      surface,
      [0, 0, 0],
      null,
      name,
    );
  // The command glazing is one continuous compound crown, seated in a dark
  // gasket and a shaped ceramic pressure coaming rather than a tall box lid.
  const canopy = [
    { z: 4.15, width: 1.25, low: 4.25, high: 4.8 },
    { z: 6.0, width: 1.83, low: 4.35, high: 5.7 },
    { z: 9.2, width: 1.76, low: 4.35, high: 5.8 },
    { z: 12.3, width: 1.4, low: 4.1, high: 5.4 },
    { z: 14.7, width: 0.65, low: 3.95, high: 4.35 },
  ];
  // The canopy grows from defined sloping return planes. Its pressure seat
  // is not a second inflated copy of the glazing surface.
  for (const side of [-1, 1]) {
    for (let index = 0; index < canopy.length - 1; index++) {
      const vertices = [];
      for (const station of [canopy[index], canopy[index + 1]]) {
        const center = (station.low + station.high) / 2;
        for (const [offset, height] of [
          [-0.025, center - 0.02],
          [0.29, center - 0.24],
          [0.29, center - 0.38],
          [-0.025, center - 0.17],
        ])
          vertices.push(side * (station.width + offset), height, station.z);
      }
      add(
        createBeveledBossPart(vertices, { radius: 0.045, segments: 3 }),
        ceramic,
        [0, 0, 0],
        null,
        'Canopy formed ceramic pressure-return plane',
      );
    }
    const gasket = canopy.map(
      (station) =>
        new T.Vector3(
          side * (station.width - 0.008),
          (station.low + station.high) / 2 - 0.005,
          station.z,
        ),
    );
    add(
      new T.TubeGeometry(new T.CatmullRomCurve3(gasket), 48, 0.043, 8),
      graphite,
      [0, 0, 0],
      null,
      'Canopy continuous seated bonded pressure gasket',
    );
  }
  box(
    [3.18, 0.19, 0.32],
    [0, 4.36, 4.12],
    service,
    0.045,
    'Command aft formed seat and retaining bridge',
  );
  box(
    [1.82, 0.15, 0.26],
    [0, 3.98, 14.72],
    ceramic,
    0.04,
    'Command fore ceramic pressure return',
  );
  loft(canopy, glass, 'Compound command canopy', 0.68);
  const deck = (
    outline,
    hole,
    surface,
    height,
    name,
    depth = 0.25,
    bevel = 0.06,
  ) => {
    const shape = roundedProfile(outline, 0.21);
    if (hole)
      shape.holes.push(
        new T.Path(roundedProfile(hole, 0.16).getPoints(14).reverse()),
      );
    const geometry = new T.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 3,
      curveSegments: 16,
      steps: 1,
    });
    geometry.rotateX(Math.PI / 2);
    return add(geometry, surface, [0, height, 0], null, name);
  };
  // Cast pressure frames sit on a shared load-bearing deck. The removable
  // covers are visibly down inside the opening, not laid over a flat hull.
  for (const side of [-1, 1]) {
    box(
      [0.48, 0.66, 14.2],
      [side * 3.63, 4.12, -3],
      graphite,
      0.075,
      'Continuous cargo pressure-deck load carrier',
    );
    box(
      [0.16, 0.26, 14.05],
      [side * 3.27, 4.27, -3],
      cold,
      0.045,
      'Cargo pressure-deck machined inner retaining rail',
    );
  }
  for (const z of [-8, -3, 2]) {
    const outer = [
      [-3.78, z - 2.24],
      [3.78, z - 2.24],
      [3.78, z + 2.24],
      [-3.78, z + 2.24],
    ];
    const opening = [
      [-2.95, z - 1.8],
      [2.95, z - 1.8],
      [2.95, z + 1.8],
      [-2.95, z + 1.8],
    ];
    deck(
      outer,
      opening,
      heat,
      4.59,
      'Cast titanium pressure-hatch load frame',
      0.48,
      0.08,
    );
    deck(
      [
        [-3.04, z - 1.89],
        [3.04, z - 1.89],
        [3.04, z + 1.89],
        [-3.04, z + 1.89],
      ],
      [
        [-2.81, z - 1.65],
        [2.81, z - 1.65],
        [2.81, z + 1.65],
        [-2.81, z + 1.65],
      ],
      graphite,
      4.42,
      'Hatch recessed bonded graphite pressure gasket',
      0.24,
      0.025,
    );
    box(
      [5.58, 0.22, 3.27],
      [0, 4.37, z],
      service,
      0.07,
      'Removable pressure cover recessed inside cast frame',
    );
    for (const side of [-1, 1])
      for (const end of [-1, 1]) {
        box(
          [0.5, 0.1, 0.32],
          [side * 2.54, 4.51, z + end * 1.35],
          cold,
          0.025,
          'Hatch seated captive pressure keeper',
        );
        box(
          [0.19, 0.055, 0.12],
          [side * 2.54, 4.575, z + end * 1.35],
          heat,
          0.02,
          'Pressure-keeper recessed drive socket',
        );
      }
  }
  const aftOuter = (z) =>
    z <= -11
      ? 7.945
      : z <= -8
        ? T.MathUtils.lerp(7.945, 7.55, (z + 11) / 3)
        : T.MathUtils.lerp(7.55, 6.8, T.MathUtils.clamp((z + 8) / 3, 0, 1));
  for (const side of [-1, 1]) {
    const aftSkin = (shape, depth, surface, offset, name, bevel = 0.055) => {
      let geometry = new T.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: 3,
        curveSegments: 16,
        steps: 2,
      });
      geometry = refineRakedProfile(geometry);
      const p = geometry.attributes.position,
        n = geometry.attributes.normal;
      for (let vertex = 0; vertex < p.count; vertex++) {
        const z = p.getX(vertex),
          y = p.getY(vertex),
          d = p.getZ(vertex);
        const slope = (aftOuter(z + 0.001) - aftOuter(z - 0.001)) / 0.002;
        const normal = new T.Vector3(
          -side * n.getZ(vertex),
          n.getY(vertex),
          n.getX(vertex) + slope * n.getZ(vertex),
        ).normalize();
        p.setXYZ(vertex, side * (aftOuter(z) - offset - d), y, z);
        n.setXYZ(vertex, normal.x, normal.y, normal.z);
      }
      if (side < 0)
        for (const attribute of Object.values(geometry.attributes))
          for (let vertex = 0; vertex < attribute.count; vertex += 3)
            for (
              let component = 0;
              component < attribute.itemSize;
              component++
            ) {
              const value = attribute.getComponent(vertex + 1, component);
              attribute.setComponent(
                vertex + 1,
                component,
                attribute.getComponent(vertex + 2, component),
              );
              attribute.setComponent(vertex + 2, component, value);
            }
      return add(geometry, surface, [0, 0, 0], null, name);
    };
    const shell = roundedProfile(
      [
        [-19.7, 4.59],
        [-11, 4.59],
        [-8, 4.08],
        [-5.15, 3.4],
        [-5.15, 1.02],
        [-10.5, 0.36],
        [-19.7, 0.36],
      ],
      0.19,
    );
    const pocket = [
      [-18.05, 3.42],
      [-13.1, 3.42],
      [-9.45, 2.95],
      [-8.95, 2.37],
      [-10.75, 1.3],
      [-17.5, 1.3],
      [-18.05, 1.72],
    ];
    const inset = (factor) =>
      pocket.map(([z, y]) => [
        -13.5 + (z + 13.5) * factor,
        2.4 + (y - 2.4) * factor,
      ]);
    shell.holes.push(
      new T.Path(roundedProfile(pocket, 0.17).getPoints(14).reverse()),
    );
    aftSkin(
      shell,
      0.34,
      ceramic,
      0,
      'Formed aft nacelle skin with open cooling pocket',
    );
    const liner = roundedProfile(inset(0.982), 0.13);
    liner.holes.push(
      new T.Path(roundedProfile(inset(0.88), 0.1).getPoints(14).reverse()),
    );
    aftSkin(
      liner,
      0.48,
      heat,
      0.17,
      'Nacelle pocket seated heat-shield return',
      0.024,
    );
    aftSkin(
      roundedProfile(inset(0.94), 0.13),
      0.13,
      graphite,
      0.76,
      'Nacelle deep cooling manifold backing',
      0.02,
    );
    for (let index = 0; index < 8; index++) {
      const z = -17.15 + index * 0.93,
        front = aftOuter(z) - 0.27,
        back = aftOuter(z) - 0.7;
      const top = z < -13 ? 3.24 : 3.24 - (z + 13) * 0.13;
      const vertices = [
        side * front,
        1.46,
        z - 0.07,
        side * front,
        top,
        z - 0.07,
        side * back,
        1.56,
        z + 0.12,
        side * back,
        top - 0.1,
        z + 0.12,
        side * (front - 0.065),
        1.46,
        z + 0.045,
        side * (front - 0.065),
        top,
        z + 0.045,
        side * (back - 0.065),
        1.56,
        z + 0.235,
        side * (back - 0.065),
        top - 0.1,
        z + 0.235,
      ];
      add(
        createBeveledBossPart(vertices, { radius: 0.025, segments: 3 }),
        heat,
        [0, 0, 0],
        null,
        'Nacelle recessed folded heat-exchanger blade',
      );
    }
    const center = side * 5.4;
    const outer = [
      [center - 2.27, -19.58],
      [center + 2.27, -19.58],
      [center + 2.27, -10.75],
      [center - 2.27, -10.75],
    ];
    const opening = [
      [center - 1.37, -18.2],
      [center + 1.37, -18.2],
      [center + 1.37, -11.9],
      [center - 1.37, -11.9],
    ];
    deck(
      outer,
      opening,
      ceramic,
      4.58,
      'Formed nacelle crown with recessed service hatch',
      0.39,
      0.065,
    );
    deck(
      [
        [center - 1.47, -18.3],
        [center + 1.47, -18.3],
        [center + 1.47, -11.8],
        [center - 1.47, -11.8],
      ],
      [
        [center - 1.31, -18.12],
        [center + 1.31, -18.12],
        [center + 1.31, -11.98],
        [center - 1.31, -11.98],
      ],
      graphite,
      4.4,
      'Nacelle hatch deep continuous pressure gasket',
      0.18,
      0.02,
    );
    box(
      [2.56, 0.19, 5.97],
      [center, 4.32, -15.05],
      service,
      0.06,
      'Nacelle service cassette seated beneath crown',
    );
    box(
      [0.72, 0.025, 5.59],
      [center + side * 0.19, 4.428, -15.05],
      red,
      0.012,
      'Bonded broad courier nacelle identification',
    );
    for (const edge of [-1, 1])
      for (const end of [-1, 1]) {
        box(
          [0.3, 0.095, 0.28],
          [center + edge * 1.06, 4.45, -15.05 + end * 2.63],
          cold,
          0.025,
          'Nacelle recessed service-cassette keeper',
        );
      }
    const vertices = [];
    for (const [z, cx, width, low, high] of [
      [-10.68, center, 2.23, 4.08, 4.58],
      [-5.08, side * 5.1, 1.62, 3.06, 3.58],
    ])
      for (const x of [cx - width, cx + width])
        for (const y of [low, high]) vertices.push(x, y, z);
    add(
      createBeveledBossPart(vertices, { radius: 0.12, segments: 4 }),
      ceramic,
      [0, 0, 0],
      null,
      'Taut nacelle shoulder crown into cargo carrier',
    );
  }
  for (const side of [-1, 1]) {
    for (const [za, zb] of [
      [-8.4, -4.5],
      [-4.25, -0.35],
      [0, 3.9],
    ]) {
      loft(
        [
          { z: za, x: side * 4.35, width: 0.62, low: 1.45, high: 3.7 },
          { z: za + 0.42, x: side * 4.6, width: 0.72, low: 1.35, high: 4.12 },
          { z: zb - 0.42, x: side * 4.6, width: 0.72, low: 1.35, high: 4.12 },
          { z: zb, x: side * 4.35, width: 0.62, low: 1.45, high: 3.7 },
        ],
        ceramic,
        'Pressure-spine formed side armor',
        0.3,
      );
      box(
        [0.08, 1.0, 2.35],
        [side * 5.305, 2.5, (za + zb) / 2],
        graphite,
        0.03,
        'Seated graphite side service bay',
      );
      for (let i = 0; i < 5; i++)
        box(
          [0.13, 0.82, 0.11],
          [side * 5.35, 2.5, za + 0.9 + i * 0.43],
          heat,
          0.02,
          'Recessed side bay pressure vane',
        );
      box(
        [0.12, 0.12, 2.8],
        [side * 5.32, 1.75, (za + zb) / 2],
        metal,
        0.025,
        'Side armor continuous lower carrier',
      );
    }
    const stripePositions = [],
      stripeIndices = [];
    const cheekStations = [
      { z: 2.8, x: 3.7, width: 1.9, low: 3.45, high: 4.7 },
      { z: 6, x: 3.8, width: 1.85, low: 2.8, high: 4.95 },
      { z: 10.5, x: 3.7, width: 1.65, low: 1.95, high: 4.65 },
      { z: 14.5, x: 2.9, width: 1.25, low: 1.25, high: 3.7 },
      { z: 17.9, x: 1.75, width: 1, low: 0.6, high: 2.1 },
      { z: 19.94, x: 1.15, width: 1.15, low: 0.2, high: 1.15 },
    ];
    // Interpolate the identical authored curved skin, keeping the bonded mark
    // seated across section changes instead of floating a horizontal decal.
    const slope = (i, key) => {
      const a = cheekStations[Math.max(0, i - 1)],
        b = cheekStations[i],
        c = cheekStations[Math.min(cheekStations.length - 1, i + 1)];
      const p = a === b ? 0 : (b[key] - a[key]) / (b.z - a.z),
        q = b === c ? 0 : (c[key] - b[key]) / (c.z - b.z);
      return p * q > 0 ? (2 * p * q) / (p + q) : 0;
    };
    for (let row = 0; row <= 60; row++) {
      const z = 5 + (row / 60) * 11;
      const index = cheekStations.findIndex((p) => p.z >= z) - 1;
      const a = cheekStations[index],
        b = cheekStations[index + 1],
        t = (z - a.z) / (b.z - a.z),
        dz = b.z - a.z;
      const value = (key) =>
        (2 * t * t * t - 3 * t * t + 1) * a[key] +
        (t * t * t - 2 * t * t + t) * dz * slope(index, key) +
        (-2 * t * t * t + 3 * t * t) * b[key] +
        (t * t * t - t * t) * dz * slope(index + 1, key);
      for (const u of [-0.5, -0.5 + 0.32 * (1 - row / 66)]) {
        const y =
          (value('low') + value('high')) / 2 +
          ((value('high') - value('low')) / 2) *
            Math.pow(1 - Math.pow(Math.abs(u), 2 / 0.26), 0.26 / 2);
        stripePositions.push(
          side * (value('x') + value('width') * u),
          y + 0.012,
          z,
        );
      }
      if (row < 60) {
        const a = row * 2;
        stripeIndices.push(
          ...(side > 0
            ? [a, a + 2, a + 3, a, a + 3, a + 1]
            : [a, a + 1, a + 3, a, a + 3, a + 2]),
        );
      }
    }
    const stripeGeometry = new T.BufferGeometry();
    stripeGeometry.setAttribute(
      'position',
      new T.Float32BufferAttribute(stripePositions, 3),
    );
    stripeGeometry.setIndex(stripeIndices);
    stripeGeometry.computeVertexNormals();
    add(
      stripeGeometry,
      red,
      [0, 0, 0],
      null,
      'Bonded conforming courier identification',
    );
  }
  // The side aperture is cut through the actual shaped cheek, not a vent
  // appliance attached to a complete loft. Its curved roof, swept end returns,
  // inset pressure liner and folded machinery share this one authored profile.
  const foreStations = [
    { z: 2.8, x: 3.7, width: 1.9, high: 4.7 },
    { z: 6, x: 3.8, width: 1.85, high: 4.95 },
    { z: 10.5, x: 3.7, width: 1.65, high: 4.65 },
    { z: 14.5, x: 2.9, width: 1.25, high: 3.7 },
    { z: 17.9, x: 1.75, width: 1, high: 2.1 },
    { z: 19.75, x: 1.15, width: 1.15, high: 1.15 },
  ];
  const foreSlope = (index, key) => {
    const a = foreStations[Math.max(0, index - 1)],
      b = foreStations[index],
      c = foreStations[Math.min(foreStations.length - 1, index + 1)];
    const p = a === b ? 0 : (b[key] - a[key]) / (b.z - a.z),
      q = b === c ? 0 : (c[key] - b[key]) / (c.z - b.z);
    return p * q > 0 ? (2 * p * q) / (p + q) : 0;
  };
  const foreValue = (z, key) => {
    const clamped = T.MathUtils.clamp(
      z,
      foreStations[0].z,
      foreStations.at(-1).z,
    );
    const index = Math.max(
      0,
      foreStations.findIndex((station) => station.z >= clamped) - 1,
    );
    const a = foreStations[index],
      b = foreStations[index + 1],
      t = (clamped - a.z) / (b.z - a.z),
      dz = b.z - a.z;
    return (
      (2 * t * t * t - 3 * t * t + 1) * a[key] +
      (t * t * t - 2 * t * t + t) * dz * foreSlope(index, key) +
      (-2 * t * t * t + 3 * t * t) * b[key] +
      (t * t * t - t * t) * dz * foreSlope(index + 1, key)
    );
  };
  const outerX = (z) => foreValue(z, 'x') + foreValue(z, 'width');
  function roundedProfile(points, radius = 0.18) {
    const shape = new T.Shape();
    for (let index = 0; index < points.length; index++) {
      const before = new T.Vector2(
        ...points[(index + points.length - 1) % points.length],
      );
      const corner = new T.Vector2(...points[index]);
      const after = new T.Vector2(...points[(index + 1) % points.length]);
      const incoming = before.clone().sub(corner),
        outgoing = after.clone().sub(corner);
      const length = Math.min(
        radius,
        incoming.length() * 0.3,
        outgoing.length() * 0.3,
      );
      const entry = corner
        .clone()
        .add(incoming.normalize().multiplyScalar(length));
      const exit = corner
        .clone()
        .add(outgoing.normalize().multiplyScalar(length));
      if (index === 0) shape.moveTo(entry.x, entry.y);
      else shape.lineTo(entry.x, entry.y);
      shape.quadraticCurveTo(corner.x, corner.y, exit.x, exit.y);
    }
    shape.closePath();
    return shape;
  }
  const cheekOutline = [
    [3.2, 4.4],
    [6, 4.65],
    [10.7, 4.32],
    [14.5, 3.38],
    [18, 1.8],
    [19.7, 1.02],
    [19.7, 0.39],
    [17.6, 0.67],
    [13.8, 1.08],
    [7, 1.28],
    [3.2, 2.15],
  ];
  const pocketOutline = [
    [6.5, 3.92],
    [10.65, 3.67],
    [13.65, 2.98],
    [14.1, 2.47],
    [12.85, 1.66],
    [7.15, 1.8],
    [6.08, 2.4],
  ];
  const pocketInset = (factor) =>
    pocketOutline.map(([z, y]) => [
      10 + (z - 10) * factor,
      2.75 + (y - 2.75) * factor,
    ]);
  for (const side of [-1, 1]) {
    const cheek = (shape, depth, surface, offset, name, bevel = 0.055) => {
      let geometry = new T.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: 3,
        curveSegments: 16,
        steps: 2,
      });
      geometry = refineRakedProfile(geometry);
      const positions = geometry.attributes.position,
        normals = geometry.attributes.normal;
      for (let vertex = 0; vertex < positions.count; vertex++) {
        const z = positions.getX(vertex),
          y = positions.getY(vertex),
          d = positions.getZ(vertex);
        const derivative = (outerX(z + 0.001) - outerX(z - 0.001)) / 0.002;
        const u = normals.getX(vertex),
          v = normals.getY(vertex),
          w = normals.getZ(vertex);
        const normal = new T.Vector3(
          -side * w,
          v,
          u + derivative * w,
        ).normalize();
        positions.setXYZ(vertex, side * (outerX(z) - offset - d), y, z);
        normals.setXYZ(vertex, normal.x, normal.y, normal.z);
      }
      if (side < 0) {
        for (const attribute of Object.values(geometry.attributes))
          for (let vertex = 0; vertex < attribute.count; vertex += 3)
            for (
              let component = 0;
              component < attribute.itemSize;
              component++
            ) {
              const value = attribute.getComponent(vertex + 1, component);
              attribute.setComponent(
                vertex + 1,
                component,
                attribute.getComponent(vertex + 2, component),
              );
              attribute.setComponent(vertex + 2, component, value);
            }
      }
      return add(geometry, surface, [0, 0, 0], null, name);
    };
    const shell = roundedProfile(cheekOutline, 0.23);
    shell.holes.push(
      new T.Path(roundedProfile(pocketOutline, 0.21).getPoints(16).reverse()),
    );
    cheek(
      shell,
      0.32,
      ceramic,
      0,
      'Swept ceramic fore cheek with structural intake pocket',
    );
    // The roof is only the formed crown, leaving a complete intentional side
    // shell below it instead of exposing an omitted loft's triangular slit.
    loft(
      foreStations.map((station) => ({
        ...station,
        x: side * station.x,
        low: station.high - 0.6,
      })),
      ceramic,
      'Formed fore cheek crown and canopy shoulder',
      0.26,
    );
    const liner = roundedProfile(pocketInset(0.986), 0.16);
    liner.holes.push(
      new T.Path(
        roundedProfile(pocketInset(0.89), 0.13).getPoints(16).reverse(),
      ),
    );
    cheek(
      liner,
      0.57,
      heat,
      0.16,
      'Deep swept pressure liner seated inside cheek',
      0.025,
    );
    cheek(
      roundedProfile(pocketInset(0.96), 0.16),
      0.1,
      graphite,
      0.94,
      'Fore intake dark recessed pressure backing',
      0.025,
    );
    for (let index = 0; index < 7; index++) {
      const z = 7.1 + index * 0.93,
        front = outerX(z) - 0.35,
        rear = outerX(z) - 0.91;
      const top = 3.78 - (z - 7.1) * 0.105,
        bottom = 1.87 - (z - 7.1) * 0.018;
      const vertices = [
        side * front,
        bottom,
        z - 0.08,
        side * front,
        top,
        z - 0.08,
        side * rear,
        bottom + 0.12,
        z + 0.12,
        side * rear,
        top - 0.12,
        z + 0.12,
        side * (front - 0.05),
        bottom,
        z + 0.045,
        side * (front - 0.05),
        top,
        z + 0.045,
        side * (rear - 0.05),
        bottom + 0.12,
        z + 0.245,
        side * (rear - 0.05),
        top - 0.12,
        z + 0.245,
      ];
      add(
        createBeveledBossPart(vertices, { radius: 0.022, segments: 3 }),
        heat,
        [0, 0, 0],
        null,
        'Deep folded fore-intake pressure vane',
      );
    }
    // A substantial graphite sill belongs to the pocket's lower ceramic
    // return. It remains recessed rather than adding another external rail.
    cheek(
      roundedProfile(
        [
          [7.2, 1.83],
          [12.8, 1.69],
          [13.2, 1.92],
          [7.1, 2.03],
        ],
        0.07,
      ),
      0.38,
      graphite,
      0.48,
      'Intake integral lower pressure sill',
      0.02,
    );
  }
  for (const side of [-1, 1]) {
    const crownPatch = (name, surface, start, end, inner, outer, lift) => {
      const positions = [],
        indices = [],
        rows = 24,
        columns = 6;
      for (let row = 0; row <= rows; row++) {
        const t = row / rows,
          z = T.MathUtils.lerp(start, end, t);
        const trim = Math.min(t / 0.15, (1 - t) / 0.15, 1) * 0.08;
        for (let column = 0; column <= columns; column++) {
          const u = T.MathUtils.lerp(
            inner + 0.08 - trim,
            outer - 0.08 + trim,
            column / columns,
          );
          const top = foreValue(z, 'high'),
            width = foreValue(z, 'width');
          const y =
            top -
            0.3 +
            0.3 * Math.pow(1 - Math.pow(Math.abs(u), 2 / 0.26), 0.26 / 2);
          positions.push(side * (foreValue(z, 'x') + width * u), y + lift, z);
        }
      }
      for (let row = 0; row < rows; row++)
        for (let column = 0; column < columns; column++) {
          const a = row * (columns + 1) + column,
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
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      add(geometry, surface, [0, 0, 0], null, name);
    };
    crownPatch(
      'Bonded fore pressure-service identification field',
      service,
      3.9,
      7.8,
      0.22,
      0.86,
      0.014,
    );
    crownPatch(
      'Broad vermilion courier service identification',
      red,
      4.75,
      6.9,
      0.43,
      0.67,
      0.021,
    );
    const glyphs = {
      0: ['a', 'b', 'c', 'd', 'e', 'f'],
      4: ['b', 'c', 'f', 'g'],
    };
    const segments = {
      a: [0.1, 0.78, 0.4, 0.095],
      b: [0.46, 0.44, 0.095, 0.4],
      c: [0.46, 0.04, 0.095, 0.4],
      d: [0.1, 0.0, 0.4, 0.095],
      e: [0.04, 0.04, 0.095, 0.4],
      f: [0.04, 0.44, 0.095, 0.4],
      g: [0.1, 0.39, 0.4, 0.095],
    };
    for (const [index, glyph] of [...'04'].entries())
      for (const segment of glyphs[glyph]) {
        const [u, v, width, height] = segments[segment],
          advance = index * 0.74;
        const shape = roundedProfile(
          [
            [advance + u, 2.48 + v],
            [advance + u + width, 2.48 + v],
            [advance + u + width, 2.48 + v + height],
            [advance + u, 2.48 + v + height],
          ],
          0.014,
        );
        const geometry = new T.ShapeGeometry(shape, 6),
          positions = geometry.attributes.position;
        for (let vertex = 0; vertex < positions.count; vertex++) {
          const z =
            side > 0
              ? 5.8 - positions.getX(vertex)
              : 4.0 + positions.getX(vertex);
          positions.setXYZ(
            vertex,
            side * (outerX(z) + 0.014),
            positions.getY(vertex),
            z,
          );
        }
        geometry.computeVertexNormals();
        add(geometry, red, [0, 0, 0], null, 'Bonded courier fleet identity 04');
      }
  }
  function nozzle(x, y, rear, radius, width, height, anchorName) {
    const shape = new T.Shape();
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const curve = (v) => Math.sign(v) * Math.pow(Math.abs(v), 0.24);
      const p = new T.Vector2(
        curve(Math.cos(a)) * width,
        curve(Math.sin(a)) * height,
      );
      if (i === 0) shape.moveTo(p.x, p.y);
      else shape.lineTo(p.x, p.y);
    }
    shape.closePath();
    const octagon = (r) => {
      const outline = new T.Shape();
      for (let index = 0; index < 8; index++) {
        const angle = Math.PI / 8 + (index / 8) * Math.PI * 2;
        const x = Math.cos(angle) * r,
          y = Math.sin(angle) * r;
        if (index === 0) outline.moveTo(x, y);
        else outline.lineTo(x, y);
      }
      outline.closePath();
      return outline;
    };
    shape.holes.push(
      new T.Path(
        octagon(radius * 1.31)
          .getPoints()
          .reverse(),
      ),
    );
    add(
      new T.ExtrudeGeometry(shape, {
        depth: 0.55,
        bevelEnabled: true,
        bevelThickness: 0.045,
        bevelSize: 0.025,
        bevelSegments: 3,
        curveSegments: 48,
        steps: 1,
      }),
      ceramic,
      [x, y, rear + 0.025],
      null,
      'Formed ceramic cold cowl around separate drive carrier',
    );
    const positions = [],
      indices = [],
      radial = 96;
    const profile = [
      ['outer', 0.34],
      ['outer-0.035', 0.305],
      ['inner+0.04', 0.085],
      ['inner', 0.12],
      ['inner', 0.61],
      ['outer', 0.61],
    ];
    for (const [ring, depth] of profile)
      for (let index = 0; index < radial; index++) {
        const angle = (index / radial) * Math.PI * 2;
        const delta =
          ((((angle + Math.PI / 8) % (Math.PI / 4)) + Math.PI / 4) %
            (Math.PI / 4)) -
          Math.PI / 8;
        const outer = (radius * 1.27 * Math.cos(Math.PI / 8)) / Math.cos(delta),
          inner = radius * 0.985;
        const r =
          ring === 'outer'
            ? outer
            : ring === 'outer-0.035'
              ? outer - 0.035
              : ring === 'inner+0.04'
                ? inner + 0.04
                : inner;
        positions.push(Math.cos(angle) * r, Math.sin(angle) * r, depth);
      }
    for (let ring = 0; ring < profile.length; ring++)
      for (let index = 0; index < radial; index++) {
        const a = ring * radial + index,
          b = ring * radial + ((index + 1) % radial);
        const c = ((ring + 1) % profile.length) * radial + index,
          d = ((ring + 1) % profile.length) * radial + ((index + 1) % radial);
        indices.push(a, d, b, a, c, d);
      }
    const collar = new T.BufferGeometry();
    collar.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    collar.setIndex(indices);
    collar.computeVertexNormals();
    add(
      collar,
      cold,
      [x, y, rear],
      null,
      'Profiled faceted machined titanium pressure collar',
    );
    for (let index = 0; index < 4; index++) {
      const angle = (index / 4) * Math.PI * 2;
      const clamp = box(
        [radius * 0.27, radius * 0.12, 0.66],
        [
          x + Math.cos(angle) * radius * 1.145,
          y + Math.sin(angle) * radius * 1.145,
          rear + 0.48,
        ],
        heat,
        0.035,
        'Cold-cuff structural radial keeper',
      );
      clamp.rotation.z = angle;
    }
    const turn = new T.Quaternion().setFromAxisAngle(axisX, Math.PI / 2);
    add(
      new T.CylinderGeometry(radius * 0.69, radius, 2.7, 64, 1, true),
      heat,
      [x, y, rear + 1.64],
      turn,
      'Recessed pressure sleeve',
    );
    const coldCuff = new T.CylinderGeometry(
      radius * 1.025,
      radius * 1.025,
      0.42,
      64,
      1,
      true,
    );
    coldCuff.rotateX(Math.PI / 2);
    add(
      coldCuff,
      metal,
      [x, y, rear + 0.39],
      null,
      'Broad machined cold mounting cuff',
    );
    add(
      new T.TorusGeometry(radius * 0.985, 0.095, 10, 64),
      metal,
      [x, y, rear + 0.41],
      null,
      'Nozzle machined inner lip',
    );
    add(
      new T.CircleGeometry(radius * 0.55, 64),
      ion,
      [x, y, rear + 2.92],
      new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI),
      'Recessed ion emitter',
    );
    for (const [depth, scale] of [
      [1.0, 0.91],
      [2.0, 0.79],
      [2.8, 0.64],
    ])
      add(
        new T.TorusGeometry(radius * scale, 0.045, 6, 64),
        metal,
        [x, y, rear + depth],
        null,
        'Seated pressure chamber retaining hoop',
      );
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const baffle = box(
        [radius * 0.45, 0.09, 1.25],
        [
          x + Math.cos(a) * radius * 0.65,
          y + Math.sin(a) * radius * 0.65,
          rear + 2.05,
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
  nozzle(-5.4, 2.5, -19.98, 1.85, 2.575, 2.27, 'Exhaust_L');
  nozzle(5.4, 2.5, -19.98, 1.85, 2.575, 2.27, 'Exhaust_R');
  nozzle(0, 1.94, -18.98, 1.16, 1.58, 1.48, 'Exhaust_C');
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
    geometry.applyMatrix4(mesh.matrix);
    const position = geometry.attributes.position,
      normal = geometry.attributes.normal;
    const uv = new Float32Array(position.count * 2);
    for (let vertex = 0; vertex < position.count; vertex++) {
      const nx = Math.abs(normal.getX(vertex)),
        ny = Math.abs(normal.getY(vertex)),
        nz = Math.abs(normal.getZ(vertex));
      uv[vertex * 2] =
        nx > ny && nx > nz ? position.getZ(vertex) : position.getX(vertex);
      uv[vertex * 2 + 1] =
        ny >= nx && ny >= nz ? position.getZ(vertex) : position.getY(vertex);
    }
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
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
    source: 'source-authored-goliath-v2',
    concept: 'docs/art/bosses/goliath-concept-v1.png',
    artVersion: 10,
  };
  const propulsion = createRivalPropulsion(group, settings);
  const propulsionScale = new T.Vector3(3.8, 3.8, 2.4);
  const mouthRadii = [1.85, 1.85, 1.16];
  let disposed = false;
  function update(frame = {}) {
    if (disposed) return;
    propulsion.update(frame);
    fitBossPropulsion(propulsion, frame, propulsionScale, mouthRadii);
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
      finish.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}
