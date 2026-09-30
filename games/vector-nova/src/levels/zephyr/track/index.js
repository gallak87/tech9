import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  boxProfile,
  beamTransform,
  sweepGeometry,
} from '../../../track/geometry.js';
import { framePoint } from '../../../track/frames.js';
export { createZephyrTrack } from './model.js';

export const ZEPHYR_ROAD_CLEARANCE = Object.freeze({
  curbInner: 16,
  sailInnerAtCameraHeight: 20,
  sailOuter: 30,
  sailHeight: 15,
  cameraHalfWidth: 18,
  supportTop: -2.2,
});

function weaveTexture() {
  const size = 256;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const cellX = Math.floor(x / 32);
      const cellY = Math.floor(y / 32);
      const across = (cellX + cellY) % 2 === 0;
      const along = across ? y % 32 : x % 32;
      const joint = along < 3 || along > 28;
      const fibre = along % 5 === 0 ? 6 : 0;
      const value =
        (joint ? 84 : 147 + Math.round(22 * Math.sin((along / 32) * Math.PI))) +
        fibre;
      const i = (y * size + x) * 4;
      pixels[i] = value;
      pixels[i + 1] = value + 3;
      pixels[i + 2] = value + 6;
      pixels[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.name = 'Zephyr / broad structural graphite basket weave';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function zephyrSupportedRanges(track) {
  const ranges = [];
  let start = 0;
  for (const jump of track.jumps) {
    ranges.push({ start, end: jump.takeoff });
    start = jump.landingStart;
  }
  ranges.push({ start, end: track.length });
  return ranges;
}

// Sails never lean into the raceway: at chase-camera height their inner face is
// already beyond ±20m. The road and its visible bronze structure end at each lip.
export function createZephyrRoad(track, { shape = false, settings = {} } = {}) {
  const group = new THREE.Group();
  group.name = shape
    ? 'Zephyr / route massing'
    : 'Zephyr / woven bridges and bronze keels';
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const material = (parameters) => {
    const result = new THREE.MeshStandardMaterial(parameters);
    materials.add(result);
    return result;
  };
  const texture = shape ? null : weaveTexture();
  if (texture) textures.add(texture);
  const graphite = material({
    color: shape ? 0x52636b : 0x5c6268,
    roughness: 0.72,
    metalness: 0.3,
    map: texture,
  });
  const induction = material({
    color: shape ? 0x6f858b : 0x667d81,
    roughness: 0.39,
    metalness: 0.62,
  });
  const bronze = material({
    color: shape ? 0x7f8c91 : 0x9a7250,
    roughness: 0.56,
    metalness: 0.67,
  });
  const bronzeDark = material({
    color: shape ? 0x4b5a60 : 0x554230,
    roughness: 0.72,
    metalness: 0.56,
  });
  const pale = material({
    color: shape ? 0xaab7ba : 0xd2c9b3,
    roughness: 0.86,
    metalness: 0.08,
    map: texture,
  });
  const silk = material({
    color: shape ? 0x8f9b9f : 0xb9c3b5,
    roughness: 0.95,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
  const cue = material({
    color: 0xd6e5d9,
    emissive: 0x86b4ae,
    emissiveIntensity: shape ? 0 : 0.34,
    roughness: 0.68,
  });
  const buckets = new Map();
  function addGeometry(name, geometry, surface, data = {}) {
    const key = `${name}:${surface.uuid}`;
    if (!buckets.has(key))
      buckets.set(key, { name, material: surface, geometries: [], data });
    buckets.get(key).geometries.push(geometry);
  }
  const ranges = zephyrSupportedRanges(track);
  const strip = (name, profile, surface, extra = {}) => {
    for (const range of ranges)
      addGeometry(
        name,
        sweepGeometry(track, profile, { ...range, step: 3, uvScale: 16 }),
        surface,
        extra,
      );
  };
  strip(
    'Broad woven graphite running plates',
    [
      [-16, 0],
      [16, 0],
    ],
    graphite,
    { drivingSurface: true },
  );
  strip(
    'Bronze folded bridge shoulders',
    [
      [16, -0.08],
      [16, -2.2],
      [10, -4.2],
      [0, -8],
      [-10, -4.2],
      [-16, -2.2],
      [-16, -0.08],
    ],
    bronzeDark,
  );
  strip(
    'Deep bronze load-bearing keel',
    [
      [-2.7, -4.1],
      [-1, -12],
      [1, -12],
      [2.7, -4.1],
    ],
    bronze,
  );
  for (const side of [-1, 1]) {
    strip(
      'Continuous pale compact curb',
      boxProfile(side * 16.55, 0.62, 1.1, 1.24),
      pale,
    );
    strip(
      'Bronze curb cap',
      boxProfile(side * 16.55, 1.28, 1.25, 0.24),
      bronze,
    );
    strip(
      'Smooth central induction bands',
      [
        [side * 3.6 - 1.55, 0.018],
        [side * 3.6 + 1.55, 0.018],
      ],
      induction,
    );
    strip(
      'Inlaid landing guidance',
      [
        [side * 14.2 - 0.2, 0.032],
        [side * 14.2 + 0.2, 0.032],
      ],
      pale,
    );
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  const quaternion = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  const addBox = (name, frame, x, y, z, width, height, depth, surface) => {
    matrix.compose(
      framePoint(frame, x, y, z),
      frame.quaternion,
      new THREE.Vector3(width, height, depth),
    );
    addGeometry(name, box.clone().applyMatrix4(matrix), surface);
  };
  const addBeam = (name, a, b, width, depth, surface) => {
    const transform = beamTransform(a, b, width, depth);
    matrix.compose(transform.position, transform.quaternion, transform.scale);
    addGeometry(name, box.clone().applyMatrix4(matrix), surface);
  };
  for (let s = 20; s < track.length; s += 38) {
    if (track.isGap(s) || track.isGap(s - 5) || track.isGap(s + 5)) continue;
    const frame = track.sample(s);
    for (const side of [-1, 1]) {
      addBox(
        'Bronze panel ferrules',
        frame,
        side * 11,
        0.09,
        0,
        2.5,
        0.16,
        0.35,
        bronze,
      );
      addBox(
        'Articulated curb saddles',
        frame,
        side * 17.1,
        -0.9,
        0,
        3.2,
        2.4,
        2.6,
        bronzeDark,
      );
      if (!shape)
        addBeam(
          'Diagonal bronze tension ties',
          framePoint(frame, side * 16.8, -1.6, 0),
          framePoint(frame, side * 2, -9.6, 0),
          0.52,
          0.75,
          bronze,
        );
    }
  }
  const halo = track.sections.find((section) => section.id === 'halo');
  for (let s = halo.start + 24; s < halo.end - 44; s += 88) {
    for (const [a, b] of [
      [-15.8, -5.5],
      [5.5, 15.8],
    ]) {
      addGeometry(
        'Halo whole pale tension panels',
        sweepGeometry(
          track,
          [
            [a, 0.042],
            [b, 0.042],
          ],
          { start: s, end: s + 42, step: 3, uvScale: 16 },
        ),
        pale,
      );
    }
  }
  const sailSpacing = settings.quality === 'low' ? 112 : 84;
  const sailEnvelope = [];
  for (let s = 40; s < track.length; s += sailSpacing) {
    if (
      track.isGap(s) ||
      track.jumps.some(
        (jump) => s > jump.takeoff - 55 && s < jump.landingStart + 110,
      )
    )
      continue;
    const frame = track.sample(s);
    // Cathedral windows need open architecture views. Interior curbs remain.
    if (
      s > track.landmarks.roseWindow.s - 60 &&
      s < track.jumps[1].takeoff + 30
    )
      continue;
    for (const side of [-1, 1]) {
      const offset = side > 0 ? 0 : 19;
      if (track.isGap(s + offset)) continue;
      const points = [
        [18.1, 0.3, -9],
        [20.2, 3.3, -9],
        [24.5, 11, -4],
        [30, 15, 5],
        [26.5, 4, 11],
        [18.1, 0.3, 11],
      ].map(([x, y, z]) => framePoint(frame, side * x, y, z + offset));
      if (!shape) {
        const panel = new THREE.BufferGeometry().setFromPoints(points);
        panel.setIndex([0, 1, 5, 1, 4, 5, 1, 2, 4, 2, 3, 4]);
        panel.computeVertexNormals();
        addGeometry('Outward-swept sail tension panels', panel, silk);
      }
      for (const [a, b] of [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 5],
      ])
        addBeam(
          'Solid bronze sail ribs',
          points[a],
          points[b],
          0.8,
          0.95,
          bronze,
        );
      sailEnvelope.push({
        s,
        side,
        minimumLateral: 18.1,
        cameraHeightLateral: 20.2,
        outer: 30,
        height: 15,
      });
    }
  }
  for (const jump of track.jumps) {
    for (const distance of [jump.takeoff - 3, jump.landingStart + 3]) {
      const frame = track.sample(distance);
      addBox(
        'Pale jump threshold plate',
        frame,
        0,
        0.08,
        0,
        31.7,
        0.14,
        1.1,
        pale,
      );
      for (const side of [-1, 1]) {
        addBox(
          'Landing direction pillar',
          frame,
          side * 18.8,
          4.4,
          0,
          1.8,
          9,
          2.3,
          bronzeDark,
        );
        addBox(
          'Backlit landing exit cue',
          frame,
          side * 18.8,
          7.5,
          -1.2,
          1.2,
          2.8,
          0.2,
          cue,
        );
      }
    }
    for (let s = jump.takeoff - 105; s < jump.takeoff - 12; s += 22) {
      const frame = track.sample(s);
      for (const side of [-1, 1]) {
        quaternion
          .copy(frame.quaternion)
          .multiply(
            new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(0, 1, 0),
              side * -0.65,
            ),
          );
        matrix.compose(
          framePoint(frame, side * 6.8, 0.09),
          quaternion,
          new THREE.Vector3(0.75, 0.14, 6.2),
        );
        addGeometry(
          'Broad jump approach chevrons',
          box.clone().applyMatrix4(matrix),
          pale,
        );
      }
    }
  }
  box.dispose();
  for (const bucket of buckets.values()) {
    const geometry = mergeGeometries(bucket.geometries, false);
    for (const part of bucket.geometries) part.dispose();
    geometry.computeBoundingSphere();
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, bucket.material);
    mesh.name = bucket.name;
    mesh.receiveShadow = true;
    Object.assign(mesh.userData, bucket.data);
    group.add(mesh);
  }
  group.userData.supportedRanges = ranges;
  group.userData.sailEnvelope = sailEnvelope;
  group.userData.roadIdentity =
    'graphite structural weave / bronze keel / outward sails';
  let disposed = false;
  return {
    group,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of geometries) geometry.dispose();
      for (const surface of materials) surface.dispose();
      for (const owned of textures) owned.dispose();
      geometries.clear();
      materials.clear();
      textures.clear();
    },
  };
}
