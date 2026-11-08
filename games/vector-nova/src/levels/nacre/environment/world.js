import * as T from 'three';
import { groundFrame } from '../../../environment/placement.js';
import { createBatches } from './geometry.js';
import { createReefSponge } from './organic.js';
import { addObservatory } from './observatory.js';
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
  // Living terrace clearings replace nearby solitary stacks rather than
  // burying the new habitat behind the previous upright composition.
  const reefClearings = [
    [2500, -1],
    [3850, 1],
  ].map(([s, side]) => {
    const frame = groundFrame(track, s);
    return frame.position.clone().addScaledVector(frame.right, side * 230);
  });
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
    const spireYaw = random() * 6;
    if (reefClearings.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 115)) {
      placements.pop();
      continue;
    }
    batches.add(
      i % 2 ? 'basaltA' : 'basaltB',
      materials.basalt,
      [p.x, rootY + height / 2, p.z],
      [radius * 0.9, height, radius * 0.82],
      [0, spireYaw, 0],
      color,
    );
    // An attached lower shoulder breaks the solitary obelisk silhouette;
    // both stacks stay inside the site's existing conservative footprint.
    const shoulderAngle = i * 1.73;
    const shoulderX = p.x + Math.cos(shoulderAngle) * radius * 0.32;
    const shoulderZ = p.z + Math.sin(shoulderAngle) * radius * 0.3;
    const shoulderRoot = nacreSeabedHeight(track, shoulderX, shoulderZ) - 14;
    const shoulderHeight = height * (0.54 + (i % 3) * 0.045);
    batches.add(
      i % 2 ? 'basaltB' : 'basaltA',
      materials.basalt,
      [shoulderX, shoulderRoot + shoulderHeight / 2, shoulderZ],
      [radius * 0.7, shoulderHeight, radius * 0.66],
      [0, i * 0.71 + 0.6, 0],
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
  // A few composed headlands remain above the swells; submerged terraces
  // continue their horizontal geological language through the living reef.
  const geologySites = [
    [750, -1, true, 170, 360],
    [1450, -1, true, 205, 430],
    [track.length - 310, -1, true],
    [2020, -1, false],
    [2500, -1, false, 154, 230, true],
    [2650, 1, false],
    [2860, -1, false],
    [3850, 1, false, 154, 230, true],
  ];
  for (const [
    index,
    [distance, side, exposed, authoredRadius, authoredOffset, living],
  ] of geologySites.entries()) {
    const frame = track.sample(distance);
    const top = exposed
      ? waterY + 48 + (index % 2) * 17
      : frame.position.y - 22;
    const radius = authoredRadius ?? (exposed ? 205 : 174);
    const p = place(
      distance,
      side,
      authoredOffset ?? (exposed ? 430 : 305),
      radius,
      seabedY - 45,
      top + (living ? 58 : 4),
      exposed ? 'volcanic-headland' : 'reef-bearing-terrace',
    );
    if (!p) continue;
    const rootY = nacreSeabedHeight(track, p.x, p.z) - 16;
    const height = top - rootY;
    const yaw =
      Math.atan2(frame.tangent.x, frame.tangent.z) + 0.3 * Math.sin(index * 2);
    batches.add(
      exposed ? 'shoreShelf' : 'reefShelf',
      materials.basalt,
      [p.x, rootY + height / 2, p.z],
      [radius * 0.84, height, radius],
      [0, yaw, 0],
      exposed ? '#72898b' : '#71918b',
    );
    // Attached lower talus follows the same bedding and never floats above the
    // surveyed seabed. Its extent remains within the reserved site envelope.
    batches.add(
      'reefShelf',
      materials.basalt,
      [p.x, rootY + height * 0.26, p.z],
      [radius, height * 0.52, radius * 0.91],
      [0, yaw + 0.16, 0],
      exposed ? '#61797d' : '#667e79',
    );
    if (living) {
      const shelfPosition = [p.x, rootY + height / 2, p.z];
      const shelfSize = [radius * 0.84, height, radius];
      const colonies = [
        [-22, -8, [34, 44, 29], '#a7bba8'],
        [22, 16, [28, 32, 25], '#b5a7b6'],
        [0, -28, [36, 38, 31], '#a7b9ad'],
      ];
      let growthTop = top;
      for (const [
        colony,
        [forward, toward, size, tint],
      ] of colonies.entries()) {
        const position = p
          .clone()
          .addScaledVector(frame.tangent, forward)
          .addScaledVector(frame.right, -side * toward);
        const samples = [
          [0, 0],
          [-size[0] * 0.65, 0],
          [size[0] * 0.65, 0],
          [0, -size[2] * 0.65],
          [0, size[2] * 0.65],
        ]
          .map(([x, z]) =>
            batches.surface(
              'reefShelf',
              shelfPosition,
              shelfSize,
              [0, yaw, 0],
              position.x + x,
              position.z + z,
            ),
          )
          .filter((y) => y !== null);
        if (samples.length !== 5) continue;
        position.y = Math.min(...samples) - 1.2;
        batches.add(
          'reefSponge',
          materials.reefCoral,
          position.toArray(),
          size,
          [0, yaw + colony * 1.7, 0],
          tint,
        );
        growthTop = Math.max(growthTop, position.y + size[1]);
      }
      const lightPosition = p
        .clone()
        .addScaledVector(frame.tangent, -22)
        .addScaledVector(frame.right, -side * 35);
      lightPosition.y = growthTop + 15;
      lightAnchors.push({
        position: lightPosition,
        color: '#9fc8b8',
        intensity: 4800,
        priority: 3,
      });
      placements.at(-1).growthTop = growthTop;
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
            [tip[0], fork[1], tip[2]],
            [5 + random() * 3, height * (0.58 + random() * 0.12), 3],
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
  // Two close reef outcrops carry living tissue at the driver's horizon. Their
  // broad accreted caps intersect the rooted geology rather than perching on tips.
  const rootGeometry = createReefSponge(),
    rootVertices = rootGeometry.attributes.position;
  const encrustingRoots = [],
    encrustingBody = [];
  for (let i = 0; i < rootVertices.count; i++) {
    const vertex = new T.Vector3().fromBufferAttribute(rootVertices, i);
    encrustingBody.push(vertex);
    if (Math.abs(vertex.y + 0.08) < 0.00001) encrustingRoots.push(vertex);
  }
  rootGeometry.dispose();
  for (const [index, distance] of [2420, 3680].entries()) {
    const frame = groundFrame(track, distance),
      radius = 30;
    const cap = frame.position.y + 14;
    const p = place(
      distance,
      -1,
      85,
      radius,
      seabedY - 40,
      cap,
      'near-field-encrusting-assembly',
    );
    if (!p) continue;
    const rootY = nacreSeabedHeight(track, p.x, p.z) - 12;
    const crownY = frame.position.y - 6,
      height = crownY - rootY;
    const yaw = Math.atan2(frame.tangent.x, frame.tangent.z) + 0.35;
    batches.add(
      'reefRoot',
      materials.basalt,
      [p.x, rootY + height / 2, p.z],
      [radius * 0.95, height, radius * 0.93],
      [0, yaw, 0],
      '#879c92',
    );
    const support = {
      position: [p.x, crownY - 3.5, p.z],
      size: [radius * 0.94, 8, radius * 0.88],
      rotation: [0, yaw, 0],
    };
    batches.add(
      'reefRockA',
      materials.basalt,
      support.position,
      support.size,
      support.rotation,
      '#879c92',
    );
    let growthTop = -Infinity;
    for (const [colony, [along, toward, size]] of [
      [-5, -5, [13, 28, 12]],
      [7, -5, [10, 23, 10]],
    ].entries()) {
      const center = p
        .clone()
        .addScaledVector(frame.tangent, along)
        .addScaledVector(frame.right, toward);
      // Open mouths face the driver's sightline; low folded tissue grows from
      // the cap rather than presenting tall closed-looking tips from below.
      const axis = frame.right
        .clone()
        .multiplyScalar(0.8660254)
        .addScaledVector(frame.up, 0.5)
        .normalize();
      const orientation = new T.Quaternion()
        .setFromUnitVectors(frame.up, axis)
        .multiply(
          new T.Quaternion().setFromAxisAngle(frame.up, yaw + colony * 1.8),
        );
      const rotation = new T.Euler()
        .setFromQuaternion(orientation)
        .toArray()
        .slice(0, 3);
      const scale = new T.Vector3(...size);
      const samples = encrustingRoots.map((vertex) => {
        const foot = vertex
          .clone()
          .multiply(scale)
          .applyQuaternion(orientation);
        const surface = batches.surface(
          'reefRockA',
          support.position,
          support.size,
          support.rotation,
          center.x + foot.x,
          center.z + foot.z,
        );
        return surface === null ? null : surface - foot.y;
      });
      if (samples.some((y) => y === null)) continue;
      center.y = Math.min(...samples) - 1;
      const relativeTop = Math.max(
        ...encrustingBody.map(
          (vertex) =>
            vertex.clone().multiply(scale).applyQuaternion(orientation).y,
        ),
      );
      center.y = Math.min(center.y, cap - relativeTop);
      batches.add(
        'reefSponge',
        materials.reefCoral,
        center.toArray(),
        size,
        rotation,
        colony ? '#ddd5d7' : '#dbe4cf',
      );
      growthTop = Math.max(growthTop, center.y + relativeTop);
    }
    // Accreted fragments and short attached growth break the exposed ledge
    // rim, joining the organism's buried root to the surrounding reef rock.
    for (let fragment = 0; fragment < 8; fragment++) {
      const angle = (fragment * Math.PI) / 4 + index * 0.37;
      const reach = 17 + (fragment % 3) * 2;
      const x = p.x + Math.cos(angle) * reach,
        z = p.z + Math.sin(angle) * reach;
      const y = batches.surface(
        'reefRockA',
        support.position,
        support.size,
        support.rotation,
        x,
        z,
      );
      if (y === null) continue;
      batches.add(
        'reefRockB',
        materials.basalt,
        [x, y - 0.8, z],
        [
          3.6 + (fragment % 2) * 1.1,
          2.3 + (fragment % 3) * 0.35,
          3.1 + (fragment % 2) * 0.8,
        ],
        [0, angle, 0.04 * Math.sin(fragment)],
        '#879c92',
      );
      batches.beam(
        materials.kelp,
        [x, y - 0.5, z],
        [x + Math.cos(angle) * 2.5, y + 0.8, z + Math.sin(angle) * 2.5],
        0.32,
        null,
        'twig',
      );
    }
    const lightPosition = p.clone().addScaledVector(frame.right, 10);
    lightPosition.y = growthTop + 12;
    lightAnchors.push({
      position: lightPosition,
      color: index ? '#b5c7c2' : '#bdcbb4',
      intensity: 1600,
      priority: 2,
    });
    placements.at(-1).growthTop = growthTop;
    placements.at(-1).roadHeight = frame.position.y;
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
      const crownY = floor + 6 + (fan % 2) * 7;
      const size = [25 + fan * 2, Math.min(44 + fan * 2, top - crownY - 3), 9];
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
