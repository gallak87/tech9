import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  boxProfile,
  beamTransform,
  sweepGeometry,
} from '../../../track/geometry.js';
import {
  finishZephyrMaterial,
  zephyrNoiseGLSL,
} from '../environment/materials.js';
import { framePoint } from '../../../track/frames.js';
import { createZephyrWeave } from './weave.js';
export { createZephyrTrack } from './model.js';

export const ZEPHYR_ROAD_CLEARANCE = Object.freeze({
  curbInner: 16,
  sailInnerAtCameraHeight: 20,
  sailOuter: 30,
  sailHeight: 15,
  cameraHalfWidth: 18,
  supportTop: -2.2,
});

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
  const maps = shape ? [] : createZephyrWeave();
  maps.forEach((texture) => textures.add(texture));
  const graphite = material({
    name: 'Zephyr / coated structural graphite twill',
    color: shape ? 0x52636b : 0x859198,
    roughness: shape ? 0.52 : 0.5,
    metalness: shape ? 0.44 : 0.22,
    map: maps[0] ?? null,
    normalMap: maps[1] ?? null,
    roughnessMap: maps[2] ?? null,
    envMapIntensity: 0.8,
  });
  const induction = material({
    color: shape ? 0x6f858b : 0x667d81,
    roughness: 0.62,
    metalness: 0.45,
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
  if (!shape) {
    bronze.name = 'Zephyr bridge bronze';
    bronzeDark.name = 'Zephyr bridge bronze shadow';
    pale.name = 'Zephyr worn bridge limestone';
    for (const surface of [bronze, bronzeDark, pale])
      finishZephyrMaterial(surface);
    silk.onBeforeCompile = (shader) => {
      shader.vertexShader =
        'varying vec3 clothPosition;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nclothPosition=position;',
        );
      shader.fragmentShader =
        'varying vec3 clothPosition;\n' +
        shader.fragmentShader.replace(
          '#include <color_fragment>',
          '#include <color_fragment>\nfloat thread=.5+.5*sin(clothPosition.y*18.);diffuseColor.rgb*=.88+thread*.12;',
        );
    };
    silk.customProgramCacheKey = () => 'zephyr-tension-fabric-v2';
  }
  const haloZone = track.sections.find((s) => s.id === 'halo');
  const ascentZone = track.sections.find((s) => s.id === 'cloudspire');
  if (!shape)
    for (const surface of [graphite, induction]) {
      surface.onBeforeCompile = (shader) => {
        shader.vertexShader =
          'varying float zephyrRoadS;varying float zephyrRoadU;\n' +
          shader.vertexShader.replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\nzephyrRoadS=uv.y*2.5;zephyrRoadU=uv.x;',
          );
        shader.fragmentShader =
          'varying float zephyrRoadS;varying float zephyrRoadU;\n' +
          zephyrNoiseGLSL +
          shader.fragmentShader
            .replace(
              '#include <color_fragment>',
              `#include <color_fragment>
 float zx=abs((zephyrRoadU-.5)*32.);
 float edging=max(1.-smoothstep(.02,.13,abs(zx-3.5)),1.-smoothstep(.02,.13,abs(zx-5.15)));
 float bay=mod(zephyrRoadS,38.);
 float outerPanel=smoothstep(5.8,6.,zx)*(1.-smoothstep(12.8,13.,zx))*smoothstep(2.,2.3,bay)*(1.-smoothstep(29.7,30.,bay));
 float haloDistrict=smoothstep(${haloZone.start.toFixed(3)},${(haloZone.start + 15).toFixed(3)},zephyrRoadS)*(1.-smoothstep(${(haloZone.end - 15).toFixed(3)},${haloZone.end.toFixed(3)},zephyrRoadS));
 float ascentDistrict=smoothstep(${ascentZone.start.toFixed(3)},${(ascentZone.start + 15).toFixed(3)},zephyrRoadS)*(1.-smoothstep(${(ascentZone.end - 15).toFixed(3)},${ascentZone.end.toFixed(3)},zephyrRoadS));
 diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(2.0,1.86,1.54),outerPanel*haloDistrict*.55);
 diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.5,.88,.51),outerPanel*ascentDistrict*.48);
 float panel=mod(floor(zephyrRoadS/18.)+floor(zx/3.),3.);
 diffuseColor.rgb*=.95+panel*.035;
 float rivetS=mod(zephyrRoadS+1.,18.);
 float rivet=(1.-smoothstep(.08,.14,length(vec2(abs(zx-12.8),min(rivetS,18.-rivetS)))));
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.24,.14,.065),rivet*.75);
 float joint=1.-smoothstep(.035,.12,min(mod(zephyrRoadS,14.),14.-mod(zephyrRoadS,14.)));
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.19,.105,.045),edging*.75);
 diffuseColor.rgb*=1.-joint*.16;
 `,
            )
            .replace(
              '#include <roughnessmap_fragment>',
              `#include <roughnessmap_fragment>
        float zw=0.;
        ${(track.curtains ?? []).map((c) => `zw=max(zw,1.-smoothstep(4.,38.,abs(zephyrRoadS-${c.s.toFixed(3)})));`).join('')}
        float wear=zephyrNoise(vec3(zephyrRoadU*32.,0.,zephyrRoadS)*.24);
        roughnessFactor=clamp(roughnessFactor+wear*.12-.025,.28,.86);
        // Local water film fills the shallow weave; the dry circuit stays satin.
        roughnessFactor=mix(roughnessFactor,.16,zw*.9);`,
            );
      };
      surface.customProgramCacheKey = () => 'zephyr-metric-twill-wet-road-v5';
    }
  const buckets = new Map();
  function addGeometry(name, geometry, surface, data = {}) {
    const key = `${name}:${surface.uuid}`;
    if (!buckets.has(key))
      buckets.set(key, { name, material: surface, geometries: [], data });
    buckets.get(key).geometries.push(geometry);
  }
  const ranges = zephyrSupportedRanges(track);
  const strip = (name, profile, surface, extra = {}, step = 4.5) => {
    for (const range of ranges)
      addGeometry(
        name,
        sweepGeometry(track, profile, { ...range, step, uvScale: 2.5 }),
        surface,
        extra,
      );
  };
  // A single partitioned deck shares every longitudinal row. Induction bands
  // are part of the surface, so bank transitions cannot expose coplanar stripes.
  const deckCuts = [-16, -14.4, -14, -5.15, -3.5, 3.5, 5.15, 14, 14.4, 16];
  for (let i = 0; i < deckCuts.length - 1; i++) {
    const a = deckCuts[i],
      b = deckCuts[i + 1];
    const surface =
      i === 1 || i === 7 ? pale : i === 3 || i === 5 ? induction : graphite;
    for (const range of ranges) {
      const geometry = sweepGeometry(
        track,
        [
          [a, 0],
          [b, 0],
        ],
        { ...range, step: 3, uvScale: 2.5 },
      );
      const uv = geometry.attributes.uv;
      for (let j = 0; j < uv.count; j++)
        uv.setX(j, (a + 16 + uv.getX(j) * (b - a)) / 32);
      addGeometry('Woven deck with inset induction bands', geometry, surface, {
        drivingSurface: true,
        roadSurface: true,
      });
    }
  }
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
    const curbProfile = [
      [16, 0],
      [16, 1.04],
      [16.18, 1.24],
      [16.92, 1.24],
      [17.1, 1.04],
      [17.1, 0],
      [16, 0],
    ].map(([x, y]) => [side * x, y]);
    if (side < 0) curbProfile.reverse();
    strip('Continuous pale compact curb', curbProfile, pale, {}, 5.2);
    strip(
      'Bronze curb cap',
      boxProfile(side * 16.55, 1.28, 1.25, 0.24),
      bronze,
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
      if (
        side < 0 &&
        s > track.landmarks.cloudspire.start - 40 &&
        s < track.landmarks.cloudspire.end + 60
      )
        continue;
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
      // Curved stitched gores leave the lower edge and alternate frames open.
      // Each transverse slice bows outward; no fabric enters the chase tube.
      const fullPanel = Math.floor(s / sailSpacing) % 3 !== 1;
      if (!shape && fullPanel) {
        const vertices = [],
          indices = [];
        for (let row = 0; row <= 12; row++) {
          const t = row / 12;
          const lower = points[1].clone().lerp(points[5], t);
          const upper = points[2]
            .clone()
            .lerp(points[3], Math.min(1, t * 2))
            .lerp(points[4], Math.max(0, t * 2 - 1));
          for (let col = 0; col <= 6; col++) {
            const u = col / 6;
            const p = lower
              .clone()
              .lerp(upper, u)
              .addScaledVector(
                frame.right,
                side * Math.sin(t * Math.PI) * Math.sin(u * Math.PI) * 1.8,
              );
            vertices.push(...p.toArray());
          }
        }
        for (let row = 0; row < 12; row++)
          for (let col = 0; col < 6; col++) {
            const i = row * 7 + col;
            indices.push(i, i + 1, i + 8, i, i + 8, i + 7);
          }
        const panel = new THREE.BufferGeometry();
        panel.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(vertices, 3),
        );
        panel.setIndex(indices);
        panel.computeVertexNormals();
        addGeometry('Curved stitched sailcloth gores', panel, silk);
        for (const t of [0.25, 0.5, 0.75]) {
          const a = points[1].clone().lerp(points[5], t),
            b = points[2]
              .clone()
              .lerp(points[3], Math.min(1, t * 2))
              .lerp(points[4], Math.max(0, t * 2 - 1));
          let previous = a;
          for (let i = 1; i <= 3; i++) {
            const u = i / 3;
            const p = a
              .clone()
              .lerp(b, u)
              .addScaledVector(
                frame.right,
                side * Math.sin(t * Math.PI) * Math.sin(u * Math.PI) * 1.8,
              );
            addBeam(
              'Sewn sailcloth battens',
              previous,
              p,
              0.12,
              0.16,
              bronzeDark,
            );
            previous = p;
          }
        }
      }
      for (const [a, b] of [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 5],
      ])
        addBeam('Bronze sail spars', points[a], points[b], 0.44, 0.55, bronze);
      for (const [a, b] of [
        [1, 4],
        [0, 3],
        [2, 5],
      ])
        addBeam(
          'Sail tension cables',
          points[a],
          points[b],
          0.07,
          0.07,
          bronzeDark,
        );
      for (const p of [points[0], points[3], points[5]]) {
        const collar = new THREE.OctahedronGeometry(0.6, 0);
        collar.translate(p.x, p.y, p.z);
        addGeometry('Bronze spar attachment knuckles', collar, bronze);
      }
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
    setReflection(texture) {
      if (disposed || shape) return;
      for (const surface of [graphite, induction]) {
        surface.envMap = texture;
        surface.envMapIntensity = 0.8;
        surface.needsUpdate = true;
      }
    },
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
