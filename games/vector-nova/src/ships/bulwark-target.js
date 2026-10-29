import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createBeveledBossPart } from './boss-art-geometry.js';
import { createBossFinish } from './boss-art-materials.js';
import { createBossLoft } from './boss-art-loft.js';
import { BULWARK_HULL } from './boss-hulls.js';
import { createRivalPropulsion } from './rival-propulsion.js';
import { fitBossPropulsion } from './boss-propulsion.js';

const SPECIFICATION = Object.freeze({
  id: 'bulwark',
  name: 'Bulwark',
  version: 2,
  role: 'Shield freight barge',
  description:
    'A broad shield barge with compound ochre armor, warm ceramic shoulders, paired cooling trenches and three deep ion drives.',
  design:
    'Twenty-metre shield barge / formed forward armor and an integrated triple-drive stern',
  propulsion: 'Three widely spaced recessed ion drives',
});
const boxPoints = (x, y, z) =>
  [-1, 1].flatMap((a) =>
    [-1, 1].flatMap((b) =>
      [-1, 1].flatMap((c) => [(a * x) / 2, (b * y) / 2, (c * z) / 2]),
    ),
  );

export function createBulwarkTarget(settings = {}) {
  const group = new T.Group(),
    body = new T.Group();
  group.name = 'Bulwark / shield barge';
  body.name = 'Bulwark / authored chassis';
  body.userData.role = 'boss-body';
  group.add(body);
  const finish = createBossFinish(settings),
    geometries = new Set(),
    instances = new Set();
  const surface = (label, kind, values) =>
    finish.material(`Bulwark / ${label}`, kind, values);
  const porcelain = surface('warm structural porcelain', 'ceramic', {
    color: '#d7d2bf',
    roughness: 0.24,
  });
  const ochre = surface('coated ochre shield armor', 'paint', {
    color: '#b38335',
    roughness: 0.25,
  });
  const service = surface('stone service ceramic', 'service', {
    color: '#999b8e',
    roughness: 0.3,
  });
  const carbon = surface('warm graphite carrier', 'carbon', {
    color: '#252a29',
    roughness: 0.3,
  });
  const alloy = surface('machined titanium retaining lips', 'alloy', {
    color: '#bbc4bf',
    metalness: 0.82,
    roughness: 0.25,
    roughnessMap: null,
    anisotropy: 0,
  });
  const brass = surface('pressure cuff brass alloy', 'darkalloy', {
    color: '#8f8463',
    roughness: 0.31,
  });
  const cuff = surface('cold titanium pressure cuffs', 'darkalloy', {
    color: '#596360',
    roughness: 0.3,
  });
  const chamber = surface('recessed chamber graphite', 'darkalloy', {
    color: '#283338',
    roughness: 0.38,
  });
  const glass = surface('protected tinted command glazing', 'glass', {
    color: '#071519',
    roughness: 0.17,
    clearcoat: 0.72,
    clearcoatRoughness: 0.07,
    specularIntensity: 0.6,
    specularColor: '#aec7cd',
    envMapIntensity: 0.65,
  });
  const gasket = surface('bonded glazing elastomer gasket', 'service', {
    color: '#0b1113',
    metalness: 0,
    roughness: 0.43,
    clearcoat: 0.14,
  });
  const ion = finish.material('Bulwark_Ion', 'service', {
    color: '#9cddf0',
    emissive: '#278fff',
    emissiveIntensity: 1.15,
    roughness: 0.3,
    metalness: 0,
    clearcoat: 0,
  });
  const add = (
    geometry,
    material,
    name,
    position = [0, 0, 0],
    parent = body,
  ) => {
    geometries.add(geometry);
    const mesh = new T.Mesh(geometry, material);
    mesh.name = `Bulwark / ${name}`;
    mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const block = (
    size,
    position,
    material,
    name,
    radius = 0.06,
    parent = body,
  ) =>
    add(
      createBeveledBossPart(boxPoints(...size), { radius }),
      material,
      name,
      position,
      parent,
    );
  const tag = (mesh, name) => {
    mesh.userData.contactPart = name;
    return mesh;
  };
  const repeatedBlocks = (size, transforms, material, name, radius = 0.025) => {
    const geometry = createBeveledBossPart(boxPoints(...size), { radius });
    geometries.add(geometry);
    const mesh = new T.InstancedMesh(geometry, material, transforms.length),
      transform = new T.Object3D();
    mesh.name = `Bulwark / ${name}`;
    mesh.castShadow = mesh.receiveShadow = true;
    transforms.forEach(([position, rotation], index) => {
      transform.position.set(...position);
      transform.rotation.set(...rotation);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    body.add(mesh);
    instances.add(mesh);
    return mesh;
  };
  const uvMetres = (geometry) => {
    const p = geometry.attributes.position,
      n = geometry.attributes.normal,
      uv = [];
    for (let i = 0; i < p.count; i++) {
      const a = Math.abs(n.getX(i)),
        b = Math.abs(n.getY(i)),
        c = Math.abs(n.getZ(i));
      if (b >= a && b >= c) uv.push(p.getX(i), p.getZ(i));
      else if (a > c) uv.push(p.getZ(i), p.getY(i));
      else uv.push(p.getX(i), p.getY(i));
    }
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    return geometry;
  };

  // Rounded solids are sampled before forming. Their analytic fillet normals
  // pass through the deformation Jacobian, keeping the shield sweep smooth.
  function formedSolid(map, radius = 0.09, divisions = [20, 10, 8]) {
    const geometry = new T.BoxGeometry(2, 2, 2, ...divisions);
    const p = geometry.attributes.position,
      n = geometry.attributes.normal;
    const local = new T.Vector3(),
      core = new T.Vector3(),
      direction = new T.Vector3();
    const jacobian = new T.Matrix3(),
      epsilon = 1e-4;
    let mirrored = false;
    for (let i = 0; i < p.count; i++) {
      local.fromBufferAttribute(p, i);
      core.copy(local).clampScalar(-1 + radius, 1 - radius);
      direction.copy(local).sub(core).normalize();
      local.copy(core).addScaledVector(direction, radius);
      const sample = map(...local.toArray());
      const derivatives = [0, 1, 2].map((axis) => {
        const before = local.toArray(),
          after = local.toArray();
        before[axis] -= epsilon;
        after[axis] += epsilon;
        return new T.Vector3(...map(...after))
          .sub(new T.Vector3(...map(...before)))
          .multiplyScalar(0.5 / epsilon);
      });
      jacobian.set(
        derivatives[0].x,
        derivatives[1].x,
        derivatives[2].x,
        derivatives[0].y,
        derivatives[1].y,
        derivatives[2].y,
        derivatives[0].z,
        derivatives[1].z,
        derivatives[2].z,
      );
      mirrored = jacobian.determinant() < 0;
      jacobian.invert().transpose();
      direction.applyMatrix3(jacobian).normalize();
      p.setXYZ(i, ...sample);
      n.setXYZ(i, direction.x, direction.y, direction.z);
    }
    if (mirrored)
      for (let i = 0; i < geometry.index.count; i += 3) {
        const b = geometry.index.getX(i + 1),
          c = geometry.index.getX(i + 2);
        geometry.index.setX(i + 1, c);
        geometry.index.setX(i + 2, b);
      }
    const result = geometry.toNonIndexed();
    geometry.dispose();
    return uvMetres(result);
  }
  const loft = (sections, power = 0.4) => {
    const source = createBossLoft(
      sections.map(([z, x, width, cy, height]) => ({
        z,
        x,
        width,
        low: cy - height,
        high: cy + height,
      })),
      {
        radial: settings.quality === 'low' ? 32 : 48,
        steps: 6,
        power,
      },
    );
    const result = source.toNonIndexed();
    source.dispose();
    return uvMetres(result);
  };
  const strut = (a, b, width, material, name) => {
    const start = new T.Vector3(...a),
      end = new T.Vector3(...b),
      axis = end.clone().sub(start);
    const mesh = block(
      [width, axis.length(), width],
      start.add(end).multiplyScalar(0.5).toArray(),
      material,
      name,
      width * 0.22,
    );
    mesh.quaternion.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      axis.normalize(),
    );
    return mesh;
  };
  const lathe = (profile, material, name, parent = body, smooth = false) => {
    const low = Math.min(...profile.map((p) => p[1])),
      high = Math.max(...profile.map((p) => p[1]));
    const points = smooth
      ? new T.CatmullRomCurve3(
          profile.map(([radius, depth]) => new T.Vector3(radius, depth, 0)),
          true,
          'centripetal',
        )
          .getPoints(24)
          .map((p) => new T.Vector2(p.x, T.MathUtils.clamp(p.y, low, high)))
      : profile.map(([radius, depth]) => new T.Vector2(radius, depth));
    const geometry = new T.LatheGeometry(
      points,
      settings.quality === 'low' ? 48 : 64,
    );
    geometry.rotateX(Math.PI / 2);
    return add(geometry, material, name, [0, 0, 0], parent);
  };
  // Authored folded skins start from a concave metre-space outline, not a
  // rounded block. The mapped extrusion keeps a real bevelled edge/thickness
  // while preserving the open inner-corner vent and individual broad facets.
  function conformingSubdivision(source) {
    let geometry = source;
    const splits = [
      [[0, 1, 2]],
      [
        [0, 3, 2],
        [3, 1, 2],
      ],
      [
        [1, 4, 0],
        [4, 2, 0],
      ],
      [
        [1, 4, 3],
        [0, 3, 2],
        [3, 4, 2],
      ],
      [
        [2, 5, 1],
        [5, 0, 1],
      ],
      [
        [0, 3, 5],
        [2, 5, 1],
        [5, 3, 1],
      ],
      [
        [2, 5, 4],
        [1, 4, 0],
        [4, 5, 0],
      ],
      [
        [0, 3, 5],
        [3, 1, 4],
        [5, 4, 2],
        [3, 4, 5],
      ],
    ];
    // Split every marked edge, including the neighbouring triangle's copy.
    // Longest-edge-only refinement would leave T-junctions that open into
    // raster cracks when the source cap and bevel are subsequently formed.
    for (let pass = 0; pass < 6; pass++) {
      const attributes = geometry.attributes,
        output = Object.fromEntries(
          Object.keys(attributes).map((key) => [key, []]),
        );
      let changed = false;
      for (
        let triangle = 0;
        triangle < attributes.position.count;
        triangle += 3
      ) {
        const vertices = [0, 1, 2].map((vertex) =>
          Object.fromEntries(
            Object.entries(attributes).map(([key, attribute]) => [
              key,
              Array.from(
                attribute.array.slice(
                  (triangle + vertex) * attribute.itemSize,
                  (triangle + vertex + 1) * attribute.itemSize,
                ),
              ),
            ]),
          ),
        );
        const marked = [
          [0, 1],
          [1, 2],
          [2, 0],
        ].map(
          ([a, b]) =>
            new T.Vector3(...vertices[a].position).distanceToSquared(
              new T.Vector3(...vertices[b].position),
            ) >
            0.09 + 1e-9,
        );
        const mask =
          Number(marked[0]) + Number(marked[1]) * 2 + Number(marked[2]) * 4;
        changed ||= mask !== 0;
        for (const [a, b] of [
          [0, 1],
          [1, 2],
          [2, 0],
        ])
          vertices.push(
            Object.fromEntries(
              Object.keys(attributes).map((key) => [
                key,
                vertices[a][key].map(
                  (value, index) => (value + vertices[b][key][index]) / 2,
                ),
              ]),
            ),
          );
        for (const face of splits[mask])
          for (const vertex of face)
            for (const key of Object.keys(attributes))
              output[key].push(...vertices[vertex][key]);
      }
      if (!changed) break;
      const refined = new T.BufferGeometry();
      for (const [key, values] of Object.entries(output))
        refined.setAttribute(
          key,
          new T.Float32BufferAttribute(values, attributes[key].itemSize),
        );
      geometry.dispose();
      geometry = refined;
    }
    return geometry;
  }
  function foldedSkin(
    points,
    thickness,
    map,
    material,
    name,
    { holes = [], bevel = 0.08 } = {},
  ) {
    const shape = new T.Shape(points.map((point) => new T.Vector2(...point)));
    for (const outline of holes)
      shape.holes.push(
        new T.Path(outline.map((point) => new T.Vector2(...point))),
      );
    const source = new T.ExtrudeGeometry(shape, {
      depth: thickness,
      steps: 1,
      bevelEnabled: true,
      bevelSize: bevel,
      bevelThickness: bevel,
      bevelSegments: 5,
      curveSegments: 12,
    });
    const geometry = conformingSubdivision(source);
    const p = geometry.attributes.position,
      n = geometry.attributes.normal,
      jacobian = new T.Matrix3();
    const point = new T.Vector3(),
      normal = new T.Vector3(),
      epsilon = 1e-4;
    let mirrored = false;
    for (let vertex = 0; vertex < p.count; vertex++) {
      point.fromBufferAttribute(p, vertex);
      const before = point.toArray(),
        value = map(...before);
      const axes = [0, 1, 2].map((axis) => {
        const a = [...before],
          b = [...before];
        a[axis] -= epsilon;
        b[axis] += epsilon;
        return new T.Vector3(...map(...b))
          .sub(new T.Vector3(...map(...a)))
          .multiplyScalar(0.5 / epsilon);
      });
      jacobian.set(
        axes[0].x,
        axes[1].x,
        axes[2].x,
        axes[0].y,
        axes[1].y,
        axes[2].y,
        axes[0].z,
        axes[1].z,
        axes[2].z,
      );
      mirrored = jacobian.determinant() < 0;
      normal
        .fromBufferAttribute(n, vertex)
        .applyMatrix3(jacobian.invert().transpose())
        .normalize();
      p.setXYZ(vertex, ...value);
      n.setXYZ(vertex, normal.x, normal.y, normal.z);
    }
    if (mirrored)
      for (let triangle = 0; triangle < p.count; triangle += 3)
        for (const attribute of Object.values(geometry.attributes))
          for (let component = 0; component < attribute.itemSize; component++) {
            const a = (triangle + 1) * attribute.itemSize + component,
              b = (triangle + 2) * attribute.itemSize + component;
            const value = attribute.array[a];
            attribute.array[a] = attribute.array[b];
            attribute.array[b] = value;
          }
    const mesh = add(geometry, material, name);
    mesh.userData.closedFormedSkin = true;
    return mesh;
  }
  let portModule = [];
  function authoredPortShoulder() {
    const firstPart = body.children.length;
    const section = (z, x0, x1, low, outerHigh, high) => [
      x0,
      low,
      z,
      x0,
      outerHigh - 0.25,
      z,
      x0 + 0.18,
      outerHigh,
      z,
      x0 + 0.72,
      high,
      z,
      x1 - 0.2,
      high - 0.1,
      z,
      x1,
      outerHigh - 0.05,
      z,
      x1,
      low + 0.1,
      z,
    ];
    tag(
      add(
        createBeveledBossPart(
          [
            ...section(-7.15, -5.72, -4.8, 0.22, 1.9, 2.2),
            ...section(-6.65, -5.76, -4.8, 0.22, 1.92, 2.24),
            ...section(-5.5, -5.84, -3.42, 0.2, 1.98, 2.34),
            ...section(-1.6, -5.68, -3.51, 0.26, 1.9, 2.2),
          ],
          { radius: 0.065 },
        ),
        carbon,
        'L authored faceted shoulder carrier',
      ),
      'bulwark-port-shoulder',
    );
    add(
      createBeveledBossPart(
        [
          ...section(-5.72, -5.79, -3.69, 0.61, 2.03, 2.43),
          ...section(-5.35, -5.97, -3.66, 0.55, 2.17, 2.55),
          ...section(-4.9, -5.95, -3.67, 0.56, 2.16, 2.53),
          ...section(-1.82, -5.79, -3.73, 0.64, 1.97, 2.34),
        ],
        { radius: 0.13 },
      ),
      porcelain,
      'L manufactured ivory shoulder skin with formed returns',
    );
    const roofHeight = (x, z) =>
      2.34 +
      0.025 * (z + 8) -
      0.025 * (x + 4.2) ** 2 +
      0.025 * Math.sin(((z + 9.8) / 4.25) * Math.PI) +
      0.04 * T.MathUtils.smoothstep(z, -6.4, -5.55);
    const roofOutline = [
      [-5.55, -9.42],
      [-5.25, -9.72],
      [-3.3, -9.72],
      [-2.8, -9.25],
      [-2.43, -8.45],
      [-2.39, -5.55],
      [-5.15, -5.55],
      [-5.66, -6.3],
    ];
    const aperture = [
      [-4.2, -7.88],
      [-4.03, -8.05],
      [-2.89, -8.05],
      [-2.7, -7.86],
      [-2.7, -6.04],
      [-2.89, -5.85],
      [-4.03, -5.85],
      [-4.2, -6.02],
    ];
    const rim = [
      [-4.32, -7.93],
      [-4.08, -8.17],
      [-2.84, -8.17],
      [-2.58, -7.91],
      [-2.58, -5.99],
      [-2.84, -5.73],
      [-4.08, -5.73],
      [-4.32, -5.97],
    ];
    foldedSkin(
      roofOutline,
      0.24,
      (x, z, depth) => [x, roofHeight(x, z) + depth - 0.24, z],
      ochre,
      'L crowned formed drive skin with bounded exchanger bay',
      { holes: [aperture], bevel: 0.08 },
    );
    foldedSkin(
      rim,
      0.07,
      (x, z, depth) => [x, roofHeight(x, z) + 0.02 + depth - 0.07, z],
      cuff,
      'L flush recessed exchanger bay retaining seat',
      { holes: [aperture], bevel: 0.025 },
    );
    foldedSkin(
      rim,
      0.46,
      (x, z, depth) => [x, roofHeight(x, z) + depth - 0.46, z],
      carbon,
      'L deep exchanger bay shaft walls',
      { holes: [aperture], bevel: 0.02 },
    );
    const skirtSection = (z, outside, inside, low, high) => [
      outside + 0.12,
      low,
      z,
      inside - 0.05,
      low,
      z,
      inside,
      low + 0.12,
      z,
      inside,
      high - 0.1,
      z,
      inside - 0.08,
      high,
      z,
      outside + 0.1,
      high,
      z,
      outside,
      high - 0.17,
      z,
      outside,
      low + 0.2,
      z,
    ];
    add(
      createBeveledBossPart(
        [
          ...skirtSection(-9.3, -5.58, -5.13, 0.33, 2.17),
          ...skirtSection(-8.1, -5.8, -5.35, 0.32, 2.39),
          ...skirtSection(-5.65, -5.82, -5.37, 0.72, 2.44),
        ],
        { radius: 0.085 },
      ),
      ochre,
      'L thick formed overlapping skirt with seated upper return',
    );
    add(
      createBeveledBossPart(
        [
          -3.1, 0.35, -9.3, -2.78, 0.35, -9.3, -3.1, 2.2, -9.3, -2.78, 2.2,
          -9.3, -3.12, 0.62, -8.22, -2.8, 0.62, -8.22, -3.12, 2.27, -8.22, -2.8,
          2.27, -8.22,
        ],
        { radius: 0.06 },
      ),
      ochre,
      'L seated inboard cold-cuff cheek',
    );
    block(
      [1.45, 0.12, 2.15],
      [-3.45, 2, -6.95],
      chamber,
      'L bounded exchanger deep floor',
      0.04,
    );
    repeatedBlocks(
      [1.28, 0.19, 0.12],
      Array.from({ length: 13 }, (_, vane) => [
        [-3.45, 2.18, -7.94 + vane * 0.158],
        [-0.24, 0, 0],
      ]),
      cuff,
      'L bounded exchanger seated pressure vanes',
    );
    for (const x of [-5.28, -2.8])
      add(
        createBeveledBossPart(
          [
            x - 0.13,
            0.28,
            -8.9,
            x + 0.13,
            0.28,
            -8.9,
            x - 0.13,
            x > -4 ? 1.78 : 1.9,
            -8.9,
            x + 0.13,
            x > -4 ? 1.78 : 1.9,
            -8.9,
            x - 0.18,
            0.22,
            -7.12,
            x + 0.18,
            0.22,
            -7.12,
            x - 0.18,
            x > -4 ? 1.84 : 2.15,
            -7.12,
            x + 0.18,
            x > -4 ? 1.84 : 2.15,
            -7.12,
          ],
          { radius: 0.05 },
        ),
        carbon,
        'L shaped pressure-cuff mounting seat',
      );
    portModule = body.children.slice(firstPart);
  }
  function mirroredStarboardShoulder() {
    const reflection = new T.Matrix4().makeScale(-1, 1, 1);
    for (const part of portModule) {
      const mirror = part.clone();
      mirror.name = part.name.replace('Bulwark / L ', 'Bulwark / R ');
      if (mirror.userData.contactPart)
        mirror.userData.contactPart = 'bulwark-starboard-shoulder';
      mirror.applyMatrix4(reflection);
      body.add(mirror);
      if (mirror.isInstancedMesh) instances.add(mirror);
    }
  }

  tag(
    add(
      loft(
        [
          [-9.2, 0, 4.5, 0, 0.2],
          [-8.5, 0, 5.05, 0, 0.2],
          [-7.4, 0, 5.45, 0, 0.2],
          [-6.7, 0, 5.8, 0.25, 0.45],
          [4.9, 0, 5.8, 0.25, 0.45],
          [6.6, 0, 5.35, 0.25, 0.45],
          [8.6, 0, 4.5, 0.25, 0.45],
        ],
        0.3,
      ),
      carbon,
      'linked graphite displacement hull',
    ),
    'bulwark-armored-undertray',
  );

  // The formed lower bow and three upper plates sweep continuously across the
  // width. Genuine joints expose a recessed graphite shield seat behind them.
  function shield(u0, u1, v0, v1, recess = 0, cheek = false) {
    return formedSolid(
      (a, b, c) => {
        const u = T.MathUtils.lerp(u0, u1, (a + 1) / 2);
        let v = T.MathUtils.lerp(v0, v1, (b + 1) / 2);
        if (cheek) v += (0.2 * (1 - v) * (1 - c)) / 2;
        const x = (6 - 0.6 * v) * u,
          y = 0.1 + 3.7 * v;
        const front =
          10 -
          2.2 * Math.max(0, (v - 0.08) / 0.92) -
          (3.8 - 1.4 * v) * u * u -
          recess;
        const rear = 3.1 + 0.7 * v + 0.08 * u * u + recess;
        return [x, y, T.MathUtils.lerp(rear, front, (c + 1) / 2)];
      },
      0.055,
      [24, 12, 8],
    );
  }
  tag(
    add(
      shield(-1, 1, 0, 0.29),
      porcelain,
      'formed porcelain lower shield carrier',
    ),
    'bulwark-shield-foundation',
  );
  add(
    shield(-0.975, 0.975, 0.27, 0.36, 0.08),
    carbon,
    'forward shield thermal isolation seat',
  );
  const shieldCrownHeight = (t) =>
    t < 1 / 3
      ? 3.57 + 0.09 * Math.sin(t * 1.5 * Math.PI)
      : t <= 5 / 12
        ? 3.66
        : t <= 2 / 3
          ? T.MathUtils.lerp(3.66, 2.48, (t - 5 / 12) * 4)
          : T.MathUtils.lerp(2.48, 1.51, (t - 2 / 3) * 3);
  function shieldHood(u0, u1, tStart = 0) {
    return formedSolid(
      (a, b, c) => {
        const t = T.MathUtils.lerp(tStart, 1, (c + 1) / 2),
          cutin = 0.1 * (1 - T.MathUtils.smoothstep(t, 0, 0.35));
        const u = T.MathUtils.lerp(
          u0 > 0 ? u0 + cutin : u0,
          u1 < 0 ? u1 - cutin : u1,
          (a + 1) / 2,
        );
        const x = (5.4 + 0.45 * t) * u;
        const front = 9.92 - 3.67 * u * u,
          rear = 3.8 + 0.08 * u * u;
        const pressedWidth =
          1 - T.MathUtils.smoothstep(Math.abs(a), 0.61, 0.82);
        const pressedLength =
          T.MathUtils.smoothstep(t, 0.5, 0.58) *
          (1 - T.MathUtils.smoothstep(t, 0.86, 0.94));
        const pressedField = 0.23 * pressedWidth * pressedLength;
        const hem = T.MathUtils.smoothstep(t, 0.89, 1);
        return [
          x,
          shieldCrownHeight(t) - pressedField + b * (0.14 + 0.04 * hem),
          T.MathUtils.lerp(rear, front, t) - 0.06 * (1 - b) * hem,
        ];
      },
      0.045,
      [20, 4, 24],
    );
  }
  function integratedShieldSideHood(side) {
    const firstPart = body.children.length;
    const map = (x, d, height) => {
      const t = d / 6,
        u = x / 5.4;
      return [
        (5.4 + 0.45 * t) * u,
        shieldCrownHeight(t) + height,
        T.MathUtils.lerp(3.8 + 0.08 * u * u, 9.92 - 3.67 * u * u, t),
      ];
    };
    const outline = [
      [2.45, 0],
      [5.17, 0],
      [5.319, 0.2],
      [5.319, 2.22],
      [5.17, 2.4],
      [2.106, 2.4],
      [2.106, 0.8],
    ];
    const opening = [
      [2.8, 0.82],
      [2.97, 0.65],
      [4.25, 0.65],
      [4.42, 0.82],
      [4.42, 1.78],
      [4.25, 1.95],
      [2.97, 1.95],
      [2.8, 1.78],
    ];
    const seat = [
      [2.7, 0.78],
      [2.93, 0.55],
      [4.29, 0.55],
      [4.52, 0.78],
      [4.52, 1.82],
      [4.29, 2.05],
      [2.93, 2.05],
      [2.7, 1.82],
    ];
    const contour = (points) =>
      points.map(([x, d]) => {
        const point = map(x, d, 0);
        return [point[0], point[2]];
      });
    const height = (x, z) => {
      let t = (z - 3.8) / 4;
      for (let iteration = 0; iteration < 8; iteration++) {
        const width = 5.4 + 0.45 * t,
          u = x / width,
          du = (-0.45 * x) / (width * width);
        const value = 3.8 + 0.08 * u * u + t * (6.12 - 3.75 * u * u) - z;
        t -= value / (6.12 - 3.75 * u * u + (0.16 - 7.5 * t) * u * du);
      }
      return shieldCrownHeight(t);
    };
    // Form in actual X/Z metres, so even narrow source triangles cannot fold
    // under the swept plan mapping. Only their height changes after refinement.
    const worldOpening = contour(opening);
    foldedSkin(
      contour(outline),
      0.28,
      (x, z, depth) => [x, height(x, z) + 0.08 + depth - 0.28, z],
      ochre,
      'shield shoulder formed armor with recessed cooling aperture',
      { holes: [worldOpening], bevel: 0.06 },
    );
    foldedSkin(
      contour(seat),
      0.42,
      (x, z, depth) => [x, height(x, z) - 0.16 + depth - 0.42, z],
      carbon,
      'shield shoulder recessed cooling duct walls',
      { holes: [worldOpening], bevel: 0.025 },
    );
    foldedSkin(
      worldOpening,
      0.08,
      (x, z, depth) => [x, height(x, z) - 0.34 + depth - 0.08, z],
      chamber,
      'shield shoulder deep cooling duct floor',
      { bevel: 0.02 },
    );
    for (let vane = 0; vane < 6; vane++) {
      const d = 0.84 + vane * 0.18;
      const vertices = [2.94, 4.28].flatMap((x) =>
        [d - 0.055, d + 0.055].flatMap((z) =>
          [-0.225, -0.095].flatMap((height) => map(x, z, height)),
        ),
      );
      add(
        createBeveledBossPart(vertices, { radius: 0.012 }),
        cuff,
        'shield shoulder seated thermal exchanger vane',
      );
    }
    add(
      shieldHood(0.39, 0.985, 0.42),
      ochre,
      'shield shoulder separate formed forward blade',
    );
    if (side < 0)
      for (const part of body.children.slice(firstPart)) {
        part.applyMatrix4(new T.Matrix4().makeScale(-1, 1, 1));
        part.name = part.name.replace(
          'Bulwark / shield',
          'Bulwark / port shield',
        );
      }
  }
  for (const [index, [u0, u1]] of [
    [-0.985, -0.39],
    [-0.37, 0.37],
    [0.39, 0.985],
  ].entries()) {
    if (index === 1)
      tag(
        add(shieldHood(u0, u1), ochre, 'central formed hollow shield hood'),
        'bulwark-sloped-shield-crown',
      );
    else integratedShieldSideHood(index === 0 ? -1 : 1);
  }
  // A single formed bulkhead links the three shield hoods to their carrier.
  // The three through-cut bays are real apertures, with deep machinery behind.
  const bulkhead = new T.Shape();
  const outline = [
    [-5.3, 1.5],
    [-5.5, 2.1],
    [-5.15, 3.46],
    [-2.15, 3.46],
    [-1.8, 3.53],
    [1.8, 3.53],
    [2.15, 3.46],
    [5.15, 3.46],
    [5.5, 2.1],
    [5.3, 1.5],
  ];
  outline.reverse().forEach((point, index) => {
    if (index) bulkhead.lineTo(...point);
    else bulkhead.moveTo(...point);
  });
  bulkhead.closePath();
  for (const [left, right, bottom, top] of [
    [-4.94, -2.45, 1.95, 3.19],
    [-1.68, 1.68, 1.85, 3.14],
    [2.45, 4.94, 1.95, 3.19],
  ]) {
    const aperture = new T.Path();
    aperture.moveTo(left, bottom);
    aperture.lineTo(left, top);
    aperture.lineTo(right, top);
    aperture.lineTo(right, bottom);
    aperture.closePath();
    bulkhead.holes.push(aperture);
  }
  add(
    new T.ExtrudeGeometry(bulkhead, {
      depth: 0.61,
      steps: 1,
      bevelEnabled: true,
      bevelSize: 0.055,
      bevelThickness: 0.055,
      bevelSegments: 3,
      curveSegments: 12,
    }),
    carbon,
    'three-bay formed shield structural bulkhead',
    [0, 0, 3.85],
  );
  block(
    [3.3, 1.2, 0.12],
    [0, 2.48, 4.82],
    chamber,
    'recessed shield actuator bay back wall',
    0.05,
  );
  for (const x of [-0.96, 0, 0.96]) {
    add(
      new T.CylinderGeometry(0.28, 0.28, 0.91, 24),
      cuff,
      'shield actuator pressure cylinder',
      [x, 2.47, 4.46],
    );
    for (const y of [2.07, 2.87])
      add(
        new T.CylinderGeometry(0.32, 0.32, 0.12, 24),
        brass,
        'shield actuator seated pressure cap',
        [x, y, 4.46],
      );
    block(
      [0.22, 0.5, 0.15],
      [x, 2.47, 4.13],
      carbon,
      'shield actuator protective spine',
      0.035,
    );
  }
  block(
    [3.6, 0.18, 0.65],
    [0, 1.74, 4.3],
    service,
    'shield actuator integrated lower cradle',
    0.045,
  );
  for (const side of [-1, 1]) {
    block(
      [0.2, 0.65, 0.9],
      [side * 5.9, 0.75, 5.65],
      brass,
      'shield cheek load shoe',
      0.065,
    );
    const ribs = [
      side * 1.95,
      1.24,
      4.05,
      side * 2.35,
      1.24,
      4.05,
      side * 1.95,
      3.43,
      4.05,
      side * 2.35,
      3.43,
      4.05,
      side * 1.95,
      1.24,
      6.4,
      side * 2.35,
      1.24,
      6.4,
      side * 1.95,
      3.1,
      6.4,
      side * 2.35,
      3.1,
      6.4,
    ];
    add(
      createBeveledBossPart(ribs, { radius: 0.08 }),
      carbon,
      'shield hood load-bearing inner rib',
    );
    const cheek = [
      side * 4.95,
      1.25,
      4.1,
      side * 5.27,
      1.25,
      4.1,
      side * 4.95,
      3.4,
      4.1,
      side * 5.27,
      3.4,
      4.1,
      side * 5.12,
      1.25,
      5.3,
      side * 5.38,
      1.25,
      5.3,
      side * 5.12,
      3.1,
      5.3,
      side * 5.38,
      3.1,
      5.3,
      side * 5.42,
      1.25,
      6.3,
      side * 5.68,
      1.25,
      6.3,
      side * 5.42,
      1.5,
      6.3,
      side * 5.68,
      1.5,
      6.3,
    ];
    add(
      createBeveledBossPart(cheek, { radius: 0.06 }),
      carbon,
      'inset load-bearing shield outer cheek',
    );
    block(
      [2.65, 1.3, 0.13],
      [side * 3.7, 2.57, 4.78],
      chamber,
      'deep integrated shield intake back wall',
      0.04,
    );
    repeatedBlocks(
      [2.43, 0.16, 0.62],
      Array.from({ length: 4 }, (_, vane) => [
        [side * 3.7, 2.12 + vane * 0.33, 4.3],
        [-0.26, 0, 0],
      ]),
      cuff,
      'shield bulkhead recessed intake louvers',
    );
  }

  const deck = formedSolid(
    (a, b, c) => [
      a * (2.65 + 0.15 * (1 - c * c)),
      1.65 + b * 0.2 + 0.08 * (1 - a * a),
      c * 6.65 - 3.1,
    ],
    0.07,
    [14, 4, 18],
  );
  tag(
    add(deck, carbon, 'central structural deck and stern lintel'),
    'bulwark-aft-engine-bank',
  );
  for (const side of [-1, 1])
    add(
      formedSolid(
        (a, b, c) => [
          side * 1.43 + a * 1.11,
          1.97 + b * 0.12 + 0.14 * (1 - a * a),
          c * 1.2 - 8.25,
        ],
        0.065,
        [12, 4, 10],
      ),
      carbon,
      'seated stern drive service cover',
    );
  add(
    loft(
      [
        [-6.8, 0, 0.7, 1.83, 0.18],
        [-5.9, 0, 0.83, 1.95, 0.3],
        [-4.1, 0, 1.15, 2.02, 0.32],
        [-3.25, 0, 1.4, 2.06, 0.27],
      ],
      0.24,
    ),
    carbon,
    'stepped central command conduit seat',
  );
  block(
    [5.6, 0.18, 0.28],
    [0, 1.92, -9.56],
    brass,
    'triple drive upper retaining bridge',
    0.05,
  );
  block(
    [4.4, 0.15, 0.24],
    [0, 1.9, -6.9],
    service,
    'stepped drive access front sill',
    0.05,
  );
  // Ivory shoulder skins surround open thermal trenches. Metal exchanger vanes
  // are seated below paired retaining rails, never painted onto the roof.
  for (const side of [-1, 1]) {
    const label = side < 0 ? 'port' : 'starboard';
    if (side < 0) authoredPortShoulder();
    else mirroredStarboardShoulder();
    add(
      loft(
        [
          [-1.57, side * 4.8, 1.08, 1.23, 1.03],
          [1.7, side * 4.75, 1.05, 1.22, 1.08],
          [4.3, side * 4.65, 1.06, 1.12, 0.99],
        ],
        0.23,
      ),
      porcelain,
      `${label} forward formed shoulder skin`,
    );
    add(
      loft(
        [
          [-6.5, side * 2.43, 0.23, 1.83, 0.31],
          [-5.4, side * 2.43, 0.25, 1.98, 0.29],
          [1.8, side * 2.4, 0.24, 1.96, 0.25],
          [3.1, side * 2.4, 0.23, 1.85, 0.2],
        ],
        0.26,
      ),
      porcelain,
      `${label} raised inboard cooling rail`,
    );
    block(
      [1.02, 0.19, 8.5],
      [side * 3.17, 1.8, -1.9],
      chamber,
      `${label} recessed thermal trench`,
      0.055,
    );
    repeatedBlocks(
      [0.94, 0.3, 0.12],
      Array.from({ length: 25 }, (_, vane) => vane)
        .filter((vane) => vane < 12 || vane > 13)
        .map((vane) => [
          [side * 3.17, 2.02, -5.9 + vane * 0.33],
          [-0.3, 0, 0],
        ]),
      chamber,
      `${label} inclined heat-exchanger vanes`,
    );
    block(
      [1.12, 0.23, 0.4],
      [side * 3.17, 2.13, -1.65],
      porcelain,
      `${label} cooling bank structural cross saddle`,
      0.05,
    );
    for (const z of [-6.42, 2.4])
      block(
        [1.05, 0.24, 0.22],
        [side * 3.17, 2.04, z],
        brass,
        `${label} thermal trench end retainer`,
        0.045,
      );
    const firstTerminal = body.children.length;
    const surround = [
      [2.48, 2.15],
      [3.87, 2.15],
      [3.92, 3.1],
      [3.65, 3.6],
      [2.68, 3.6],
      [2.43, 3.1],
    ];
    const throat = [
      [2.73, 2.32],
      [3.61, 2.32],
      [3.66, 3],
      [3.44, 3.32],
      [2.88, 3.32],
      [2.68, 3],
    ];
    const saddleHeight = (z) =>
      2.1 + 0.16 * T.MathUtils.smoothstep(z, 2.15, 3.6);
    foldedSkin(
      surround,
      0.16,
      (x, z, depth) => [x, saddleHeight(z) + depth - 0.16, z],
      service,
      'fitted tapering shield cooling intake saddle',
      { holes: [throat], bevel: 0.05 },
    );
    foldedSkin(
      throat,
      0.12,
      (x, z, depth) => [x, 1.92 + depth - 0.12, z],
      chamber,
      'shield cooling saddle recessed turning floor',
      { bevel: 0.025 },
    );
    for (const [z, width] of [
      [2.47, 0.81],
      [2.76, 0.74],
      [3.02, 0.6],
    ]) {
      const vane = block(
        [width, 0.13, 0.13],
        [3.17, 2.08, z],
        cuff,
        'shield cooling saddle seated turning vane',
        0.025,
      );
      vane.rotation.x = -0.2;
    }
    if (side < 0)
      for (const part of body.children.slice(firstTerminal)) {
        part.applyMatrix4(new T.Matrix4().makeScale(-1, 1, 1));
        part.name = part.name.replace('Bulwark / ', 'Bulwark / port ');
      }
    add(
      loft(
        [
          [-1.3, side * 5.73, 0.2, 0.84, 0.46],
          [2.4, side * 5.67, 0.2, 0.82, 0.46],
          [4.7, side * 5.58, 0.19, 0.84, 0.45],
        ],
        0.3,
      ),
      service,
      `${label} lower impact strake`,
    );
  }

  tag(
    add(
      loft(
        [
          [-3.35, 0, 1.53, 2.05, 0.24],
          [-2.7, 0, 1.62, 2.14, 0.29],
          [-1.2, 0, 1.54, 2.13, 0.3],
          [0.3, 0, 1.27, 2.03, 0.25],
          [1.65, 0, 0.92, 1.93, 0.2],
          [2.85, 0, 0.58, 1.83, 0.14],
        ],
        0.2,
      ),
      carbon,
      'taut stepped command citadel carrier',
    ),
    'bulwark-command-citadel',
  );
  add(
    loft(
      [
        [-3.07, 0, 1.35, 2.22, 0.13],
        [-1.8, 0, 1.45, 2.32, 0.15],
        [0.5, 0, 1.08, 2.12, 0.14],
        [1.8, 0, 0.81, 2.02, 0.12],
        [2.5, 0, 0.54, 1.95, 0.1],
      ],
      0.2,
    ),
    brass,
    'substantial bonded command frame and gasket seat',
  );
  const gasketOuter = [
    [-1.36, -3.05],
    [1.36, -3.05],
    [1.52, -1.75],
    [0.76, 1.85],
    [0.52, 2.5],
    [-0.52, 2.5],
    [-0.76, 1.85],
    [-1.52, -1.75],
  ];
  const gasketInner = [
    [-1.2, -2.91],
    [1.2, -2.91],
    [1.34, -1.75],
    [0.6, 1.79],
    [0.38, 2.35],
    [-0.38, 2.35],
    [-0.6, 1.79],
    [-1.34, -1.75],
  ];
  const glazingSeatHeight = (z) =>
    z <= -1.75
      ? T.MathUtils.lerp(2.22, 2.33, (z + 3.05) / 1.3)
      : z <= 1.85
        ? T.MathUtils.lerp(2.33, 2.04, (z + 1.75) / 3.6)
        : T.MathUtils.lerp(2.04, 1.95, (z - 1.85) / 0.65);
  foldedSkin(
    gasketOuter,
    0.12,
    (x, z, depth) => [x, glazingSeatHeight(z) + 0.1 + depth - 0.12, z],
    gasket,
    'continuous bonded command glazing gasket',
    { holes: [gasketInner], bevel: 0.025 },
  );
  const glassRings = [
    [-2.95, 1.18, 2.25, 0.91, 2.85],
    [-1.8, 1.3, 2.34, 0.9, 3.19],
    [1.8, 0.65, 2.04, 0.45, 2.36],
    [2.38, 0.42, 1.97, 0.28, 2.13],
  ];
  const glazingVertices = glassRings.flatMap(
    ([z, width, low, roofWidth, high]) => [
      -width,
      low,
      z,
      width,
      low,
      z,
      roofWidth,
      high,
      z,
      -roofWidth,
      high,
      z,
    ],
  );
  add(
    createBeveledBossPart(glazingVertices, { radius: 0.045 }),
    glass,
    'faceted bonded command glazing',
  );
  for (const side of [-1, 1]) {
    const roofPoints = glassRings.map(([z, , , width, high]) => [
      side * width,
      high + 0.015,
      z,
    ]);
    for (let i = 0; i < roofPoints.length - 1; i++)
      strut(
        roofPoints[i],
        roofPoints[i + 1],
        0.17,
        brass,
        'formed command roof edge pressure frame',
      );
    const [z, width, low, roofWidth, high] = glassRings[1];
    strut(
      [side * width, low, z],
      [side * roofWidth, high, z],
      0.2,
      brass,
      'command canopy rear pressure pillar',
    );
    const section = (z, inner, outer, low, high) => [
      side * inner,
      low,
      z,
      side * outer,
      low,
      z,
      side * inner,
      high,
      z,
      side * outer,
      high - 0.15,
      z,
    ];
    add(
      createBeveledBossPart(
        [
          ...section(-3.05, 1.06, 1.55, 1.95, 2.3),
          ...section(-1.8, 1.22, 1.83, 1.94, 2.55),
          ...section(1.75, 0.65, 1.1, 1.8, 2.14),
        ],
        { radius: 0.075 },
      ),
      porcelain,
      'load-bearing command glazing shoulder seat',
    );
  }
  strut(
    [-0.9, 3.205, -1.8],
    [0.9, 3.205, -1.8],
    0.2,
    brass,
    'command canopy transverse roof pressure frame',
  );
  block(
    [2.5, 0.19, 0.34],
    [0, 2.22, -3.14],
    brass,
    'command rear pressure seal',
    0.045,
  );

  function drive(x, y, side, scale = 1) {
    const assembly = new T.Group();
    assembly.name = `Bulwark / ${side} integrated drive assembly`;
    assembly.position.set(x, y, -10);
    assembly.scale.setScalar(scale);
    body.add(assembly);
    const shape = new T.Shape(),
      w = 1.23,
      h = 1.005,
      r = 0.33;
    const outline = [
      [-w + r, -h],
      [w - r, -h],
      [w, -h + r],
      [w, h - r],
      [w - r, h],
      [-w + r, h],
      [-w, h - r],
      [-w, -h + r],
    ];
    shape.moveTo(...outline[0]);
    outline.slice(1).forEach((p) => shape.lineTo(...p));
    shape.closePath();
    const hole = new T.Path();
    hole.absarc(0, 0, 0.89, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const cowl = new T.ExtrudeGeometry(shape, {
      depth: 1.65,
      steps: 8,
      bevelEnabled: true,
      bevelSegments: 4,
      bevelSize: 0.045,
      bevelThickness: 0.045,
      curveSegments: 24,
    });
    const p = cowl.attributes.position,
      n = cowl.attributes.normal,
      corrected = new T.Vector3();
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i) + 0.225,
        t = T.MathUtils.clamp(z / 2.86, 0, 1);
      const sx = 1 + 0.08 * Math.sin(t * Math.PI),
        sy = 1 + 0.045 * Math.sin(t * Math.PI);
      const dx = ((p.getX(i) * 0.08 * Math.PI) / 2.86) * Math.cos(t * Math.PI);
      const dy = ((p.getY(i) * 0.045 * Math.PI) / 2.86) * Math.cos(t * Math.PI);
      corrected
        .set(
          n.getX(i) / sx,
          n.getY(i) / sy,
          n.getZ(i) - (dx * n.getX(i)) / sx - (dy * n.getY(i)) / sy,
        )
        .normalize();
      n.setXYZ(i, corrected.x, corrected.y, corrected.z);
      p.setXYZ(i, p.getX(i) * sx, p.getY(i) * sy, z);
    }
    add(
      cowl,
      cuff,
      `${side} exposed octagonal cold pressure cuff`,
      [0, 0, 0],
      assembly,
    );
    // A broad machined octagonal collar owns the opening. The painted roof and
    // cheek plates overlap its long cold cuff, exposing a real structural step.
    const collarRings = [
      { octagon: 1.065, depth: 0.31 },
      { octagon: 0.98, depth: 0 },
      { circle: 0.9, depth: 0 },
      { circle: 0.715, depth: 0.33 },
    ];
    const positions = [],
      indices = [],
      collarUV = [],
      radial = settings.quality === 'low' ? 64 : 96;
    let profileLength = 0;
    for (let strip = 0; strip < collarRings.length; strip++) {
      const start = positions.length / 3;
      const first = collarRings[strip],
        last = collarRings[(strip + 1) % collarRings.length];
      const sectionLength = Math.hypot(
        (first.circle ?? first.octagon) - (last.circle ?? last.octagon),
        first.depth - last.depth,
      );
      for (const [ringIndex, ring] of [first, last].entries()) {
        for (let step = 0; step <= radial; step++) {
          const angle = (step / radial) * Math.PI * 2;
          const facetAngle =
            ((angle + Math.PI / 8) % (Math.PI / 4)) - Math.PI / 8;
          const radius = ring.circle ?? ring.octagon / Math.cos(facetAngle);
          positions.push(
            Math.cos(angle) * radius,
            Math.sin(angle) * radius,
            ring.depth,
          );
          collarUV.push(angle * 0.9, profileLength + ringIndex * sectionLength);
        }
      }
      for (let step = 0; step < radial; step++) {
        const a = start + step,
          b = a + radial + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
      profileLength += sectionLength;
    }
    const collar = new T.BufferGeometry();
    collar.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    collar.setIndex(indices);
    collar.computeVertexNormals();
    collar.setAttribute('uv', new T.Float32BufferAttribute(collarUV, 2));
    // Inner turned bevel uses exact circular normals, independent of radial
    // tessellation; the octagonal outer mounting section remains intentional.
    const normal = new T.Vector3();
    for (let ring = 0; ring < 2; ring++)
      for (let step = 0; step <= radial; step++) {
        const angle = (step / radial) * Math.PI * 2;
        normal
          .set(-0.33 * Math.cos(angle), -0.33 * Math.sin(angle), -0.185)
          .normalize();
        collar.attributes.normal.setXYZ(
          2 * 2 * (radial + 1) + ring * (radial + 1) + step,
          normal.x,
          normal.y,
          normal.z,
        );
      }
    add(
      collar,
      alloy,
      `${side} broad section machined retaining collar`,
      [0, 0, 0],
      assembly,
    );
    lathe(
      [
        [0.77, 0.33],
        [0.78, 0.65],
        [0.73, 1.35],
        [0.62, 2.05],
        [0.52, 2.55],
        [0.46, 2.55],
        [0.56, 2.03],
        [0.67, 1.33],
        [0.72, 0.63],
        [0.715, 0.33],
        [0.77, 0.33],
      ],
      chamber,
      `${side} deep tapered thermal chamber`,
      assembly,
    );
    for (let band = 0; band < 5; band++) {
      const depth = 0.63 + band * 0.32,
        radius = 0.725 - band * 0.045;
      add(
        new T.TorusGeometry(
          radius,
          0.018,
          6,
          settings.quality === 'low' ? 48 : 64,
        ),
        brass,
        `${side} seated chamber cooling band`,
        [0, 0, depth],
        assembly,
      );
    }
    const back = new T.CircleGeometry(0.48, 48);
    back.rotateY(Math.PI);
    add(back, carbon, `${side} deep chamber backplate`, [0, 0, 2.54], assembly);
    const emitter = new T.SphereGeometry(
      0.26,
      32,
      16,
      0,
      Math.PI * 2,
      Math.PI / 2,
      Math.PI / 2,
    );
    emitter.rotateX(Math.PI / 2);
    add(
      emitter,
      ion,
      `${side} recessed convex ion emitter`,
      [0, 0, 2.43],
      assembly,
    );
    for (const sign of [-1, 1])
      block(
        [0.18, 0.3, 0.6],
        [sign * 1.24, 0, 0.6],
        brass,
        `${side} cowl pressure keeper`,
        0.04,
        assembly,
      );
  }
  drive(-4.2, 1.1, 'L');
  drive(4.2, 1.1, 'R');
  drive(0, 1, 'C', 0.72);
  block(
    [5.6, 0.25, 0.65],
    [0, 0.3, -9.35],
    carbon,
    'stern linked lower pressure beam',
    0.09,
  );
  for (const side of [-1, 1]) {
    block(
      [1.65, 1.05, 0.12],
      [side * 1.95, 1.05, -9.5],
      chamber,
      'stern recessed cooling intake',
      0.04,
    );
    repeatedBlocks(
      [0.12, 0.88, 0.23],
      Array.from({ length: 6 }, (_, vane) => [
        [side * (1.26 + vane * 0.26), 1.05, -9.66],
        [0, side * 0.22, 0],
      ]),
      brass,
      'stern folded cooling stators',
    );
  }
  for (const [x, y, side] of [
    [-4.2, 1.1, 'L'],
    [4.2, 1.1, 'R'],
    [0, 1, 'C'],
  ]) {
    const anchor = new T.Group();
    anchor.name = `Exhaust_${side}`;
    anchor.position.set(x, y, -10);
    group.add(anchor);
  }
  // Preserve contact masses, closed formed skins and instanced exchangers as
  // inspectable nodes. Bake only static fittings, preserving authored UVs and
  // normals; reflected parts need their winding reversed after baking.
  body.updateMatrixWorld(true);
  const fittings = [],
    materialBatches = new Map();
  let sourceMeshes = 0;
  body.traverse((mesh) => {
    if (!mesh.isMesh) return;
    sourceMeshes++;
    if (
      mesh.isInstancedMesh ||
      mesh.userData.contactPart ||
      mesh.userData.closedFormedSkin
    )
      return;
    fittings.push(mesh);
    if (!materialBatches.has(mesh.material))
      materialBatches.set(mesh.material, []);
    let geometry = mesh.geometry.clone();
    if (geometry.index) {
      const flat = geometry.toNonIndexed();
      geometry.dispose();
      geometry = flat;
    }
    geometry.applyMatrix4(mesh.matrixWorld);
    if (mesh.matrixWorld.determinant() < 0)
      for (
        let triangle = 0;
        triangle < geometry.attributes.position.count;
        triangle += 3
      )
        for (const attribute of Object.values(geometry.attributes))
          for (let component = 0; component < attribute.itemSize; component++) {
            const a = (triangle + 1) * attribute.itemSize + component,
              b = (triangle + 2) * attribute.itemSize + component;
            const value = attribute.array[a];
            attribute.array[a] = attribute.array[b];
            attribute.array[b] = value;
          }
    materialBatches.get(mesh.material).push({ geometry, name: mesh.name });
  });
  fittings.forEach((mesh) => mesh.removeFromParent());
  for (const [material, parts] of materialBatches) {
    const geometry = mergeGeometries(parts.map((part) => part.geometry));
    parts.forEach((part) => part.geometry.dispose());
    const mesh = add(
      geometry,
      material,
      `static ${material.name.replace('Bulwark / ', '')}`,
    );
    mesh.userData.authoredParts = parts.map((part) => part.name);
  }
  const referenced = new Set();
  body.traverse((mesh) => {
    if (mesh.geometry) referenced.add(mesh.geometry);
  });
  for (const geometry of geometries)
    if (!referenced.has(geometry)) {
      geometry.dispose();
      geometries.delete(geometry);
    }
  let renderMeshes = 0;
  body.traverse((mesh) => {
    if (mesh.isMesh) renderMeshes++;
  });
  const bounds = new T.Box3().setFromObject(body);
  group.userData = {
    rivalId: 'bulwark',
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    source: 'source-authored-bulwark-v2',
    hullSha256: BULWARK_HULL.hullSha256,
    blockout: false,
    artStage: 'finished-pressed-shield-and-bonded-glazing-r10',
    concept: 'docs/art/bosses/bulwark-concept-v1.png',
    batching: { sourceMeshes, renderMeshes },
  };
  const propulsion = createRivalPropulsion(group, settings);
  const plumeScale = new T.Vector3(2.05, 2.05, 1.6);
  let disposed = false;
  const update = (frame = {}) => {
    if (disposed) return;
    propulsion.update(frame);
    fitBossPropulsion(propulsion, frame, plumeScale, [0.83, 0.83, 0.72]);
  };
  update();
  return {
    group,
    specification: SPECIFICATION,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      propulsion.dispose();
      instances.forEach((mesh) => mesh.dispose());
      geometries.forEach((geometry) => geometry.dispose());
      finish.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}
