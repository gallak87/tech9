import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sweepGeometry } from '../track/geometry.js';

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

export function createDeviceGeometry(track, device, projector) {
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
      color: vector ? 0xf4b24b : 0x39bdac,
      emissive: vector ? 0xe4932f : 0x249e93,
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
  const road = (key, shapes, offset, skirt) =>
    add(key, projector.geometry(shapes, offset, skirt));
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
    const chevrons = [];
    const white = [];
    for (let s = from + 1.8; s < to - 1; s += 3.3) {
      for (const side of [-1, 1]) {
        const outside = centre + side * width * 0.39;
        chevrons.push([
          [outside, s - 1.1],
          [centre, s + 0.75],
          [centre, s + 2],
          [outside, s + 0.15],
        ]);
        white.push([
          [outside, s + 0.24],
          [centre, s + 2.1],
          [centre, s + 2.45],
          [outside, s + 0.59],
        ]);
      }
    }
    // The full-width luminous threshold marks the exact leading edge; the
    // travelling chevrons then guide the driver through the entire live strip.
    road('signal', [rectangle(x0, x1, from, from + 0.8)], 0.082);
    road('signal', chevrons, 0.082);
    road(
      'signal',
      [
        rectangle(x0 + 0.08, x0 + 0.22, from, to),
        rectangle(x1 - 0.22, x1 - 0.08, from, to),
      ],
      0.084,
    );
    road('white', white, 0.086);
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
    road('signal', markers, 0.021);
  } else {
    // An open, segmented arch leaves the racing sightline completely clear.
    const frame = track.sample(distance);
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
  let available = true;
  let pulseTime = 0;
  let motion = 1;
  function signalBrightness() {
    const pulse = motion ? 0.5 + 0.5 * Math.sin(pulseTime * 3.2) : 0.65;
    for (const owned of [materials, archMaterials]) {
      if (!owned.signal) continue;
      owned.signal.emissiveIntensity = available
        ? vector
          ? (3.3 + pulse * 1.7) * signalScale
          : 1.15 + pulse * 0.5
        : 0.06;
      owned.white.emissiveIntensity = available
        ? vector
          ? (1.25 + pulse * 0.65) * signalScale
          : 0.45
        : 0.02;
    }
  }
  signalBrightness();
  return {
    group,
    materials,
    arch,
    archMaterials,
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
    },
    setAvailable(nextAvailable) {
      available = nextAvailable;
      for (const owned of [materials, archMaterials]) {
        if (!owned.signal) continue;
        owned.signal.color.setHex(
          available ? (vector ? 0xf4b24b : 0x39bdac) : 0x586368,
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
  for (let layer = 0; layer < 3; layer++) {
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
  geometry.boundingSphere.radius *= 1.35;
  return geometry;
}

export function createShipFeedback() {
  const group = new THREE.Group();
  group.name = 'Race device feedback / owned';
  const shieldMaterial = new THREE.ShaderMaterial({
    name: 'Aegis / expanding ion-field pulses',
    forceSinglePass: true,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: {
      strength: { value: 1 },
      hit: { value: 0 },
      hitSide: { value: 1 },
      release: { value: 0 },
      flowTime: { value: 0 },
      reducedMotion: { value: 0 },
    },
    vertexShader: `
      uniform float flowTime;
      uniform float reducedMotion;
      uniform float hit;
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
        pulse = fract(flowTime * .85 + max(fieldLayer - 1., 0.) * .5);
        float outward = fieldLayer > .5 ? pulse * .34 * motion : .008 * sin(flowTime * 5.) * motion;
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
      uniform float strength;
      uniform float hit;
      uniform float hitSide;
      uniform float release;
      uniform float flowTime;
      uniform float reducedMotion;
      varying vec2 fieldUv;
      varying vec3 viewNormal;
      varying vec3 viewPosition;
      varying float layer;
      varying float pulse;
      void main() {
        if (layer > .5 && reducedMotion > .5) discard;
        float fresnel = pow(1.-abs(dot(normalize(viewNormal), normalize(-viewPosition))), 8.);
        float grazingRim = smoothstep(.84,.98,fresnel);
        float sideRim = smoothstep(.4895,.4985,abs(fieldUv.x-.5));
        float endRim = 1.-smoothstep(.0045,.015,min(fieldUv.y,1.-fieldUv.y));
        float seam = 1.-smoothstep(.002,.006,abs(fract(fieldUv.y*8.)-.5));
        float ribs = 1.-smoothstep(.0015,.005,abs(fract(fieldUv.x*13.+fieldUv.y*3.)-.5));
        float moving = 1. - reducedMotion;
        float surge = pow(.5+.5*sin(fieldUv.y*15.-flowTime*5.), 5.) * moving;
        float side = smoothstep(.18,.8, hitSide > 0. ? fieldUv.x : 1.-fieldUv.x);
        float contact = side * exp(-pow((fieldUv.y-.3)/.45,2.)) * hit;
        // Keep the hull readable: energy lives on edges and a sparse lattice,
        // with two low-opacity shells rippling outward in alternating phases.
        float alpha = grazingRim*.09 + sideRim*.24 + endRim*.26;
        alpha += seam*.025 + ribs*.012 + surge*(grazingRim*.025+seam*.035);
        if (layer > .5) alpha = max(sideRim,endRim)*.42 * pow(1.-pulse,2.) * smoothstep(0.,.09,pulse);
        float departing = exp(-pow((fieldUv.y-release)/.095,2.)) * step(.001,release);
        alpha = (alpha + contact*.18 + departing*seam*.075) * strength;
        vec3 color = mix(vec3(.12,2.7,2.05),vec3(2.5,3.5,3.05),min(1.,contact*.9+surge*.14));
        // Concentrate HDR energy on the narrow boundary core, never on the
        // transparent shell faces, so bloom reads as a field around the craft.
        float rimCore = smoothstep(.92,1.,max(sideRim,endRim));
        color *= 1. + rimCore * 2.;
        if(alpha < .002) discard;
        gl_FragColor = vec4(color,min(alpha,.5));
      }`,
  });
  const shield = new THREE.Mesh(shieldHullGeometry(), shieldMaterial);
  shield.name = 'Aegis / hull field and outward pulses';
  shield.userData.aoExclude = true;
  shield.userData.reflectionExclude = true;
  group.add(shield);
  const driveMaterial = new THREE.ShaderMaterial({
    name: 'Vector / tapered propulsion volume',
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: { strength: { value: 1 }, flowTime: { value: 0 } },
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
        vec3 a = (vec3(-.34,-.34,-3.4)-eye)/safeRay;
        vec3 b = (vec3(.34,.34,0.)-eye)/safeRay;
        vec3 nearBox=min(a,b),farBox=max(a,b);
        float start=max(0.,max(nearBox.x,max(nearBox.y,nearBox.z)));
        float end=min(farBox.x,min(farBox.y,farBox.z));
        float stride=max(0.,end-start)/18.;
        float density=0.;
        float core=0.;
        for(int i=0;i<18;i++) {
          vec3 p=eye+ray*(start+(float(i)+.5)*stride);
          float aft=clamp(-p.z/3.4,0.,1.);
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
        vec3 color=mix(vec3(1.,.61,.2),vec3(1.,.96,.79),clamp(core/max(density,.001),0.,1.));
        gl_FragColor=vec4(color,opacity);
      }`,
  });
  const volumes = [-1, 1].map((side) => {
    const geometry = new THREE.BoxGeometry(0.68, 0.68, 3.4);
    geometry.translate(side * 1.08, 0.5, -4.98);
    return geometry;
  });
  const drive = new THREE.Mesh(joined(volumes), driveMaterial);
  drive.name = 'Vector / soft twin nozzle volume';
  drive.userData.aoExclude = true;
  drive.userData.reflectionExclude = true;
  group.add(drive);
  shield.visible = drive.visible = false;
  return { group, shield, shieldMaterial, drive, driveMaterial };
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
