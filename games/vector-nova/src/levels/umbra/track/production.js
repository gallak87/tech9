import * as THREE from 'three';
import { finishUmbraMaterial } from '../environment/materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  sweepGeometry,
  boxProfile,
  beamTransform,
} from '../../../track/geometry.js';
import { framePoint } from '../../../track/frames.js';
import { tidalResponse } from './forces.js';
import { selectPracticalFixtures } from '../../../track/lighting.js';

function panelGeometry(track) {
  const positions = [];
  const normals = [];
  const colors = [];
  const uvs = [];
  const roadCoord = [];
  const cassetteUvs = [];
  const triangle = (vertices, color, coordinates, panel, surfaceNormals) => {
    const normal = new THREE.Vector3()
      .crossVectors(
        vertices[1].clone().sub(vertices[0]),
        vertices[2].clone().sub(vertices[0]),
      )
      .normalize();
    for (const [index, vertex] of vertices.entries()) {
      positions.push(...vertex.toArray());
      normals.push(...(surfaceNormals?.[index] ?? normal).toArray());
      colors.push(color.r, color.g, color.b);
      uvs.push(...coordinates[index]);
      roadCoord.push(coordinates[index][1], coordinates[index][0]);
      cassetteUvs.push(...panel[index]);
    }
  };
  for (const [start, end] of track.solidRuns) {
    for (let from = start; from < end; from += 18) {
      const to = Math.min(end, from + 18);
      const section = track.sections.find(
        (entry) => from >= entry.start && from < entry.end,
      );
      const landing = track.jumps.some(
        (jump) => from >= jump.landingStart && from < jump.landingStart + 110,
      );
      const launch = track.jumps.some(
        (jump) => from > jump.takeoff - 85 && from < jump.takeoff,
      );
      const bounds =
        section.id === 'event-fold' ? [-14, -8, 8, 14] : [-14, -5.7, 5.7, 14];
      for (let column = 0; column < bounds.length - 1; column += 1) {
        const x0 = bounds[column] + 0.085;
        const x1 = bounds[column + 1] - 0.085;
        const shade =
          landing || launch
            ? column === 1
              ? 0x819395
              : 0xb4b9ab
            : section.id === 'broken-meridian' &&
                (Math.floor(from / 18) + column) % 7 === 0
              ? 0x64716e
              : section.id === 'event-fold' && column !== 1
                ? 0x64757d
                : [0x3c4649, 0x343c40, 0x434b4b][column];
        const color = new THREE.Color(shade).multiplyScalar(
          0.91 + ((Math.floor(from / 18) + column * 3) % 5) * 0.035,
        );
        const along = Math.max(1, Math.ceil((to - from) / 6));
        for (let row = 0; row < along; row += 1) {
          const a = THREE.MathUtils.lerp(from + 0.08, to - 0.08, row / along);
          const b = THREE.MathUtils.lerp(
            from + 0.08,
            to - 0.08,
            (row + 1) / along,
          );
          const fa = track.sample(a);
          const fb = track.sample(b);
          const mid = (x0 + x1) / 2;
          for (const [left, right, leftY, rightY] of [
            [x0, x0 + 0.14, 0.003, 0.06],
            [x0 + 0.14, mid, 0.06, 0.065],
            [mid, x1 - 0.14, 0.065, 0.06],
            [x1 - 0.14, x1, 0.06, 0.003],
          ]) {
            const p = [
              framePoint(fa, left, leftY),
              framePoint(fb, left, leftY),
              framePoint(fa, right, rightY),
              framePoint(fb, right, rightY),
            ];
            const slope = (rightY - leftY) / (right - left);
            const na = fa.up
              .clone()
              .addScaledVector(fa.right, -slope)
              .normalize();
            const nb = fb.up
              .clone()
              .addScaledVector(fb.right, -slope)
              .normalize();
            const edge = left === x0 || right === x1;
            const finish = edge ? color.clone().multiplyScalar(1.16) : color;
            const U = (x) => (x - x0) / (x1 - x0),
              V = (z) => (z - from) / (to - from);
            triangle(
              [p[0], p[1], p[2]],
              finish,
              [
                [left, a],
                [left, b],
                [right, a],
              ],
              [
                [U(left), V(a)],
                [U(left), V(b)],
                [U(right), V(a)],
              ],
              [na, nb, na],
            );
            triangle(
              [p[2], p[1], p[3]],
              finish,
              [
                [right, a],
                [left, b],
                [right, b],
              ],
              [
                [U(right), V(a)],
                [U(left), V(b)],
                [U(right), V(b)],
              ],
              [na, nb, nb],
            );
          }
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute(
    'roadCoord',
    new THREE.Float32BufferAttribute(roadCoord, 2),
  );
  geometry.setAttribute(
    'umbraCassette',
    new THREE.Float32BufferAttribute(cassetteUvs, 2),
  );
  geometry.computeBoundingSphere();
  return geometry;
}

// The deck is an engineered graphite ribbon: continuous curb, broad faceted
// panels, unequal suspended boundary leaves and two exposed tension spines.
export function buildUmbraRoad(
  track,
  { shape = false, surfaceTexture = null } = {},
) {
  const group = new THREE.Group();
  group.name = shape
    ? 'Umbra Fold / neutral shape'
    : 'Umbra Fold / graphite observatory raceway';
  const geometries = new Set();
  const materials = new Set();
  const makeMaterial = (parameters) => {
    const Material =
      'anisotropy' in parameters
        ? THREE.MeshPhysicalMaterial
        : THREE.MeshStandardMaterial;
    const material = new Material(parameters);
    materials.add(material);
    return material;
  };
  const graphite = makeMaterial({
    color: shape ? 0x626f77 : 0x273139,
    roughness: 0.63,
    metalness: 0.24,
  });
  const panel = makeMaterial({
    color: 0xffffff,
    vertexColors: true,
    anisotropy: 0.28,
    anisotropyRotation: Math.PI / 2,
    roughness: 0.66,
    metalness: 0.38,
  });
  const metal = makeMaterial({
    color: shape ? 0x91a0a7 : 0x7c929e,
    roughness: 0.38,
    metalness: 0.7,
  });
  const formedMetal = shape
    ? metal
    : makeMaterial({
        color: 0x73838a,
        anisotropy: 0.28,
        roughness: 0.52,
        metalness: 0.76,
      });
  const pale = makeMaterial({
    color: 0xc5c9b8,
    roughness: 0.8,
    metalness: 0.12,
  });
  const underside = makeMaterial({
    color: 0x3d4c5b,
    roughness: 0.43,
    metalness: 0.54,
  });
  const guide = makeMaterial({
    color: 0xc9eaf0,
    emissive: 0x729cac,
    emissiveIntensity: shape ? 0 : 0.65,
    roughness: 0.45,
    metalness: 0.25,
  });
  const amber = makeMaterial({
    color: 0xedbd70,
    emissive: 0xd78a38,
    emissiveIntensity: shape ? 0 : 0.9,
    roughness: 0.43,
  });
  const repair = makeMaterial({
    color: 0x746256,
    roughness: 0.72,
    metalness: 0.35,
  });
  if (!shape) {
    for (const material of [graphite, underside, repair])
      finishUmbraMaterial(material, 'graphite', surfaceTexture);
    finishUmbraMaterial(panel, 'deck', surfaceTexture);
    finishUmbraMaterial(metal, 'metal', surfaceTexture);
    finishUmbraMaterial(formedMetal, 'plate', surfaceTexture);
    finishUmbraMaterial(pale, 'stone', surfaceTexture);
  }
  const mesh = (name, geometry, material) => {
    geometries.add(geometry);
    const result = new THREE.Mesh(geometry, material);
    result.name = name;
    result.receiveShadow = true;
    result.castShadow = true;
    group.add(result);
    return result;
  };
  const sweep = (name, profile, material, step = 3) => {
    const parts = track.solidRuns.map(([start, end]) =>
      sweepGeometry(track, profile, { start, end, step }),
    );
    const geometry = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    return mesh(name, geometry, material);
  };
  const half = track.width / 2;
  const road = sweep(
    'Graphite deck backing / real open jump intervals',
    [
      [-half, shape ? 0 : -0.12],
      [half, shape ? 0 : -0.12],
    ],
    graphite,
    2,
  );
  road.userData.drivingSurface = true;
  road.userData.roadSurface = true;
  road.userData.solidRuns = track.solidRuns.map((range) => [...range]);
  sweep(
    'Deep faceted deck sides and bottom',
    [
      [half, -0.13],
      [half + 0.45, -1.6],
      [11, -3.2],
      [-11, -3.2],
      [-half - 0.45, -1.6],
      [-half, -0.13],
    ],
    underside,
    6,
  );
  if (!shape) {
    const panels = mesh(
      'Broad segmented graphite facets and pale landing patches',
      panelGeometry(track),
      panel,
    );
    panels.userData.drivingSurface = true;
    panels.userData.roadSurface = true;
  }
  for (const side of [-1, 1]) {
    sweep(
      'Cold metal edge band',
      [
        [side * (half - 0.85) - 0.27, 0.08],
        [side * (half - 0.85) + 0.27, 0.08],
      ],
      metal,
      2,
    );
    sweep(
      'Recessed continuous luminous guide',
      boxProfile(side * (half - 0.18), 0.12, 0.21, 0.08),
      guide,
      3,
    );
    sweep(
      'Low continuous impact curb',
      boxProfile(side * (half + 0.42), 0.61, 0.7, 1.22),
      metal,
      4,
    );
    if (!shape) {
      const spineProfile = [
        [side * 7.7, -2.9],
        [side * 9.7, -5.8],
        [side * 8.7, -7.1],
        [side * 7.5, -5.8],
        [side * 7.7, -2.9],
      ];
      if (side < 0) spineProfile.reverse();
      sweep('Paired graphite tension spine', spineProfile, underside, 6);
      sweep(
        'Lit tension line on exposed deck bottom',
        boxProfile(side * 8.6, -7.15, 0.2, 0.13),
        guide,
        6,
      );
    }
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  // Explicit unit tangents keep stretched cassette faces orthonormal. The
  // UV-derivative fallback shortens one axis on these long, narrow instances.
  box.computeTangents();
  geometries.add(box);
  // Closed pressed leaves: clipped corners and recessed faces on both sides.
  const profile = [
    [-0.5, -0.38],
    [-0.37, -0.5],
    [0.34, -0.5],
    [0.5, -0.38],
    [0.5, 0.4],
    [0.36, 0.5],
    [-0.37, 0.5],
    [-0.5, 0.38],
  ];
  const leafPositions = [],
    leafIndices = [];
  // A rolled perimeter, sloped reveal and recessed face replace the broad
  // triangular bowl. Open vents reveal the independently mounted inner cassettes.
  for (const side of [-1, 1]) {
    for (const [y, z] of profile) leafPositions.push(side * 0.5, y, z);
    for (const [y, z] of profile)
      leafPositions.push(side * 0.32, y * 0.76, z * 0.89);
    leafPositions.push(side * 0.3, 0, 0);
  }
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    leafIndices.push(i, 8 + i, j, j, 8 + i, 8 + j);
    leafIndices.push(17 + i, 17 + j, 25 + i, 17 + j, 25 + j, 25 + i);
    leafIndices.push(i, j, 17 + i, j, 17 + j, 17 + i);
    leafIndices.push(8 + i, 25 + i, 8 + j, 8 + j, 25 + i, 25 + j);
  }
  const indexedLeaf = new THREE.BufferGeometry();
  indexedLeaf.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(leafPositions, 3),
  );
  indexedLeaf.setIndex(leafIndices);
  const leaf = indexedLeaf.toNonIndexed();
  indexedLeaf.dispose();
  leaf.computeVertexNormals();
  const plateTangents = [];
  for (let i = 0; i < leaf.attributes.normal.count; i++) {
    const n = new THREE.Vector3().fromBufferAttribute(
      leaf.attributes.normal,
      i,
    );
    const t = new THREE.Vector3(0, 0, 1);
    if (Math.abs(n.z) > 0.95) t.set(1, 0, 0);
    t.addScaledVector(n, -t.dot(n)).normalize();
    plateTangents.push(t.x, t.y, t.z, 1);
  }
  leaf.setAttribute(
    'tangent',
    new THREE.Float32BufferAttribute(plateTangents, 4),
  );

  geometries.add(leaf);
  const fixtures = [];
  const instances = new Map();
  const instance = (material, position, quaternion, scale, geometry = box) => {
    const key = geometry.uuid + material.uuid;
    if (!instances.has(key))
      instances.set(key, { material, geometry, transforms: [] });
    instances
      .get(key)
      .transforms.push(
        new THREE.Matrix4().compose(position, quaternion, scale),
      );
  };
  const localBox = (
    material,
    frame,
    x,
    y,
    z,
    width,
    height,
    length,
    tilt = 0,
    geometry = box,
  ) => {
    const q = frame.quaternion
      .clone()
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          tilt,
        ),
      );
    instance(
      material,
      framePoint(frame, x, y, z),
      q,
      new THREE.Vector3(width, height, length),
      geometry,
    );
  };
  const beam = (material, a, b, width, depth = width) => {
    const transform = beamTransform(a, b, width, depth);
    instance(
      material,
      transform.position,
      transform.quaternion,
      transform.scale,
    );
  };
  for (const [start, end] of track.solidRuns) {
    for (
      let distance = start + 12;
      distance < end - 8;
      distance += shape ? 100 : 34
    ) {
      const frame = track.sample(distance);
      const nearLanding = track.jumps.some(
        (jump) =>
          distance > jump.landingStart && distance < jump.landingStart + 160,
      );
      const nearLaunch = track.jumps.some(
        (jump) => distance > jump.takeoff - 180 && distance < jump.takeoff,
      );
      const sideMaterial = nearLanding ? pale : shape ? metal : formedMetal;
      const outside = frame.curvature > 0 ? -1 : 1;
      for (const side of [-1, 1]) {
        const tall = side === outside;
        const height = shape ? 0.9 : tall ? 3.9 : 2.1;
        const x = side * (half + (tall ? 2.2 : 1.5));
        const y = shape ? 1.55 : tall ? 3.65 : 2.65;
        const length = Math.min(tall ? 20 : 12, (end - distance) * 1.2);
        const plateMaterial = nearLaunch ? repair : sideMaterial;
        const opticOffset = new THREE.Vector2(
          -side * 0.38,
          height * 0.32,
        ).rotateAround(new THREE.Vector2(), side * -0.14);
        if (!shape && tall)
          fixtures.push({
            distance,
            position: framePoint(frame, x + opticOffset.x, y + opticOffset.y),
            target: framePoint(frame, 0, 0.2, 5),
            color: nearLaunch ? 0xffd3a1 : 0xc4d8e5,
          });
        localBox(
          plateMaterial,
          frame,
          x,
          y,
          0,
          shape ? 0.5 : 0.65,
          height,
          length,
          side * -0.14,
          shape ? box : leaf,
        );
        if (!shape) {
          const housingBox = (
            material,
            hx,
            hy,
            hz,
            w,
            h,
            l,
            tilt = side * -0.14,
            geometry = box,
          ) => {
            const dx = hx - x,
              dy = hy - y,
              c = Math.cos(tilt),
              s = Math.sin(tilt);
            localBox(
              material,
              frame,
              x + dx * c - dy * s,
              y + dx * s + dy * c,
              hz,
              w,
              h,
              l,
              tilt,
              geometry,
            );
          };
          for (const z of [-length * 0.32, length * 0.32]) {
            beam(
              underside,
              framePoint(frame, side * (half + 0.3), 0.45, z),
              framePoint(frame, x + side * 1.1, y - height * 0.15, z),
              0.36,
              0.55,
            );
            beam(
              metal,
              framePoint(frame, x + side * 1.1, y - height * 0.15, z),
              framePoint(frame, x, y + height * 0.28, z),
              0.25,
              0.35,
            );
          }
          housingBox(
            nearLaunch ? amber : guide,
            x - side * 0.38,
            y + height * 0.32,
            0,
            0.1,
            0.12,
            length * 0.88,
          );
          // Formed perimeter, recessed cassettes and bolted repair patches make
          // the large leaf a manufactured part at ordinary racing distance.
          const faceX = x - side * 0.29;
          for (const dy of [-height * 0.45, height * 0.44]) {
            housingBox(
              underside,
              faceX,
              y + dy,
              0,
              0.23,
              0.16,
              length * 0.81,
              side * -0.14,
            );
            housingBox(
              metal,
              faceX - side * 0.04,
              y + dy + 0.08,
              0,
              0.12,
              0.07,
              length * 0.98,
              side * -0.14,
            );
          }
          for (const z of [-length * 0.47, 0, length * 0.47]) {
            housingBox(
              underside,
              faceX,
              y,
              z,
              0.24,
              height * 0.86,
              0.2,
              side * -0.14,
            );
          }
          for (const z of [-length * 0.24, length * 0.24]) {
            housingBox(
              underside,
              faceX + side * 0.19,
              y,
              z,
              0.12,
              height * 0.56,
              length * 0.43,
              side * -0.14,
            );
            housingBox(
              plateMaterial,
              faceX + side * 0.09,
              y + 0.04,
              z,
              0.12,
              height * 0.5,
              length * 0.4,
              side * -0.14,
              box,
            );
          }
          if (Math.floor(distance / 34) % 3 === 0) {
            housingBox(
              repair,
              faceX - side * 0.16,
              y - height * 0.14,
              length * 0.21,
              0.15,
              height * 0.35,
              length * 0.16,
              side * -0.14,
            );
            for (const z of [length * 0.15, length * 0.27])
              for (const dy of [-height * 0.25, -height * 0.04])
                housingBox(
                  metal,
                  faceX - side * 0.26,
                  y + dy,
                  z,
                  0.1,
                  0.12,
                  0.12,
                  side * -0.14,
                );
          }
          for (const z of [-length * 0.43, length * 0.43])
            for (const dy of [-height * 0.22, height * 0.22])
              housingBox(
                metal,
                faceX - side * 0.025,
                y + dy,
                z,
                0.18,
                0.28,
                0.55,
              );
        }
      }
      if (!shape) {
        beam(
          metal,
          framePoint(frame, -9, -6.2),
          framePoint(frame, 9, -6.2),
          0.8,
          1.3,
        );
        for (const side of [-1, 1]) {
          // Alternating web braces connect each pair of longitudinal spines.
          // They remain below the existing deck envelope through every roll.
          for (const z of [-10, 10]) {
            beam(
              metal,
              framePoint(frame, side * 8, -6.2, z),
              framePoint(frame, side * 12, -3.3, -z),
              0.38,
              0.7,
            );
            localBox(metal, frame, side * 8, -6.4, z, 2.1, 0.45, 2.8);
          }
          localBox(
            repair,
            frame,
            side * 8.6,
            -4.75,
            0,
            3.4,
            3.6,
            2.8,
            side * 0.21,
          );
          beam(
            metal,
            framePoint(frame, side * 7.8, -6),
            framePoint(frame, side * 13.8, -0.9, 5.5),
            0.52,
            0.75,
          );
        }
      }
    }
  }
  // The original grid remains a recognizable depth landmark below Event Fold.
  const grid = track.sample(0);
  for (const side of [-1, 1]) {
    localBox(pale, grid, side * 21, 5.8, 0, 2.6, 11.6, 3.2);
    localBox(amber, grid, side * 21, 11.9, 0, 3.4, 0.5, 4);
    beam(
      metal,
      framePoint(grid, side * 21, -5),
      framePoint(grid, side * 9, -6),
      1.4,
      2.3,
    );
  }
  // Tide instruments use sideways arrows and measured force bars; launch
  // instruments retain their longitudinal runway stripes. The paint follows
  // the actual deck frame, including bank reversals and the inversion exit.
  const tidePaintPositions = [];
  const tidePaintNormals = [];
  const tideCues = [];
  const maximumTide = Math.max(
    ...track.tidalZones.map((zone) => zone.strength),
  );
  const paintStroke = (distance, from, to, breadth = 0.26) => {
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const inverse = breadth / (2 * Math.hypot(dx, dz));
    const corners = [
      [from[0] - dz * inverse, from[1] + dx * inverse],
      [from[0] + dz * inverse, from[1] - dx * inverse],
      [to[0] - dz * inverse, to[1] + dx * inverse],
      [to[0] + dz * inverse, to[1] - dx * inverse],
    ].map(([x, z]) => {
      const frame = track.sample(distance + z);
      return { position: framePoint(frame, x, 0.087), up: frame.up };
    });
    for (const indices of [
      [0, 1, 2],
      [1, 3, 2],
    ]) {
      const vertices = indices.map((index) => corners[index]);
      const normal = new THREE.Vector3().crossVectors(
        vertices[1].position.clone().sub(vertices[0].position),
        vertices[2].position.clone().sub(vertices[0].position),
      );
      if (normal.dot(vertices[0].up) < 0) vertices.reverse();
      for (const vertex of vertices) {
        tidePaintPositions.push(...vertex.position.toArray());
        tidePaintNormals.push(...vertex.up.toArray());
      }
    }
  };
  for (const zone of track.tidalZones) {
    for (
      let distance = zone.start + 6;
      distance < zone.end - 5;
      distance += 24
    ) {
      if ([-4, 0, 4].some((offset) => track.isGap(distance + offset))) continue;
      const frame = track.sample(distance);
      const direction =
        Math.sign(
          track.accretionCenter.clone().sub(frame.position).dot(frame.right),
        ) || 1;
      const response = tidalResponse(track, distance);
      const fraction = THREE.MathUtils.clamp(
        response.strength / maximumTide,
        0,
        1,
      );
      const bars = 1 + Math.floor(fraction * 2.999);
      tideCues.push({
        distance,
        zone: zone.id,
        direction,
        strength: response.strength,
        fraction,
        bars,
      });
      for (const side of [-1, 1]) {
        for (let bar = 0; bar < bars; bar += 1) {
          const x = side * 11;
          const z = (bar - (bars - 1) / 2) * 2.25;
          const tail = x - direction * 0.77;
          const tip = x + direction * 0.77;
          paintStroke(distance, [tail, z - 0.83], [tip, z]);
          paintStroke(distance, [tail, z + 0.83], [tip, z]);
        }
        if (!shape) {
          const x = side * 16.2;
          // A graphite instrument badge sits wholly beyond the usable road;
          // its head-on face makes the lateral arrow readable from chase view.
          localBox(underside, frame, x, 3.9, 0, 2.6, 3.1, 0.32);
          beam(
            metal,
            framePoint(frame, x, 0.8),
            framePoint(frame, x, 2.35),
            0.25,
            0.28,
          );
          for (const vertical of [-0.45, 0.45]) {
            beam(
              amber,
              framePoint(frame, x - direction * 0.62, 4.8 + vertical, -0.2),
              framePoint(frame, x + direction * 0.62, 4.8, -0.2),
              0.16,
              0.12,
            );
          }
          for (let bar = 0; bar < bars; bar += 1) {
            const height = 0.48 + fraction * 0.95;
            localBox(
              amber,
              frame,
              x + (bar - (bars - 1) / 2) * 0.52,
              2.62 + height / 2,
              -0.2,
              0.25,
              height,
              0.1,
            );
          }
        }
      }
    }
    // Twin amber entry uprights and a cool capped exit identify the exact
    // authored interval without constructing a gate above the race corridor.
    for (const [distance, entering] of [
      [zone.start, true],
      [zone.end, false],
    ]) {
      if (track.isGap(distance)) continue;
      const frame = track.sample(distance);
      for (const side of [-1, 1]) {
        for (const offset of [-0.42, 0.42])
          localBox(
            entering ? amber : guide,
            frame,
            side * 15.5 + offset,
            2.7,
            0,
            0.22,
            4.2,
            0.32,
          );
        localBox(
          entering ? amber : guide,
          frame,
          side * 15.5,
          entering ? 0.55 : 4.85,
          0,
          1.06,
          0.22,
          0.32,
        );
      }
    }
  }
  if (tidePaintPositions.length) {
    const paint = new THREE.BufferGeometry();
    paint.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(tidePaintPositions, 3),
    );
    paint.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute(tidePaintNormals, 3),
    );
    paint.computeBoundingSphere();
    mesh(
      'Embedded lateral tide chevrons / measured ramp and ring direction',
      paint,
      amber,
    );
  }
  group.userData.tideCues = tideCues;
  // Amber landing ribs and stacked runway arrows remain visible on both presets.
  for (const jump of track.jumps) {
    for (const distance of [
      jump.takeoff - 90,
      jump.takeoff - 60,
      jump.takeoff - 30,
      jump.takeoff - 8,
      jump.landingStart + 2,
      jump.landingStart + 24,
      jump.landingStart + 48,
    ]) {
      const frame = track.sample(distance);
      const incoming = distance < jump.takeoff;
      for (const side of [-1, 1]) {
        localBox(
          incoming ? amber : guide,
          frame,
          side * 11.6,
          0.14,
          0,
          1.1,
          0.09,
          incoming ? 3.5 : 8,
        );
        if (!shape) {
          localBox(
            pale,
            frame,
            side * 16.3,
            incoming ? 3.7 : 9,
            0,
            1,
            incoming ? 7.4 : 18,
            1,
          );
          localBox(
            incoming ? amber : guide,
            frame,
            side * 16.3,
            incoming ? 7.4 : 18,
            0,
            1.45,
            0.35,
            1.45,
          );
        }
      }
    }
  }
  // Sparse side-mounted survey beacons describe the measured ballistic bend;
  // their open centre preserves the complete airborne corridor.
  if (!shape)
    for (const jump of track.jumps) {
      const launch = track.sample(jump.takeoff);
      const velocity = launch.tangent.clone().multiplyScalar(jump.targetSpeed);
      const acceleration = new THREE.Vector3(...jump.airAcceleration);
      acceleration.y = -26;
      for (const time of [0.42, 0.84, 1.26, 1.65]) {
        const centre = launch.position
          .clone()
          .addScaledVector(velocity, time)
          .addScaledVector(acceleration, 0.5 * time ** 2);
        const tangent = velocity
          .clone()
          .addScaledVector(acceleration, time)
          .normalize();
        const right = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
        const up = tangent.clone().cross(right).normalize();
        const quaternion = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(right, up, tangent),
        );
        for (const side of [-1, 1]) {
          const position = centre
            .clone()
            .addScaledVector(right, side * 19.5)
            .addScaledVector(up, -2.5);
          instance(
            metal,
            position,
            quaternion,
            new THREE.Vector3(0.5, 3.5, 1.1),
          );
          instance(
            amber,
            position.clone().addScaledVector(up, 1.95),
            quaternion,
            new THREE.Vector3(1.05, 0.32, 1.35),
          );
        }
      }
    }
  for (let distance = 20; distance < track.length; distance += 82) {
    if (track.isGap(distance)) continue;
    const frame = track.sample(distance);
    for (const side of [-1, 1]) {
      const a = framePoint(frame, side * 0.8, 0.18, -0.8);
      const b = framePoint(frame, 0, 0.18, 1.5);
      beam(shape ? pale : metal, a, b, 0.1, 0.07);
    }
  }
  // Batch identical guide sweeps while retaining their original world geometry.
  // This pays for richer leaf silhouettes without increasing the road draw cap.
  if (!shape)
    for (const surface of [guide, metal]) {
      const guides = group.children.filter(
        (node) => node.isMesh && node.material === surface,
      );
      const merged = mergeGeometries(guides.map((node) => node.geometry));
      for (const node of guides) {
        group.remove(node);
        geometries.delete(node.geometry);
        node.geometry.dispose();
      }
      merged.computeBoundingSphere();
      mesh(
        surface === guide
          ? 'Embedded navigation guides and lit keel lines'
          : 'Continuous formed metal curbs and bands',
        merged,
        surface,
      );
    }
  for (const { material, geometry, transforms } of instances.values()) {
    const result = new THREE.InstancedMesh(
      geometry,
      material,
      transforms.length,
    );
    result.name =
      'Umbra structural modules / suspended leaves, offset struts and repair nodes';
    transforms.forEach((transform, index) =>
      result.setMatrixAt(index, transform),
    );
    result.computeBoundingSphere();
    result.receiveShadow = true;
    result.castShadow = true;
    group.add(result);
  }
  // The three nearest existing leaf optics cast a continuous grazing pool.
  // Fixture selection fades to zero at handoffs and follows track distance,
  // including inversion, pause and seeded/replayed scenario restoration.
  const practicals = shape
    ? []
    : Array.from({ length: 3 }, () => {
        const light = new THREE.SpotLight(0xc4d8e5, 0, 78, 1.12, 0.85, 2);
        light.name = 'Umbra / recessed roadside optic';
        group.add(light, light.target);
        return light;
      });
  const assignments = Array(practicals.length).fill(-1);
  function update({ state } = {}) {
    if (disposed || !practicals.length || !state) return;
    const selected = selectPracticalFixtures(
      fixtures,
      track.length,
      state.distance,
      20,
    );
    const retained = new Set(selected.map(({ index }) => index)),
      claimed = new Set();
    for (const { index, fixture, weight } of selected) {
      let slot = assignments.indexOf(index);
      if (slot < 0)
        slot = assignments.findIndex(
          (id, i) => !retained.has(id) && !claimed.has(i),
        );
      claimed.add(slot);
      const light = practicals[slot];
      if (assignments[slot] !== index) {
        light.position.copy(fixture.position);
        light.target.position.copy(fixture.target);
        light.color.setHex(fixture.color);
        assignments[slot] = index;
      }
      light.intensity = 460 * weight;
    }
  }
  group.userData.reviewKind = shape ? 'bare-track' : 'production';
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    group.traverse((object) => {
      if (object.isInstancedMesh || object.isLight) object.dispose();
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    geometries.clear();
    materials.clear();
    surfaceTexture?.dispose();
  };
  group.userData.dispose = dispose;
  return {
    group,
    dispose,
    update,
    setReflection(texture) {
      for (const material of materials) {
        material.envMap = texture;
        material.envMapIntensity = material === panel ? 0.48 : 0.62;
        material.needsUpdate = true;
      }
    },
  };
}
