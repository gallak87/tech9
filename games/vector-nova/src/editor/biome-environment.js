import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createEditorOwner } from './world-owner.js';
import { createRegionPlan } from './region-plan.js';
import { buildRegionEnvironment } from './region-environment.js';
import { editorBiome } from './biomes.js';
import { createRouteClearance } from '../environment/placement.js';
import { finishIceMaterial } from '../levels/glasswake/environment/materials.js';
import { finishThermalMaterial } from '../levels/helion/environment/materials.js';
import { finishZephyrMaterial } from '../levels/zephyr/environment/materials.js';
import { finishShatterlineMaterial } from '../levels/shatterline/environment/materials.js';

const UP = new T.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
function randomFor(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let v = Math.imul(state ^ (state >>> 15), 1 | state);
    v ^= v + Math.imul(v ^ (v >>> 7), 61 | v);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}
const SUSPENDED = new Set(['orbital', 'zephyr', 'helion', 'umbra', 'ravel']);
const NATURAL = new Set([
  'nacre',
  'vesper-forest',
  'glasswake',
  'cindercoil',
  'saffron',
  'shatterline',
  'worldspire',
]);
function pointedArch() {
  const shape = new T.Shape();
  shape.moveTo(-1, -0.15);
  shape.lineTo(-1, 0.75);
  shape.quadraticCurveTo(-1, 1.55, 0, 2.25);
  shape.quadraticCurveTo(1, 1.55, 1, 0.75);
  shape.lineTo(1, -0.15);
  shape.closePath();
  const hole = new T.Path();
  hole.moveTo(-0.64, 0);
  hole.lineTo(0.64, 0);
  hole.lineTo(0.64, 0.72);
  hole.quadraticCurveTo(0.64, 1.2, 0, 1.78);
  hole.quadraticCurveTo(-0.64, 1.2, -0.64, 0.72);
  hole.closePath();
  shape.holes.push(hole);
  return new T.ExtrudeGeometry(shape, {
    depth: 0.3,
    bevelEnabled: false,
    curveSegments: 5,
  });
}
function curvedSail() {
  const geometry = new T.PlaneGeometry(1, 1, 3, 3),
    p = geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i);
    p.setZ(
      i,
      Math.sin((x + 0.5) * Math.PI) * Math.sin((y + 0.5) * Math.PI) * 0.18,
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Whole-region static kits share the road survey, never a campaign route or
 * mechanic. Their geometry and collision come from the same owned batches. */
export function createBiomeEnvironment(
  doc,
  track,
  { renderer = null, collectSolid = null, preview = false, plan = null } = {},
) {
  const biome = editorBiome(doc.biome),
    profile = biome.environment;
  if (!profile)
    throw new Error(
      'A regional environment profile is missing for ' + doc.biome,
    );
  plan ??= createRegionPlan(doc, track);
  const owner = createEditorOwner(
      'Editor / ' + biome.label + ' regional world',
      preview,
    ),
    family = doc.biome;
  const finish =
    family === 'glasswake'
      ? finishIceMaterial
      : family === 'zephyr'
        ? finishZephyrMaterial
        : family === 'helion'
          ? finishThermalMaterial
          : family === 'shatterline'
            ? finishShatterlineMaterial
            : null;
  const material = (name, color, roughness = 0.8, metalness = 0, extra = {}) =>
    owner.material(
      biome.label + ' / ' + name,
      { color, roughness, metalness, ...extra },
      finish ? (m) => finish(m) : undefined,
    );
  const soil = material(
      family === 'shatterline' ? 'limestone terrain' : 'regional ground',
      profile.terrain,
      0.94,
    ),
    rock = material(
      family === 'glasswake'
        ? 'Fresh fracture ice'
        : 'fractured bearing geology',
      profile.rock,
      0.83,
    ),
    structure = material('occupied structure', profile.structure, 0.67, 0.12),
    dark = material(
      'recessed construction',
      new T.Color(profile.structure).multiplyScalar(0.32),
      0.7,
      0.32,
    ),
    metal = material(
      family === 'zephyr' ? 'bronze roofing' : 'jointed structural metal',
      profile.accent,
      0.5,
      0.58,
    ),
    foliage = material('living canopy', profile.vegetation, 0.94),
    wood = material(
      'root and branch bearings',
      family === 'vesper-forest' ? '#6b533a' : profile.rock,
      0.91,
    ),
    glow = material('shielded light', profile.accent, 0.5, 0.12, {
      emissive: profile.accent,
      emissiveIntensity: 0.32,
    }),
    water = material('regional water', profile.water, 0.3, 0.22),
    cloth = material('tension membrane', profile.structure, 0.82, 0, {
      side: T.DoubleSide,
    });
  const materials = {
    soil,
    rock,
    concrete: structure,
    paving: dark,
    roof: metal,
    occupied: glow,
    water,
  };
  const suspended = SUSPENDED.has(family),
    natural = NATURAL.has(family);
  const { clears } = track
    ? createRouteClearance(track, {
        spacing: 8,
        sidePadding: 24,
        localVertical: [-18, 38],
      })
    : { clears: () => true };
  const region = buildRegionEnvironment(
    {
      ...plan,
      chunks: suspended ? [] : plan.chunks,
      parcels: [],
      landmarks: [],
      basins: profile.waterEnabled && !natural && !suspended ? plan.basins : [],
      paths: natural || suspended ? [] : plan.paths,
    },
    {
      owner,
      materials,
      collectSolid,
      clears,
      districtCourts: ['halcyon', 'nomad', 'colossus', 'oriel'].includes(
        family,
      ),
    },
  );
  if (!profile.waterEnabled)
    for (const mesh of [...owner.group.children])
      if (mesh.userData.regionWater) {
        owner.group.remove(mesh);
      }
  const bases = {
    box: new T.BoxGeometry(1, 1, 1),
    rock: new T.IcosahedronGeometry(1, 0),
    crown: new T.IcosahedronGeometry(1, 1),
    hex: new T.CylinderGeometry(1, 1, 1, 6),
    cone: new T.CylinderGeometry(0.02, 1, 1, 6),
    round: new T.CylinderGeometry(1, 1, 1, 8),
    ring: new T.TorusGeometry(1, 0.12, 4, 12),
    arch: new T.TorusGeometry(1, 0.13, 4, 12, Math.PI),
    lancet: pointedArch(),
    sail: curvedSail(),
  };
  Object.values(bases).forEach((g) => owner.geometries.add(g));
  const batches = new Map(),
    accepted = [],
    cells = new Map(),
    counts = {
      assemblies: 0,
      near: 0,
      mid: 0,
      far: 0,
      landmarks: 0,
      primitives: 0,
      features: {},
    };
  let pendingKit = null;
  function emit(type, mat, world, scale, q, solid = true) {
    const matrix = new T.Matrix4().compose(world, q, scale);
    let geometry = bases[type].clone();
    geometry.applyMatrix4(matrix);
    if (geometry.index) {
      const unindexed = geometry.toNonIndexed();
      geometry.dispose();
      geometry = unindexed;
    }
    geometry.computeBoundingBox();
    pendingKit.push({ geometry, material: mat, solid });
  }
  function kit(candidate, landmark = false) {
    const random = randomFor(candidate.seed ?? plan.seed),
      size = candidate.scale ?? 1,
      spread = (natural ? 82 : 75) * size,
      top =
        (family === 'worldspire'
          ? 170
          : family === 'ravel' || family === 'zephyr'
            ? 155
            : 120) * size;
    const minY = suspended
      ? candidate.y - 65 * size
      : Math.min(
          candidate.y - 5,
          plan.surfaceHeight(candidate.x - spread, candidate.z - spread),
          plan.surfaceHeight(candidate.x + spread, candidate.z + spread),
        ) - 4;
    if (
      !plan.clears(
        candidate.x,
        candidate.z,
        spread * 2,
        spread * 2,
        candidate.y + top,
        candidate.yaw,
        minY,
      ) ||
      !clears(
        candidate.x,
        candidate.z,
        spread * 2,
        spread * 2,
        candidate.y + top,
        candidate.yaw,
        minY,
      )
    )
      return;
    const cx = Math.floor(candidate.x / 160),
      cz = Math.floor(candidate.z / 160);
    for (let x = cx - 1; x <= cx + 1; x++)
      for (let z = cz - 1; z <= cz + 1; z++)
        for (const other of cells.get(x + ':' + z) ?? [])
          if (
            Math.hypot(candidate.x - other.x, candidate.z - other.z) <
            (spread + other.radius) * 0.75
          )
            return;
    let lod = candidate.lod ?? 'far';
    if (lod === 'near' && counts.near >= 64) lod = 'mid';
    if (lod === 'mid' && counts.mid >= 144) lod = 'far';
    const detailed = lod === 'near',
      middle = lod !== 'far',
      baseQ = new T.Quaternion().setFromAxisAngle(UP, candidate.yaw ?? 0);
    const local = (x, y, z) =>
      new T.Vector3(x * size, y * size, z * size)
        .applyQuaternion(baseQ)
        .add(new T.Vector3(candidate.x, candidate.y, candidate.z));
    const shape = (
      type,
      mat,
      x,
      y,
      z,
      w,
      h,
      d,
      rx = 0,
      ry = 0,
      rz = 0,
      solid = true,
    ) =>
      emit(
        type,
        mat,
        local(x, y, z),
        new T.Vector3(w * size, h * size, d * size),
        baseQ
          .clone()
          .multiply(new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz))),
        solid,
      );
    const box = (mat, x, y, z, w, h, d, ry = 0) =>
      shape('box', mat, x, y, z, w, h, d, 0, ry);
    const beam = (mat, a, b, r = 2) => {
      const from = local(...a),
        to = local(...b),
        delta = to.clone().sub(from);
      emit(
        'round',
        mat,
        from.clone().add(to).multiplyScalar(0.5),
        new T.Vector3(r * size, delta.length(), r * size),
        new T.Quaternion().setFromUnitVectors(UP, delta.normalize()),
      );
    };
    const tree = (x, z, h = 65, k = 1) => {
      beam(wood, [x, 0, z], [x + 3, h * 0.56, z], 2.5 * k);
      for (const side of [-1, 1]) {
        beam(
          wood,
          [x, h * 0.38, z],
          [x + side * h * 0.26, h * 0.76, z + side * 9],
          1.7 * k,
        );
        shape(
          middle ? 'crown' : 'rock',
          foliage,
          x + side * h * 0.23,
          h * 0.82,
          z + side * 8,
          h * 0.29,
          h * 0.32,
          h * 0.28,
        );
      }
      shape(
        middle ? 'crown' : 'rock',
        foliage,
        x,
        h * 0.98,
        z,
        h * 0.31,
        h * 0.3,
        h * 0.32,
      );
      for (const side of [-1, 1])
        beam(wood, [x + side * 18, 0, z + 8], [x, h * 0.14, z], 2.1 * k);
    };
    const facade = (x, z, w = 34, h = 72, d = 32) => {
      box(structure, x, h / 2, z, w, h, d);
      box(dark, x, h * 0.6, z + d / 2 + 0.2, w * 0.88, h * 0.45, 0.5);
      box(metal, x, h + 2, z, w + 3, 3, d + 3);
      if (middle)
        for (let i = 0; i < (detailed ? 5 : 2); i++)
          box(
            glow,
            x,
            h * 0.22 + (i * h) / (detailed ? 7 : 3),
            z + d / 2 + 0.5,
            w * 0.68,
            2,
            0.6,
          );
    };
    const frame = (x, z, w = 72, h = 70, d = 10) => {
      box(structure, x - w / 2, h / 2, z, 8, h, d);
      box(structure, x + w / 2, h / 2, z, 8, h, d);
      box(structure, x, h, z, w + 8, 8, d);
      box(dark, x, h + 5, z, w, 2, d + 3);
    };
    pendingKit = [];
    if (suspended) {
      shape(
        'cone',
        rock,
        0,
        -28,
        0,
        (spread / size) * 0.8,
        60,
        (spread / size) * 0.7,
        0,
        0,
        Math.PI,
      );
      shape(
        'hex',
        dark,
        0,
        -2,
        0,
        (spread / size) * 0.78,
        5,
        (spread / size) * 0.68,
      );
    } else if (!natural) {
      const footing = Math.max(3, (candidate.y - minY) / size);
      box(structure, 0, -footing / 2, 0, 95, footing, 80);
    }
    let feature;
    switch (family) {
      case 'halcyon':
        facade(-25, -5, 30, 80 + random() * 35, 42);
        facade(18, 8, 38, 48 + random() * 20, 38);
        box(structure, 0, 16, 5, 94, 28, 58);
        box(dark, 0, 31, 5, 88, 2, 52);
        if (middle) {
          facade(38, -28, 22, 110, 23);
          frame(-15, 39, 72, 18, 9);
        }
        feature = 'setbacks';
        break;
      case 'orbital':
        frame(0, -22, 78, 72, 13);
        frame(0, 25, 62, 90, 10);
        shape('ring', structure, 0, 55, 0, 42, 42, 10);
        for (const side of [-1, 1]) {
          box(dark, side * 48, 38, 0, 20, 65, 52);
          for (let i = 0; i < (middle ? 5 : 2); i++)
            box(metal, side * 48, 14 + i * 12, 0, 23, 2, 56);
        }
        box(glow, 0, 90, 25, 48, 2, 2);
        feature = 'openFrames';
        break;
      case 'nacre':
        for (let i = 0; i < 3; i++)
          shape(
            'rock',
            rock,
            (i - 1) * 24,
            30 + i * 12,
            (i % 2) * 18,
            25,
            50 + i * 13,
            22,
            0.12,
            i * 0.8,
            0.08,
          );
        shape('hex', structure, 0, 23, -24, 42, 8, 35);
        shape('cone', structure, 0, 42, -24, 46, 24, 38);
        shape('ring', metal, 0, 39, -24, 27, 27, 5, Math.PI / 2);
        if (middle)
          for (const side of [-1, 1])
            shape(
              'arch',
              glow,
              side * 32,
              8,
              22,
              25,
              30,
              8,
              0,
              side * 0.5,
              0,
              false,
            );
        feature = 'reefs';
        break;
      case 'vesper-forest':
        tree(-26, -15, 72);
        tree(22, 12, 90);
        if (middle) tree(12, -30, 58, 0.8);
        if (detailed) {
          tree(-35, 28, 54, 0.7);
          shape('rock', rock, 12, 4, 28, 30, 9, 20);
        }
        feature = 'forkedGroves';
        break;
      case 'glasswake':
        for (let i = 0; i < 4; i++)
          shape(
            i % 2 ? 'cone' : 'rock',
            i % 2 ? structure : rock,
            (i - 1.5) * 21,
            26 + i * 12,
            (i % 2 ? 1 : -1) * 13,
            25,
            54 + i * 15,
            26,
            0.08,
            i * 0.6,
            (i - 1.5) * 0.14,
          );
        box(dark, 0, 10, 5, 104, 14, 56);
        shape('rock', metal, 30, 35, 8, 12, 23, 13);
        feature = 'fractures';
        break;
      case 'cindercoil':
        shape('hex', rock, 0, 8, 0, 58, 18, 48);
        shape('ring', structure, 0, 17, 0, 42, 42, 12, Math.PI / 2);
        shape('hex', glow, 0, 15, 0, 29, 2, 28, 0, 0, 0, false);
        for (const side of [-1, 1]) {
          box(dark, side * 39, 28, 6, 16, 46, 50);
          for (let i = 0; i < (middle ? 4 : 2); i++)
            box(structure, side * 39, 10 + i * 10, 6, 22, 3, 58);
        }
        feature = 'kilns';
        break;
      case 'saffron':
        for (let i = 0; i < (middle ? 4 : 2); i++) {
          const x = (i - (middle ? 1.5 : 0.5)) * 22;
          shape(
            'arch',
            structure,
            x,
            3,
            -i * 8,
            35,
            52 + i * 5,
            12,
            0,
            Math.PI / 2,
            0,
          );
          beam(structure, [x - 8, 0, -30], [x + 2, 65 - i * 5, 0], 3);
        }
        shape('rock', rock, 0, 2, 10, 66, 12, 43);
        shape('lancet', structure, -35, 3, 15, 19, 23, 24, 0, 0, 0.14);
        feature = 'corticalOpenings';
        break;
      case 'zephyr':
        for (const side of [-1, 1]) {
          shape('lancet', structure, side * 28, 2, 8, 20, 29, 22);
          box(structure, side * 43, 53, -18, 16, 102, 19);
          shape('cone', metal, side * 43, 119, -18, 17, 35, 18);
        }
        box(structure, 0, 49, 15, 92, 4, 28);
        shape('lancet', structure, 0, 50, 15, 22, 27, 14);
        if (middle) {
          for (const side of [-1, 1])
            shape('lancet', structure, side * 35, 0, -35, 17, 24, 16);
          box(metal, 0, 56, 15, 96, 2, 32);
        }
        shape('round', water, 0, 1, 25, 19, 1, 13, 0, 0, 0, false);
        shape('sail', water, 0, -19, 43, 6, 40, 1, 0, 0.12, 0, false);
        if (middle)
          shape('sail', water, 5, -22, 42, 2, 46, 1, 0, -0.1, 0, false);
        feature = 'gothicIslands';
        break;
      case 'helion':
        box(dark, 0, 27, 0, 100, 49, 34);
        for (let i = -3; i <= 3; i++) {
          box(structure, i * 14, 34, -22, 12, 62, 7, 0.1 * i);
          box(metal, i * 14, 34, -27, 7, 60, 3, 0.1 * i);
        }
        frame(0, 27, 90, 73, 10);
        box(structure, 0, 78, 8, 108, 8, 62);
        for (const side of [-1, 1])
          shape('sail', metal, side * 48, 48, 3, 42, 56, 1, 0, side * 0.42);
        feature = 'radiators';
        break;
      case 'umbra':
        shape('arch', structure, 0, 2, 0, 48, 70, 18);
        for (const side of [-1, 1]) {
          box(rock, side * 47, 37, 0, 24, 70, 44);
          box(dark, side * 47, 57, 0, 26, 16, 46);
          beam(metal, [side * 38, 12, -20], [side * 20, 90, 10], 2.5);
        }
        shape('rock', rock, 30, 100, -12, 24, 18, 20, 0.2, 0.4, 0.3);
        box(glow, -25, 43, 24, 18, 1.5, 1);
        feature = 'brokenVaults';
        break;
      case 'shatterline':
        for (let i = 0; i < 3; i++)
          shape(
            'rock',
            rock,
            (i - 1) * 30,
            36 + i * 12,
            (i % 2) * 20,
            36,
            65 + i * 23,
            34,
            0.15,
            i * 0.4,
            0.11,
          );
        shape('ring', metal, 4, 77, 15, 43, 46, 7, 0, 0.25);
        box(structure, 0, 10, 30, 105, 12, 20);
        feature = 'acceleratorCliffs';
        break;
      case 'worldspire':
        shape('rock', rock, 0, 52, 0, 48, 104, 42, 0, 0.2, 0.06);
        for (const side of [-1, 1]) {
          shape(
            'cone',
            rock,
            side * 30,
            62,
            side * 13,
            31,
            124,
            30,
            0.04,
            side * 0.3,
            side * 0.16,
          );
          beam(rock, [side * 58, 0, 20], [side * 15, 85, 0], 10);
        }
        shape('arch', structure, 0, 0, 35, 29, 46, 9);
        box(glow, -12, 57, 39, 3, 40, 2);
        feature = 'mineralRoots';
        break;
      case 'colossus':
        box(dark, 0, 16, -6, 100, 30, 63);
        frame(0, 15, 96, 92, 12);
        for (const side of [-1, 1]) {
          shape('round', structure, side * 38, 34, -25, 15, 62, 15);
          shape('round', metal, side * 38, 67, -25, 19, 5, 19);
        }
        box(metal, 0, 82, 15, 110, 7, 17);
        for (let i = -2; i <= 2; i++) box(structure, i * 16, 20, 35, 9, 30, 30);
        feature = 'gantryWorks';
        break;
      case 'ravel':
        for (const side of [-1, 1]) {
          beam(metal, [side * 48, 0, -20], [side * 30, 132, 0], 2.5);
          beam(metal, [side * 48, 0, 26], [side * 30, 132, 0], 2);
          shape(
            'sail',
            cloth,
            side * 22,
            76,
            0,
            49,
            92,
            18,
            0,
            side * 0.6,
            side * 0.15,
          );
          beam(metal, [side * 30, 132, 0], [0, 8, 35], 1.2);
        }
        box(dark, 0, 7, 0, 112, 12, 74);
        feature = 'tensionSails';
        break;
      case 'nomad':
        box(dark, 0, 12, 0, 108, 23, 62);
        box(structure, 0, 29, 0, 93, 11, 55);
        facade(8, -5, 44, 55, 27);
        for (const side of [-1, 1])
          for (const z of [-19, 21])
            shape(
              'round',
              metal,
              side * 48,
              10,
              z,
              13,
              12,
              13,
              0,
              0,
              Math.PI / 2,
            );
        box(metal, -34, 50, -10, 7, 38, 7);
        box(glow, -34, 71, -10, 15, 2, 8);
        feature = 'carrierHulls';
        break;
      case 'oriel':
        for (const side of [-1, 1]) {
          box(structure, side * 35, 21, 0, 25, 40, 60);
          for (const z of [-20, 0, 20])
            shape(
              'arch',
              structure,
              side * 35,
              2,
              z,
              14,
              22,
              8,
              0,
              Math.PI / 2,
            );
          box(metal, side * 35, 43, 0, 29, 3, 65);
          shape('rock', foliage, side * 35, 48, 0, 28, 8, 58);
        }
        box(structure, 0, 22, -23, 60, 4, 17);
        shape('arch', metal, 0, 29, 15, 42, 46, 9);
        if (middle) {
          shape('round', water, 0, 1, 5, 21, 1, 21);
          tree(0, 28, 33, 0.6);
        }
        feature = 'gardenArcades';
        break;
      default:
        throw new Error('No static regional kit for ' + family);
    }
    const actual = new T.Box3();
    for (const entry of pendingKit) actual.union(entry.geometry.boundingBox);
    const center = actual.getCenter(new T.Vector3()),
      dimensions = actual.getSize(new T.Vector3());
    if (
      !plan.clears(
        center.x,
        center.z,
        dimensions.x,
        dimensions.z,
        actual.max.y,
        0,
        actual.min.y,
      ) ||
      !clears(
        center.x,
        center.z,
        dimensions.x,
        dimensions.z,
        actual.max.y,
        0,
        actual.min.y,
      )
    ) {
      pendingKit.forEach((entry) => entry.geometry.dispose());
      pendingKit = null;
      return;
    }
    for (const entry of pendingKit) {
      const key = entry.material.uuid + ':' + entry.solid;
      if (!batches.has(key))
        batches.set(key, {
          material: entry.material,
          solid: entry.solid,
          geometries: [],
        });
      batches.get(key).geometries.push(entry.geometry);
      counts.primitives++;
    }
    pendingKit = null;
    counts.features[feature] = (counts.features[feature] ?? 0) + 1;
    const key = cx + ':' + cz;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push({ x: candidate.x, z: candidate.z, radius: spread });
    accepted.push({
      ...candidate,
      lod,
      bounds: { min: actual.min.toArray(), max: actual.max.toArray() },
    });
    counts.assemblies++;
    counts[lod]++;
    if (landmark) counts.landmarks++;
  }
  // Landmarks establish the large silhouette before ordinary detail fills it.
  for (const d of plan.districts.filter((_, i) => i % 4 === 0))
    kit(
      {
        x: d.x,
        y: plan.surfaceHeight(d.x, d.z),
        z: d.z,
        yaw: d.yaw,
        scale: 1.65,
        lod: d.band,
        seed: plan.seed + counts.landmarks * 913,
      },
      true,
    );
  for (const p of plan.parcels) kit(p);
  // Natural worlds occupy the spaces between settlements too, rather than
  // becoming isolated trees/rocks on a wide empty civil survey.
  if (natural) {
    const random = randomFor(plan.seed ^ 0x8f2bd1),
      t = plan.terrain;
    for (let z = 1; z < t.nz && counts.assemblies < 650; z += 2)
      for (let x = 1; x < t.nx && counts.assemblies < 650; x += 2) {
        if (random() > (family === 'vesper-forest' ? 0.86 : 0.5)) continue;
        const px = t.minX + (x + (random() - 0.5) * 0.7) * t.dx,
          pz = t.minZ + (z + (random() - 0.5) * 0.7) * t.dz,
          y = plan.surfaceHeight(px, pz);
        if (y < plan.waterHeight(px, pz) + 2) continue;
        const nearest = plan.roadSamples.reduce(
            (n, p) => Math.min(n, (px - p.x) ** 2 + (pz - p.z) ** 2),
            Infinity,
          ),
          lod =
            nearest < 500 ** 2 ? 'near' : nearest < 1400 ** 2 ? 'mid' : 'far';
        kit({
          x: px,
          y,
          z: pz,
          yaw: random() * TAU,
          scale: 0.75 + random() * 0.5,
          lod,
          seed: Math.floor(random() * 4294967296),
        });
      }
  }
  for (const { material, solid, geometries } of batches.values()) {
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach((g) => g.dispose());
    if (!geometry)
      throw new Error('Regional kit geometry could not be batched');
    owner.solid(
      biome.label + ' / ' + (solid ? 'founded kit' : 'visual detail'),
      geometry,
      material,
      solid ? { kind: 'structure' } : null,
      solid ? collectSolid : null,
    );
  }
  owner.finish();
  owner.ready = Promise.resolve();
  owner.group.userData.biome = family;
  owner.group.userData.region = {
    ...region.stats,
    ...counts,
    terrainStyle: suspended ? 'floating-regions' : 'surveyed-ground',
  };
  owner.group.userData.regionalPlacements = accepted.map(
    ({ x, y, z, lod, bounds }) => ({ x, y, z, lod, bounds }),
  );
  // A water horizon is only present in worlds that own it; its floor remains
  // the exact surveyed terrain used for supports and collision.
  if (profile.waterEnabled && !suspended) {
    const b = plan.bounds,
      cx = (b.min.x + b.max.x) / 2,
      cz = (b.min.z + b.max.z) / 2,
      geometry = new T.PlaneGeometry(200000, 200000);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(cx, doc.settings.waterLevel, cz);
    const mesh = owner.solid(biome.label + ' / distant water', geometry, water);
    mesh.castShadow = false;
  }
  if (!profile.waterEnabled && !suspended) {
    const b = plan.bounds,
      geometry = new T.PlaneGeometry(200000, 200000),
      groundY = plan.seaLevel - 28;
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(
      (b.min.x + b.max.x) / 2,
      groundY,
      (b.min.z + b.max.z) / 2,
    );
    const mesh = owner.solid(
      biome.label + ' / distant land',
      geometry,
      soil,
      { kind: 'terrain' },
      collectSolid,
    );
    mesh.castShadow = false;
    mesh.userData.regionFarGround = true;
    owner.group.userData.region.farGroundY = groundY;
  }
  void renderer;
  return owner;
}
