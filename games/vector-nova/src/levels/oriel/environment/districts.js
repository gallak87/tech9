import * as T from 'three';
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';
import {
  createLivingForestKit,
  livingForestBarkURL,
  livingForestLeafURL,
} from '@worldkit/environment/living-forest';
import { createCivicKit } from './civic-kit.js';
import { orielIslandEdge, orielIslandWeight } from '../hazards.js';
import {
  shellPoint,
  shellMatrix,
  terrainHeight,
  groundSlope,
  lakeAt,
  routeClearance,
  finishHabitatMaterial,
  randomSource,
  TAU,
  townAt,
  hubGateDistances,
  civicExcluded,
  LAKE_BASINS,
} from './habitat.js';

function lakeFacingYaw(row, col) {
  // Neighbours share an orientation toward the reservoir their streets serve.
  // Cardinal fronts retain the existing parcel grid and its pedestrian paths.
  const angle = ((Math.floor(col / 3) * 3 + 1) / 48) * TAU;
  const z = -2200 + (Math.floor(row / 3) * 3 + 1) * 130;
  let nearest = Infinity;
  let yaw = 0;
  for (const [lakeAngle, lakeZ] of LAKE_BASINS) {
    const across =
      Math.atan2(Math.sin(lakeAngle - angle), Math.cos(lakeAngle - angle)) *
      1000;
    const along = lakeZ - z;
    const distance = across * across + along * along;
    if (distance < nearest) {
      nearest = distance;
      yaw =
        Math.round(Math.atan2(across, along) / (Math.PI / 2)) * (Math.PI / 2);
    }
  }
  return yaw;
}

function batchParts(parts, placements, name, group, own, shadows = false) {
  if (!placements.length) return;
  for (const part of parts) {
    const mesh = own(
      new T.InstancedMesh(part.geometry, part.material, placements.length),
    );
    mesh.name = name;
    placements.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}

function finishCivicStone(material) {
  if (!/limestone|cornice/.test(material.name)) return;
  const base = material.onBeforeCompile,
    key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    base(shader, renderer);
    shader.vertexShader =
      'varying vec3 civicLocal;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ncivicLocal=position;',
      );
    shader.fragmentShader =
      'varying vec3 civicLocal;\n' +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
      float row=floor(civicLocal.y/3.2);
      vec2 block=vec2(civicLocal.x+civicLocal.z+mod(row,2.)*3.1,civicLocal.y);
      float edgeY=abs(mod(block.y+1.6,3.2)-1.6);
      float edgeX=abs(mod(block.x+3.1,6.2)-3.1);
      float footprint=max(fwidth(block.x),fwidth(block.y));
      float joint=1.-smoothstep(.015,.04+footprint,min(edgeX,edgeY));
      float course=sin(floor(block.x/6.2)*4.8+row*3.9)*.035;
      diffuseColor.rgb*=1.+course;
      diffuseColor.rgb*=1.-joint*.16;
    `,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+sin(civicLocal.x*2.1)*sin(civicLocal.y*1.7)*.035,.3,.92);`,
        );
  };
  material.customProgramCacheKey = () => key + ':oriel-civic-cut-block-v1';
}

export async function createHabitatDistricts(
  track,
  lifetime,
  stoneMaps,
  promenadeFronts = [],
  promenadeTrees = [],
  { reservations = [], plantingAnchors = [], civicPlacements = [] } = {},
) {
  const own = (resource) => lifetime.own(resource);
  const group = new T.Group();
  group.name = 'Oriel / inhabited terraces and Worldkit gardens';
  const kit = own(await createCivicKit());
  const loader = new T.TextureLoader();
  const bark = own(await loader.loadAsync(livingForestBarkURL));
  const leaves = own(await loader.loadAsync(livingForestLeafURL));
  bark.colorSpace = leaves.colorSpace = T.SRGBColorSpace;
  bark.wrapS = bark.wrapT = T.RepeatWrapping;
  bark.anisotropy = leaves.anisotropy = 4;
  const forest = own(
    createLivingForestKit({
      detail: 'low',
      textures: { wood: { map: bark }, leaf: { map: leaves } },
    }),
  );
  const treeParts = forest.prototypes[1].treeParts.map((part) => ({ ...part }));
  treeParts[0].geometry = own(
    await new SimplifyModifier().modify(
      treeParts[0].geometry,
      Math.floor(treeParts[0].geometry.attributes.position.count * 0.72),
    ),
  );
  for (const material of [forest.materials.wood, forest.materials.leaf])
    finishHabitatMaterial(material, { bounce: 0.14 });
  forest.materials.leaf.color.set('#d5e0d0');
  forest.materials.leaf.emissive.set('#99bc80');
  forest.materials.leaf.emissiveIntensity = 0.16;
  forest.materials.leaf.emissiveMap = leaves;
  forest.materials.leaf.userData.orielFoliage = true;
  const materials = new Set(
    Object.values(kit.prototypes)
      .flat()
      .flatMap((p) => (Array.isArray(p.material) ? p.material : [p.material])),
  );
  materials.forEach((material) => {
    finishHabitatMaterial(material, { bounce: 0.25 });
    finishCivicStone(material);
  });
  for (const parts of Object.values(kit.prototypes))
    for (const part of parts) {
      if (/limestone|cornice/.test(part.material.name)) {
        stoneMaps?.apply(part.material);
        stoneMaps?.coordinates(part.geometry);
      }
    }
  const random = randomSource(83104);
  const clear = routeClearance(track);
  const samples = [];
  for (let s = 0; s < track.length; s += 80)
    samples.push(track.sample(s).position);
  const nearRoute = (p) =>
    samples.some((q) => q.distanceToSquared(p) < 310 ** 2);
  const groups = new Map();
  const add = (category, matrix, angle, near) => {
    // Nearby shadow casters need local bounds. Whole-quadrant batches submit
    // distant civic geometry into a small sun-shadow camera on every frame.
    const sector = Math.floor(
      ((((angle % TAU) + TAU) % TAU) / TAU) * (near ? 8 : 4),
    );
    const axial = near ? Math.floor(matrix.elements[14] / 600) : 0;
    const key = `${category}:${sector}:${axial}:${near}`;
    if (!groups.has(key)) groups.set(key, { category, near, placements: [] });
    groups.get(key).placements.push(matrix);
  };
  const neighborhoods = [];
  const reserve = [];
  const reserved = (position, padding = 0) =>
    reservations.some((r) => r.contains(position, padding));
  // Real cutout foliage sits inside the physical chicane planters. Keep the
  // canopy well behind their stone faces so the clear lane stays readable.
  for (const island of track.challenges.filter((c) => c.kind === 'garden')) {
    for (let s = island.start + 20; s < island.end - 20; s += 24) {
      if (orielIslandWeight(island, s) < 0.3) continue;
      const edge = island.side * orielIslandEdge(island, s);
      const frame = track.sample(s);
      for (let x = edge + 4; x < 18; x += 6) {
        const position = frame.position
          .clone()
          .addScaledVector(frame.right, island.side * x)
          .addScaledVector(frame.up, 1.815);
        const size = 0.25 + random() * 0.06;
        add(
          'orchards',
          new T.Matrix4().compose(
            position,
            frame.quaternion
              .clone()
              .multiply(
                new T.Quaternion().setFromAxisAngle(
                  new T.Vector3(0, 1, 0),
                  random() * TAU,
                ),
              ),
            new T.Vector3(size, size * 0.8, size),
          ),
          Math.atan2(position.x, 1000 - position.y),
          true,
        );
      }
    }
  }
  for (const tree of promenadeTrees)
    add('trees', tree.matrix, tree.angle, true);
  for (const front of promenadeFronts) {
    add(front.category, front.matrix, front.angle, true);
    neighborhoods.push(front);
    reserve.push(front.position);
  }
  for (const place of civicPlacements) {
    const matrix = new T.Matrix4().compose(
      place.position,
      place.quaternion,
      place.scale,
    );
    const angle = Math.atan2(place.position.x, 1000 - place.position.y);
    add(place.category, matrix, angle, nearRoute(place.position));
    neighborhoods.push({ category: place.category, matrix, angle });
    reserve.push(place.position);
  }
  for (const anchor of plantingAnchors) {
    const position = anchor.position;
    add(
      anchor.kind === 'shrub' ? 'orchards' : 'trees',
      new T.Matrix4().compose(position, anchor.quaternion, anchor.scale),
      Math.atan2(position.x, 1000 - position.y),
      true,
    );
  }
  if (track.landmarks.corkscrew) {
    const f = track.sample(track.landmarks.corkscrew.start - 115);
    const p = f.position.clone().addScaledVector(f.right, -195);
    const angle = Math.atan2(p.x, 1000 - p.y),
      h = terrainHeight(angle, p.z) - 2;
    const position = shellPoint(angle, p.z, h + 28);
    if (clear(position, 112) && !reserved(position, 112)) {
      const toward = f.position.clone().sub(position),
        right = new T.Vector3(Math.cos(angle), Math.sin(angle), 0);
      const matrix = shellMatrix(
        angle,
        p.z,
        h,
        Math.atan2(toward.dot(right), toward.z),
        1.35,
      );
      add('gardenCourt', matrix, angle, true);
      neighborhoods.push({ category: 'gardenCourt', matrix, angle, position });
      reserve.push(position);
    }
  }
  for (const section of track.sections.filter(
    (s) => !promenadeFronts.some((f) => f.section === s.id),
  )) {
    if (section.id === 'sunline') continue;
    for (const side of [-1, 1]) {
      const distance = section.showcase + 135 + (side > 0 ? 140 : 0);
      if (
        track.jumps.some(
          (j) => distance > j.takeoff - 100 && distance < j.landingStart + 180,
        )
      )
        continue;
      const frame = track.sample(distance);
      for (const offset of [150, 190, 230]) {
        const near = frame.position
          .clone()
          .addScaledVector(frame.right, side * offset);
        const angle = Math.atan2(near.x, 1000 - near.y),
          z = near.z;
        if (lakeAt(angle, z) < 1.1) continue;
        const h = terrainHeight(angle, z) - 2.5,
          p = shellPoint(angle, z, h + 35);
        if (!clear(p, 108) || reserved(p, 85)) continue;
        const toward = frame.position.clone().sub(p);
        const right = new T.Vector3(Math.cos(angle), Math.sin(angle), 0);
        const yaw = Math.atan2(toward.dot(right), toward.z);
        const category = ['lakeside', 'terraces', 'waterside'].includes(
          section.id,
        )
          ? 'waterfront'
          : 'gardenCourt';
        const matrix = shellMatrix(angle, z, h, yaw, 1);
        add(category, matrix, angle, true);
        neighborhoods.push({ category, matrix, angle });
        reserve.push(p);
        break;
      }
    }
  }
  for (const { category, matrix, angle } of neighborhoods) {
    for (const anchor of kit.plantingAnchors[category] ?? []) {
      const size = category === 'waterfront' ? 0.21 : 0.18;
      const tree = matrix
        .clone()
        .multiply(new T.Matrix4().makeTranslation(...anchor))
        .multiply(new T.Matrix4().makeRotationY(random() * TAU))
        .multiply(new T.Matrix4().makeScale(size, size, size));
      add('trees', tree, angle, true);
    }
  }
  for (const distance of hubGateDistances(track)) {
    const frame = track.sample(distance);
    const matrix = new T.Matrix4().compose(
      frame.position.clone().addScaledVector(frame.up, -9),
      frame.quaternion,
      new T.Vector3(2.6, 1.75, 2),
    );
    add(
      'sunBracket',
      matrix,
      Math.atan2(frame.position.x, 1000 - frame.position.y),
      true,
    );
  }
  for (const z of [-2270, 2270])
    for (let i = 0; i < 12; i++) {
      const angle = ((i + 0.5) / 12) * TAU;
      add(
        'waterfrontFar',
        shellMatrix(angle, z, 45, z > 0 ? Math.PI : 0, 1.5),
        angle,
        false,
      );
    }
  let placed = 0;
  const parcels = [];
  for (let row = 0; row < 35; row++) {
    const z = -2200 + row * 130;
    for (let col = 0; col < 48; col++) {
      const angle = (col / 48) * TAU,
        axial = z;
      if (
        lakeAt(angle, axial) < 1.13 ||
        groundSlope(angle, axial) > 0.065 ||
        townAt(angle, axial) < 0.13 ||
        random() > 0.92
      )
        continue;
      const height = terrainHeight(angle, axial) - 3.5;
      const p = shellPoint(angle, axial, height + 30);
      if (
        reserved(p, 90) ||
        reserve.some((q) => q.distanceToSquared(p) < 170 ** 2) ||
        !clear(p, 128)
      )
        continue;
      const near = nearRoute(p),
        r = random();
      const base = r < 0.08 ? 'tower' : r < 0.55 ? 'waterfront' : 'gardenCourt';
      const scale =
        base === 'tower'
          ? 0.9 + random() * 0.2
          : base === 'waterfront'
            ? 0.72 + random() * 0.12
            : 0.95 + random() * 0.1;
      const category = base + (near ? '' : 'Far');
      const yaw = lakeFacingYaw(row, col);
      const matrix = shellMatrix(angle, axial, height, yaw, scale);
      add(category, matrix, angle, near);
      placed++;
      parcels.push({
        row,
        col,
        angle,
        z: axial,
        height: terrainHeight(angle, axial),
      });
      if (base !== 'tower' && random() < 0.68) {
        for (const anchor of (kit.plantingAnchors[base] ?? []).slice(0, 2)) {
          const tree = matrix
            .clone()
            .multiply(new T.Matrix4().makeTranslation(...anchor))
            .multiply(new T.Matrix4().makeRotationY(random() * TAU))
            .multiply(new T.Matrix4().makeScale(0.9, 0.9, 0.9));
          add('orchards', tree, angle, near);
        }
      }
    }
  }
  // Paired mature avenues attach the greenery to the race's actual districts.
  for (let s = 20; s < track.length; s += 45) {
    if (civicExcluded(track, s, 100)) continue;
    if (track.isGap(s)) continue;
    const frame = track.sample(s);
    const radial = Math.hypot(frame.position.x, frame.position.y - 1000);
    if (radial < 890) continue;
    for (const side of [-1, 1]) {
      const p = frame.position
        .clone()
        .addScaledVector(frame.right, side * (53 + random() * 18));
      const angle = Math.atan2(p.x, 1000 - p.y),
        z = p.z;
      if (lakeAt(angle, z) < 1.1) continue;
      const h = terrainHeight(angle, z);
      const top = shellPoint(angle, z, h + 14);
      if (reserved(top, 16)) continue;
      if (reserve.some((q) => q.distanceToSquared(top) < 140 ** 2)) continue;
      if (!clear(top, 35)) continue;
      add(
        'trees',
        shellMatrix(
          angle,
          z,
          h,
          random() * TAU,
          new T.Vector3(
            0.2 + random() * 0.06,
            0.22 + random() * 0.09,
            0.2 + random() * 0.06,
          ),
        ),
        angle,
        true,
      );
    }
  }
  const groves = [
    [1.55, 760],
    [2.35, -30],
    [5.45, -1420],
    [0.72, -930],
    [3.35, 1120],
  ];
  for (const [centerAngle, centerZ] of groves)
    for (let row = -4; row <= 4; row++)
      for (let col = -4; col <= 4; col++) {
        if (row * row + col * col > 28 || random() < 0.12) continue;
        const angle = centerAngle + (col * 28 + (random() - 0.5) * 6) / 1000,
          z = centerZ + row * 34 + (random() - 0.5) * 7;
        if (lakeAt(angle, z) < 1.13 || groundSlope(angle, z) > 0.18) continue;
        const h = terrainHeight(angle, z),
          p = shellPoint(angle, z, h + 10);
        if (
          reserved(p, 16) ||
          !clear(p, 65) ||
          reserve.some((q) => q.distanceToSquared(p) < 85 ** 2)
        )
          continue;
        const scale = 1.1 + random() * 0.35;
        add(
          'orchards',
          shellMatrix(
            angle,
            z,
            h - 0.25,
            random() * TAU,
            new T.Vector3(scale, scale, scale),
          ),
          angle,
          nearRoute(p),
        );
      }
  for (const { category, placements, near } of groups.values()) {
    const parts =
      category === 'trees'
        ? treeParts
        : category === 'orchards'
          ? forest.shrubParts
          : kit.prototypes[category];
    batchParts(
      parts,
      placements,
      `Oriel / ${category === 'trees' ? 'Worldkit garden pines' : category + ' civic streets'}`,
      group,
      own,
      near,
    );
  }
  group.userData.civicCount = placed;
  group.userData.neighborhoodCount = neighborhoods.length;
  group.userData.usesWorldkit =
    '@worldkit/environment/living-forest; low windward canopy and canonical bark/foliage textures';
  return {
    group,
    parcels,
    materials: [...materials, ...treeParts.map((p) => p.material)],
  };
}
