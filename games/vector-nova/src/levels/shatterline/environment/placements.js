import * as T from 'three';
import collisionKit from '../../../../assets/levels/shatterline/collision-kit.json' with { type: 'json' };
import { createReceivingCampusTriangles } from './receiver.js';
import { createShatterlineCradleGeometry } from './cradles.js';
import { shatterlineGroundHeight } from './terrain.js';
import { createShatterlineDescentTriangles } from './descents.js';
import { groundFrame } from '../../../environment/placement.js';

/** Same finite assemblies and transforms drive visible assets and solid proxies. */
export function shatterlinePlacements(track) {
  const placements = [];
  const at = (z) => (track.distanceAt ? track.distanceAt(z) : z);
  const descentAt = (s, margin = 0) =>
    [...(track.descents ?? []), ...(track.variations ?? [])].some(
      (d) => s > d.start - margin && s < d.end + margin,
    );
  const add = (
    asset,
    s,
    lateral = 0,
    height = 0,
    scale = 1,
    yaw = 0,
    worldZ = null,
    worldX = null,
  ) => {
    if (
      ((asset === 'load-foundation' && lateral === 0) ||
        asset === 'service-gallery' ||
        asset === 'service-shelter') &&
      descentAt(s, 85)
    )
      return;
    const f = groundFrame(track, s),
      position = f.position.addScaledVector(f.right, lateral);
    position.y += height;
    if (worldZ !== null) position.z = worldZ;
    if (worldX !== null) position.x = worldX;
    const quaternion = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 1, 0),
      Math.atan2(f.tangent.x, f.tangent.z) + yaw,
    );
    const size = Array.isArray(scale)
      ? new T.Vector3(...scale)
      : new T.Vector3().setScalar(scale);
    if (asset === 'service-shelter') {
      const road = track.sample(s);
      quaternion.copy(road.quaternion);
      position
        .copy(road.position)
        .addScaledVector(road.right, lateral)
        .addScaledVector(road.up, height);
      size.x *= 1.16;
    }
    if (asset === 'load-foundation' && lateral === 0) position.y -= 16;
    if (asset === 'load-foundation')
      size.y = Math.max(
        0.82,
        (position.y -
          shatterlineGroundHeight(track, position.x, position.z) +
          15) /
          170,
      );
    const matrix = new T.Matrix4().compose(position, quaternion, size);
    // A world-Z shear keeps each broad bedding mass on the same falling mountain
    // face, including opposing and rotated ranges; roofs and machinery stay plumb.
    if (asset === 'crown-hero')
      matrix
        .multiply(new T.Matrix4().makeTranslation(0, 90, 0))
        .multiply(new T.Matrix4().makeRotationX(0.42))
        .multiply(new T.Matrix4().makeTranslation(0, -90, 0));
    if (asset.startsWith('geology-')) {
      const before = track.sample(Math.max(0, s - 280)),
        after = track.sample(Math.min(track.length, s + 280));
      const delta = after.position.clone().sub(before.position);
      const far = asset === 'geology-distant-range';
      const grade = far
        ? (track.sample(track.length).position.y - track.sample(0).position.y) /
          track.spineZAt(track.sourceLength)
        : T.MathUtils.clamp(
            delta.y / Math.max(1, Math.hypot(delta.x, delta.z)),
            -0.85,
            -0.06,
          );
      const downhill = far ? new T.Vector3(0, 0, 1) : f.tangent;
      for (const column of [0, 4, 8])
        matrix.elements[column + 1] +=
          grade *
          (downhill.x * matrix.elements[column] +
            downhill.z * matrix.elements[column + 2]);
    }
    placements.push({
      asset,
      s,
      lateral,
      matrix,
      position,
      quaternion,
      scale: size,
      id: `shatterline-${asset}-${placements.length}`,
    });
  };
  const gapAt = (s, margin = 0) =>
    track.jumps.some(
      (j) => s > j.takeoff - margin && s < j.landingStart + margin,
    );
  add('crown-severed', at(35), 0, -5, 0.91, -0.07);
  add('crown-broken', at(1000), 330, -150, 1.05, -0.48);
  // Severance: one cut-off accelerator on the lip, then a clear broken valley.
  const [severance, crown, horizon] = track.jumps.filter((j) => j.hero);
  add('crown-broken', severance.takeoff - 155, 0, -12, 1.15, -0.15);
  add(
    'fractured-cassette',
    severance.takeoff - 25,
    -125,
    -100,
    [2.4, 2.2, 3],
    -0.8,
  );
  add('crown-broken', severance.landingStart + 320, 270, -145, 0.98, 0.65);
  // The unique Crown Shot assembly is the only complete giant aperture here.
  add('crown-hero', at(4840), 0, 12, 1.52, -0.035);
  for (const side of [-1, 1])
    add('load-foundation', at(4840), side * 210, -112, [2, 2.25, 2]);
  // Horizon: no wall or repeated ring beyond the last launch; the receiving campus
  // is visible across a completely open basin.
  add('crown-terminal', horizon.takeoff - 105, 0, -12, 1.12, 0);
  for (const jump of [severance, crown, horizon])
    for (const side of [-1, 1]) {
      add(
        'load-foundation',
        jump.takeoff - 42,
        side * 78,
        -21,
        [1.1, 1.8, 1.25],
      );
      add(
        'load-foundation',
        jump.landingStart + 70,
        side * 79,
        -22,
        [1.1, 2.1, 1.25],
      );
      add('service-gallery', jump.takeoff - 105, side * 95, -9, 1);
    }
  for (let s = 230; s < track.finishDistance; s += 230) {
    if (gapAt(s, 55) || descentAt(s, 100)) continue;
    add('load-foundation', s, 0, -30, [0.76, 1, 0.84]);
    if (Math.floor(s / 230) % 2 === 0)
      add('service-gallery', s + 16, 108, -6, 1);
    if (Math.floor(s / 230) % 3 === 0)
      add('service-gallery', s - 30, -108, -12, 0.9);
  }
  // Broken machinery is occasional and directionally varied, never a ring tunnel.
  for (const [z, lateral, scale, yaw] of [
    [2780, 160, 0.7, -0.19],
    [5510, 310, 0.73, -0.4],
    [6670, -180, 0.67, 0.1],
    [8020, -290, 0.7, 0.52],
  ])
    add('crown-broken', at(z), lateral, lateral ? -95 : -10, scale, yaw);
  for (const z of [3330, 3410, 3490]) add('service-shelter', at(z), 0, -3, 1);
  for (let i = 0; i < 27; i++) {
    const z = 270 + i * 317,
      side = i % 3 === 0 ? -1 : 1;
    add(
      'fractured-cassette',
      at(z),
      side * (102 + (i % 3) * 19),
      -84 - (i % 4) * 11,
      [0.8 + (i % 4) * 0.16, 0.6 + (i % 3) * 0.12, 1],
      i * 0.71,
    );
  }
  // Eight coherent near masses leave real openings instead of a uniform retaining wall.
  for (const [asset, z, lateral, height, scale, yaw] of [
    ['geology-eroded-bluff', 410, 270, -68, [0.82, 1.04, 0.72], 0.03],
    ['geology-bedded-ridge', 1040, 370, -120, [1.0, 1.03, 0.68], -0.035],
    ['geology-bedded-ridge', 2820, 410, -30, [1.05, 1.05, 0.73], 0.025],
    ['geology-eroded-bluff', 3490, 315, -52, [0.9, 1.12, 0.8], -0.035],
    ['geology-bedded-ridge', 4060, 620, -100, [1.0, 1.05, 0.66], 0.06],
    ['geology-eroded-bluff', 5960, 410, -30, [1.03, 1.03, 0.9], -0.04],
  ])
    add(asset, at(z), lateral, height, scale, yaw);
  // Folded roads occupy a whole district footprint. These opposite walls sit
  // outside that footprint rather than being offset from just one branch.
  if (track.variations?.length) {
    const bounds = new T.Box3();
    for (const section of track.variations) bounds.union(section.bounds);
    const crossingZ =
      track.crossings?.[0]?.lowerPoint.z ?? bounds.getCenter(new T.Vector3()).z;
    for (const [asset, source, x, z, height, scale, direction] of [
      [
        'geology-bedded-ridge',
        7130,
        bounds.max.x + 580,
        crossingZ + 190,
        -150,
        [1.05, 1.12, 0.9],
        0,
      ],
      [
        'geology-eroded-bluff',
        8160,
        bounds.min.x - 610,
        crossingZ + 40,
        -105,
        [1, 0.98, 0.88],
        Math.PI,
      ],
    ]) {
      const frame = groundFrame(track, at(source));
      add(
        asset,
        at(source),
        0,
        height,
        scale,
        direction - Math.atan2(frame.tangent.x, frame.tangent.z),
        z,
        x,
      );
    }
  }
  // Stretched inversion districts have their own physical-scale canyon walls.
  for (const section of track.inversions ?? [])
    for (const t of [0.35, 0.78]) {
      const s = T.MathUtils.lerp(section.start, section.end, t);
      add('geology-bedded-ridge', s, 650, -135, [1.1, 0.95, 0.78], 0.025);
      if (section.kind === 'inversion')
        add('geology-eroded-bluff', s, -820, -210, [0.82, 0.84, 0.77], Math.PI);
    }
  // Lower opposing spurs and broad far ranges form three depth bands.
  for (const [z, lateral, y, scale] of [
    [700, -1100, -440, 1.2],
    [3010, -1450, -470, 1.4],
    [5790, -1600, -450, 1.2],
    [7710, -1500, -470, 1.1],
  ])
    add(
      'geology-eroded-bluff',
      at(z),
      lateral,
      y,
      [scale, 0.82, 1.25],
      Math.PI,
    );
  for (const [z, lateral, yaw, scale] of [
    [600, 2200, 0.1, 1.7],
    [2480, 2900, -0.12, 1.8],
    [5100, 2400, 0.08, 1.7],
    [7590, 2500, -0.1, 1.85],
    [1100, -3800, 3.05, 1.8],
    [4720, -4700, 3.3, 2.1],
    [8020, -4000, 3.05, 1.8],
    [10900, 3000, 0, 1.5],
  ])
    add('geology-distant-range', at(z), lateral, -580, [scale, 1.1, 1.45], yaw);
  // Three distant blue-grey ranges close the basin beyond the race terminus.
  for (const [z, x, y, scale, yaw] of [
    [18400, 1000, -470, [1.7, 1.3, 1.5], 1.52],
    [17000, -3700, -450, [2.4, 1.6, 1.8], 0.18],
    [18800, 2800, -360, [2.1, 1.35, 1.7], -0.3],
  ])
    add(
      'geology-distant-range',
      at(11050),
      x,
      y,
      scale,
      yaw,
      z + (track.spineZAt ? track.spineZAt(track.sourceLength) - 11050 : 0),
    );
  // One primary receiving mass, offset to driver-left, commands the installation;
  // secondary halls, pump yards and lower command blocks form unequal wings.
  add('receiver-primary', at(10250), 285, 20, [1.15, 1.1, 1.12]);
  add('receiver-process-hall', at(9910), -235, -24, [1.1, 1.05, 1.1]);
  add('receiver-process-hall', at(10330), -325, -24, [0.86, 0.75, 0.87]);
  add('receiver-condenser', at(9810), 245, -28, [1.1, 1.1, 1.1]);
  add('receiver-condenser', at(10600), 205, -26, [1.0, 1.15, 1.0]);
  add('receiver-condenser', at(10480), -172, -28, [0.9, 0.9, 0.9]);
  add('receiver-command', at(10770), -240, -45, [1.25, 1.05, 1.0]);
  for (const [z, side, scale] of [
    [9690, -1, 0.68],
    [9950, 1, 0.78],
    [10590, -1, 0.56],
  ])
    add('receiving-tower', at(z), side * 118, -34, scale);
  return placements;
}

export function createShatterlineSceneryTriangles(track) {
  const triangles = [],
    placements = shatterlinePlacements(track);
  for (const p of placements) {
    const local = collisionKit[p.asset];
    if (!local?.length) continue;
    for (const points of local)
      triangles.push({
        points: points.map((v) =>
          new T.Vector3(...v).applyMatrix4(p.matrix).toArray(),
        ),
        id: p.id,
        kind: 'structure',
      });
  }
  const cradle = createShatterlineCradleGeometry(track, placements),
    points = cradle.attributes.position,
    indices = cradle.index?.array ?? [];
  for (let i = 0; i < indices.length; i += 3)
    triangles.push({
      id: `shatterline-load-cradle-${Math.floor((points.getZ(indices[i]) + points.getZ(indices[i + 1]) + points.getZ(indices[i + 2])) / 720)}`,
      kind: 'structure',
      points: [indices[i], indices[i + 1], indices[i + 2]].map((n) => [
        points.getX(n),
        points.getY(n),
        points.getZ(n),
      ]),
    });
  cradle.dispose();
  for (const list of [
    createReceivingCampusTriangles(track),
    createShatterlineDescentTriangles(track),
  ])
    for (const triangle of list) triangles.push(triangle);
  return triangles;
}
