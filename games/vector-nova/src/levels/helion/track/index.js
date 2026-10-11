import * as THREE from 'three';
import {
  createHelionCeramicMaps,
  setCeramicCoordinates,
} from './ceramic-maps.js';
import { finishThermalMaterial } from '../environment/materials.js';
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
export function buildHelionRoad(
  track,
  { shape = false, settings = {}, renderer = null } = {},
) {
  const group = new THREE.Group();
  group.name = 'Helion / heat-tile decks and copper radiator edges';
  const geometries = new Set();
  const materials = new Set();
  const ceramicMaterials = new Set();
  const makeMaterial = (
    name,
    color,
    roughness,
    metalness = 0,
    ceramic = false,
  ) => {
    const Material =
      ceramic && !shape
        ? THREE.MeshPhysicalMaterial
        : THREE.MeshStandardMaterial;
    const material = new Material({
      color: shape ? 0x929c9f : color,
      roughness,
      metalness: shape ? 0 : metalness,
    });
    material.name = name;
    if (ceramic) ceramicMaterials.add(material);
    if (!shape && !ceramic)
      finishThermalMaterial(
        material,
        /copper/i.test(name)
          ? 'copper'
          : /graphite|charcoal/i.test(name)
            ? 'graphite'
            : 'ceramic',
      );
    materials.add(material);
    return material;
  };
  const tile = makeMaterial(
    'Warm ivory thermal ceramic',
    0xd2d0bc,
    1,
    0.02,
    true,
  );
  const freshTile = makeMaterial(
    'Replacement ivory ceramic cassette',
    0xe0d5bc,
    0.78,
    0.02,
    true,
  );
  const spentTile = makeMaterial(
    'Heat-cycled ceramic cassette',
    0x9fa292,
    1.25,
    0.02,
    true,
  );
  const coveredTile = makeMaterial(
    'Graphite sheltered cassette',
    0x43525b,
    0.9,
    0.22,
    true,
  );
  if (!shape) {
    for (const material of ceramicMaterials) {
      material.clearcoat = 0.28;
      material.clearcoatRoughness = 0.36;
      material.normalScale.set(0.6, 0.6);
      material.clearcoatNormalScale.set(0.28, 0.28);
    }
    freshTile.clearcoat = 0.42;
    freshTile.clearcoatRoughness = 0.3;
    spentTile.clearcoat = 0.12;
    spentTile.normalScale.set(0.7, 0.7);
    coveredTile.clearcoat = 0.2;
    coveredTile.normalScale.set(0.18, 0.18);
  }
  const ceramicMaps = !shape
    ? createHelionCeramicMaps(renderer, ceramicMaterials)
    : null;
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
    0.28,
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
    if (!shape && ceramicMaterials.has(material))
      setCeramicCoordinates(geometry);
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
          [range.min, -0.45],
          [range.max, -0.45],
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
  running.userData.roadSurface = true;
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

  const cassetteParts = new Map([
    [tile, []],
    [freshTile, []],
    [spentTile, []],
    [coveredTile, []],
  ]);
  for (const range of solidRanges) {
    for (let start = range.start; start < range.end; start += 14) {
      const end = Math.min(start + 13.82, range.end);
      if (end - start < 0.3) continue;
      for (let x = range.min; x < range.max; x += 5) {
        const right = Math.min(x + 5, range.max);
        const index = Math.floor(start / 14) * 7 + Math.floor(x / 5);
        const covered = track.thermalZones.some(
          (z) => z.kind === 'shelter' && start >= z.start && start < z.end,
        );
        const material =
          covered && index % 6 < 3
            ? coveredTile
            : index % 17 === 0
              ? freshTile
              : index % 23 === 0
                ? spentTile
                : tile;
        cassetteParts.get(material).push(
          sweep(
            [
              [x + 0.08, 0.026],
              [x + 0.2, 0.095],
              [right - 0.2, 0.095],
              [right - 0.08, 0.026],
            ],
            { start: start + 0.06, end },
            2,
          ),
        );
      }
    }
  }
  for (const [material, parts] of cassetteParts) {
    const surface = merged(
      `Formed cassettes / ${material.name}`,
      parts,
      material,
    );
    if (surface) surface.userData.roadSurface = true;
  }

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
            [range.min + 0.6, 0.111],
            [range.max - 0.6, 0.111],
          ],
          { start: s, end: s + 5.5 },
          1.5,
        ),
      );
    }
  }
  merged('Large tile joints / warm bevel lines', seams, bevel);
  merged(
    'Broad graphite reinforcement plates',
    service,
    shaded,
  ).userData.roadSurface = true;
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
  featherShape.quadraticCurveTo(0.75, 0.6, 2.2, 0.72);
  featherShape.quadraticCurveTo(3.5, 0.9, 4.45, 1.75);
  featherShape.lineTo(4.55, 1.52);
  featherShape.quadraticCurveTo(3.5, 0.61, 2.25, 0.44);
  featherShape.quadraticCurveTo(0.8, 0.35, 0, -0.15);
  featherShape.closePath();
  const feather = new THREE.ExtrudeGeometry(featherShape, {
    depth: 8.8,
    bevelEnabled: true,
    bevelThickness: 0.09,
    bevelSize: 0.1,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 6,
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
        0.8,
        9.7,
      );
      box(
        'Copper root clamps',
        copperEdge,
        frame,
        side * 16.1,
        1.1,
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
  const serviceDecks = [],
    serviceRails = [],
    serviceMains = [];
  for (const side of [-1, 1]) {
    serviceDecks.push(
      sweep(
        boxProfile(side * 30, -9.5, 4.4, 0.6),
        { start: 0, end: track.length },
        4,
      ),
    );
    for (const edge of [-1, 1])
      serviceRails.push(
        sweep(
          boxProfile(side * 30 + edge * 2, -6.7, 0.25, 0.35),
          { start: 0, end: track.length },
          4,
        ),
      );
    serviceMains.push(
      sweep(
        boxProfile(side * 26, -11.5, 0.8, 1.3),
        { start: 0, end: track.length },
        4,
      ),
    );
  }
  merged('Connected external ceramic maintenance decks', serviceDecks, blanket);
  merged('Continuous maintenance handrails', serviceRails, graphite);
  merged('Bundled observatory service mains', serviceMains, copper);
  for (let s = 22; s < track.length; s += 28) {
    const frame = track.sample(s);
    for (const side of [-1, 1]) {
      box(
        'Maintenance handrail stanchions',
        copper,
        frame,
        side * 32,
        -8,
        0,
        0.35,
        3,
        0.35,
      );
      beam(
        'Attached lower service cross-truss',
        graphite,
        framePoint(frame, side * 11, -6),
        framePoint(frame, side * 30, -10),
        0.8,
        1,
      );
    }
  }
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
      const jumpSpan = track.jumps.some(
        (jump) => s >= jump.takeoff - 50 && s <= jump.recovery + 70,
      );
      const supportX = jumpSpan ? -28 : 0;
      const seat = framePoint(frame, supportX, -16);
      const foot = seat.clone();
      foot.y = track.groundY;
      const plumbRight = new THREE.Vector3(
        frame.right.x,
        0,
        frame.right.z,
      ).normalize();
      const plumbForward = new THREE.Vector3(
        frame.tangent.x,
        0,
        frame.tangent.z,
      ).normalize();
      for (const x of [-1, 1])
        for (const z of [-1, 1]) {
          const offset = plumbRight
            .clone()
            .multiplyScalar(x * 4.5)
            .addScaledVector(plumbForward, z * 4.5);
          beam(
            'Graphite observatory support pier',
            graphite,
            foot.clone().add(offset),
            seat.clone().add(offset),
            1.5,
            2.1,
          );
        }
      for (let y = foot.y + 18, index = 0; y < seat.y - 10; y += 24, index++) {
        const centre = new THREE.Vector3(seat.x, y, seat.z);
        for (const side of [-1, 1]) {
          const a = centre
            .clone()
            .addScaledVector(plumbRight, side * 4.5)
            .addScaledVector(plumbForward, -4.5);
          const b = centre
            .clone()
            .addScaledVector(plumbRight, side * 4.5)
            .addScaledVector(plumbForward, 4.5);
          a.y += index % 2 ? 0 : 18;
          b.y += index % 2 ? 18 : 0;
          beam('Open observatory pier lattice', graphite, a, b, 0.6, 0.8);
          const c = centre
            .clone()
            .addScaledVector(plumbForward, side * 4.5)
            .addScaledVector(plumbRight, -4.5);
          const d = centre
            .clone()
            .addScaledVector(plumbForward, side * 4.5)
            .addScaledVector(plumbRight, 4.5);
          c.y += index % 2 ? 18 : 0;
          d.y += index % 2 ? 0 : 18;
          beam('Open observatory pier lattice', graphite, c, d, 0.6, 0.8);
        }
        instance(
          'Pier thermal service collar',
          unitBox,
          blanket,
          centre,
          new THREE.Quaternion(),
          new THREE.Vector3(10, 0.9, 10),
        );
      }
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
        supportX,
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
    for (const s of [
      jump.takeoff - 11,
      jump.landingStart + 5,
      jump.recovery + 3,
    ]) {
      const marker = track.sample(s);
      box(
        'Vault ceramic shoulder marker',
        blanket,
        marker,
        18.4,
        3.5,
        0,
        1.8,
        7,
        2.3,
      );
      box(
        'Vault amber marker crown',
        warning,
        marker,
        18.4,
        7.3,
        0,
        2.4,
        0.9,
        2.6,
      );
    }
    for (const start of [
      jump.takeoff - 18,
      jump.landingStart + 1,
      jump.recovery + 1,
    ])
      for (let row = 0; row < 3; row++)
        for (let column = 0; column < 5; column++) {
          const marker = track.sample(start + row * 3.2);
          box(
            'Vault left receiving checker',
            (row + column) % 2 ? shaded : freshTile,
            marker,
            1.6 + column * 2.6,
            0.135,
            0,
            2.5,
            0.07,
            3.05,
          );
        }
    const landing = track.sample(jump.landingStart + 3);
    box('Full-width receiving deck root', blanket, landing, 0, -2, 0, 30, 4, 5);
  }
  for (let s = 18, index = 0; s < track.length; s += 28, index++) {
    const frame = track.sample(s);
    const gap = track.gapAt(s);
    for (const side of [-1, 1]) {
      if (gap && side > 0) continue;
      for (let leaf = 0; leaf < 3; leaf++) {
        box(
          'Open copper feather lamination',
          copperEdge,
          frame,
          side * (17.0 + leaf * 0.8),
          0.85 + leaf * 0.16,
          -1.5,
          0.2,
          0.18,
          6.8,
        );
      }
      box(
        'Graphite side service vent',
        graphite,
        frame,
        side * 14.15,
        0.118,
        1,
        0.65,
        0.035,
        4.0,
      );
      box(
        'Inset copper service lock',
        copperEdge,
        frame,
        side * 13.35,
        0.13,
        1,
        0.28,
        0.08,
        0.9,
      );
    }
    if (index % 3 === 0 && !gap)
      box(
        'Quiet graphite maintenance insert',
        shaded,
        frame,
        index % 2 ? -9 : 9,
        0.115,
        0,
        3.5,
        0.028,
        4.2,
      );
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
    ceramicMaps?.dispose();
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
    ready: ceramicMaps?.ready,
    dispose,
    setReflection(texture) {
      for (const material of materials) {
        material.envMap = texture;
        material.needsUpdate = true;
      }
    },
  };
}
