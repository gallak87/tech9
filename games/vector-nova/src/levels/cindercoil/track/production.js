import * as THREE from 'three';
import { beveledBoxGeometry } from './beveled-box.js';
import { createCeramicTextures } from './ceramic-textures.js';
import { applyCindercoilAssetMaterials } from '../environment/materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { framePoint } from '../../../track/frames.js';
import {
  beamTransform,
  boxProfile,
  sweepGeometry,
} from '../../../track/geometry.js';
import { createRouteClearance } from '../../../environment/placement.js';

export function roadIntervals(track) {
  const result = [];
  let start = 0;
  for (const jump of track.jumps) {
    result.push({ start, end: jump.takeoff });
    start = jump.landingStart;
  }
  result.push({ start, end: track.length });
  return result;
}

const transform = (
  track,
  s,
  x,
  y,
  z = 0,
  scale = new THREE.Vector3(1, 1, 1),
) => {
  const frame = track.sample(s);
  return {
    position: framePoint(frame, x, y, z),
    quaternion: frame.quaternion,
    scale,
  };
};

export function createCindercoilRoad({ track, shape = false, settings = {} }) {
  const group = new THREE.Group();
  group.name = shape
    ? 'Cindercoil / neutral route'
    : 'Cindercoil / interlocking ceramic raceway';
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const material = (parameters) => {
    const result = new THREE.MeshStandardMaterial(parameters);
    materials.add(result);
    return result;
  };
  const ceramic = shape ? {} : createCeramicTextures();
  for (const texture of Object.values(ceramic)) textures.add(texture);
  const bodyFinish = shape
    ? {}
    : {
        map: ceramic.bodyColor,
        bumpMap: ceramic.bodyHeight,
        bumpScale: 0.09,
        roughnessMap: ceramic.roughness,
      };
  const plateFinish = shape
    ? {}
    : {
        map: ceramic.plateColor,
        bumpMap: ceramic.plateHeight,
        bumpScale: 0.075,
        roughnessMap: ceramic.roughness,
      };
  const ivory = material({
    color: shape ? 0xb4bdc0 : 0xd9ceb7,
    roughness: 0.94,
    metalness: 0.025,
    ...bodyFinish,
  });
  const charcoal = material({
    color: shape ? 0x89979c : 0x60696b,
    roughness: 0.9,
    metalness: 0.055,
    ...bodyFinish,
  });
  const oxide = material({
    color: shape ? 0x7b8b90 : 0x914d3c,
    roughness: 0.93,
    metalness: 0.03,
    ...bodyFinish,
  });
  const palePlate = material({
    color: 0xdbd0b8,
    roughness: 0.93,
    metalness: 0.025,
    ...plateFinish,
  });
  const darkPlate = material({
    color: 0x647173,
    roughness: 0.88,
    metalness: 0.09,
    ...plateFinish,
  });
  const redPlate = material({
    color: 0x975748,
    roughness: 0.88,
    metalness: 0.055,
    ...plateFinish,
  });
  const blackglass = material({
    color: 0x37484f,
    roughness: 0.53,
    metalness: 0.24,
    ...plateFinish,
  });
  const keel = material({
    color: shape ? 0x77878e : 0x343b3e,
    roughness: 0.95,
    ...bodyFinish,
  });
  const edge = material({
    color: shape ? 0xc0c8ca : 0xe0d4b8,
    roughness: 0.83,
    ...bodyFinish,
  });
  const basalt = material({
    name: 'Basalt / stable support plinths',
    color: 0x424a55,
    roughness: 0.98,
  });
  const amber = material({
    color: shape ? 0xc2ad79 : 0xd5a750,
    roughness: 0.72,
    emissive: shape ? 0x000000 : 0x603313,
    emissiveIntensity: 0.2,
  });
  const white = material({ color: 0xf5e6c5, roughness: 0.85 });
  const add = (name, geometry, surface, drivingSurface = false) => {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.name = name;
    mesh.receiveShadow = true;
    mesh.castShadow = !drivingSurface;
    mesh.userData.drivingSurface = drivingSurface;
    group.add(mesh);
    return mesh;
  };
  const merged = (name, parts, surface, drivingSurface = false) => {
    if (!parts.length) return null;
    const geometry = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    return add(name, geometry, surface, drivingSurface);
  };
  const instanced = (
    name,
    geometry,
    surface,
    placements,
    castShadow = true,
  ) => {
    if (!placements.length) {
      geometry.dispose();
      return null;
    }
    geometries.add(geometry);
    const mesh = new THREE.InstancedMesh(geometry, surface, placements.length);
    const matrix = new THREE.Matrix4();
    placements.forEach(
      ({ position, quaternion, scale = new THREE.Vector3(1, 1, 1) }, index) => {
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(index, matrix);
      },
    );
    mesh.name = name;
    mesh.receiveShadow = true;
    mesh.castShadow = castShadow;
    mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  };
  const intervals = roadIntervals(track);
  const deckParts = [],
    sideParts = [],
    railParts = [],
    edgeParts = [];
  const palePlates = [],
    darkPlates = [],
    redPlates = [],
    glassPlates = [];
  const wallBlocks = [],
    wallCaps = [],
    wallBrackets = [],
    coolingSlats = [];
  const oxideCaps = [],
    edgeBolts = [],
    shoulders = [],
    warningTabs = [];
  const isCoil = (s) =>
    s >= track.landmarks.coil.start && s <= track.landmarks.coil.end;
  const inCrown = (s) => {
    const section = track.sections.find(({ id }) => id === 'crown');
    return s >= section.start && s <= section.end;
  };
  for (const { start, end } of intervals) {
    if (shape)
      deckParts.push(
        sweepGeometry(
          track,
          [
            [-15, 0],
            [15, 0],
          ],
          { start, end, step: 2.5 },
        ),
      );
    sideParts.push(
      sweepGeometry(
        track,
        [
          [15, 0],
          [16.3, -1.1],
          [15.2, -3.8],
          [10.8, -7.8],
          [-10.8, -7.8],
          [-15.2, -3.8],
          [-16.3, -1.1],
          [-15, 0],
        ],
        { start, end, step: 2.5 },
      ),
    );
    for (const side of [-1, 1]) {
      railParts.push(
        sweepGeometry(track, boxProfile(side * 15.65, 0.55, 1.25, 1.1), {
          start,
          end,
          step: 2.5,
        }),
      );
      edgeParts.push(
        sweepGeometry(track, boxProfile(side * 15.5, 1.11, 1.0, 0.12), {
          start,
          end,
          step: 2.5,
        }),
      );
      shoulders.push(
        sweepGeometry(track, boxProfile(side * 16.8, -2.3, 2.4, 1.2), {
          start,
          end,
          step: 3,
        }),
      );
    }
    // One tessellated running surface: adjacent cassettes meet on identical
    // 2 m stations. Joint/bevel maps replace coplanar overlays, preventing the
    // near-field cracks and z-fighting previously visible through the roll.
    if (!shape) {
      const edges = [-15, -9, -3, 3, 9, 15];
      for (let column = 0; column < edges.length - 1; column += 1) {
        const stagger = column % 2 ? 6 : 0;
        for (let rowStart = start - stagger; rowStart < end; rowStart += 12) {
          const from = Math.max(start, rowStart),
            to = Math.min(end, rowStart + 12);
          if (to <= from) continue;
          const row = Math.floor((rowStart - start + stagger) / 12);
          const middle = (from + to) / 2;
          let parts = palePlates;
          if (
            column === 2 ||
            (column === 1 && row % 7 === 3) ||
            (column === 3 && row % 9 === 6)
          )
            parts = darkPlates;
          if (
            isCoil(middle) &&
            (column === 2 || (column === 4 && row % 5 === 2))
          )
            parts = redPlates;
          if (inCrown(middle) && column > 0 && column < 4) parts = glassPlates;
          const geometry = sweepGeometry(
            track,
            [
              [edges[column], 0],
              [edges[column + 1], 0],
            ],
            { start: from, end: to, step: 2 },
          );
          const uv = geometry.attributes.uv;
          const segments = uv.count / 2 - 1;
          for (let index = 0; index < uv.count; index += 1) {
            const distance =
              from + ((to - from) * Math.floor(index / 2)) / segments;
            const u = index % 2;
            uv.setXY(index, row % 2 ? 1 - u : u, (distance - rowStart) / 12);
          }
          parts.push(geometry);
        }
      }
    }
    const spacing = shape ? 24 : 18;
    for (let s = start + 8; s < end - 7; s += spacing) {
      for (const side of [-1, 1]) {
        wallBlocks.push(transform(track, s, side * 17.2, 1.9));
        wallCaps.push(transform(track, s, side * 17.3, 3.12));
        wallBrackets.push(transform(track, s, side * 17.6, 0.7));
        if (Math.floor(s / spacing) % 4 === 0)
          oxideCaps.push(transform(track, s, side * 17.34, 3.17));
        if (!shape && settings.quality !== 'low') {
          for (const y of [-4.7, -5.35, -6])
            coolingSlats.push(transform(track, s, side * 11.75, y));
          edgeBolts.push(transform(track, s - 4.5, side * 15.67, 1.2));
          edgeBolts.push(transform(track, s + 4.5, side * 15.67, 1.2));
        }
      }
    }
  }
  merged('Continuous 30 m ceramic deck / gap omitted', deckParts, ivory, true);
  if (!shape) {
    merged('Broad pale interlocking heat plates', palePlates, palePlate, true);
    merged('Charcoal glazed cassette fields', darkPlates, darkPlate, true);
    merged(
      'Oxide replacement cassettes / furnace reinforcement',
      redPlates,
      redPlate,
      true,
    );
    merged('Cool polished Blackglass cassettes', glassPlates, blackglass, true);
  }
  merged('Deep beveled ceramic box keel', sideParts, keel);
  merged('Low continuous inner ceramic curb', railParts, ivory);
  merged('Warm pale continuous edge cap', edgeParts, edge);
  merged('External cantilever shoulder ledges', shoulders, oxide);
  instanced(
    'Slotted kiln-shelf upper wall masses',
    beveledBoxGeometry(2.8, 1.0, 11.4, 0.13),
    ivory,
    wallBlocks,
  );
  instanced(
    'Overhanging kiln-shelf wall caps',
    beveledBoxGeometry(3.65, 0.48, 13.2, 0.095),
    edge,
    wallCaps,
  );
  instanced(
    'Offset wall cantilever brackets',
    beveledBoxGeometry(1.6, 5.0, 1.15, 0.09),
    oxide,
    wallBrackets,
  );
  instanced(
    'Oxide red wall replacement ends',
    beveledBoxGeometry(3.68, 0.2, 2.3, 0.045),
    oxide,
    oxideCaps,
  );
  instanced(
    'Underside cooling slot shadow bands',
    new THREE.BoxGeometry(0.22, 0.23, 10.4),
    charcoal,
    coolingSlats,
    false,
  );
  instanced(
    'Ceramic wall cap captive anchors',
    new THREE.BoxGeometry(0.25, 0.12, 0.28),
    charcoal,
    edgeBolts,
    false,
  );

  // Upright outside piers and broad under-deck brackets visibly meet basalt.
  // The shared clearance query rejects any pier that approaches another road,
  // including the raised coil and the lower return beneath its approach.
  const clearance = createRouteClearance(track, {
    spacing: 5,
    sidePadding: 6,
    localVertical: [-5, 23],
    longitudinalHalfLength: 7,
    supportPadding: 0,
  });
  const piers = [],
    footings = [],
    rockBases = [],
    arms = [],
    collars = [],
    towerArms = [];
  const supportBounds = [];
  const supportSegments = [];
  const corridorFrames = [];
  for (let s = 0; s < track.length; s += 4)
    corridorFrames.push(track.sample(s));
  const beamClears = (from, to) => {
    const steps = Math.ceil(from.distanceTo(to) / 3);
    for (let index = 0; index <= steps; index += 1) {
      const point = from.clone().lerp(to, index / steps);
      for (const frame of corridorFrames) {
        const delta = point.clone().sub(frame.position);
        if (
          Math.abs(delta.dot(frame.tangent)) < 8.5 &&
          Math.abs(delta.dot(frame.right)) < 24 &&
          delta.dot(frame.up) > -8.5 &&
          delta.dot(frame.up) < 26
        )
          return false;
      }
    }
    return true;
  };
  for (let s = 65; s < track.length; s += 90) {
    if (
      track.jumps.some(
        ({ takeoff, landingStart }) =>
          s > takeoff - 15 && s < landingStart + 12,
      )
    )
      continue;
    const frame = track.sample(s);
    if (isCoil(s)) {
      const center = new THREE.Vector3(...track.landmarks.coil.center);
      const destination = framePoint(frame, 0, -12);
      const radial = destination.clone().sub(center);
      radial.y = 0;
      radial.normalize();
      const anchor = center.addScaledVector(
        radial,
        track.landmarks.coil.towerRadius - 2,
      );
      anchor.y = destination.y - 11;
      if (beamClears(anchor, destination)) {
        towerArms.push(beamTransform(anchor, destination, 3.3, 5.2));
        supportSegments.push({
          from: anchor.toArray(),
          to: destination.toArray(),
          kind: 'coil',
        });
      }
      continue;
    }
    if (frame.up.y < 0.45) continue;
    const side = Math.floor(s / 90) % 2 ? -1 : 1;
    const outer = framePoint(frame, side * 29, -17);
    const top = outer.y;
    const bottom = track.groundY + 3;
    if (
      top < bottom + 12 ||
      !clearance.clears(outer.x, outer.z, 7.5, 9.5, top, 0, bottom)
    )
      continue;
    const position = new THREE.Vector3(outer.x, (top + bottom) / 2, outer.z);
    piers.push({
      position,
      quaternion: new THREE.Quaternion(),
      scale: new THREE.Vector3(7.5, top - bottom, 9.5),
    });
    footings.push({
      position: new THREE.Vector3(outer.x, bottom + 0.5, outer.z),
      quaternion: new THREE.Quaternion(),
    });
    rockBases.push({
      position: new THREE.Vector3(outer.x, track.groundY - 16, outer.z),
      quaternion: new THREE.Quaternion(),
    });
    const inner = framePoint(frame, side * 6, -10.5);
    arms.push(beamTransform(outer, inner, 3.5, 5.8));
    supportSegments.push({
      from: outer.toArray(),
      to: inner.toArray(),
      kind: 'pier',
    });
    collars.push({
      position: new THREE.Vector3(outer.x, top - 0.8, outer.z),
      quaternion: new THREE.Quaternion(),
    });
    supportBounds.push({
      x: outer.x,
      z: outer.z,
      minY: track.groundY - 39,
      maxY: top,
      halfX: 9,
      halfZ: 11,
    });
  }
  instanced(
    'Basalt-founded offset ceramic piers',
    beveledBoxGeometry(1, 1, 1, 0.022),
    ivory,
    piers,
  );
  instanced(
    'Wide under-deck bracket arms',
    beveledBoxGeometry(1, 1, 1, 0.018),
    oxide,
    arms,
  );
  instanced(
    'Coil tower radial cantilevers / clearance filtered',
    new THREE.BoxGeometry(1, 1, 1),
    oxide,
    towerArms,
  );
  instanced(
    'Pier spread foundation blocks',
    beveledBoxGeometry(13, 4.5, 15, 0.32),
    keel,
    footings,
  );
  instanced(
    'Columnar basalt stable support plinths',
    naturalPlinthGeometry(),
    basalt,
    rockBases,
  );
  instanced(
    'Ceramic pier bearing capitals',
    beveledBoxGeometry(10.5, 3.2, 12.5, 0.28),
    oxide,
    collars,
  );

  // Braking shelves and the vent are marked by broad bars and paired arrows.
  const markerParts = [],
    markerBacks = [],
    brakeBands = [];
  const markerAt = (s, side, colorDirection = 1) => {
    const frame = track.sample(s);
    const local = [
      [-1.6, 1.35],
      [0, 2.6],
      [1.6, 1.35],
      [1.6, 0.5],
      [0, 1.7],
      [-1.6, 0.5],
    ];
    const positions = [];
    for (const index of [0, 1, 5, 1, 4, 5, 1, 2, 4, 2, 3, 4]) {
      const [x, y] = local[index];
      const p = framePoint(
        frame,
        side * 17.3 + x * colorDirection,
        y + 2.7,
        -0.35,
      );
      positions.push(p.x, p.y, p.z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.computeVertexNormals();
    markerParts.push(geometry);
    markerBacks.push(transform(track, s, side * 17.3, 4.25));
  };
  for (const section of track.sections) {
    for (let index = 0; index < 3; index += 1) {
      const s = Math.max(12, section.start - 18 - index * 18);
      if (
        track.jumps.some(
          ({ takeoff, landingStart }) => s > takeoff && s < landingStart,
        )
      )
        continue;
      markerAt(s, -1);
      if (section.id === 'teeth' || section.id === 'return')
        brakeBands.push(
          sweepGeometry(
            track,
            [
              [-13.8, 0.115],
              [13.8, 0.115],
            ],
            { start: s, end: s + 0.8, step: 1 },
          ),
        );
    }
  }
  for (const jump of track.jumps) {
    for (let index = 0; index < 3; index += 1) {
      const s = jump.takeoff - 18 - index * 20;
      markerAt(s, 1);
      markerAt(s, -1);
      warningTabs.push(transform(track, s, 0, -5.1));
    }
    for (const side of [-1, 1]) markerAt(jump.landingStart + 8, side);
  }
  merged('Large amber direction and launch chevrons', markerParts, amber);
  instanced(
    'Ceramic braking and landing marker backboards',
    new THREE.BoxGeometry(4.6, 3, 0.6),
    charcoal,
    markerBacks,
  );
  merged('Broad pale braking shelf bars', brakeBands, white);
  instanced(
    'Vent approach underside ceramic reinforcement ribs',
    new THREE.BoxGeometry(29, 1.8, 3),
    oxide,
    warningTabs,
  );
  const grid = [];
  for (const x of [-12, -6, 0, 6, 12]) grid.push(transform(track, 22, x, 0.13));
  instanced(
    'Ashgate timing stripe',
    new THREE.BoxGeometry(3, 0.06, 1.2),
    white,
    grid,
  );
  group.userData.roadIntervals = intervals;
  group.userData.surfaceConstruction =
    'Single tessellation / staggered 6 x 12 m ceramic cassettes / no coplanar overlay';
  group.userData.ownedTextures = [...textures];
  group.userData.supportBounds = supportBounds;
  group.userData.supportSegments = supportSegments;
  group.userData.supportCounts = {
    piers: piers.length,
    coilArms: towerArms.length,
  };
  group.userData.identity =
    'Heat-shield cassettes / deep ceramic keel / open kiln-shelf walls';
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const geometry of geometries) geometry.dispose();
    for (const surface of materials) surface.dispose();
    for (const texture of textures) texture.dispose();
  };
  if (!shape) applyCindercoilAssetMaterials(group);
  group.traverse((object) => {
    object.updateMatrix();
    object.matrixAutoUpdate = false;
  });
  return { group, dispose };
}

function naturalPlinthGeometry() {
  const geometry = new THREE.CylinderGeometry(12, 16, 46, 9, 5);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      y = positions.getY(i),
      z = positions.getZ(i);
    const factor = 1 + 0.045 * Math.sin(y * 0.32 + Math.atan2(z, x) * 3);
    positions.setXYZ(i, x * factor, y, z * factor);
  }
  geometry.computeVertexNormals();
  return geometry;
}
