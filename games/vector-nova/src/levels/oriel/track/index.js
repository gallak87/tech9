import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  sweepGeometry,
  boxProfile,
  beamTransform,
} from '../../../track/geometry.js';
import { framePoint } from '../../../track/frames.js';
import { finishHabitatMaterial } from '../environment/habitat.js';
import {
  orielIslandEdge,
  orielIslandGeometry,
  orielRoadBounds,
} from '../hazards.js';
export { createOrielTrack, ORIEL_HABITAT, ORIEL_WIDTH } from './model.js';

export function createOrielRoad(track, { shape = false } = {}) {
  const group = new THREE.Group();
  group.name = 'Oriel / limestone civic raceway';
  const geometries = new Set();
  const materials = new Set();
  const make = (name, parameters) => {
    const material = new THREE.MeshStandardMaterial({ name, ...parameters });
    materials.add(material);
    return material;
  };
  const limestone = make('Oriel / satin mineral-composite running slab', {
    color: shape ? 0x9da8a7 : 0xc7c4ad,
    roughness: 0.64,
    metalness: 0.06,
  });
  if (!shape) {
    limestone.onBeforeCompile = (shader) => {
      shader.vertexShader =
        'attribute vec2 roadCoord; varying vec2 orielMetres;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\norielMetres=roadCoord;',
        );
      shader.fragmentShader =
        'varying vec2 orielMetres;\n' +
        shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
        float jointS=abs(mod(orielMetres.x+7.,14.)-7.);
        float jointL=abs(mod(orielMetres.y+2.5,5.)-2.5);
        float joint=min(jointS,jointL);
        float edge=1.-smoothstep(.022,.085,joint);
        float block=sin(floor(orielMetres.x/14.)*4.1+floor(orielMetres.y/5.)*7.3)*.022;
        float mineral=sin(orielMetres.x*.84+sin(orielMetres.y*1.3))*sin(orielMetres.y*.49-orielMetres.x*.21)*.018;
        diffuseColor.rgb*=1.+block+mineral;
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*.56,edge*.68);
        `,
        );
    };
    limestone.customProgramCacheKey = () => 'oriel-metric-limestone-v1';
  }
  const pale = make('Oriel / formed limestone parapet', {
    color: 0xe0d6ba,
    roughness: 0.7,
    metalness: 0.03,
  });
  const slate = make('Oriel / slate structural bed', {
    color: 0x3b5558,
    roughness: 0.61,
    metalness: 0.23,
  });
  const bronze = make('Oriel / seated bronze seam and load arm', {
    color: 0x90734c,
    roughness: 0.48,
    metalness: 0.68,
  });
  const turquoise = make('Oriel / recessed turquoise induction glass', {
    color: 0x3a9c98,
    emissive: 0x2b8884,
    emissiveIntensity: shape ? 0 : 0.52,
    roughness: 0.34,
    metalness: 0.3,
  });
  const warning = make('Oriel / amber launch threshold', {
    color: 0xe0a653,
    emissive: 0x7e5724,
    emissiveIntensity: shape ? 0 : 0.24,
    roughness: 0.55,
    metalness: 0.1,
  });
  const soil = make('Oriel / planted civic-island beds', {
    color: shape ? 0x566865 : 0x425c42,
    roughness: 0.96,
  });
  if (!shape) {
    for (const material of materials) {
      finishHabitatMaterial(material, { bounce: 0.2 });
      material.customProgramCacheKey = () =>
        `oriel-road-radial-day-v1:0.2:${material === limestone ? 'metric-limestone-v1' : material.name}`;
    }
  }
  const buckets = new Map();
  const add = (name, geometry, material, data = {}) => {
    const key = `${name}:${material.uuid}`;
    if (!buckets.has(key))
      buckets.set(key, { name, material, parts: [], data });
    buckets.get(key).parts.push(geometry);
  };
  const ranges = track.supportedRanges;
  const strip = (name, profile, material, data = {}, options = {}) => {
    for (const range of ranges)
      add(
        name,
        sweepGeometry(track, profile, {
          ...range,
          step: 3.5,
          uvScale: 1,
          ...options,
        }),
        material,
        data,
      );
  };
  // One partitioned top: the inlaid guides occupy their own slab faces rather
  // than floating above the road or fighting a coplanar underlying surface.
  for (const [a, b, material] of [
    [-20, -18.9, pale],
    [-18.9, -18.48, turquoise],
    [-18.48, 18.48, limestone],
    [18.48, 18.9, turquoise],
    [18.9, 20, pale],
  ])
    strip(
      'Supported mineral-composite road top',
      [
        [a, 0],
        [b, 0],
      ],
      material,
      { roadSurface: true, drivingSurface: true },
      { transverseStep: 2.5 },
    );
  strip(
    'Deep slate load-bearing bed',
    [
      [20, 0],
      [20, -1.9],
      [15, -4.5],
      [-15, -4.5],
      [-20, -1.9],
      [-20, 0],
    ],
    slate,
  );
  strip(
    'Bronze civic bridge keel',
    [
      [-2, -4.4],
      [-1.4, -8],
      [1.4, -8],
      [2, -4.4],
    ],
    bronze,
    {},
    { step: 5 },
  );
  for (const side of [-1, 1]) {
    strip(
      'Formed limestone parapet',
      boxProfile(side * 20.55, 0.62, 1.1, 1.24),
      pale,
    );
    strip(
      'Bronze parapet cap',
      boxProfile(side * 20.55, 1.28, 1.18, 0.16),
      bronze,
    );
    strip(
      'Recessed turquoise parapet line',
      boxProfile(side * 20.02, 0.68, 0.055, 0.23),
      turquoise,
      {},
      { step: 4 },
    );
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  const transform = new THREE.Matrix4();
  const addBox = (name, frame, x, y, z, width, height, depth, material) => {
    transform.compose(
      framePoint(frame, x, y, z),
      frame.quaternion,
      new THREE.Vector3(width, height, depth),
    );
    add(name, box.clone().applyMatrix4(transform), material);
  };
  const beam = (name, a, b, width, depth, material) => {
    const pose = beamTransform(a, b, width, depth);
    transform.compose(pose.position, pose.quaternion, pose.scale);
    add(name, box.clone().applyMatrix4(transform), material);
  };
  for (const island of track.challenges) {
    const outer = island.side * 20.55;
    add(
      'Solid limestone civic chicane and launch divider',
      orielIslandGeometry(track, island, (s) => {
        const edge = orielIslandEdge(island, s);
        return [
          [edge, 0],
          [edge, 1.8],
          [outer, 1.8],
          [outer, 0],
          [edge, 0],
        ];
      }),
      pale,
      { challengeBarrier: true },
    );
    add(
      'Recessed amber civic-island guidance',
      orielIslandGeometry(track, island, (s) => {
        const edge = orielIslandEdge(island, s);
        return [
          [edge - island.side * 0.45, 0.045],
          [edge - island.side * 0.05, 0.045],
        ];
      }),
      island.kind === 'launch' ? warning : turquoise,
    );
    add(
      'Amber civic-divider warning band',
      orielIslandGeometry(track, island, (s) => {
        const edge = orielIslandEdge(island, s) - island.side * 0.025;
        return [
          [edge, 0.67],
          [edge, 1.02],
        ];
      }),
      warning,
    );
    if (island.kind !== 'garden') continue;
    for (let s = island.start - 90; s < island.start + 35; s += 24) {
      const frame = track.sample(s);
      const lane = -island.side * 10.5;
      for (const direction of [-1, 1])
        beam(
          'Amber garden-chicane approach arrows',
          framePoint(frame, lane + direction * 3, 0.065, -2),
          framePoint(frame, lane, 0.065, 2),
          0.55,
          0.055,
          warning,
        );
    }
    add(
      'Seated civic-island planting bed',
      orielIslandGeometry(track, island, (s) => {
        const edge = orielIslandEdge(island, s);
        const inset = Math.min(1.1, Math.abs(outer - edge) * 0.3);
        return [
          [edge + island.side * inset, 1.815],
          [outer - island.side * inset, 1.815],
        ];
      }),
      soil,
    );
  }
  for (let s = 24; s < track.length; s += 78) {
    if (track.jumps.some((j) => s > j.takeoff - 8 && s < j.landingStart + 12))
      continue;
    const frame = track.sample(s);
    for (const side of [-1, 1]) {
      addBox(
        'Bronze parapet foundation joints',
        frame,
        side * 20.55,
        -0.5,
        0,
        1.7,
        2,
        1.4,
        bronze,
      );
      addBox(
        'Inset slate maintenance hatch',
        frame,
        side * 15.8,
        0.026,
        0,
        1.6,
        0.04,
        2.5,
        slate,
      );
      beam(
        'Seated bronze load arm',
        framePoint(frame, side * 20, -1.1),
        framePoint(frame, side * 7.5, -6.3),
        0.6,
        0.9,
        bronze,
      );
    }
  }
  for (let s = 40; s < track.length; s += 100) {
    if (
      track.isGap(s) ||
      track.jumps.some((j) => s > j.takeoff - 20 && s < j.landingStart + 12)
    )
      continue;
    const f = track.sample(s);
    const bounds = orielRoadBounds(track, s);
    const glyphLane = bounds ? (bounds.min + bounds.max) / 2 : 0;
    for (const side of [-1, 1]) {
      const q = f.quaternion
        .clone()
        .multiply(
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            side * 0.65,
          ),
        );
      transform.compose(
        framePoint(f, glyphLane + side * 1.1, 0.055),
        q,
        new THREE.Vector3(0.23, 0.045, 2.1),
      );
      add(
        'Small forward bronze road glyphs',
        box.clone().applyMatrix4(transform),
        bronze,
      );
    }
  }
  for (const jump of track.jumps) {
    for (const [distance, material] of [
      [jump.takeoff - 1.2, warning],
      [jump.landingStart + 1.2, turquoise],
    ]) {
      const f = track.sample(distance);
      addBox(
        'Transfer threshold inlay',
        f,
        0,
        0.035,
        0,
        39.6,
        0.06,
        1.35,
        material,
      );
      for (const side of [-1, 1]) {
        addBox(
          'Limestone receiving beacon base',
          f,
          side * 23.2,
          2.6,
          0,
          2.7,
          6,
          3.6,
          pale,
        );
        addBox(
          'Turquoise receiving beacon',
          f,
          side * 23.2,
          5.9,
          0,
          1.5,
          0.6,
          2.1,
          turquoise,
        );
      }
    }
    for (let s = jump.takeoff - 112; s < jump.takeoff - 16; s += 21) {
      const f = track.sample(s);
      for (const side of [-1, 1]) {
        const q = f.quaternion
          .clone()
          .multiply(
            new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(0, 1, 0),
              side * 0.66,
            ),
          );
        transform.compose(
          framePoint(f, side * 5, 0.06),
          q,
          new THREE.Vector3(0.7, 0.06, 5),
        );
        add(
          'Broad amber launch chevrons',
          box.clone().applyMatrix4(transform),
          warning,
        );
      }
    }
  }
  box.dispose();
  for (const bucket of buckets.values()) {
    const geometry = mergeGeometries(bucket.parts, false);
    for (const part of bucket.parts) part.dispose();
    geometry.computeBoundingSphere();
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, bucket.material);
    mesh.name = bucket.name;
    mesh.receiveShadow = true;
    Object.assign(mesh.userData, bucket.data);
    group.add(mesh);
  }
  group.userData.roadIdentity =
    'satin limestone / turquoise inlay / slate civic bow / bronze load arms';
  group.userData.supportedRanges = ranges;
  let disposed = false;
  return {
    group,
    setReflection(texture) {
      if (disposed) return;
      for (const material of materials) {
        material.envMap = texture;
        material.envMapIntensity = material === bronze ? 0.75 : 0.45;
        material.needsUpdate = true;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      geometries.clear();
      materials.clear();
    },
  };
}
