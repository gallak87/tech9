import * as THREE from 'three';
import { framePoint } from '../model.js';
import {
  sweepGeometry,
  boxProfile,
  beamTransform,
  roadSealGeometry,
} from '../geometry.js';
import { selectPracticalFixtures } from '../lighting.js';
import {
  orbitalSurfaceTexture,
  orbitalSignsTexture,
  orbitalGuidanceTexture,
} from './materials.js';

export function buildOrbitalTrack(track) {
  const group = new THREE.Group();
  group.name = 'Asterion Orbital / engineered transit circuit';
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const structuralSegments = [];
  const practicalFixtures = [];
  const material = (parameters) => {
    const result = new THREE.MeshStandardMaterial(parameters);
    materials.add(result);
    return result;
  };
  const texture = (value) => {
    textures.add(value);
    return value;
  };
  const deckMap = texture(orbitalSurfaceTexture());
  const graphite = material({
    color: 0x8f9b9e,
    map: deckMap,
    bumpMap: deckMap,
    bumpScale: 0.012,
    roughness: 0.86,
    metalness: 0.17,
  });
  const ivory = material({ color: 0xdfdbcf, roughness: 0.59, metalness: 0.2 });
  const portalFinish = new THREE.MeshPhysicalMaterial({
    color: 0xcbd0c8,
    roughness: 0.34,
    metalness: 0.14,
    clearcoat: 0.32,
    clearcoatRoughness: 0.24,
  });
  materials.add(portalFinish);
  const portalHardware = material({
    color: 0x8b9ca3,
    roughness: 0.38,
    metalness: 0.62,
  });
  const titanium = material({
    color: 0x718d99,
    roughness: 0.72,
    metalness: 0.26,
  });
  const dark = material({ color: 0x293e49, roughness: 0.78, metalness: 0.2 });
  const underframe = material({
    color: 0x4b6370,
    roughness: 0.83,
    metalness: 0.18,
  });
  const cavity = material({ color: 0x152730, roughness: 0.9, metalness: 0.12 });
  const paint = material({ color: 0xe5e4d7, roughness: 0.72, metalness: 0.08 });
  const amber = material({ color: 0xc79d63, roughness: 0.56, metalness: 0.35 });
  const vermilion = material({
    color: 0xb7563d,
    roughness: 0.61,
    metalness: 0.2,
  });
  const optics = material({
    color: 0xffe4bc,
    emissive: 0xffd19a,
    emissiveIntensity: 1.9,
    roughness: 0.32,
  });
  const seals = material({
    color: 0x203139,
    roughness: 0.96,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    depthWrite: false,
  });
  const add = (name, geometry, surface, castShadow = false) => {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.name = name;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const instances = (name, geometry, surface, entries, castShadow = false) => {
    geometries.add(geometry);
    const mesh = new THREE.InstancedMesh(geometry, surface, entries.length);
    mesh.name = name;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    const unit = new THREE.Vector3(1, 1, 1);
    entries.forEach((entry, index) =>
      mesh.setMatrixAt(
        index,
        matrix.compose(
          entry.position,
          entry.quaternion ?? new THREE.Quaternion(),
          entry.scale ?? unit,
        ),
      ),
    );
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  };
  const local = (distance, x, y, z = 0, scale) => {
    const frame = track.sample(distance);
    return {
      position: framePoint(frame, x, y, z),
      quaternion: frame.quaternion,
      scale,
      distance,
      x,
      y,
      z,
    };
  };
  // Shoulder panels follow separate road frames at both longitudinal ends.
  // Rigid tangent-plane boxes would cut through the bank transitions.
  const conformPanels = (name, size, surface, entries) => {
    const corners = [
      [
        [-1, -1, 1],
        [1, -1, 1],
        [1, 1, 1],
        [-1, 1, 1],
      ],
      [
        [1, -1, -1],
        [-1, -1, -1],
        [-1, 1, -1],
        [1, 1, -1],
      ],
      [
        [-1, 1, -1],
        [-1, 1, 1],
        [1, 1, 1],
        [1, 1, -1],
      ],
      [
        [-1, -1, 1],
        [-1, -1, -1],
        [1, -1, -1],
        [1, -1, 1],
      ],
      [
        [1, -1, 1],
        [1, -1, -1],
        [1, 1, -1],
        [1, 1, 1],
      ],
      [
        [-1, -1, -1],
        [-1, -1, 1],
        [-1, 1, 1],
        [-1, 1, -1],
      ],
    ];
    const positions = [];
    const indices = [];
    for (const entry of entries)
      for (const face of corners) {
        const base = positions.length / 3;
        for (const [x, y, z] of face) {
          const frame = track.sample(
            entry.distance + entry.z + (z * size[2]) / 2,
          );
          const point = framePoint(
            frame,
            entry.x + (x * size[0]) / 2,
            entry.y + (y * size[1]) / 2,
          );
          positions.push(point.x, point.y, point.z);
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return add(name, geometry, surface);
  };
  const sweep = (name, profile, surface, options = {}, shadows = false) =>
    add(
      name,
      sweepGeometry(track, profile, { step: 4, ...options }),
      surface,
      shadows,
    );
  const beam = (from, to, thickness, depth = thickness) => {
    structuralSegments.push({
      from,
      to,
      radius: Math.hypot(thickness, depth) / 2,
    });
    return beamTransform(from, to, thickness, depth);
  };

  const runningSurface = sweep(
    'Graphite ceramic running panels / approved 28 m surface',
    [
      [-14, 0],
      [14, 0],
    ],
    graphite,
    { uvScale: 12 },
  );
  runningSurface.userData.drivingSurface = true;
  sweep(
    'Ivory folded alloy deck shell',
    [
      [17.4, -0.03],
      [17.4, -1.6],
      [12.1, -3.8],
      [9, -7.1],
      [-9, -7.1],
      [-12.1, -3.8],
      [-17.4, -1.6],
      [-17.4, -0.03],
    ],
    ivory,
    { uvScale: 24 },
    true,
  );
  sweep('Graphite keel enclosure', boxProfile(0, -7.8, 12.5, 1.35), dark, {
    step: 6,
  });
  for (const side of [-1, 1]) {
    sweep(
      'Inset ivory service shoulder',
      [
        [side * 15.7 - 1.68, 0.013],
        [side * 15.7 + 1.68, 0.013],
      ],
      ivory,
    );
    sweep(
      'Race boundary paint',
      [
        [side * 13.65 - 0.1, 0.026],
        [side * 13.65 + 0.1, 0.026],
      ],
      paint,
    );
    sweep(
      'Shoulder graphite expansion groove',
      [
        [side * 16 - 0.07, 0.036],
        [side * 16 + 0.07, 0.036],
      ],
      cavity,
    );
    sweep(
      'Titanium low curb',
      boxProfile(side * 14.35, 0.19, 0.45, 0.38),
      titanium,
    );
    sweep(
      'Folded titanium lower safety rail',
      [
        [side * 14.95 - 0.22, 0.62],
        [side * 14.95 + 0.27, 0.66],
        [side * 14.95 + 0.3, 1.01],
        [side * 14.95 + 0.16, 1.12],
        [side * 14.95 - 0.26, 1.04],
        [side * 14.95 - 0.22, 0.62],
      ],
      titanium,
    );
    sweep(
      'Open titanium upper rail',
      boxProfile(side * 14.95, 1.68, 0.19, 0.18),
      titanium,
    );
    sweep(
      'External service conduit',
      boxProfile(side * 17.32, -1.04, 0.19, 0.24),
      dark,
    );
    sweep(
      'Exposed underside longeron',
      boxProfile(side * 9.9, -7.0, 0.45, 0.55),
      underframe,
      { step: 5 },
    );
  }
  const joints = add(
    'Surface-conforming module seals',
    roadSealGeometry(track, runningSurface.geometry, {
      spacing: 30,
      breadth: 0.068,
      offset: 0.008,
    }),
    seals,
  );
  joints.renderOrder = 1;

  const railPosts = [],
    shoes = [],
    fasteners = [],
    reflectors = [],
    shoulderLids = [],
    lidInsets = [],
    lidHandles = [],
    ventRecesses = [],
    ventSlats = [],
    flankPlates = [],
    flankRecesses = [],
    flankLocks = [],
    upperTrusses = [],
    keelCrossheads = [],
    undersideJoints = [],
    curbIntervals = [],
    lampBodies = [],
    lampFaces = [],
    lampBrackets = [],
    portalFrames = [],
    portalCladding = [],
    portalCollars = [],
    portalFasteners = [],
    portalTopFins = [],
    portalBraces = [],
    directionArrows = [];
  for (let s = 0; s < track.length; s += 12) {
    for (const side of [-1, 1]) {
      railPosts.push(local(s, side * 14.95, 0.88));
      shoes.push(local(s, side * 14.95, 0.057));
      fasteners.push(local(s, side * 14.59, 0.14));
      fasteners.push(local(s, side * 15.3, 0.14));
      reflectors.push(local(s, side * 14.74, 1.57));
      if (s % 24 === 0) {
        shoulderLids.push(local(s + 5, side * 16.3, 0.037));
        lidInsets.push(local(s + 5, side * 16.3, 0.072));
        lidHandles.push(local(s + 5, side * 16.3, 0.095, 0.8));
      }
      if (s % 48 === 0) {
        ventRecesses.push(local(s + 9, side * 16.18, 0.048));
        for (let blade = -4; blade <= 4; blade += 1)
          ventSlats.push(local(s + 9, side * 16.18, 0.079, blade * 0.2));
        flankRecesses.push(local(s + 4, side * 17.47, -0.74));
        flankPlates.push(local(s + 4, side * 17.52, -0.74));
        for (const z of [-1.95, 1.95])
          flankLocks.push(local(s + 4, side * 17.6, -0.74, z));
      }
      if (s % 36 === 0 && Math.abs(track.sample(s).curvature) > 0.003)
        curbIntervals.push(local(s + 1.5, side * 14.34, 0.44));
    }
  }
  for (let s = 0; s < track.length; s += 30) {
    const a = track.sample(s),
      b = track.sample(s + 30);
    keelCrossheads.push(local(s, 0, -7.4));
    undersideJoints.push(local(s, 0, -7.16));
    for (const side of [-1, 1]) {
      upperTrusses.push(
        beam(
          framePoint(a, side * 9.7, -7.35),
          framePoint(b, side * 9.7, -10.8),
          0.42,
          0.5,
        ),
      );
      upperTrusses.push(
        beam(
          framePoint(a, side * 9.7, -10.8),
          framePoint(b, side * 9.7, -7.35),
          0.42,
          0.5,
        ),
      );
      upperTrusses.push(
        beam(
          framePoint(a, side * 9.7, -10.8),
          framePoint(b, side * 9.7, -10.8),
          0.52,
          0.62,
        ),
      );
    }
  }
  for (
    let distance = 18, index = 0;
    distance < track.length;
    distance += 90, index += 1
  ) {
    const side = index % 2 ? -1 : 1;
    const frame = track.sample(distance);
    lampBrackets.push(local(distance, side * 17.0, 2.0));
    lampBodies.push(local(distance, side * 16.8, 3.85));
    lampFaces.push(local(distance, side * 16.45, 3.8));
    practicalFixtures.push({
      distance,
      position: framePoint(frame, side * 16.45, 3.8),
      target: framePoint(frame, side * 6, 0.4),
      intensity: 180,
      color: 0xffd5a6,
    });
    if (index % 2 === 0)
      directionArrows.push(local(distance + 15, side * 16.2, 0.125));
  }
  instances(
    'Rail vertical posts',
    new THREE.BoxGeometry(0.25, 1.67, 0.38),
    dark,
    railPosts,
  );
  instances(
    'Captive rail attachment shoes',
    new THREE.BoxGeometry(1, 0.11, 0.83),
    titanium,
    shoes,
  );
  instances(
    'Hex-head titanium fixings',
    new THREE.CylinderGeometry(0.072, 0.072, 0.09, 6),
    titanium,
    fasteners,
  );
  instances(
    'Sparse amber passive rail reflectors',
    new THREE.BoxGeometry(0.07, 0.15, 0.5),
    amber,
    reflectors,
  );
  conformPanels(
    'Removable shoulder panel frames',
    [1.45, 0.057, 3.3],
    dark,
    shoulderLids,
  );
  conformPanels(
    'Brushed shoulder access lids',
    [1.29, 0.02, 3.13],
    titanium,
    lidInsets,
  );
  conformPanels('Flush access latch', [0.45, 0.028, 0.12], cavity, lidHandles);
  conformPanels(
    'Recessed service ventilation pockets',
    [1.67, 0.055, 2.38],
    cavity,
    ventRecesses,
  );
  conformPanels(
    'Shielded ventilation blades',
    [1.47, 0.025, 0.086],
    titanium,
    ventSlats,
  );
  instances(
    'Side access dark seals',
    new THREE.BoxGeometry(0.055, 1.08, 4.4),
    cavity,
    flankRecesses,
  );
  instances(
    'External ivory side panels',
    new THREE.BoxGeometry(0.04, 0.9, 4.2),
    ivory,
    flankPlates,
  );
  instances(
    'Panel captive lock bars',
    new THREE.BoxGeometry(0.032, 0.45, 0.07),
    dark,
    flankLocks,
  );
  instances(
    'Exposed triangulated underside frame',
    new THREE.BoxGeometry(1, 1, 1),
    underframe,
    upperTrusses,
    true,
  );
  instances(
    'Load-bearing transverse keel ribs',
    new THREE.BoxGeometry(20.7, 0.45, 1.15),
    dark,
    keelCrossheads,
    true,
  );
  instances(
    'Underside module breaks',
    new THREE.BoxGeometry(17.6, 0.035, 0.12),
    cavity,
    undersideJoints,
  );
  conformPanels(
    'Corner curb vermilion intervals',
    [0.42, 0.019, 2.4],
    vermilion,
    curbIntervals,
  );
  instances(
    'Outer shoulder luminaire brackets',
    new THREE.BoxGeometry(0.22, 4, 0.25),
    dark,
    lampBrackets,
  );
  instances(
    'Shielded luminaire alloy housings',
    new THREE.BoxGeometry(0.8, 0.42, 1.8),
    ivory,
    lampBodies,
  );
  instances(
    'Recessed warm track optics',
    new THREE.BoxGeometry(0.035, 0.24, 1.45),
    optics,
    lampFaces,
  );
  const arrowGeometry = new THREE.BufferGeometry();
  arrowGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-0.48, 0, -0.75, 0, 0, 0.85, 0.48, 0, -0.75],
      3,
    ),
  );
  arrowGeometry.computeVertexNormals();
  instances(
    'Service shoulder travel arrows',
    arrowGeometry,
    amber,
    directionArrows,
  );

  const portalDistances = [
    32, 120, 208, 560, 1200, 1748, 2848, 3316, 3690, 4106,
  ];
  const portalProfile = [
    [-20, -3.5],
    [-20, 10.5],
    [-13, 19],
    [13, 19],
    [20, 10.5],
    [20, -3.5],
  ];
  const signPositions = [],
    signUvs = [],
    signIndices = [];
  const atlas = texture(orbitalSignsTexture(track.sections));
  const signMaterial = material({
    color: 0xffffff,
    map: atlas,
    roughness: 0.62,
    metalness: 0.12,
    emissive: 0xc6d7df,
    emissiveMap: atlas,
    emissiveIntensity: 0.18,
  });
  for (const distance of portalDistances) {
    const frame = track.sample(distance);
    // The portal's depth follows the road tangent even on rolled sections.
    // Split cladding exposes the darker load-bearing member at service joints.
    const portalBeam = (from, to, width, depth) => {
      const entry = beam(from, to, width, depth);
      const along = to.clone().sub(from).normalize();
      const across = along.clone().cross(frame.tangent).normalize();
      entry.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(across, along, frame.tangent),
      );
      return entry;
    };
    for (let i = 0; i < portalProfile.length - 1; i += 1) {
      const from = framePoint(frame, ...portalProfile[i]);
      const to = framePoint(frame, ...portalProfile[i + 1]);
      portalFrames.push(portalBeam(from, to, 0.64, 1.45));
      const span = to.clone().sub(from);
      const along = span.clone().normalize();
      const across = along.clone().cross(frame.tangent).normalize();
      const count = Math.ceil(span.length() / 2.8);
      const joint = 0.045 / span.length();
      for (let panel = 0; panel < count; panel += 1) {
        const begin = from.clone().addScaledVector(span, panel / count + joint);
        const end = from
          .clone()
          .addScaledVector(span, (panel + 1) / count - joint);
        portalCladding.push(
          portalBeam(
            begin.clone().addScaledVector(frame.tangent, -0.81),
            end.clone().addScaledVector(frame.tangent, -0.81),
            0.78,
            0.18,
          ),
        );
        for (const endpoint of [begin, end]) {
          const inset = endpoint === begin ? 0.15 : -0.15;
          for (const side of [-1, 1])
            portalFasteners.push({
              position: endpoint
                .clone()
                .addScaledVector(along, inset)
                .addScaledVector(across, side * 0.24)
                .addScaledVector(frame.tangent, -0.925),
              quaternion: frame.quaternion,
            });
        }
      }
      // Connection saddles give changes of direction a load-bearing assembly.
      if (i > 0)
        portalCollars.push(
          portalBeam(
            from.clone().addScaledVector(along, 0.04),
            from.clone().addScaledVector(along, 0.38),
            0.9,
            1.58,
          ),
        );
    }
    for (const side of [-1, 1]) {
      portalBraces.push(
        beam(
          framePoint(track.sample(distance - 7), side * 19, -3.5),
          framePoint(frame, side * 20, 10.5),
          0.36,
          0.5,
        ),
      );
      portalTopFins.push(local(distance, side * 11.1, 20.5, 1.1));
    }
    const sectionIndex = Math.max(
      0,
      track.sections.findIndex(
        (section) =>
          distance + 35 >= section.start && distance + 35 < section.end,
      ),
    );
    const vertexOffset = signPositions.length / 3;
    for (const [x, y, u, v] of [
      [6, 18.7, 0, 0],
      [-6, 18.7, 1, 0],
      [6, 21.1, 0, 1],
      [-6, 21.1, 1, 1],
    ]) {
      const point = framePoint(frame, x, y, -0.87);
      signPositions.push(point.x, point.y, point.z);
      signUvs.push(u, 1 - (sectionIndex + 1 - v) / track.sections.length);
    }
    signIndices.push(
      vertexOffset,
      vertexOffset + 1,
      vertexOffset + 2,
      vertexOffset + 1,
      vertexOffset + 3,
      vertexOffset + 2,
    );
  }
  instances(
    'Orbital service portals / open sky frames',
    new THREE.BoxGeometry(1, 1, 1),
    dark,
    portalFrames,
    true,
  );
  const panelShape = new THREE.Shape();
  panelShape.moveTo(-0.46, -0.46);
  panelShape.lineTo(0.46, -0.46);
  panelShape.lineTo(0.46, 0.46);
  panelShape.lineTo(-0.46, 0.46);
  panelShape.closePath();
  const panelGeometry = new THREE.ExtrudeGeometry(panelShape, {
    depth: 0.94,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.04,
    bevelSegments: 1,
    steps: 1,
  });
  panelGeometry.translate(0, 0, -0.47);
  instances(
    'Portal titanium face plates',
    panelGeometry,
    portalFinish,
    portalCladding,
    true,
  );
  instances(
    'Portal connection saddles',
    new THREE.BoxGeometry(1, 1, 1),
    portalHardware,
    portalCollars,
    true,
  );
  instances(
    'Portal captive panel locks',
    new THREE.CylinderGeometry(0.056, 0.056, 0.035, 6).rotateX(Math.PI / 2),
    portalHardware,
    portalFasteners,
  );
  instances(
    'Portal triangular stabilizers',
    new THREE.BoxGeometry(1, 1, 1),
    titanium,
    portalBraces,
    true,
  );
  instances(
    'Split portal roof fins / open centre',
    new THREE.BoxGeometry(6.2, 0.35, 5.8),
    ivory,
    portalTopFins,
    true,
  );
  const signGeometry = new THREE.BufferGeometry();
  signGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(signPositions, 3),
  );
  signGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(signUvs, 2));
  signGeometry.setIndex(signIndices);
  signGeometry.computeVertexNormals();
  add('Authored section advisories', signGeometry, signMaterial);

  // Advance advisories announce demands before turn-in. These are physical
  // shoulder boards and edge-only paint, never an ideal racing-line overlay.
  const guidance = [
    {
      kind: 'brake-left',
      distance: 3920,
      side: -1,
      up: 7.4,
      width: 7.2,
      height: 4.3,
      row: 0,
      hazardDistance: 4162,
    },
    {
      kind: 'wallride',
      distance: 500,
      side: 1,
      up: 7.4,
      width: 7.2,
      height: 4.3,
      row: 1,
      hazardDistance: 825,
    },
    {
      kind: 'dive',
      distance: 3190,
      side: -1,
      up: 7.4,
      width: 7.2,
      height: 4.3,
      row: 2,
      hazardDistance: 3463,
    },
    ...[4090, 4120, 4150, 4180, 4210, 4240].map((distance) => ({
      kind: 'left-chevron',
      distance,
      side: -1,
      up: 3.8,
      width: 4.3,
      height: 2.2,
      row: 3,
      hazardDistance: 4162,
    })),
  ];
  const guidanceMap = texture(orbitalGuidanceTexture());
  const guidanceMaterial = material({
    color: 0xffffff,
    map: guidanceMap,
    roughness: 0.9,
    metalness: 0,
    emissive: 0x9f7543,
    emissiveMap: guidanceMap,
    emissiveIntensity: 0.065,
  });
  const guidancePositions = [],
    guidanceUvs = [],
    guidanceIndices = [],
    guidanceBacks = [],
    guidanceMasts = [],
    guidanceFeet = [],
    brakingMarks = [];
  for (const board of guidance) {
    const frame = track.sample(board.distance);
    const lateral = board.side * 19.3;
    const offset = guidancePositions.length / 3;
    for (const [x, y, u, v] of [
      [board.width / 2, -board.height / 2, 0, 0],
      [-board.width / 2, -board.height / 2, 1, 0],
      [board.width / 2, board.height / 2, 0, 1],
      [-board.width / 2, board.height / 2, 1, 1],
    ]) {
      const point = framePoint(frame, lateral + x, board.up + y, -0.19);
      guidancePositions.push(point.x, point.y, point.z);
      guidanceUvs.push(u, 1 - (board.row + 1 - v) / 4);
    }
    guidanceIndices.push(
      offset,
      offset + 1,
      offset + 2,
      offset + 1,
      offset + 3,
      offset + 2,
    );
    guidanceBacks.push(
      local(
        board.distance,
        lateral,
        board.up,
        0,
        new THREE.Vector3(board.width + 0.2, board.height + 0.2, 0.28),
      ),
    );
    guidanceMasts.push(
      local(
        board.distance,
        board.side * 18.6,
        board.up / 2,
        0.08,
        new THREE.Vector3(0.28, board.up + 0.8, 0.33),
      ),
    );
    guidanceFeet.push(
      local(
        board.distance,
        board.side * 18,
        -0.43,
        0,
        new THREE.Vector3(2.8, 0.38, 1.05),
      ),
    );
  }
  for (const [distance, count] of [
    [3910, 3],
    [3980, 2],
    [4050, 1],
  ]) {
    for (const side of [-1, 1])
      for (let index = 0; index < count; index += 1)
        brakingMarks.push(local(distance + index * 3, side * 11.9, 0.064));
  }
  conformPanels(
    'Three two one / edge-only braking paint',
    [2.6, 0.017, 0.58],
    amber,
    brakingMarks,
  );
  instances(
    'Advance guidance board edge cases',
    new THREE.BoxGeometry(1, 1, 1),
    dark,
    guidanceBacks,
  );
  instances(
    'Guidance board outside-shoulder masts',
    new THREE.BoxGeometry(1, 1, 1),
    underframe,
    guidanceMasts,
  );
  instances(
    'Guidance board docking feet',
    new THREE.BoxGeometry(1, 1, 1),
    underframe,
    guidanceFeet,
  );
  const guidanceGeometry = new THREE.BufferGeometry();
  guidanceGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(guidancePositions, 3),
  );
  guidanceGeometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(guidanceUvs, 2),
  );
  guidanceGeometry.setIndex(guidanceIndices);
  guidanceGeometry.computeVertexNormals();
  add(
    'Advance braking and transition guidance',
    guidanceGeometry,
    guidanceMaterial,
  );
  group.userData.guidance = guidance;

  const practicalLights = Array.from({ length: 3 }, () => {
    const light = new THREE.SpotLight(0xffd5a6, 0, 52, 0.94, 0.78, 1.8);
    light.castShadow = false;
    group.add(light, light.target);
    return light;
  });
  const lightAssignments = Array(practicalLights.length).fill(-1);
  group.userData.update = (distance) => {
    const selection = selectPracticalFixtures(
      practicalFixtures,
      track.length,
      distance,
      18,
    );
    const selectedIndices = new Set(selection.map(({ index }) => index));
    const claimed = new Set();
    for (const { index, fixture, weight } of selection) {
      let slot = lightAssignments.indexOf(index);
      if (slot < 0)
        slot = lightAssignments.findIndex(
          (assigned, candidate) =>
            !selectedIndices.has(assigned) && !claimed.has(candidate),
        );
      claimed.add(slot);
      const light = practicalLights[slot];
      if (lightAssignments[slot] !== index) {
        light.intensity = 0;
        light.position.copy(fixture.position);
        light.target.position.copy(fixture.target);
        lightAssignments[slot] = index;
      }
      light.intensity = fixture.intensity * weight;
    }
  };
  group.userData.update(0);
  group.userData.practicalFixtures = practicalFixtures;
  group.userData.structuralSegments = structuralSegments;
  group.userData.portalDistances = portalDistances;
  group.userData.engineeringEnvelope = {
    lateral: 23,
    below: 11.5,
    above: 21.3,
  };
  let disposed = false;
  group.userData.dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const geometry of geometries) geometry.dispose();
    for (const surface of materials) surface.dispose();
    for (const map of textures) map.dispose();
    for (const light of practicalLights) light.dispose();
    geometries.clear();
    materials.clear();
    textures.clear();
  };
  return group;
}
