import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  sweepGeometry,
  boxProfile,
  beamTransform,
} from '../../../track/geometry.js';
import { nacreSeabedHeight } from '../environment/seabed.js';
import { applyNacreSurfaceFinish } from './surface-finish.js';
import { createCeramicMaps } from './ceramic-maps.js';
import { nacreDeviceMountHeight } from './device-mount.js';

const point = (frame, x, y, z = 0) =>
  frame.position
    .clone()
    .addScaledVector(frame.right, x)
    .addScaledVector(frame.up, y)
    .addScaledVector(frame.tangent, z);
const solidRuns = (track) => {
  let start = 0;
  const runs = [];
  for (const jump of track.jumps) {
    runs.push([start, jump.takeoff]);
    start = jump.landingStart;
  }
  runs.push([start, track.length]);
  return runs;
};

// Fine source-authored relief belongs on the small sculpted gills. The running
// ceramic uses smooth Physical lobes: broad correlated normal/roughness maps
// produced a repeated angular sheen at chase scale in the actual A/B captures.
function gillNormalMap() {
  const size = 128;
  const normals = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const phase = x * 0.22 + Math.sin(y * 0.087) * 3.2;
      normals.set(
        [
          128 + Math.cos(phase) * 18,
          128 + Math.sin(phase + y * 0.087) * 12,
          252,
          255,
        ],
        i,
      );
    }
  const texture = new THREE.DataTexture(normals, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function ceramicPanels(track, runs) {
  const channels = Object.fromEntries(
    ['ceramic', 'membrane', 'glaze', 'reveal'].map((name) => [
      name,
      {
        positions: [],
        normals: [],
        colors: [],
        uv: [],
        roadCoord: [],
        panel: [],
      },
    ]),
  );
  const addTriangle = (channel, vertices, color) => {
    const output = channels[channel];
    for (const vertex of vertices) {
      output.positions.push(...vertex.position.toArray());
      output.normals.push(...vertex.up.toArray());
      output.colors.push(color.r, color.g, color.b);
      output.uv.push(vertex.x / 9, vertex.distance / 18);
      output.roadCoord.push(vertex.distance, vertex.x);
      output.panel.push(...vertex.panel);
    }
  };
  // Large dry shell plates become broad pressure membranes beneath the water.
  // Every surface patch is tessellated across its full width; the backing bed is
  // deeply recessed instead of relying on a depth offset to hide intersections.
  for (const [start, end] of runs) {
    for (let a = start; a < end - 0.01;) {
      const section = track.sections.find(
        (entry) => a >= entry.start && a < entry.end,
      );
      const submerged = track.sample(a + 8).position.y < track.waterY - 12;
      const nearJump = track.jumps.some(
        (jump) => a > jump.takeoff - 105 && a < jump.landingEnd + 18,
      );
      const membrane = submerged && !nearJump;
      const rowLength = membrane
        ? 23
        : section.id === 'breaker'
          ? 14
          : section.id === 'storm'
            ? 26
            : 20;
      const b = Math.min(end, section.end, a + rowLength);
      const dryGlass = !submerged && !nearJump;
      const bounds = membrane
        ? [-14.5, -11, 11, 14.5]
        : dryGlass && section.id === 'grid'
          ? [-14.5, -11, -5, 5, 11, 14.5]
          : dryGlass && section.id === 'breaker'
            ? [-14.5, -8, 8, 14.5]
            : dryGlass && section.id === 'ascent'
              ? [-14.5, -9, 9, 14.5]
              : section.id === 'storm'
                ? [-14.5, 0, 14.5]
                : [-14.5, -4.84, 4.84, 14.5];
      for (let column = 0; column < bounds.length - 1; column += 1) {
        const x0 = bounds[column] + 0.075;
        const x1 = bounds[column + 1] - 0.075;
        const glazed =
          dryGlass &&
          ((section.id === 'grid' && (column === 1 || column === 3)) ||
            (section.id === 'breaker' &&
              column === 1 &&
              Math.floor(a / 28) % 2 === 0) ||
            (section.id === 'ascent' && column === 1));
        const channel =
          membrane && column === 1 ? 'membrane' : glazed ? 'glaze' : 'ceramic';
        const color = new THREE.Color(
          channel === 'membrane'
            ? 0x568f91
            : channel === 'glaze'
              ? section.id === 'ascent'
                ? 0x375e73
                : 0x417476
              : submerged
                ? 0x9eb4b4
                : section.id === 'breaker' && column === 1
                  ? 0x526963
                  : section.id === 'return'
                    ? 0x8b99ad
                    : 0xc8b999,
        );
        color.multiplyScalar(
          0.88 + ((column * 7 + Math.floor(a / 20) * 3) % 5) * 0.035,
        );
        const across = Math.ceil((x1 - x0) / 3);
        const along = Math.ceil((b - a) / 2);
        const vertices = [];
        const scallopAt = (distance, u) =>
          Math.sin(u * Math.PI) *
          (channel === 'ceramic' ? 1.3 : 0.25) *
          Math.min(1, (distance - start) / 5, (end - distance) / 5);
        for (let v = 0; v <= along; v += 1)
          for (let u = 0; u <= across; u += 1) {
            const x = THREE.MathUtils.lerp(x0, x1, u / across);
            const distance = THREE.MathUtils.lerp(
              a + 0.065 + scallopAt(a, u / across),
              b - 0.065 + scallopAt(b, u / across),
              v / along,
            );
            const clipped = THREE.MathUtils.clamp(
              distance,
              start + 0.04,
              end - 0.04,
            );
            const frame = track.sample(clipped);
            const fv = v / along;
            const bevel = u === 0 || u === across ? 0.045 : 0;
            const leadingLip =
              channel === 'ceramic' ? Math.exp(-fv * 32) * 0.085 : 0;
            vertices.push({
              position: point(frame, x, 0.018 + leadingLip - bevel),
              up: frame.up,
              x,
              distance: clipped,
              panel: [(u / across) * (x1 - x0), fv * (b - a), x1 - x0, b - a],
            });
          }
        for (let v = 0; v < along; v += 1)
          for (let u = 0; u < across; u += 1) {
            const i = v * (across + 1) + u;
            addTriangle(
              channel,
              [vertices[i], vertices[i + across + 1], vertices[i + 1]],
              color,
            );
            addTriangle(
              channel,
              [
                vertices[i + 1],
                vertices[i + across + 1],
                vertices[i + across + 2],
              ],
              color,
            );
          }
        for (const row of [0, along])
          for (let u = 0; u < across; u += 1) {
            const first = vertices[row * (across + 1) + u];
            const second = vertices[row * (across + 1) + u + 1];
            const lowered = (vertex) => ({
              ...vertex,
              position: vertex.position
                .clone()
                .addScaledVector(vertex.up, -0.26),
            });
            const lowerFirst = lowered(first),
              lowerSecond = lowered(second);
            const normal = second.position
              .clone()
              .sub(first.position)
              .cross(lowerFirst.position.clone().sub(first.position))
              .normalize();
            const side = (vertex) => ({ ...vertex, up: normal });
            addTriangle(
              'reveal',
              [side(first), side(second), side(lowerFirst)],
              new THREE.Color(0x5c817c),
            );
            addTriangle(
              'reveal',
              [side(second), side(lowerSecond), side(lowerFirst)],
              new THREE.Color(0x5c817c),
            );
          }
      }
      a = b;
    }
  }
  return Object.fromEntries(
    Object.entries(channels).map(([name, data]) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(data.positions, 3),
      );
      geometry.setAttribute(
        'normal',
        new THREE.Float32BufferAttribute(data.normals, 3),
      );
      geometry.setAttribute(
        'color',
        new THREE.Float32BufferAttribute(data.colors, 3),
      );
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
      if (name !== 'reveal') {
        geometry.setAttribute(
          'nacrePanel',
          new THREE.Float32BufferAttribute(data.panel, 4),
        );
        geometry.setAttribute(
          'roadCoord',
          new THREE.Float32BufferAttribute(data.roadCoord, 2),
        );
      }
      geometry.computeBoundingSphere();
      return [name, geometry];
    }),
  );
}

function sculptedGill(height, breadth) {
  const positions = [],
    colors = [],
    uvs = [],
    indices = [];
  const rows = 8,
    columns = 4;
  for (const side of [-1, 1])
    for (let v = 0; v <= rows; v += 1)
      for (let u = 0; u <= columns; u += 1) {
        const t = v / rows,
          across = u / columns;
        const width = 0.25 + breadth * Math.pow(Math.sin(Math.PI * t), 0.7);
        const thickness =
          0.18 + Math.sin(Math.PI * across) * Math.sin(Math.PI * t) * 0.86;
        positions.push(
          side * thickness,
          height * t,
          -4.5 +
            8.5 * t -
            2.2 * Math.sin(Math.PI * t) +
            width * (across * 2 - 1),
        );
        const shade = 0.46 + Math.sin(Math.PI * across) * 0.42 + t * 0.08;
        const color = new THREE.Color().setRGB(
          shade * (0.96 + t * 0.15),
          shade,
          shade * (1.04 - t * 0.13),
        );
        colors.push(color.r, color.g, color.b);
        uvs.push(across, t);
      }
  const faceVertices = (rows + 1) * (columns + 1);
  for (let face = 0; face < 2; face += 1)
    for (let v = 0; v < rows; v += 1)
      for (let u = 0; u < columns; u += 1) {
        const a = face * faceVertices + v * (columns + 1) + u,
          b = a + columns + 1;
        if (face === 0) indices.push(a, a + 1, b, a + 1, b + 1, b);
        else indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
  // Close the two thin leading/trailing edges and foot/tip without flat caps.
  for (let v = 0; v < rows; v += 1)
    for (const u of [0, columns]) {
      const a = v * (columns + 1) + u,
        b = a + columns + 1;
      indices.push(
        a,
        a + faceVertices,
        b,
        b,
        a + faceVertices,
        b + faceVertices,
      );
    }
  for (const v of [0, rows])
    for (let u = 0; u < columns; u += 1) {
      const a = v * (columns + 1) + u;
      indices.push(
        a,
        a + 1,
        a + faceVertices,
        a + 1,
        a + faceVertices + 1,
        a + faceVertices,
      );
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildNacreTrack(track, renderer) {
  const group = new THREE.Group();
  group.name = 'Nacre Tempest / pressure ceramic causeway';
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  const material = (params, physical = false) => {
    const result = physical
      ? new THREE.MeshPhysicalMaterial(params)
      : new THREE.MeshStandardMaterial(params);
    materials.add(result);
    return result;
  };
  const shellNormalMap = gillNormalMap();
  textures.add(shellNormalMap);
  const ceramic = material(
    {
      color: 0xffffff,
      vertexColors: true,
      metalness: 0.06,
      specularIntensity: 1,
      roughness: 0.48,
      clearcoat: 1,
      envMapIntensity: 1.3,
      // A continuous top coat avoids a second correlated near-mirror lobe.
      clearcoatRoughness: 0.22,
      iridescence: 0.36,
      iridescenceIOR: 1.3,
      iridescenceThicknessRange: [240, 360],
    },
    true,
  );
  // Keep a uniform albedo within every physical panel. The growth response is
  // evaluated continuously per fragment, with derivative filtering at distance;
  // painting nonlinear bands at mesh vertices exposes the triangle diagonals.
  ceramic.onBeforeCompile = (shader) => {
    // The albedo's gentle growth tint has its own UV varying; it does not require
    // a normal map or modulate the physical lobe width.
    shader.vertexShader =
      'varying vec2 vNacreTintUv;\n' +
      shader.vertexShader.replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\nvNacreTintUv = uv;',
      );
    shader.fragmentShader =
      'varying vec2 vNacreTintUv;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
       vec2 nacreUV = vNacreTintUv;
       float nacreWarp = sin(nacreUV.y * 6.2831853) * 0.22 + sin(nacreUV.y * 2.0943951) * 0.08;
       float nacrePhase = 6.2831853 * (nacreUV.x * 1.6 + nacreWarp + nacreUV.y * 0.25);
       float nacreFilter = 1.0 - smoothstep(0.4, 1.8, fwidth(nacrePhase));
       float nacreGrowth = sin(nacrePhase) * nacreFilter;
       float nacreUndertone = sin(nacreUV.x * 8.0 + nacreUV.y * 5.0) * nacreFilter;
       diffuseColor.rgb *= vec3(1.0 + nacreGrowth * 0.035, 0.98 + nacreUndertone * 0.025, 1.03 - nacreGrowth * 0.06) * (0.96 + nacreGrowth * 0.035);`,
      );
  };
  ceramic.customProgramCacheKey = () => 'nacre-smooth-pearl-lamella-v2';
  const membraneMaterial = material({
    color: 0xffffff,
    vertexColors: true,
    metalness: 0.1,
    roughness: 0.22,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    emissive: 0x24544f,
    emissiveIntensity: 0.2,
    side: THREE.DoubleSide,
  });
  const pearl = material({ color: 0xc2cabb, metalness: 0.27, roughness: 0.31 });
  const deepTeal = material({
    color: 0x163f46,
    metalness: 0.42,
    roughness: 0.4,
  });
  const keel = material({ color: 0x253e43, metalness: 0.54, roughness: 0.54 });
  const seals = material({ color: 0x254c51, roughness: 0.62, metalness: 0.2 });
  const edge = material({
    color: 0xa6d2c1,
    emissive: 0x3c8174,
    emissiveIntensity: 0.27,
    metalness: 0.32,
    roughness: 0.33,
  });
  const cyan = material({
    color: 0x71a9a0,
    emissive: 0x287f80,
    emissiveIntensity: 0.48,
    roughness: 0.27,
    metalness: 0.32,
  });
  const amber = material({
    color: 0xeebd77,
    emissive: 0xb96927,
    emissiveIntensity: 0.45,
    roughness: 0.35,
    metalness: 0.2,
  });
  const pressureGlass = material(
    {
      color: 0xffffff,
      vertexColors: true,
      metalness: 0.08,
      roughness: 0.16,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      side: THREE.DoubleSide,
      envMapIntensity: 1.5,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      iridescence: 0.24,
      iridescenceIOR: 1.42,
    },
    true,
  );
  const ceramicMaps = createCeramicMaps(renderer, ceramic);
  applyNacreSurfaceFinish(ceramic, 'ceramic');
  applyNacreSurfaceFinish(pressureGlass, 'glaze');
  applyNacreSurfaceFinish(membraneMaterial, 'membrane');
  // Borrow the existing above-water district capture for exposed coated panels.
  // Submerged membranes keep the backdrop response; no reflected dry dock there.
  group.userData.setReflection = (texture) => {
    for (const surface of [ceramic, pressureGlass]) {
      surface.envMap = texture;
      surface.envMapIntensity = surface === ceramic ? 1.5 : 1.1;
      surface.needsUpdate = true;
    }
  };
  const gillShell = material(
    {
      color: 0xffffff,
      vertexColors: true,
      metalness: 0.43,
      roughness: 0.24,
      normalMap: shellNormalMap,
      normalScale: new THREE.Vector2(0.13, 0.13),
      clearcoat: 0.9,
      clearcoatRoughness: 0.1,
      iridescence: 0.35,
    },
    true,
  );
  const add = (name, geometry, mat) => {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = name;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const runs = solidRuns(track);
  const sweep = (name, profile, mat, { step = 5, offset = 0 } = {}) => {
    const pieces = runs.map(([start, end]) =>
      sweepGeometry(track, profile, {
        start: start + offset,
        end: end - offset,
        step,
      }),
    );
    const combined = mergeGeometries(pieces);
    pieces.forEach((piece) => piece.dispose());
    return add(name, combined, mat);
  };
  const half = track.width / 2;
  const base = sweep(
    'Recessed pressure-seal running bed',
    [
      [-half, -0.95],
      [half, -0.95],
    ],
    seals,
    { step: 2.8 },
  );
  base.userData.substrate = true;
  const panels = ceramicPanels(track, runs);
  group.userData.deviceMountHeight = (device, projector) =>
    nacreDeviceMountHeight(
      [panels.ceramic, panels.glaze, panels.membrane],
      device,
      projector,
    );
  const scales = add(
    'Pearlescent scalloped ceramic running scales',
    panels.ceramic,
    ceramic,
  );
  scales.userData.drivingSurface = true;
  const membraneSurface = add(
    'Broad submerged luminous pressure membrane',
    panels.membrane,
    membraneMaterial,
  );
  membraneSurface.userData.drivingSurface = true;
  const glassSurface = add(
    'Broad smoked-glass pressure bays',
    panels.glaze,
    pressureGlass,
  );
  glassSurface.userData.drivingSurface = true;
  add(
    'Layered nacre lap joints and pressure reveal walls',
    panels.reveal,
    deepTeal,
  );
  group.userData.pressureBedDepth = 0.95;
  group.userData.surfaceTreatments = [
    'Champagne / violet nacre lamellae and stepped lap joints',
    'Twin six-metre smoked pressure bays across the grid',
    'Alternating dark-glazed breaker induction bays',
    'Broad eighteen-metre ascent pressure glazing',
    'Open gill-rib exposed spans',
    '22m submerged translucent pressure membranes',
    'Solid amber-marked jump aprons',
  ];
  sweep(
    'Folded ceramic hull cheeks',
    [
      [half, 0],
      [half + 1.1, -0.7],
      [half - 0.5, -2.6],
      [9, -4.2],
      [5, -4.6],
    ],
    pearl,
  );
  sweep(
    'Folded ceramic hull cheeks',
    [
      [-5, -4.6],
      [-9, -4.2],
      [-half + 0.5, -2.6],
      [-half - 1.1, -0.7],
      [-half, 0],
    ],
    pearl,
  );
  sweep(
    'Pressure-rated deep keel',
    [
      [5, -4.6],
      [3.7, -6],
      [-3.7, -6],
      [-5, -4.6],
    ],
    keel,
  );
  for (const side of [-1, 1]) {
    sweep(
      'Sculpted fin footing',
      [
        [side * 14.7, 0.04],
        [side * 15.8, 0.9],
        [side * 16.8, 0.5],
        [side * 16.7, -1.3],
      ],
      deepTeal,
    );
    sweep(
      'Continuous readable pearl curb',
      boxProfile(side * 14.65, 0.12, 0.45, 0.25),
      edge,
      { step: 2.8 },
    );
    sweep(
      'Recessed submerged guidance conduit',
      boxProfile(side * 14.05, -1.65, 0.36, 0.4),
      cyan,
    );
    sweep(
      'Exposed lower pressure pipe',
      boxProfile(side * 7.2, -4.4, 0.8, 0.6),
      deepTeal,
    );
  }
  const instance = (name, geometry, mat, entries) => {
    geometries.add(geometry);
    const mesh = new THREE.InstancedMesh(geometry, mat, entries.length);
    mesh.name = name;
    mesh.receiveShadow = true;
    const transform = new THREE.Object3D();
    entries.forEach((entry, i) => {
      if (entry.from) {
        const beam = beamTransform(
          entry.from,
          entry.to,
          entry.width,
          entry.depth,
        );
        transform.position.copy(beam.position);
        transform.quaternion.copy(beam.quaternion);
        transform.scale.copy(beam.scale);
      } else {
        const frame = track.sample(entry.distance);
        transform.position.copy(
          point(frame, entry.x ?? 0, entry.y ?? 0, entry.z ?? 0),
        );
        transform.quaternion.copy(frame.quaternion);
        if (entry.rotation)
          transform.quaternion.multiply(
            new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(0, 1, 0),
              entry.rotation,
            ),
          );
        transform.scale.fromArray(entry.scale ?? [1, 1, 1]);
      }
      transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix);
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  };
  // Rounded shell gills have a convex nacre skin and a recessed dark spine.
  // Paired thin ribs alternate with broader sails by district.
  const finGeometry = sculptedGill(7.8, 3.4);
  const fins = [],
    finInlays = [],
    openRibs = [],
    membraneRibs = [],
    pressurePorts = [],
    braces = [],
    pillars = [],
    pads = [];
  for (let distance = 14; distance < track.length; distance += 23) {
    if (
      track.isGap(distance) ||
      track.jumps.some(
        (jump) =>
          distance > jump.takeoff - 8 && distance < jump.landingStart + 8,
      )
    )
      continue;
    const frame = track.sample(distance);
    const submerged = frame.position.y < track.waterY;
    const section = track.sections.find(
      (entry) => distance >= entry.start && distance < entry.end,
    );
    const useOpenRibs = ['breaker', 'trench', 'ascent'].includes(section.id);
    for (const side of [-1, 1]) {
      if (useOpenRibs) {
        for (const offset of [-5, 5])
          openRibs.push({
            distance: distance + offset,
            x: side * (half + 1.5),
            y: 0.45,
            scale: [1, submerged ? 0.8 : 0.65, 1.1],
          });
      } else
        fins.push({
          distance,
          x: side * (half + 1.5),
          y: 0.45,
          scale: [
            1,
            section.id === 'storm' ? 0.6 : 1,
            section.id === 'storm' ? 1.4 : 1,
          ],
        });
      if (!useOpenRibs)
        finInlays.push({
          distance,
          x: side * (half + 1.46),
          y: submerged ? 4.6 : 5.5,
          z: -0.5,
          scale: [0.87, 0.16, 2.4],
        });
      pressurePorts.push({
        distance,
        x: side * 11,
        y: -3.2,
        scale: [1.7, 0.7, 2.1],
      });
    }
  }
  for (const [start, end] of runs)
    for (let distance = start + 8; distance < end - 8; distance += 18) {
      membraneRibs.push({ distance, y: -0.58, scale: [26, 0.13, 0.32] });
    }
  for (let distance = 45; distance < track.length; distance += 104) {
    if (
      track.isGap(distance) ||
      track.jumps.some(
        (jump) =>
          distance > jump.takeoff - 7 && distance < jump.landingStart + 7,
      )
    )
      continue;
    const frame = track.sample(distance);
    for (const side of [-1, 1]) {
      const top = point(frame, side * 10, -3.5);
      const root = point(frame, side * 20, -28);
      root.y = nacreSeabedHeight(track, root.x, root.z) - 4;
      const knee = top.clone().lerp(root, 0.2);
      braces.push({ from: top, to: knee, width: 3.6, depth: 5.2 });
      pillars.push({ from: knee, to: root, width: 4.5, depth: 7.4 });
      pads.push({
        from: root.clone().add(new THREE.Vector3(0, -3, 0)),
        to: root.clone().add(new THREE.Vector3(0, 3, 0)),
        width: 13,
        depth: 15,
      });
    }
  }
  instance('Swept pearl gill containment fins', finGeometry, gillShell, fins);
  const ribGeometry = sculptedGill(9.2, 1.25);
  instance(
    'Alternating open swept gill ribs',
    ribGeometry,
    gillShell,
    openRibs,
  );
  const spineCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.72, 0.25, -4.1),
    new THREE.Vector3(-0.96, 2, -4.4),
    new THREE.Vector3(-0.72, 4.5, -3.2),
    new THREE.Vector3(-0.32, 6.9, 0.1),
  ]);
  instance(
    'Recessed structural gill spines',
    new THREE.TubeGeometry(spineCurve, 9, 0.22, 5, false),
    deepTeal,
    fins,
  );
  instance(
    'Visible pressure membrane under-ribs',
    new THREE.BoxGeometry(1, 1, 1),
    cyan,
    membraneRibs,
  );
  instance(
    'Muted fin-tip pressure emitters',
    new THREE.BoxGeometry(1, 1, 1),
    cyan,
    finInlays,
  );
  instance(
    'Dark pressure service ports',
    new THREE.BoxGeometry(1, 1, 1),
    deepTeal,
    pressurePorts,
  );
  instance(
    'Wave-cut support shoulders',
    new THREE.BoxGeometry(1, 1, 1),
    pearl,
    braces,
  );
  instance(
    'Splayed tidal support stems',
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.5, -0.5),
        new THREE.Vector2(0.37, -0.3),
        new THREE.Vector2(0.29, 0.05),
        new THREE.Vector2(0.38, 0.3),
        new THREE.Vector2(0.5, 0.5),
      ],
      10,
    ),
    deepTeal,
    pillars,
  );
  instance(
    'Seabed pressure foundations',
    new THREE.BoxGeometry(1, 1, 1),
    keel,
    pads,
  );
  // The takeoffs and aprons have visible end diaphragms, cantilever braces and
  // graduated approach marks. All their support geometry stays behind the lip.
  const ends = [],
    beacons = [],
    warnings = [],
    arrows = [],
    landings = [];
  for (const jump of track.jumps) {
    for (const [distance, inward] of [
      [jump.takeoff - 1.5, -1],
      [jump.landingStart + 1.5, 1],
    ]) {
      const frame = track.sample(distance);
      ends.push({ distance, y: -2.6, scale: [track.width + 2, 4.7, 1.8] });
      for (const side of [-1, 1]) {
        const rootFrame = track.sample(distance + inward * 23);
        landings.push({
          from: point(frame, side * 12, -4),
          to: point(rootFrame, side * 11, -15),
          width: 2.6,
          depth: 3.1,
        });
        beacons.push({
          distance: distance + inward * 3,
          x: side * 16.3,
          y: 3.7,
          scale: [1.35, 7.2, 1.35],
        });
        beacons.push({
          distance: distance + inward * 8,
          x: side * 16.3,
          y: 2.2,
          scale: [1, 4.2, 1],
        });
      }
    }
    for (let i = 0; i < 7; i += 1) {
      const distance = jump.takeoff - 9 - i * 8;
      for (const side of [-1, 1])
        warnings.push({
          distance,
          x: side * 12.5,
          y: 0.1,
          scale: [2.2, 0.06, 1.6 + i * 0.2],
          rotation: side * 0.32,
        });
      arrows.push({
        distance,
        x: -0.7,
        y: 0.08,
        scale: [0.32, 0.06, 2.1],
        rotation: -0.5,
      });
      arrows.push({
        distance,
        x: 0.7,
        y: 0.08,
        scale: [0.32, 0.06, 2.1],
        rotation: 0.5,
      });
    }
    for (const distance of [
      jump.landingStart + 8,
      jump.landingEnd - 8,
      jump.recovery,
    ])
      for (const side of [-1, 1])
        beacons.push({ distance, x: side * 16.5, y: 1.8, scale: [1, 3.4, 1] });
  }
  instance(
    'Authored takeoff and landing end diaphragms',
    new THREE.BoxGeometry(1, 1, 1),
    deepTeal,
    ends,
  );
  instance(
    'Cantilever approach and catch engineering',
    new THREE.BoxGeometry(1, 1, 1),
    pearl,
    landings,
  );
  instance(
    'Jump approach amber scale markings',
    new THREE.BoxGeometry(1, 1, 1),
    amber,
    warnings,
  );
  instance(
    'Takeoff alignment arrows',
    new THREE.BoxGeometry(1, 1, 1),
    amber,
    arrows,
  );
  instance(
    'Landing and recovery pearl beacons',
    new THREE.BoxGeometry(1, 1, 1),
    amber,
    beacons,
  );
  group.userData.surfaceCoverage = track.surfaceCoverage;
  group.userData.openSpans = track.jumps.map(
    ({ id, takeoff, landingStart }) => ({
      id,
      start: takeoff,
      end: landingStart,
    }),
  );
  group.userData.kind = 'nacre-production';
  group.userData.foundations = pads.map(({ from, to }) => ({
    x: from.x,
    z: from.z,
    bottom: from.y,
    top: to.y,
    seabed: nacreSeabedHeight(track, from.x, from.z),
  }));
  group.userData.sourceBudgets = {
    calls: group.children.length,
    triangles: 0,
    textures: textures.size,
    textureBytes: (128 * 128 * 4 * textures.size * 4) / 3,
    parts: 0,
  };
  group.traverse((object) => {
    if (!object.geometry) return;
    group.userData.sourceBudgets.triangles +=
      ((object.geometry.index?.count ??
        object.geometry.attributes.position.count) /
        3) *
      (object.count ?? 1);
    group.userData.sourceBudgets.parts += object.count ?? 1;
  });
  group.userData.provenance =
    'Original source-authored ceramic geometry, coated Physical pearl, metric fitted rims, CC0 ambientCG mineral-composite PBR maps and growth tint, gill fins, pressure windows, support engineering and one deterministic 128px gill normal map; convex sculpted shell gills, stepped pressure-joint reveals and broad smoked-glass running bays. Road finish combines source-authored shaders, licensed Terrazzo019S maps and the borrowed district reflection; provenance is retained in assets/levels/nacre/ceramic.';
  group.userData.ready = ceramicMaps.ready.then(() => {
    group.userData.sourceBudgets.textures += ceramicMaps.count;
    group.userData.sourceBudgets.textureBytes += ceramicMaps.bytes;
  });
  group.userData.dispose = () => {
    ceramicMaps.dispose();
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((mat) => mat.dispose());
    textures.forEach((texture) => texture.dispose());
    geometries.clear();
    materials.clear();
    textures.clear();
  };
  return group;
}
