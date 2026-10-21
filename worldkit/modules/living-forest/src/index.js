import * as T from 'three';
import {
  createWoodGeometry,
  createFoliageSprayGeometry,
  createRockGeometry,
  mergeParts,
  randomSource,
} from './geometry.js';
import { createLivingForestMaterials } from './materials.js';

function matureTree(seed, variant, detail, materials) {
  const random = randomSource(seed),
    high = detail === 'high';
  const wood = [],
    leaves = [];
  const stature = [1, 0.91, 1.12][variant];
  const lean = [
    new T.Vector3(6, 0, -5),
    new T.Vector3(17, 0, 5),
    new T.Vector3(-9, 0, 7),
  ][variant];
  const trunk = (y) =>
    new T.Vector3(
      lean.x * Math.pow(y / 90, 1.35) + Math.sin(y / 25) * 2.6,
      y * stature,
      (lean.z * y) / 90,
    );
  const addWood = (points, radii, segments = 16, sides = 12, fluting = 0.18) =>
    wood.push(
      createWoodGeometry(points, radii, {
        segments: high ? segments : Math.max(3, Math.round(segments * 0.6)),
        sides: high ? sides : Math.max(5, Math.round(sides * 0.45)),
        lobes: 7,
        seed: seed % 17,
        fluting,
      }),
    );
  addWood(
    [trunk(0), trunk(18), trunk(44), trunk(65), trunk(86)],
    [10, 7.8, 5.5, 3.7, 1.4],
    36,
    24,
    0.23,
  );
  // Tall triangular buttress roots merge into the bole, then sink into the soil.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + random() * 0.18;
    const direction = new T.Vector3(Math.cos(a), 0, Math.sin(a));
    addWood(
      [
        trunk(24 + random() * 8).addScaledVector(direction, 1.4),
        direction.clone().multiplyScalar(8).setY(11),
        direction
          .clone()
          .multiplyScalar(17 + random() * 5)
          .setY(2.8),
        direction
          .clone()
          .multiplyScalar(26 + random() * 7)
          .setY(-1.2),
      ],
      [3.6, 5.1, 2.7, 0.28],
      14,
      12,
      0.1,
    );
  }
  const crowns = [];
  for (let i = 0; i < 5; i++) {
    const angle = i * 2.399 + variant * 0.7;
    const direction = new T.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const y = 42 + i * 6.2;
    const start = trunk(y);
    const reach = (variant === 1 ? 37 : 29) + random() * 8 - i * 1.4;
    const end = start
      .clone()
      .addScaledVector(direction, reach)
      .add(new T.Vector3(lean.x * 0.25, 17 + random() * 10, lean.z * 0.2));
    const elbow = start
      .clone()
      .lerp(end, 0.48)
      .add(new T.Vector3(0, -4, 0));
    addWood([start, elbow, end], [4.5 - i * 0.28, 2.8, 0.6], 20, 16);
    crowns.push({ center: end, angle, size: 15 + random() * 7 });
  }
  crowns.push({ center: trunk(88), angle: variant, size: 17 });
  for (const crown of crowns) {
    // Unequal outward limbs create overlapping crown masses, never a palm rosette.
    for (let f = 0; f < 5; f++) {
      const angle = crown.angle + (f - 2) * 0.58 + (random() - 0.5) * 0.85;
      const radial = new T.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const start = crown.center.clone().addScaledVector(radial, -1.8);
      const tip = crown.center
        .clone()
        .addScaledVector(radial, crown.size * (0.75 + random() * 0.55))
        .add(new T.Vector3(0, random() * 12 - 4, 0));
      const bend = 1.5 + random() * 2.5;
      addWood(
        [
          start,
          start
            .clone()
            .lerp(tip, 0.48)
            .add(new T.Vector3(0, bend, 0)),
          tip,
        ],
        [1.15, 0.62, 0.12],
        10,
        8,
        0.06,
      );
      for (let fork = 0; fork < 4; fork++) {
        const ft = 0.19 + fork * 0.2 + random() * 0.05;
        const forkBase = start.clone().lerp(tip, ft);
        forkBase.y += Math.sin(ft * Math.PI) * bend;
        const forkAngle = angle + (fork % 2 ? 1 : -1) * (0.5 + random() * 0.75);
        const forkDirection = new T.Vector3(
          Math.cos(forkAngle),
          0,
          Math.sin(forkAngle),
        );
        const forkTip = forkBase
          .clone()
          .addScaledVector(forkDirection, 5 + random() * 7)
          .add(new T.Vector3(0, random() * 5 - 1.5, 0));
        // The lowest quality keeps parent limbs; near twigs join them physically.
        if (high)
          addWood(
            [
              forkBase,
              forkBase
                .clone()
                .lerp(forkTip, 0.5)
                .add(new T.Vector3(0, 1, 0)),
              forkTip,
            ],
            [0.26, 0.14, 0.025],
            5,
            5,
            0.04,
          );
        const sprayLength = 13 + random() * 6;
        const sprayWidth = sprayLength * (0.8 + random() * 0.27);
        const brightness = 0.88 + random() * 0.18;
        const yaw = forkAngle + (random() - 0.5) * 0.25;
        const pitch = (random() - 0.3) * 0.45;
        const bendAmount = 0.8 + random() * 1.3;
        // Every far crown keeps every attachment site. Two crossed planes retain
        // coverage; near crowns gain a third gently twisted plane for depth.
        for (let card = 0; card < (high ? 3 : 2); card++) {
          const leaf = createFoliageSprayGeometry({
            length: sprayLength, width: sprayWidth, bend: bendAmount,
            tint: [brightness * 0.96, brightness, brightness * 0.98],
          });
          leaf.rotateZ([-0.68, 0.68, 0][card]);
          leaf.rotateX(pitch + (card === 2 ? 0.2 : 0));
          leaf.rotateY(Math.PI / 2 - yaw);
          leaf.translate(forkBase.x, forkBase.y, forkBase.z);
          leaves.push(leaf);
        }
      }
    }
  }
  const treeParts = [
    { geometry: mergeParts(wood), material: materials.wood, kind: 'wood' },
    { geometry: mergeParts(leaves), material: materials.leaf, kind: 'leaf' },
  ];
  const bounds = new T.Box3();
  treeParts.forEach(({ geometry }) => bounds.union(geometry.boundingBox));
  return {
    name: ['cathedral', 'windward', 'forked'][variant],
    treeParts,
    foliageClusterCount: crowns.length * 5 * 4,
    foliageCardCount: leaves.length,
    bounds,
    height: bounds.max.y - bounds.min.y,
    radius: Math.max(bounds.max.x, -bounds.min.x, bounds.max.z, -bounds.min.z),
  };
}

function shrub(seed, detail, materials) {
  const random = randomSource(seed),
    wood = [],
    leaves = [];
  for (let stem = 0; stem < 5; stem++) {
    const a = stem * 2.399;
    const tip = new T.Vector3(
      Math.cos(a) * 3,
      3 + random() * 3,
      Math.sin(a) * 3,
    );
    wood.push(
      createWoodGeometry(
        [[0, -0.2, 0], [tip.x * 0.4, 2, tip.z * 0.4], tip],
        [0.45, 0.22, 0.04],
        { segments: 7, sides: 6, fluting: 0.08 },
      ),
    );
    for (let card = 0; card < 2; card++) {
      const leaf = createFoliageSprayGeometry({length: 5.5 + random() * 2, width: 6.5, bend: 0.5});
      leaf.rotateZ(card ? 0.7 : -0.7); leaf.rotateX(-0.35); leaf.rotateY(a);
      leaf.translate(tip.x, tip.y - 1, tip.z); leaves.push(leaf);
    }
  }
  return [
    { geometry: mergeParts(wood), material: materials.wood, kind: 'wood' },
    { geometry: mergeParts(leaves), material: materials.leaf, kind: 'leaf' },
  ];
}

/**
 * Original monumental cloud-forest art, in metres. Two merged draws per tree.
 * Consumers own placement/lighting; kit owns geometry, materials and generated maps.
 * Optional textures.wood maps (color/normal/roughness/bump) and textures.leaf.map are borrowed.
 */
export function createLivingForestKit({
  detail = 'high',
  seed = 7319,
  textures,
} = {}) {
  if (!['high', 'low'].includes(detail))
    throw new Error('Living Forest detail must be high or low');
  const palette = createLivingForestMaterials({ textures });
  const prototypes = [0, 1, 2].map((variant) =>
    matureTree(seed + variant * 517, variant, detail, palette),
  );
  const shrubParts = shrub(seed + 333, detail, palette);
  const rockParts = [0, 1, 2].map((i) => ({
    geometry: createRockGeometry(seed + i * 17, detail),
    material: palette.rock,
    kind: 'rock',
  }));
  const allParts = [
    ...prototypes.flatMap((p) => p.treeParts),
    ...shrubParts,
    ...rockParts,
  ];
  let disposed = false;
  return {
    prototypes,
    treeParts: prototypes[0].treeParts,
    shrubParts,
    rockParts,
    materials: { wood: palette.wood, leaf: palette.leaf, rock: palette.rock },
    materialList: palette.materials,
    palette,
    textures: palette.textures,
    dispose() {
      if (disposed) return;
      disposed = true;
      new Set(allParts.map((p) => p.geometry)).forEach((geometry) =>
        geometry.dispose(),
      );
      palette.dispose();
    },
  };
}

export { createLivingForestMaterials } from './materials.js';
export {
  createWoodGeometry,
  createLeafGeometry,
  createRockGeometry,
} from './geometry.js';
