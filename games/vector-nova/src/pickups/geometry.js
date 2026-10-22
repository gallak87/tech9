import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sweepGeometry } from '../track/geometry.js';
import { DEVICE_COLORS } from './theme.js';
import { createDeviceSignal, createAcquisitionFlash } from './signal.js';
import { createVectorDeckMaterial } from './vector-deck.js';

const mix = THREE.MathUtils.lerp;
const cross = (a, b, p) =>
  (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
const rectangle = (x0, x1, s0, s1) => [
  [x0, s0],
  [x1, s0],
  [x1, s1],
  [x0, s1],
];

// Clip authored track-space shapes against the actual Float32 road triangles.
// Interpolating ideal sample frames instead would cut into the road on a bank.
export function createRoadProjector(track, suppliedSurface) {
  const surface =
    suppliedSurface ||
    sweepGeometry(track, [
      [-track.width / 2, 0],
      [track.width / 2, 0],
    ]);
  const attribute = surface.getAttribute('position');
  const segments = attribute.count / 2 - 1;
  const step = track.length / segments;
  const point = (index) =>
    new THREE.Vector3().fromBufferAttribute(attribute, index);
  function sample(distance, lateral) {
    const wrapped = ((distance % track.length) + track.length) % track.length;
    const segment = Math.min(segments - 1, Math.floor(wrapped / step));
    const u = (lateral + track.width / 2) / track.width;
    const v = (wrapped - segment * step) / step;
    const left = point(segment * 2);
    const right = point(segment * 2 + 1);
    const nextLeft = point(segment * 2 + 2);
    const nextRight = point(segment * 2 + 3);
    const position = new THREE.Vector3();
    if (u + v <= 1)
      position
        .addScaledVector(left, 1 - u - v)
        .addScaledVector(right, u)
        .addScaledVector(nextLeft, v);
    else
      position
        .addScaledVector(right, 1 - v)
        .addScaledVector(nextLeft, 1 - u)
        .addScaledVector(nextRight, u + v - 1);
    return position;
  }
  function geometry(shapes, offset = 0.08, skirt = null) {
    const positions = [];
    const normals = [];
    const coordinates = [];
    for (const original of shapes) {
      const low = Math.min(...original.map((p) => p[1]));
      const high = Math.max(...original.map((p) => p[1]));
      // Unwrapped authoring also permits a module across the start-line seam.
      for (
        let lap = Math.floor(low / track.length);
        lap <= Math.floor(high / track.length);
        lap++
      ) {
        const shape = original.map(([x, s]) => [x, s - lap * track.length]);
        const start = Math.max(0, low - lap * track.length);
        const end = Math.min(track.length, high - lap * track.length);
        for (
          let segment = Math.floor(start / step);
          segment <= Math.min(segments - 1, Math.floor(end / step));
          segment++
        ) {
          const s0 = segment * step;
          const s1 = s0 + step;
          const corners = [
            { at: [-track.width / 2, s0], p: point(segment * 2) },
            { at: [track.width / 2, s0], p: point(segment * 2 + 1) },
            { at: [-track.width / 2, s1], p: point(segment * 2 + 2) },
            { at: [track.width / 2, s1], p: point(segment * 2 + 3) },
          ];
          for (const triangle of [
            [0, 2, 1],
            [1, 2, 3],
          ]) {
            let polygon = triangle.map((i) => corners[i]);
            const normal = new THREE.Vector3()
              .crossVectors(
                polygon[1].p.clone().sub(polygon[0].p),
                polygon[2].p.clone().sub(polygon[0].p),
              )
              .normalize();
            const area = shape.reduce((sum, a, i) => {
              const b = shape[(i + 1) % shape.length];
              return sum + a[0] * b[1] - b[0] * a[1];
            }, 0);
            for (let edge = 0; edge < shape.length && polygon.length; edge++) {
              const a = shape[edge];
              const b = shape[(edge + 1) % shape.length];
              const clipped = [];
              for (let i = 0; i < polygon.length; i++) {
                const current = polygon[i];
                const next = polygon[(i + 1) % polygon.length];
                const da = cross(a, b, current.at) * Math.sign(area);
                const db = cross(a, b, next.at) * Math.sign(area);
                if (da >= -1e-8) clipped.push(current);
                if (da >= 0 !== db >= 0) {
                  const t = da / (da - db);
                  clipped.push({
                    at: [
                      mix(current.at[0], next.at[0], t),
                      mix(current.at[1], next.at[1], t),
                    ],
                    p: current.p.clone().lerp(next.p, t),
                  });
                }
              }
              polygon = clipped;
            }
            if (skirt !== null && polygon.length >= 3) {
              for (let i = 0; i < polygon.length; i++) {
                const a = polygon[i].p;
                const b = polygon[(i + 1) % polygon.length].p;
                const corners = [
                  a.clone().addScaledVector(normal, offset),
                  b.clone().addScaledVector(normal, offset),
                  a.clone().addScaledVector(normal, skirt),
                  b.clone().addScaledVector(normal, skirt),
                ];
                const sideNormal = new THREE.Vector3()
                  .crossVectors(b.clone().sub(a), normal)
                  .normalize();
                for (const index of [0, 2, 1, 1, 2, 3]) {
                  positions.push(...corners[index].toArray());
                  normals.push(...sideNormal.toArray());
                  coordinates.push(
                    ...polygon[index % 2 ? (i + 1) % polygon.length : i].at,
                  );
                }
              }
            }
            for (let i = 1; i < polygon.length - 1; i++) {
              for (const vertex of [polygon[0], polygon[i], polygon[i + 1]]) {
                const p = vertex.p.clone().addScaledVector(normal, offset);
                positions.push(p.x, p.y, p.z);
                normals.push(normal.x, normal.y, normal.z);
                coordinates.push(...vertex.at);
              }
            }
          }
        }
      }
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    result.setAttribute(
      'roadCoord',
      new THREE.Float32BufferAttribute(coordinates, 2),
    );
    result.computeBoundingSphere();
    return result;
  }
  return {
    geometry,
    sample,
    dispose() {
      if (!suppliedSurface) surface.dispose();
    },
  };
}

function joined(parts) {
  const prepared = parts.map((part) => {
    const result = part.index ? part.toNonIndexed() : part;
    result.deleteAttribute('uv');
    if (result !== part) part.dispose();
    return result;
  });
  const result = mergeGeometries(prepared);
  prepared.forEach((part) => part.dispose());
  return result;
}

function beam(a, b, width, depth = width) {
  const direction = b.clone().sub(a);
  const result = new THREE.BoxGeometry(width, direction.length(), depth);
  result.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    ),
  );
  result.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
  return result;
}

const shieldOutline = [
  [-1, 0.62],
  [-0.72, 1],
  [0.72, 1],
  [1, 0.62],
  [0.75, -0.45],
  [0, -1],
  [-0.75, -0.45],
  [-1, 0.62],
];

// Clearance is a world-space envelope, independent of timers, pickup state,
// viewport aspect, and the track's bank/inversion. A padded sightline protects
// the whole craft; the near-camera zone catches a beam above that sightline.
export function archVisibility(cameraPosition, shipPosition, bounds) {
  if (!cameraPosition || !shipPosition) return 1;
  const proximity = THREE.MathUtils.smoothstep(
    bounds.distanceToPoint(cameraPosition),
    4,
    12,
  );
  if (!proximity) return 0;
  const intersects = (padding) => {
    let near = 0;
    let far = 1;
    for (const axis of ['x', 'y', 'z']) {
      const origin = cameraPosition[axis];
      const direction = shipPosition[axis] - origin;
      const low = bounds.min[axis] - padding;
      const high = bounds.max[axis] + padding;
      if (Math.abs(direction) < 1e-8) {
        if (origin < low || origin > high) return false;
      } else {
        const a = (low - origin) / direction;
        const b = (high - origin) / direction;
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
        if (near > far) return false;
      }
    }
    return true;
  };
  if (intersects(1.8)) return 0;
  if (!intersects(4)) return proximity;
  let low = 1.8;
  let high = 4;
  for (let step = 0; step < 7; step++) {
    const middle = (low + high) / 2;
    if (intersects(middle)) high = middle;
    else low = middle;
  }
  return Math.min(proximity, THREE.MathUtils.smoothstep(high, 1.8, 4));
}

export function createDeviceGeometry(
  track,
  device,
  projector,
  { mountHeight = 0 } = {},
) {
  const group = new THREE.Group();
  group.name = `${device.type === 'vector' ? 'Vector propulsion strip' : 'Aegis reserve shield'} / ${device.id}`;
  const x0 = device.lateral - device.width / 2;
  const x1 = device.lateral + device.width / 2;
  const centre = (x0 + x1) / 2;
  const width = x1 - x0;
  const distance = device.distance;
  const length = device.length || (device.type === 'vector' ? 15 : 8);
  const from = distance - length / 2;
  const to = distance + length / 2;
  const vector = device.type === 'vector';
  const signalScale = device.signalScale ?? 1;
  const materials = {
    case: new THREE.MeshStandardMaterial({
      color: 0x293940,
      metalness: 0.72,
      roughness: 0.36,
    }),
    ceramic: new THREE.MeshStandardMaterial({
      color: 0xd6ded7,
      metalness: 0.28,
      roughness: 0.4,
    }),
    signal: new THREE.MeshStandardMaterial({
      color: DEVICE_COLORS[device.type],
      emissive: DEVICE_COLORS[device.type],
      emissiveIntensity: 0.8,
      metalness: 0.22,
      roughness: 0.37,
    }),
    white: new THREE.MeshStandardMaterial({
      color: 0xf3efdb,
      emissive: 0xdacdaa,
      emissiveIntensity: 0.26,
      roughness: 0.38,
      metalness: 0.25,
    }),
  };
  // Authored road coordinates survive triangle clipping, so the bright wave
  // follows the actual banked deck rather than scrolling through world space.
  const pulseUniforms = {
    pickupTime: { value: 0 },
    pickupMotion: { value: 1 },
  };
  if (vector) {
    materials.signal.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, pulseUniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute vec2 roadCoord; varying vec2 pickupCoord;',
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\npickupCoord = roadCoord;',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float pickupTime; uniform float pickupMotion; varying vec2 pickupCoord;',
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float chase = pow(.5 + .5 * sin(pickupCoord.y * .72 - pickupTime * 6.4), 4.);
          totalEmissiveRadiance *= mix(1., .66 + chase * 1.25, pickupMotion);`,
        );
    };
    materials.signal.customProgramCacheKey = () => 'vector-road-wave-v1';
  }
  const deck = vector
    ? createVectorDeckMaterial(materials, pulseUniforms, { ...device, length })
    : null;
  const bins = new Map();
  const archBins = new Map();
  const arch = new THREE.Group();
  arch.name = `${device.id} / camera-safe raised arch`;
  const addArch = (key, geometry) => {
    if (!archBins.has(key)) archBins.set(key, []);
    archBins.get(key).push(geometry);
  };
  function add(key, geometry) {
    if (!bins.has(key)) bins.set(key, []);
    bins.get(key).push(geometry);
  }
  const road = (key, shapes, offset, skirt, mounted = true) =>
    add(
      key,
      projector.geometry(shapes, offset + (mounted ? mountHeight : 0), skirt),
    );
  road(
    'case',
    [rectangle(x0 - 0.35, x1 + 0.35, from - 0.35, to + 0.35)],
    0.063,
    0.003,
  );
  road(
    'ceramic',
    [
      rectangle(x0 - 0.22, x0 + 0.05, from, to),
      rectangle(x1 - 0.05, x1 + 0.22, from, to),
    ],
    0.073,
  );
  road(
    'white',
    [rectangle(x0, x1, from, from + 0.32), rectangle(x0, x1, to - 0.32, to)],
    0.075,
  );
  const pads = [];
  for (const x of [x0 + 0.2, x1 - 0.55]) {
    for (let s = from + 0.9; s < to - 0.4; s += 2.1)
      pads.push(rectangle(x, x + 0.35, s, s + 0.65));
  }
  road('ceramic', pads, 0.076);
  if (vector) {
    // The full-width luminous threshold marks the exact leading edge; the
    // travelling chevrons then guide the driver through the entire live strip.
    road('signal', [rectangle(x0, x1, from, from + 0.8)], 0.082);
    road(
      'signal',
      [
        rectangle(x0 + 0.08, x0 + 0.22, from, to),
        rectangle(x1 - 0.22, x1 - 0.08, from, to),
      ],
      0.084,
    );
    const markers = [];
    for (const before of [12, 24, 38]) {
      for (const side of [-1, 1]) {
        const x = centre + side * width * 0.33;
        markers.push([
          [x - 0.5, from - before],
          [x + 0.5, from - before],
          [x, from - before + 2.6],
        ]);
      }
    }
    road('signal', markers, 0.021, null, false);
  } else {
    // An open, segmented arch leaves the racing sightline completely clear.
    const frame = projector.frame?.(distance, centre) ?? track.sample(distance);
    const point = (x, y, z = 0) =>
      projector
        .sample(distance, x)
        .addScaledVector(frame.up, y)
        .addScaledVector(frame.tangent, z);
    const half = width / 2 + 0.16;
    for (const side of [-1, 1]) {
      const x = centre + side * half;
      addArch('case', beam(point(x, 0.06), point(x, 2.7), 0.42, 0.78));
      addArch(
        'ceramic',
        beam(point(x, 2.7), point(centre + side * half * 0.66, 4.3), 0.4, 0.7),
      );
      addArch(
        'case',
        beam(
          point(centre + side * half * 0.66, 4.3),
          point(centre + side * 0.2, 4.75),
          0.29,
          0.68,
        ),
      );
      for (const y of [0.75, 1.6, 2.45])
        addArch(
          'signal',
          beam(
            point(x, y - 0.24, -0.43),
            point(x, y + 0.24, -0.43),
            0.29,
            0.06,
          ),
        );
      addArch(
        'signal',
        beam(
          point(centre + side * half * 0.9, 3.22, -0.39),
          point(centre + side * half * 0.67, 4.23, -0.39),
          0.22,
          0.05,
        ),
      );
    }
    for (let i = 0; i < shieldOutline.length - 1; i++) {
      const a = shieldOutline[i];
      const b = shieldOutline[i + 1];
      addArch(
        'white',
        beam(
          point(centre + a[0] * 0.58, 4.45 + a[1] * 0.6, -0.46),
          point(centre + b[0] * 0.58, 4.45 + b[1] * 0.6, -0.46),
          0.11,
          0.06,
        ),
      );
    }
    const shield = [];
    const sx = width * 0.31;
    const outline = shieldOutline.map(([x, s]) => [
      centre + x * sx,
      distance + s * 2.1,
    ]);
    for (let i = 0; i < outline.length - 1; i++) {
      const a = outline[i];
      const b = outline[i + 1];
      const d = new THREE.Vector2(b[0] - a[0], b[1] - a[1])
        .normalize()
        .multiplyScalar(0.23);
      shield.push([
        [a[0] - d.y, a[1] + d.x],
        [b[0] - d.y, b[1] + d.x],
        [b[0] + d.y, b[1] - d.x],
        [a[0] + d.y, a[1] - d.x],
      ]);
    }
    road('signal', shield, 0.085);
    road(
      'white',
      [
        rectangle(
          centre - 0.18,
          centre + 0.18,
          distance - 0.85,
          distance + 1.2,
        ),
      ],
      0.087,
    );
    road(
      'signal',
      [
        rectangle(x0 + 0.9, x1 - 0.9, from - 12, from - 11.5),
        rectangle(x0 + 1.3, x1 - 1.3, from - 24, from - 23.5),
      ],
      0.02,
    );
  }
  for (const [key, geometries] of bins) {
    const mesh = new THREE.Mesh(joined(geometries), materials[key]);
    mesh.name = `${device.id} / ${key}`;
    mesh.receiveShadow = true;
    mesh.castShadow = !vector;
    group.add(mesh);
  }
  const archMaterials = Object.fromEntries(
    [...archBins.keys()].map((key) => {
      const material = materials[key].clone();
      material.transparent = true;
      const mesh = new THREE.Mesh(joined(archBins.get(key)), material);
      mesh.name = `${device.id} / raised ${key}`;
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      arch.add(mesh);
      return [key, material];
    }),
  );
  if (arch.children.length) group.add(arch);
  const archBounds = new THREE.Box3().setFromObject(arch);
  group.userData.deviceId = device.id;
  const edgeLight = createDeviceSignal(
    { ...device, length },
    projector,
    mountHeight,
  );
  group.add(edgeLight.mesh);
  let available = true;
  let pulseTime = 0;
  let motion = 1;
  function signalBrightness() {
    const pulse = motion ? 0.5 + 0.5 * Math.sin(pulseTime * 3.2) : 0.65;
    for (const owned of [materials, archMaterials]) {
      if (!owned.signal) continue;
      owned.signal.emissiveIntensity = available
        ? vector
          ? (2.3 + pulse * 0.9) * signalScale
          : 1.8 + pulse * 0.6
        : 0.06;
      owned.white.emissiveIntensity = available
        ? vector
          ? (0.75 + pulse * 0.35) * signalScale
          : 0.45
        : 0.02;
    }
    deck?.intensity.set(
      materials.signal.emissiveIntensity,
      materials.white.emissiveIntensity,
    );
  }
  signalBrightness();
  return {
    group,
    materials,
    arch,
    archMaterials,
    activate: edgeLight.activate,
    reset: edgeLight.reset,
    updateCamera(camera, shipPosition) {
      if (!arch.children.length) return;
      const opacity = archVisibility(
        camera?.position,
        shipPosition,
        archBounds,
      );
      arch.visible = opacity > 0.001;
      for (const mesh of arch.children) {
        mesh.material.opacity = opacity;
        mesh.material.depthWrite = opacity >= 0.999;
        mesh.castShadow = opacity >= 0.999;
      }
    },
    update({ time = pulseTime, reducedMotion = false, running = false } = {}) {
      if (running) pulseTime = time;
      motion = reducedMotion ? 0 : 1;
      pulseUniforms.pickupTime.value = pulseTime;
      pulseUniforms.pickupMotion.value = motion;
      signalBrightness();
      edgeLight.update({ time, reducedMotion, available });
    },
    setAvailable(nextAvailable) {
      available = nextAvailable;
      for (const owned of [materials, archMaterials]) {
        if (!owned.signal) continue;
        owned.signal.color.setHex(
          available ? DEVICE_COLORS[device.type] : 0x586368,
        );
      }
      signalBrightness();
    },
  };
}

function shieldHullGeometry() {
  // Cross-sections trace the Kestrel shoulders and split prow, rather than a
  // sphere around empty air. The rear stays open around the turbine exhausts.
  const stations = [
    [-3.55, 1.85, 1.04],
    [-2.9, 2.11, 1.22],
    [-1.7, 2.22, 1.52],
    [-0.5, 2.12, 1.59],
    [0.8, 1.88, 1.33],
    [2, 1.57, 0.94],
    [3.35, 1.19, 0.5],
    [3.8, 0.78, 0.32],
  ];
  const positions = [];
  const uv = [];
  const indices = [];
  const layers = [];
  const sides = 32;
  for (let layer = 0; layer < 4; layer++) {
    for (let row = 0; row < stations.length; row++) {
      const [z, width, height] = stations[row];
      for (let side = 0; side <= sides; side++) {
        const u = side / sides;
        const angle = (u - 0.5) * Math.PI * 1.12;
        positions.push(
          Math.sin(angle) * width,
          0.22 + Math.cos(angle) * height,
          z,
        );
        uv.push(u, (z + 3.55) / 7.35);
        layers.push(layer);
        if (row < stations.length - 1 && side < sides) {
          const i =
            layer * stations.length * (sides + 1) + row * (sides + 1) + side;
          indices.push(
            i,
            i + sides + 1,
            i + 1,
            i + 1,
            i + sides + 1,
            i + sides + 2,
          );
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute(
    'fieldLayer',
    new THREE.Float32BufferAttribute(layers, 1),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius *= 1.55;
  return geometry;
}

export function createShipFeedback() {
  const group = new THREE.Group();
  group.name = 'Race device feedback / owned';
  const shieldMaterial = new THREE.ShaderMaterial({
    name: 'Aegis / luminous fracture field',
    forceSinglePass: true,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: {
      color: { value: new THREE.Color(DEVICE_COLORS.aegis) },
      strength: { value: 1 },
      hit: { value: 0 },
      hitSide: { value: 1 },
      breakAge: { value: 0 },
      release: { value: 0 },
      flowTime: { value: 0 },
      reducedMotion: { value: 0 },
    },
    vertexShader: `
      uniform float flowTime;
      uniform float reducedMotion;
      uniform float hit;
      uniform float breakAge;
      attribute float fieldLayer;
      varying vec2 fieldUv;
      varying vec3 viewNormal;
      varying vec3 viewPosition;
      varying float layer;
      varying float pulse;
      void main() {
        fieldUv = uv;
        layer = fieldLayer;
        float motion = 1. - reducedMotion;
        pulse = fract(flowTime * .85 + max(fieldLayer - 2., 0.) * .5);
        float outward = fieldLayer > 1.5 ? pulse * .3 * motion : fieldLayer > .5 ? .075 : 0.;
        outward += hit * breakAge * .65 * motion;
        vec3 expanded = position;
        expanded.x *= 1. + outward;
        expanded.y = .22 + (expanded.y - .22) * (1. + outward);
        expanded.z *= 1. + outward * .55;
        viewNormal = normalize(normalMatrix * normal);
        vec4 p = modelViewMatrix * vec4(expanded, 1.);
        viewPosition = p.xyz;
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: `
      uniform vec3 color;
      uniform float strength, hit, hitSide, breakAge, release, flowTime, reducedMotion;
      varying vec2 fieldUv;
      varying vec3 viewNormal, viewPosition;
      varying float layer, pulse;
      vec2 cellHash(vec2 p) {
        return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);
      }
      void main() {
        if (layer > 1.5 && reducedMotion > .5) discard;
        float fresnel=pow(1.-abs(dot(normalize(viewNormal),normalize(-viewPosition))),2.5);
        float sideRim=exp(-pow(min(fieldUv.x,1.-fieldUv.x)/.035,2.));
        float endRim=exp(-pow(min(fieldUv.y,1.-fieldUv.y)/.022,2.));
        float rim=max(sideRim,endRim);
        float seam=exp(-pow((fract(fieldUv.y*8.)-.5)/.04,2.));
        float motion=1.-reducedMotion;
        float surge=pow(.5+.5*sin(fieldUv.y*13.-flowTime*5.),4.)*motion;
        float alpha=.025+fresnel*.16+rim*.44+seam*.025+surge*.035;
        if (layer > .5) alpha=.015+fresnel*.12+rim*.09;
        if (layer > 1.5) alpha=(rim*.32+fresnel*.035)*pow(1.-pulse,2.)*smoothstep(0.,.1,pulse);
        vec3 tint=color*(2.1+rim*1.3);
        if (hit > 0.) {
          vec2 p=fieldUv*vec2(7.,12.);
          vec2 cell=floor(p), local=fract(p);
          float first=10., second=10., shard=0.;
          for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) {
            vec2 neighbor=vec2(float(x),float(y));
            vec2 seed=cellHash(cell+neighbor);
            float d=length(neighbor+.18+seed*.64-local);
            if(d<first){second=first;first=d;shard=seed.x;}
            else second=min(second,d);
          }
          float crack=1.-smoothstep(.015,.08,second-first);
          float gap=1.-smoothstep(.008,.02,second-first);
          vec2 impact=vec2(hitSide>0.?.74:.26,.4);
          float radius=length((fieldUv-impact)*vec2(1.,1.5));
          float reached=1.-smoothstep(breakAge*8.+.06,breakAge*8.+.19,radius);
          float dissolve=1.-smoothstep(.18+shard*.16,.48+shard*.14,breakAge);
          alpha=(alpha*(1.-gap*reached)+crack*reached*.6)*dissolve;
          tint=mix(tint,vec3(3.4,4.,3.7),crack*reached*.8);
          if(layer>.5) alpha*=.5;
        }
        float departing=1.-smoothstep(release,release+.25,fieldUv.y);
        if(release>0.) alpha*=1.-departing;
        alpha*=strength*(reducedMotion>.5?.65:1.);
        if(alpha<.002) discard;
        gl_FragColor=vec4(tint,min(alpha,.72));
      }`,
  });
  const shield = new THREE.Mesh(shieldHullGeometry(), shieldMaterial);
  shield.name = 'Aegis / hull field and outward pulses';
  shield.userData.aoExclude = true;
  shield.userData.reflectionExclude = true;
  group.add(shield);
  const trailMaterial = new THREE.ShaderMaterial({
    name: 'Aegis / soft moving field wake',
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: {
      color: { value: new THREE.Color(DEVICE_COLORS.aegis) },
      strength: { value: 0 },
      flowTime: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `
      varying vec2 vUv;
      uniform vec3 color;
      uniform float strength,flowTime;
      void main(){
        float across=exp(-pow((vUv.x-.5)*5.,2.));
        float along=smoothstep(0.,.06,vUv.y)*pow(1.-vUv.y,2.);
        float flow=.8+.2*sin(vUv.y*16.-flowTime*9.);
        float a=across*along*strength*flow*.14;
        if(a<.002)discard;
        gl_FragColor=vec4(color*1.8,a);
      }`,
  });
  const trailPlanes = [];
  for (const side of [-1, 1]) {
    for (const tilt of [0, Math.PI / 2]) {
      const geometry = new THREE.PlaneGeometry(1.2, 10);
      geometry.rotateY(tilt);
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(side * 2, 0.65, -7.7);
      trailPlanes.push(geometry);
    }
  }
  const shieldTrail = new THREE.Mesh(joined(trailPlanes), trailMaterial);
  shieldTrail.name = 'Aegis / dim driving trail';
  shieldTrail.userData.aoExclude =
    shieldTrail.userData.reflectionExclude = true;
  shieldTrail.visible = false;
  group.add(shieldTrail);
  const driveMaterial = new THREE.ShaderMaterial({
    name: 'Vector / tapered propulsion volume',
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      color: { value: new THREE.Color(DEVICE_COLORS.vector) },
      strength: { value: 1 },
      flowTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 localPosition;
      varying vec3 localEye;
      varying float nozzle;
      void main() {
        localPosition = position;
        nozzle = sign(position.x);
        vec3 translation = -modelViewMatrix[3].xyz;
        localEye = vec3(dot(normalMatrix[0],translation),dot(normalMatrix[1],translation),dot(normalMatrix[2],translation));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.);
      }`,
    fragmentShader: `
      uniform vec3 color;
      uniform float strength;
      uniform float flowTime;
      varying vec3 localPosition;
      varying vec3 localEye;
      varying float nozzle;
      void main() {
        vec3 eye = localEye-vec3(nozzle*1.08,.5,-3.28);
        vec3 proxy = localPosition-vec3(nozzle*1.08,.5,-3.28);
        vec3 ray = normalize(proxy-eye);
        vec3 safeRay = (step(vec3(0.),ray)*2.-1.)*max(abs(ray),vec3(.00001));
        vec3 a = (vec3(-.34,-.34,-5.2)-eye)/safeRay;
        vec3 b = (vec3(.34,.34,0.)-eye)/safeRay;
        vec3 nearBox=min(a,b),farBox=max(a,b);
        float start=max(0.,max(nearBox.x,max(nearBox.y,nearBox.z)));
        float end=min(farBox.x,min(farBox.y,farBox.z));
        float stride=max(0.,end-start)/18.;
        float density=0.;
        float core=0.;
        for(int i=0;i<18;i++) {
          vec3 p=eye+ray*(start+(float(i)+.5)*stride);
          float aft=clamp(-p.z/5.2,0.,1.);
          float radius=.24*(1.-aft*.78)*(1.-smoothstep(.75,1.,aft));
          float radial=length(p.xy)/max(.005,radius);
          float edge=1.-smoothstep(.65,1.15,radial);
          float fade=smoothstep(.002,.035,aft)*(1.-smoothstep(.45,1.,aft));
          float flow=.94+.06*sin(aft*24.-flowTime*13.);
          density+=(exp(-radial*radial*3.)*.75+exp(-radial*radial*20.)*1.6)*edge*fade*flow*stride;
          core+=exp(-radial*radial*20.)*edge*fade*stride;
        }
        float opacity=(1.-exp(-density*strength*2.5));
        if(opacity<.001) discard;
        vec3 driveColor=mix(color * 2.,vec3(2.2,2.1,1.8),clamp(core/max(density,.001),0.,1.));
        gl_FragColor=vec4(driveColor,opacity);
      }`,
  });
  const volumes = [-1, 1].map((side) => {
    const geometry = new THREE.BoxGeometry(0.68, 0.68, 5.2);
    geometry.translate(side * 1.08, 0.5, -5.88);
    return geometry;
  });
  const drive = new THREE.Mesh(joined(volumes), driveMaterial);
  drive.name = 'Vector / soft twin nozzle volume';
  drive.userData.aoExclude = true;
  drive.userData.reflectionExclude = true;
  group.add(drive);
  shield.visible = drive.visible = false;
  const acquisition = createAcquisitionFlash();
  group.add(acquisition);
  return {
    group,
    shield,
    shieldMaterial,
    shieldTrail,
    drive,
    driveMaterial,
    acquisition,
  };
}

export function disposeGroup(group) {
  const geometries = new Set();
  const materials = new Set();
  group.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material])
      if (material) materials.add(material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  group.removeFromParent();
}
