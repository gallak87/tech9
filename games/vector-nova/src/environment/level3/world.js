import * as T from 'three';
import { groundFrame } from '../placement.js';
import { createBatches } from './geometry.js';
import { nacreSeabedHeight } from './seabed.js';

export function createNacreWorld(track, materials, clearance, random, seabedY) {
  const batches = createBatches();
  const placements = [];
  const lightAnchors = [];
  const waterY = track.waterY ?? 0;
  function place(distance, side, offset, radius, minY, maxY, kind) {
    const frame = groundFrame(track, distance);
    const reservedRadius = radius + 12;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const p = frame.position
        .clone()
        .addScaledVector(frame.right, side * (offset + attempt * 42));
      if (!clearance.clears(p.x, p.z, reservedRadius, minY, maxY)) continue;
      placements.push({ kind, distance, x: p.x, z: p.z, radius, minY, maxY });
      return p;
    }
    return null;
  }
  // Weathered asymmetric pinnacles rise out of broad, irregular talus feet.
  for (let i = 0; i < 32; i += 1) {
    const distance = (track.length * (i + 0.3)) / 32;
    const radius = 38 + random() * 37;
    const top =
      i % 3 ? waterY - 18 - random() * 54 : waterY + 40 + random() * 115;
    const p = place(
      distance,
      i % 2 ? 1 : -1,
      195,
      radius + 14,
      seabedY - 40,
      top + 12,
      'basalt-spire',
    );
    if (!p) continue;
    const rootY = nacreSeabedHeight(track, p.x, p.z) - 12;
    const height = top - rootY;
    const color = new T.Color().setHSL(
      0.52 + random() * 0.02,
      0.075,
      0.31 + random() * 0.1,
    );
    batches.add(
      i % 2 ? 'basaltA' : 'basaltB',
      materials.basalt,
      [p.x, rootY + height / 2, p.z],
      [radius * 0.9, height, radius * 0.82],
      [0, random() * 6, 0],
      color,
    );
    for (let b = 0; b < 3; b += 1) {
      const h = height * (0.18 + b * 0.065);
      batches.add(
        b % 2 ? 'reefRockA' : 'reefRockB',
        materials.basalt,
        [
          p.x + Math.sin(i + b * 2.1) * radius * 0.22,
          rootY + h * 0.6,
          p.z + Math.cos(i + b * 2.1) * radius * 0.18,
        ],
        [radius * (0.75 - b * 0.08), h, radius * (0.68 - b * 0.07)],
        [0, i * 0.71 + b, 0.08 * Math.sin(i)],
        color,
      );
    }
  }
  // Reefs grow as asymmetric branches, thin fans and encrusting boulder coral.
  // Local depth bands and longitudinal jitter avoid pairs of repeated planters.
  for (
    let distance = 90;
    distance < track.length;
    distance += 68 + random() * 48
  ) {
    const frame = track.sample(distance);
    if (frame.position.y > waterY - 13) continue;
    for (const side of [-1, 1]) {
      if (random() < 0.1) continue;
      const depthBand = Math.floor(random() * 3);
      const radius = 30 + random() * 10;
      const floor = Math.max(
        seabedY + 20,
        frame.position.y - 35 - depthBand * 24 - random() * 14,
      );
      const top = Math.min(waterY - 10, floor + 48);
      const p = place(
        distance,
        side,
        68 + depthBand * 64 + random() * 35,
        radius,
        seabedY - 40,
        top,
        'reef-colony',
      );
      if (!p) continue;
      const rootY = nacreSeabedHeight(track, p.x, p.z) - 12;
      const baseHeight = floor + 10 - rootY;
      batches.add(
        'reefRockA',
        materials.basalt,
        [p.x, rootY + baseHeight / 2, p.z],
        [radius * 0.91, baseHeight * 0.58, radius * 0.83],
        [0, distance * 0.013, 0],
        '#879c92',
      );
      for (let b = 0; b < 3; b += 1) {
        const angle = random() * Math.PI * 2;
        const bx = p.x + Math.cos(angle) * radius * 0.4;
        const bz = p.z + Math.sin(angle) * radius * 0.35;
        batches.add(
          'reefRockB',
          materials.basalt,
          [bx, floor - 6 + random() * 8, bz],
          [9 + random() * 8, 7 + random() * 9, 8 + random() * 7],
          [0, angle, 0.15],
          '#7c9991',
        );
      }
      const species = Math.floor(random() * 3);
      placements.at(-1).species = [
        'branching-antler',
        'sea-fan',
        'encrusting-boulder',
      ][species];
      const count = 4 + Math.floor(random() * 5);
      for (let plant = 0; plant < count; plant += 1) {
        const angle = random() * Math.PI * 2;
        const radiusFromCenter = 5 + random() * 14;
        const x = p.x + Math.cos(angle) * radiusFromCenter;
        const z = p.z + Math.sin(angle) * radiusFromCenter;
        const height = Math.min(12 + random() * 22, top - floor - 12);
        const leanX = Math.cos(angle + 0.7) * 4;
        const leanZ = Math.sin(angle + 0.7) * 4;
        if (species === 2) {
          const size = 4 + random() * 4;
          batches.add(
            'reefRockB',
            materials.coral,
            [x, floor + size * 0.55, z],
            [size, size * 0.7, size * 0.8],
            [0, angle, 0.2],
          );
          for (let tip = 0; tip < 3; tip += 1) {
            const ta = angle + tip * 2.1;
            batches.beam(
              materials.glow,
              [
                x + Math.cos(ta) * size * 0.5,
                floor + size * 0.7,
                z + Math.sin(ta) * size * 0.4,
              ],
              [
                x + Math.cos(ta) * size * 0.8,
                floor + size + 1,
                z + Math.sin(ta) * size * 0.7,
              ],
              0.32,
              null,
              'twig',
            );
          }
          continue;
        }
        const root = [x, floor + 2, z];
        const fork = [x + leanX * 0.5, floor + height * 0.52, z + leanZ * 0.5];
        const tip = [x + leanX, floor + height, z + leanZ];
        batches.beam(materials.kelp, root, fork, 1.0, null, 'twig');
        batches.beam(materials.coral, fork, tip, 0.7, null, 'twig');
        if (species === 1) {
          batches.add(
            'fan',
            materials.fan,
            [tip[0], tip[1] - 4, tip[2]],
            [5 + random() * 3, 7 + random() * 4, 3],
            [0.15, angle, -0.2 + random() * 0.4],
          );
          batches.beam(
            materials.glow,
            [tip[0], tip[1] - 2, tip[2]],
            tip,
            0.28,
            null,
            'twig',
          );
        } else {
          for (let branch = 0; branch < 3; branch += 1) {
            const a = angle + branch * 2.15;
            const branchRoot = [
              fork[0],
              fork[1] + branch * height * 0.07,
              fork[2],
            ];
            const elbow = [
              fork[0] + Math.cos(a) * 5,
              fork[1] + height * (0.18 + branch * 0.06),
              fork[2] + Math.sin(a) * 5,
            ];
            const end = [
              elbow[0] + Math.cos(a + 0.3) * 2,
              elbow[1] + 4,
              elbow[2] + Math.sin(a + 0.3) * 2,
            ];
            batches.beam(
              materials.coral,
              branchRoot,
              elbow,
              0.63,
              null,
              'twig',
            );
            batches.beam(materials.glow, elbow, end, 0.34, null, 'twig');
          }
        }
      }
    }
  }
  // Large living canopies frame the submerged course above its barrier line.
  const gardens = [];
  for (let distance = 1580; distance < track.length - 600; distance += 188) {
    if (track.sample(distance).position.y < waterY - 42)
      gardens.push({ distance, side: gardens.length % 2 ? 1 : -1 });
  }
  const abyss = track.jumps[1];
  if (abyss)
    for (const side of [-1, 1])
      gardens.push({ distance: abyss.landingStart + 48, side });
  for (const [index, garden] of gardens.entries()) {
    const frame = groundFrame(track, garden.distance);
    const floor = frame.position.y - 26;
    const top = Math.min(waterY - 8, frame.position.y + 48);
    const p = place(
      garden.distance,
      garden.side,
      132,
      64,
      seabedY - 40,
      top + 3,
      'living-reef-canopy',
    );
    if (!p) continue;
    const rootY = nacreSeabedHeight(track, p.x, p.z) - 14;
    const height = floor - rootY;
    const baseColor = index % 2 ? '#6f8c85' : '#788a95';
    batches.add(
      'reefRockB',
      materials.basalt,
      [p.x, (rootY + floor) / 2, p.z],
      [57, height * 0.64, 49],
      [0, index * 0.81, 0],
      baseColor,
    );
    for (let tier = 0; tier < 3; tier += 1) {
      const a = index * 1.4 + tier * 2.1;
      batches.add(
        'reefRockA',
        materials.basalt,
        [p.x + Math.cos(a) * 23, floor - 13 - tier * 8, p.z + Math.sin(a) * 19],
        [30, 20 + tier * 3, 27],
        [0, a, 0.13],
        baseColor,
      );
    }
    const towardRoad = frame.position.clone().sub(p);
    const facing = Math.atan2(towardRoad.x, towardRoad.z);
    for (let fan = 0; fan < 4; fan += 1) {
      const a = index * 0.9 + fan * 1.5;
      const x = p.x + Math.cos(a) * 19,
        z = p.z + Math.sin(a) * 16;
      const crownY = floor + 18 + (fan % 2) * 10;
      const size = [18 + fan * 2, Math.min(32 + fan * 2, top - crownY - 3), 9];
      const rotation = [0.12, facing + (fan - 1.5) * 0.32, -0.16 + fan * 0.08];
      batches.beam(
        materials.kelp,
        [x, floor - 2, z],
        [x, crownY + 2, z],
        1.8,
        null,
        'twig',
      );
      batches.add('canopyFan', materials.fan, [x, crownY, z], size, rotation);
      batches.add(
        'fanEdge',
        fan === 2 ? materials.amber : materials.fanEdge,
        [x, crownY, z],
        size,
        rotation,
      );
      // Visible radial ribs give the large membrane construction and self-scale.
      for (const spread of [-0.64, 0, 0.64]) {
        const localTip = new T.Vector3(
          Math.sin(spread) * size[0] * 0.88,
          Math.cos(spread) * size[1] * 0.86,
          0,
        ).applyEuler(new T.Euler(...rotation));
        batches.beam(
          materials.coral,
          [x, crownY, z],
          [x + localTip.x, crownY + localTip.y, z + localTip.z],
          0.34,
          null,
          'twig',
        );
      }
    }
    for (let ribbon = 0; ribbon < 9; ribbon += 1) {
      const a = index + ribbon * 2.37;
      const x = p.x + Math.cos(a) * (17 + (ribbon % 3) * 9),
        z = p.z + Math.sin(a) * (15 + (ribbon % 3) * 8);
      const baseY = floor - 3 + (ribbon % 3) * 3;
      const ribbonHeight = Math.min(42 + (ribbon % 4) * 7, top - baseY - 4);
      batches.add(
        'ribbon',
        ribbon % 3 === 0 ? materials.warmCoral : materials.ribbon,
        [x, baseY, z],
        [22 + (ribbon % 3) * 4, ribbonHeight, 18],
        [0, facing + a, (ribbon % 2 ? -1 : 1) * 0.05],
      );
    }
    lightAnchors.push({
      position: new T.Vector3(p.x, floor + 18, p.z),
      color:
        index % 3 === 0 ? '#d4a66b' : index % 3 === 1 ? '#729deb' : '#51cbb8',
    });
    placements.at(-1).roadHeight = frame.position.y;
    placements.at(-1).growthTop = top;
  }
  // Distant volcanic islands give the ocean a horizon at more than one scale.
  const center = track.bounds.getCenter(new T.Vector3());
  for (let i = 0; i < 9; i += 1) {
    const angle = (i * Math.PI * 2) / 9 + 0.3;
    const distance = 2050 + random() * 350;
    const x = center.x + Math.cos(angle) * distance,
      z = center.z + Math.sin(angle) * distance;
    const radius = 170 + random() * 130,
      top = 190 + random() * 250;
    if (!clearance.clears(x, z, radius, seabedY - 40, top)) continue;
    const islandBaseY = nacreSeabedHeight(track, x, z) - 8;
    placements.push({
      kind: 'distant-volcanic-island',
      x,
      z,
      radius,
      minY: seabedY - 40,
      maxY: top,
    });
    batches.add(
      'reefRockB',
      materials.basalt,
      [x, islandBaseY + (top - islandBaseY) * 0.26, z],
      [radius, (top - islandBaseY) * 0.27, radius * 0.7],
      [0, angle, 0],
      '#3c565e',
    );
    batches.add(
      'basaltB',
      materials.basalt,
      [x, (top + islandBaseY) / 2, z],
      [radius * 0.72, top - islandBaseY, radius * 0.62],
      [0, angle, 0],
      '#53737a',
    );
  }
  // Distinct off-road sonar lenses sit beyond each landing, leaving the target clear.
  for (const [index, jump] of (track.jumps ?? []).entries()) {
    const distance = jump.landingEnd + 64;
    const frame = track.sample(distance);
    const lensY = frame.position.y + 18;
    const p = place(
      distance,
      index ? -1 : 1,
      105,
      32,
      seabedY - 40,
      lensY + 23,
      'landing-sonar-lens',
    );
    if (!p) continue;
    const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
    const foundationY = nacreSeabedHeight(track, p.x, p.z) - 8;
    batches.add(
      'tube',
      materials.alloy,
      [p.x, (foundationY + lensY - 10) / 2, p.z],
      [6, lensY - 10 - foundationY, 6],
    );
    batches.add(
      'ring',
      materials.pearl,
      [p.x, lensY, p.z],
      [19, 19, 19],
      [0, yaw, 0],
    );
    batches.add(
      'ring',
      index ? materials.glow : materials.amber,
      [p.x, lensY, p.z],
      [16.5, 16.5, 16.5],
      [0, yaw, 0],
    );
    batches.add(
      'lens',
      materials.glass,
      [p.x, lensY, p.z],
      [12, 12, 5],
      [0, yaw, 0],
    );
    batches.add(
      'orb',
      index ? materials.glow : materials.amber,
      [p.x, lensY + 21, p.z],
      [2, 2, 2],
    );
  }
  const observatory = place(
    70,
    1,
    310,
    132,
    seabedY - 40,
    waterY + 304,
    'tide-observatory',
  );
  if (observatory)
    addObservatory(
      batches,
      materials,
      observatory,
      waterY,
      nacreSeabedHeight(track, observatory.x, observatory.z) - 12,
    );
  return {
    group: batches.finish('Nacre / archipelago, reefs and tide observatory'),
    placements,
    lightAnchors,
  };
}

function addObservatory(batch, m, center, waterY, seabedY) {
  const p = (x, y, z) => [center.x + x, waterY + y, center.z + z];
  const depth = waterY - seabedY;
  batch.add('column', m.alloy, p(0, (126 - depth) / 2, 0), [
    35,
    126 + depth,
    35,
  ]);
  batch.add('tube', m.pearl, p(0, 12, 0), [72, 12, 72]);
  batch.add('tube', m.alloy, p(0, 116, 0), [84, 8, 84]);
  batch.add('tube', m.glass, p(0, 124, 0), [77, 11, 77]);
  batch.add('shell', m.pearl, p(0, 130, 0), [92, 22, 92]);
  batch.add('lens', m.glass, p(0, 169, 0), [48, 42, 48]);
  batch.add('ring', m.pearl, p(0, 170, 0), [51, 51, 51], [Math.PI / 2, 0, 0]);
  batch.add('ring', m.amber, p(0, 119, 0), [85, 85, 30], [Math.PI / 2, 0, 0]);
  batch.add('ring', m.alloy, p(0, 169, 0), [54, 54, 54], [0, 0.4, 0]);
  batch.add(
    'ring',
    m.alloy,
    p(0, 169, 0),
    [54, 54, 54],
    [0, 0.4 + Math.PI / 2, 0],
  );
  batch.add('cone', m.pearl, p(0, 245, 0), [10, 94, 10]);
  batch.add('orb', m.amber, p(0, 297, 0), [4, 4, 4]);
  for (let i = 0; i < 12; i += 1) {
    const a = (i * Math.PI) / 6;
    const x = Math.cos(a),
      z = Math.sin(a);
    batch.beam(
      m.pearl,
      p(x * 102, -depth + 15, z * 102),
      p(x * 34, 112, z * 34),
      4.5,
    );
    batch.beam(m.alloy, p(x * 33, 65, z * 33), p(x * 76, 115, z * 76), 2.3);
    batch.add('box', m.pearl, p(x * 78, 126, z * 78), [2.4, 15, 4], [0, -a, 0]);
    batch.add('box', m.amber, p(x * 64, 20, z * 64), [3, 0.8, 4], [0, -a, 0]);
    batch.add('shell', m.pearl, p(x * 61, 11, z * 61), [14, 7, 11], [0, -a, 0]);
  }
  for (let y = -110; y < 100; y += 28) {
    batch.add('ring', m.alloy, p(0, y, 0), [37, 37, 12], [Math.PI / 2, 0, 0]);
    batch.add(
      'ring',
      m.glow,
      p(0, y + 1.5, 0),
      [37.5, 37.5, 5],
      [Math.PI / 2, 0, 0],
    );
  }
}
