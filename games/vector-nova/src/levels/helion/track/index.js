import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  sweepGeometry,
  boxProfile,
  beamTransform,
} from '../../../track/geometry.js';
import { framePoint } from '../../../track/frames.js';
export { createHelionTrack } from './model.js';

// Authored construction geometry is shared by production and neutral review.
// Environment owns the large modeled shields, canopies and thermal markings.
export function buildHelionRoad(track, { shape = false, settings = {} } = {}) {
  const group = new THREE.Group();
  group.name = 'Helion / heat-tile decks and copper radiator edges';
  const geometries = new Set();
  const materials = new Set();
  const makeMaterial = (name, color, roughness, metalness = 0) => {
    const material = new THREE.MeshStandardMaterial({
      color: shape ? 0x929c9f : color,
      roughness,
      metalness: shape ? 0 : metalness,
    });
    material.name = name;
    materials.add(material);
    return material;
  };
  const tile = makeMaterial('Warm ivory thermal ceramic', 0xd2d0bc, 0.78, 0.08);
  const bevel = makeMaterial('Warm grey tile bevels', 0x858575, 0.9, 0.04);
  const graphite = makeMaterial(
    'Graphite structural composite',
    0x29353c,
    0.73,
    0.35,
  );
  const copper = makeMaterial(
    'Oxidized copper heat feathers',
    0x9e593a,
    0.43,
    0.74,
  );
  const copperEdge = makeMaterial('Worn copper tips', 0xc99064, 0.35, 0.7);
  const blanket = makeMaterial(
    'Pale ceramic thermal blankets',
    0xc3c3b2,
    0.96,
    0.06,
  );
  const warning = makeMaterial('Warm braking markers', 0xe0b467, 0.62, 0.12);
  const shaded = makeMaterial('Charcoal service panels', 0x454b4d, 0.84, 0.17);
  const add = (name, geometry, material) => {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const merged = (name, parts, material) => {
    if (!parts.length) return;
    const geometry = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    return add(name, geometry, material);
  };
  const half = track.width / 2;
  const solidRanges = [];
  let cursor = 0;
  for (const jump of track.jumps) {
    solidRanges.push({
      start: cursor,
      end: jump.takeoff,
      min: -half,
      max: half,
    });
    solidRanges.push({
      start: jump.takeoff,
      end: jump.landingStart,
      min: -half,
      max: 0,
    });
    cursor = jump.landingStart;
  }
  solidRanges.push({ start: cursor, end: track.length, min: -half, max: half });
  const sweep = (profile, range, step = 3) =>
    sweepGeometry(track, profile, { start: range.start, end: range.end, step });
  const tops = [];
  const sides = [];
  const curbParts = [];
  for (const range of solidRanges) {
    tops.push(
      sweep(
        [
          [range.min, 0],
          [range.max, 0],
        ],
        range,
      ),
    );
    sides.push(
      sweep(
        [
          [range.max, 0],
          [range.max, -2.6],
          [range.min, -2.6],
          [range.min, 0],
        ],
        range,
      ),
    );
    if (range.max === 0) {
      // The visible gap-side curb exactly marks the runtime's grounded max=0.
      curbParts.push(sweep(boxProfile(0.25, 0.62, 0.5, 1.24), range));
    }
  }
  const running = merged(
    'Broad 30 m thermal-tile running surface / real left gaps',
    tops,
    tile,
  );
  running.userData.drivingSurface = true;
  merged('Thick chamfered thermal slab edges and underside', sides, bevel);
  for (const side of [-1, 1]) {
    for (const range of solidRanges) {
      if (range.max === 0 && side === 1) continue;
      curbParts.push(
        sweep(boxProfile(side * (half + 0.34), 0.46, 0.68, 0.92), range),
      );
    }
  }
  merged(
    'Continuous graphite curbs / split-lane separator',
    curbParts,
    graphite,
  );

  const seams = [];
  const service = [];
  const edgeCaps = [];
  for (const range of solidRanges) {
    for (const x of [-10, -5, 0, 5, 10]) {
      if (x <= range.min || x >= range.max) continue;
      seams.push(
        sweep(
          [
            [x - 0.035, 0.022],
            [x + 0.035, 0.022],
          ],
          range,
        ),
      );
    }
    for (const x of [range.min + 0.35, range.max - 0.35])
      edgeCaps.push(
        sweep(
          [
            [x - 0.18, 0.035],
            [x + 0.18, 0.035],
          ],
          range,
        ),
      );
    for (
      let s = Math.ceil(range.start / 14) * 14;
      s < range.end - 0.2;
      s += 14
    ) {
      const end = Math.min(s + 0.14, range.end);
      seams.push(
        sweep(
          [
            [range.min + 0.5, 0.025],
            [range.max - 0.5, 0.025],
          ],
          { start: s, end },
          0.5,
        ),
      );
    }
    for (
      let s = Math.ceil(range.start / 126) * 126 + 12;
      s < range.end - 8;
      s += 126
    ) {
      service.push(
        sweep(
          [
            [range.min + 0.6, 0.032],
            [range.max - 0.6, 0.032],
          ],
          { start: s, end: s + 5.5 },
          1.5,
        ),
      );
    }
  }
  merged('Large tile joints / warm bevel lines', seams, bevel);
  merged('Broad graphite reinforcement plates', service, shaded);
  merged('Copper edge service caps', edgeCaps, copperEdge);

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  geometries.add(unitBox);
  const buckets = new Map();
  const instance = (key, geometry, material, position, quaternion, scale) => {
    if (!buckets.has(key))
      buckets.set(key, { geometry, material, matrices: [] });
    buckets
      .get(key)
      .matrices.push(new THREE.Matrix4().compose(position, quaternion, scale));
  };
  const box = (key, material, frame, x, y, z, width, height, depth) =>
    instance(
      key,
      unitBox,
      material,
      framePoint(frame, x, y, z),
      frame.quaternion,
      new THREE.Vector3(width, height, depth),
    );
  const beam = (key, material, from, to, width, depth = width) => {
    const transform = beamTransform(from, to, width, depth);
    instance(
      key,
      unitBox,
      material,
      transform.position,
      transform.quaternion,
      transform.scale,
    );
  };
  const featherShape = new THREE.Shape();
  featherShape.moveTo(0, 0);
  featherShape.lineTo(0.8, 1.4);
  featherShape.lineTo(2.1, 1.7);
  featherShape.lineTo(4.5, 3.0);
  featherShape.lineTo(4.7, 2.35);
  featherShape.lineTo(2.4, 0.3);
  featherShape.closePath();
  const feather = new THREE.ExtrudeGeometry(featherShape, {
    depth: 8.8,
    bevelEnabled: true,
    bevelThickness: 0.09,
    bevelSize: 0.1,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 1,
  });
  feather.translate(0, 0, -4.4);
  geometries.add(feather);
  const reverse = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    Math.PI,
  );
  for (let s = 10; s < track.length; s += 14) {
    const frame = track.sample(s);
    for (const side of [-1, 1]) {
      if (track.gapAt(s) && side === 1) continue;
      const quaternion = frame.quaternion.clone();
      if (side < 0) quaternion.multiply(reverse);
      instance(
        'Overlapping copper radiator feathers',
        feather,
        copper,
        framePoint(frame, side * (half + 0.45), 0.55),
        quaternion,
        new THREE.Vector3(1, 1, 1),
      );
      box(
        'Thick feather root / open cooling slots',
        graphite,
        frame,
        side * 16.2,
        0.55,
        0,
        1.3,
        1.3,
        9.7,
      );
      box(
        'Copper root clamps',
        copperEdge,
        frame,
        side * 16.1,
        1.34,
        -2.8,
        1.9,
        0.3,
        1.0,
      );
    }
  }
  const structural = [];
  const pipes = [];
  for (const range of solidRanges) {
    const xs = range.max === 0 ? [-11, -3] : [-11, 11];
    for (const x of xs) {
      structural.push(sweep(boxProfile(x, -5.0, 1.8, 6), range, 4));
      pipes.push(sweep(boxProfile(x + 1.4, -3.7, 0.75, 0.85), range, 4));
    }
  }
  merged('Continuous deep graphite load spines', structural, graphite);
  merged('Copper heat transfer pipes', pipes, copper);
  for (let s = 18; s < track.length; s += 28) {
    const frame = track.sample(s);
    const right = track.gapAt(s) ? -2 : 12;
    box(
      'Thermal blanket crossmembers',
      blanket,
      frame,
      (right - 12) / 2,
      -2.8,
      0,
      right + 13,
      1.2,
      2.6,
    );
    beam(
      'Underside open graphite diagonals',
      graphite,
      framePoint(frame, -11, -7.7, -9),
      framePoint(frame, right - 1, -3.2, 9),
      0.9,
      0.9,
    );
    if (settings.quality !== 'low' && !shape) {
      box(
        'Graphite underside access walkway',
        graphite,
        frame,
        -6.5,
        -8.6,
        0,
        2.4,
        0.5,
        20,
      );
      box(
        'Copper access brackets',
        copper,
        frame,
        -6.5,
        -7.8,
        -8,
        3.5,
        0.5,
        0.7,
      );
    }
  }
  for (let s = 55; s < track.length; s += 112) {
    if (
      track.jumps.some(
        (jump) => s > jump.takeoff - 20 && s < jump.landingStart + 20,
      )
    )
      continue;
    const frame = track.sample(s);
    const wall = s >= track.wallRide.start && s <= track.wallRide.end;
    if (wall) {
      box(
        'Massive shield-wall anchor shoes',
        blanket,
        frame,
        0,
        -19,
        0,
        31,
        9,
        11,
      );
      for (const side of [-1, 1])
        beam(
          'Shield anchor load braces',
          graphite,
          framePoint(frame, side * 11, -4),
          framePoint(frame, side * 14, -18),
          3.2,
          5,
        );
    } else {
      const seat = framePoint(frame, 0, -16);
      const foot = seat.clone();
      foot.y = track.groundY;
      beam('Graphite observatory support pier', graphite, foot, seat, 5.5, 8);
      for (const side of [-1, 1])
        beam(
          'Copper clad cantilever truss roots',
          copper,
          seat,
          framePoint(frame, side * 12, -3.8),
          2.4,
          3.6,
        );
      box(
        'Pale thermal blanket support collar',
        blanket,
        frame,
        0,
        -15,
        0,
        10,
        9,
        12,
      );
      instance(
        'Massive terminal foundation shoes',
        unitBox,
        graphite,
        foot,
        new THREE.Quaternion(),
        new THREE.Vector3(25, 8, 28),
      );
    }
  }
  // Physical approach markers and lane split cues are independent of heat state.
  for (const apex of track.brakingShelves) {
    for (let i = 0; i < 3; i += 1) {
      const frame = track.sample(apex - 70 + i * 18);
      for (const side of [-1, 1]) {
        box(
          'Braking shelf marker pylons',
          graphite,
          frame,
          side * 19,
          4.1,
          0,
          1.9,
          8.2,
          2.3,
        );
        box(
          'Broad copper braking flags',
          warning,
          frame,
          side * 18.5,
          6.6,
          0,
          2.1,
          1.4,
          2.7,
        );
      }
    }
  }
  for (const jump of track.jumps) {
    for (let s = jump.takeoff - 72; s < jump.takeoff - 8; s += 14) {
      const frame = track.sample(s);
      box(
        'Vault branch approach splitter markers',
        copperEdge,
        frame,
        0,
        0.16,
        0,
        0.7,
        0.28,
        6,
      );
    }
    const frame = track.sample(jump.takeoff - 2);
    box(
      'Vault lip thermal cap',
      copperEdge,
      frame,
      8,
      0.13,
      0,
      13.1,
      0.24,
      1.8,
    );
    const landing = track.sample(jump.landingStart + 3);
    box('Full-width receiving deck root', blanket, landing, 0, -2, 0, 30, 4, 5);
  }
  for (const [name, { geometry, material, matrices }] of buckets) {
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    mesh.name = name;
    for (const [index, matrix] of matrices.entries())
      mesh.setMatrixAt(index, matrix);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    group.traverse((object) => {
      if (object.isInstancedMesh) object.dispose();
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    geometries.clear();
    materials.clear();
    group.clear();
  };
  group.userData.reviewKind = shape ? 'bare-track' : 'production';
  group.userData.dispose = dispose;
  group.userData.surfaceRanges = solidRanges;
  return {
    group,
    dispose,
    setReflection(texture) {
      for (const material of materials) {
        material.envMap = texture;
        material.needsUpdate = true;
      }
    },
  };
}
