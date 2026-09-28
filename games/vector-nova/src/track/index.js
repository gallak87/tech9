import * as THREE from 'three';
import { createTrack, framePoint } from './model.js';
import {
  sweepGeometry,
  boxProfile,
  beamTransform,
  surfaceTexture,
  roadRoughnessTexture,
  signTexture,
} from './geometry.js';
export { createTrack };

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export function buildTrackVisual(track) {
  const group = new THREE.Group();
  group.name = 'Halcyon Viaduct / complete authored circuit';
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const ownTexture = (texture) => {
    textures.add(texture);
    return texture;
  };
  const material = (parameters) => {
    const result = new THREE.MeshStandardMaterial(parameters);
    materials.add(result);
    return result;
  };
  const roadMap = ownTexture(surfaceTexture('road'));
  const concreteMap = ownTexture(surfaceTexture('concrete'));
  const road = material({
    color: 0xd2d7d7,
    map: roadMap,
    bumpMap: roadMap,
    bumpScale: 0.004,
    roughnessMap: ownTexture(roadRoughnessTexture()),
    roughness: 0.9,
    metalness: 0.07,
  });
  const concrete = material({
    color: 0xd8d6cc,
    map: concreteMap,
    bumpMap: concreteMap,
    bumpScale: 0.024,
    roughness: 0.86,
  });
  const edgeConcrete = material({
    color: 0xb4bec0,
    map: concreteMap,
    roughness: 0.83,
  });
  const steel = material({ color: 0x9caeb5, roughness: 0.34, metalness: 0.76 });
  const darkSteel = material({
    color: 0x30424c,
    roughness: 0.48,
    metalness: 0.7,
  });
  const tunnelCladding = material({
    color: 0xc1c6c2,
    map: concreteMap,
    bumpMap: concreteMap,
    bumpScale: 0.002,
    roughness: 0.48,
    metalness: 0.32,
  });
  const tunnelPlinth = material({
    color: 0x45535a,
    roughness: 0.68,
    metalness: 0.28,
  });
  const tunnelBronze = material({
    color: 0xb78254,
    roughness: 0.48,
    metalness: 0.6,
  });
  const stripe = material({
    color: 0xd8d6c7,
    roughness: 0.72,
    metalness: 0.03,
  });
  const amber = material({
    color: 0xe4af62,
    roughness: 0.48,
    metalness: 0.2,
    emissive: 0xbb6016,
    emissiveIntensity: 0.22,
  });
  const vermilion = material({
    color: 0xb84730,
    roughness: 0.54,
    metalness: 0.22,
  });
  const lamp = material({
    color: 0xffead1,
    emissive: 0xffcc8e,
    emissiveIntensity: 3.2,
    roughness: 0.32,
  });
  const blueLamp = material({
    color: 0xc2e2eb,
    emissive: 0xafd8f1,
    emissiveIntensity: 1.35,
    roughness: 0.4,
  });

  function addMesh(name, geometry, surface, castShadow = false) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.name = name;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  function addInstances(
    name,
    geometry,
    surface,
    transforms,
    castShadow = false,
  ) {
    geometries.add(geometry);
    const mesh = new THREE.InstancedMesh(geometry, surface, transforms.length);
    mesh.name = name;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    const unit = new THREE.Vector3(1, 1, 1);
    transforms.forEach((entry, index) => {
      matrix.compose(
        entry.position,
        entry.quaternion ?? new THREE.Quaternion(),
        entry.scale ?? unit,
      );
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  }
  function localTransform(s, x, y, z = 0, scale) {
    const frame = track.sample(s);
    return {
      position: framePoint(frame, x, y, z),
      quaternion: frame.quaternion,
      scale,
    };
  }
  function sweep(name, profile, surface, options, shadows = false) {
    return addMesh(
      name,
      sweepGeometry(track, profile, options),
      surface,
      shadows,
    );
  }

  sweep(
    'Composite running surface / 28 metres',
    [
      [-14, 0],
      [14, 0],
    ],
    road,
  );
  sweep(
    'Precast segmented box girder / complete underside',
    [
      [15.8, -0.04],
      [15.8, -1.35],
      [10.5, -2.7],
      [8.2, -5.5],
      [-8.2, -5.5],
      [-10.5, -2.7],
      [-15.8, -1.35],
      [-15.8, -0.04],
    ],
    concrete,
    { uvScale: 12 },
    true,
  );
  for (const side of [-1, 1]) {
    sweep(
      'Service shoulder with removable concrete panels',
      [
        [side * 14 - 0.001, 0.008],
        [side * 15.8, 0.008],
      ].sort((a, b) => a[0] - b[0]),
      edgeConcrete,
      { uvScale: 6 },
    );
    sweep(
      'Edge running boundary',
      [
        [side * 13.25 - 0.11, 0.025],
        [side * 13.25 + 0.11, 0.025],
      ],
      stripe,
    );
    sweep(
      'Concrete safety curb',
      boxProfile(side * 14.35, 0.2, 0.44, 0.4),
      edgeConcrete,
      { uvScale: 9 },
    );
    sweep(
      'Crash rail lower folded steel beam',
      [
        [side * 14.75 - 0.16, 0.63],
        [side * 14.75 + 0.19, 0.65],
        [side * 14.75 + 0.25, 0.92],
        [side * 14.75 + 0.16, 1.08],
        [side * 14.75 - 0.19, 1.06],
        [side * 14.75 - 0.25, 0.78],
        [side * 14.75 - 0.16, 0.63],
      ],
      steel,
    );
    sweep(
      'Upper safety handrail',
      boxProfile(side * 14.75, 1.66, 0.25, 0.22),
      steel,
    );
    sweep(
      'Concealed service duct',
      boxProfile(side * 15.55, -0.64, 0.34, 0.42),
      darkSteel,
    );
    sweep(
      'Underside utility trunk',
      boxProfile(side * 7.4, -5.57, 0.28, 0.2),
      darkSteel,
      { step: 8 },
    );
  }
  const posts = [],
    reflectors = [],
    baseplates = [],
    bolts = [],
    grates = [],
    drainSlots = [],
    joints = [],
    crossheads = [],
    piers = [],
    footings = [],
    pierCaps = [],
    pierBands = [],
    girderSeams = [],
    curbMarkings = [],
    laneDashes = [],
    serviceCovers = [];
  for (let s = 0; s < track.length; s += 12) {
    for (const side of [-1, 1]) {
      posts.push(localTransform(s, side * 14.75, 0.88));
      reflectors.push(localTransform(s, side * 14.48, 1.61));
      baseplates.push(localTransform(s, side * 14.75, 0.038));
      bolts.push(localTransform(s, side * 14.47, 0.071));
      bolts.push(localTransform(s, side * 15.03, 0.071));
      if (Math.round(s / 12) % 2 === 0) {
        grates.push(localTransform(s + 5, side * 14.98, 0.032));
        for (let slot = -2; slot <= 2; slot += 1)
          drainSlots.push(
            localTransform(s + 5, side * 14.98, 0.049, slot * 0.19),
          );
      }
      if (s % 48 === 0)
        serviceCovers.push(localTransform(s + 9, side * 15.03, 0.021));
      if (Math.abs(track.sample(s).curvature) > 0.003)
        curbMarkings.push(localTransform(s + 3, side * 13.7, 0.026));
    }
  }
  for (let s = 0; s < track.length; s += 36) {
    joints.push(localTransform(s, 0, 0.008));
    girderSeams.push(localTransform(s, 0, -5.535));
  }
  for (let s = 12; s < 420; s += 21)
    for (const x of [-4.7, 4.7]) laneDashes.push(localTransform(s, x, 0.028));
  // Skip columns beneath the elevated crossing when a lower running surface
  // occupies their footprint. The arch then carries the clear bridge span.
  const lowerRoute = Array.from(
    { length: Math.ceil(track.length / 9) },
    (_, i) => ({ s: i * 9, position: track.sample(i * 9).position }),
  );
  const columnClear = (position, s) =>
    lowerRoute.every((entry) => {
      const delta = Math.abs(entry.s - s);
      if (Math.min(delta, track.length - delta) < 120) return true;
      if (entry.position.y > position.y - 15) return true;
      return (
        Math.hypot(
          entry.position.x - position.x,
          entry.position.z - position.z,
        ) > 25
      );
    });
  for (let s = 24; s < track.length; s += 72) {
    const frame = track.sample(s);
    const supports = [-1, 1].map((side) => framePoint(frame, side * 6.2, -7.2));
    if (!supports.every((position) => columnClear(position, s))) continue;
    crossheads.push(localTransform(s, 0, -6.15));
    for (const top of supports) {
      const height = top.y - track.groundY - 1.25;
      piers.push({
        position: new THREE.Vector3(
          top.x,
          track.groundY + 1.25 + height / 2,
          top.z,
        ),
        scale: new THREE.Vector3(3.3, height, 4.9),
      });
      footings.push({
        position: new THREE.Vector3(top.x, track.groundY + 0.65, top.z),
      });
      pierCaps.push({ position: new THREE.Vector3(top.x, top.y - 0.7, top.z) });
      for (let y = track.groundY + 14; y < top.y - 8; y += 24)
        pierBands.push({ position: new THREE.Vector3(top.x, y, top.z) });
    }
  }
  addInstances(
    'Barrier posts / bolted folded steel',
    new THREE.BoxGeometry(0.33, 1.7, 0.44),
    darkSteel,
    posts,
  );
  addInstances(
    'Amber ceramic edge reflectors',
    new THREE.BoxGeometry(0.16, 0.14, 0.68),
    amber,
    reflectors,
  );
  addInstances(
    'Rail anchor shoes',
    new THREE.BoxGeometry(0.82, 0.066, 0.76),
    steel,
    baseplates,
  );
  addInstances(
    'Hexagonal barrier anchors',
    new THREE.CylinderGeometry(0.065, 0.065, 0.06, 6),
    steel,
    bolts,
  );
  addInstances(
    'Service drainage trays',
    new THREE.BoxGeometry(0.74, 0.025, 1.13),
    steel,
    grates,
  );
  addInstances(
    'Drainage slots',
    new THREE.BoxGeometry(0.57, 0.015, 0.055),
    darkSteel,
    drainSlots,
  );
  addInstances(
    'Shoulder access lids',
    new THREE.BoxGeometry(0.9, 0.028, 1.45),
    darkSteel,
    serviceCovers,
  );
  addInstances(
    'Deck expansion seals',
    new THREE.BoxGeometry(27.98, 0.014, 0.078),
    darkSteel,
    joints,
  );
  addInstances(
    'Underside precast joins',
    new THREE.BoxGeometry(16.45, 0.07, 0.16),
    darkSteel,
    girderSeams,
  );
  addInstances(
    'Grid approach lane paint',
    new THREE.BoxGeometry(0.12, 0.013, 6.2),
    stripe,
    laneDashes,
  );
  addInstances(
    'Corner shoulder vermilion intervals',
    new THREE.BoxGeometry(0.34, 0.015, 4.1),
    vermilion,
    curbMarkings,
  );
  addInstances(
    'Concrete transverse pier heads',
    new THREE.BoxGeometry(20.7, 1.8, 5.6),
    concrete,
    crossheads,
    true,
  );
  addInstances(
    'Grounded vertical twin piers',
    new THREE.BoxGeometry(1, 1, 1),
    concrete,
    piers,
    true,
  );
  addInstances(
    'Grounded spread foundations',
    new THREE.BoxGeometry(8.1, 1.3, 9.3),
    concrete,
    footings,
    true,
  );
  addInstances(
    'Pier upper bearing collars',
    new THREE.BoxGeometry(4.1, 1.5, 5.6),
    edgeConcrete,
    pierCaps,
  );
  addInstances(
    'Pier formwork collars',
    new THREE.BoxGeometry(3.4, 0.17, 5.0),
    edgeConcrete,
    pierBands,
  );

  // A repeated road-light family, with only the three nearest practical lights
  // evaluated by the renderer. Every visible light has authored physical hardware.
  const lampPoles = [],
    lampArms = [],
    lampBodies = [],
    lampFaces = [],
    lightFixtures = [];
  for (let s = 24, i = 0; s < track.length; s += 72, i += 1) {
    if (s > track.length * 0.38 && s < track.length * 0.43) continue;
    const side = i % 2 ? -1 : 1;
    lampPoles.push(localTransform(s, side * 15.37, 4.35));
    lampArms.push(localTransform(s, side * 13.82, 8.61));
    lampBodies.push(localTransform(s, side * 12.22, 8.55));
    lampFaces.push(localTransform(s, side * 12.22, 8.4));
    const f = track.sample(s);
    lightFixtures.push({
      distance: s,
      position: framePoint(f, side * 12.22, 8.36),
      target: framePoint(f, side * 6, 0),
      intensity: 135,
      color: 0xffd2a0,
    });
  }
  addInstances(
    'Road luminaire masts',
    new THREE.BoxGeometry(0.22, 8.7, 0.28),
    darkSteel,
    lampPoles,
    true,
  );
  addInstances(
    'Road luminaire cantilever arms',
    new THREE.BoxGeometry(3.4, 0.24, 0.31),
    steel,
    lampArms,
  );
  addInstances(
    'Road luminaire housings',
    new THREE.BoxGeometry(0.85, 0.26, 2.3),
    darkSteel,
    lampBodies,
  );
  addInstances(
    'Warm downward road optics',
    new THREE.BoxGeometry(0.67, 0.038, 2.06),
    lamp,
    lampFaces,
  );

  const ribBeams = [],
    tunnelFixtures = [],
    tunnelLampBodies = [],
    tunnelLampBrackets = [],
    tunnelPanels = [],
    panelRecesses = [],
    wallPanels = [],
    panelLapSeams = [],
    ventRecesses = [],
    ventSlats = [],
    panelFasteners = [],
    extractionDucts = [],
    extractionRims = [],
    extractionGrilles = [],
    extractionHangers = [],
    evacuationStripes = [];
  const tunnelStart = track.length * 0.383;
  const tunnelEnd = track.length * 0.426;
  const vault = [
    [16.5, 0],
    [16.5, 9],
    [12.6, 14],
    [0, 17],
    [-12.6, 14],
    [-16.5, 9],
    [-16.5, 0],
  ];
  // Daylight slots separate finished precast bays. Their interiors expose
  // cladding, extraction equipment, fixings and shielded optical cassettes.
  for (let s = tunnelStart; s < tunnelEnd; s += 48) {
    const bayEnd = Math.min(s + 43, tunnelEnd);
    sweep(
      'Transit vault precast shell bay',
      [
        ...vault,
        [-17.35, 0],
        [-17.35, 9.3],
        [-13.1, 14.75],
        [0, 17.85],
        [13.1, 14.75],
        [17.35, 9.3],
        [17.35, 0],
        [16.5, 0],
      ],
      concrete,
      { start: s, end: bayEnd, step: 4, uvScale: 6 },
      true,
    );
    for (const side of [-1, 1]) {
      const interior =
        side > 0
          ? [
              [16.2, 0.12],
              [16.2, 2.75],
            ]
          : [
              [-16.2, 2.75],
              [-16.2, 0.12],
            ];
      sweep('Vault replaceable dark service plinth', interior, tunnelPlinth, {
        start: s,
        end: bayEnd,
        step: 4,
        uvScale: 6,
      });
      sweep(
        'Vault bronze service datum',
        boxProfile(side * 16.05, 2.87, 0.11, 0.17),
        tunnelBronze,
        { start: s, end: bayEnd, step: 4 },
      );
      for (const offset of [7, 20, 33]) {
        if (s + offset + 5.5 >= bayEnd) continue;
        const station = s + offset;
        panelRecesses.push(localTransform(station, side * 16.14, 4.93));
        wallPanels.push(localTransform(station, side * 15.98, 4.93));
        for (const z of [-1.78, 1.78])
          panelLapSeams.push(localTransform(station + z, side * 15.922, 4.93));
        ventRecesses.push(localTransform(station, side * 16.12, 7.77));
        for (let row = 0; row < 6; row += 1)
          ventSlats.push(
            localTransform(station, side * 15.96, 7.25 + row * 0.2),
          );
        for (const z of [-4.9, 4.9])
          for (const y of [3.48, 6.38]) {
            panelFasteners.push(localTransform(station + z, side * 15.895, y));
          }
      }
      if (bayEnd - s > 27) {
        const station = s + 21;
        const duct = localTransform(station, side * 4.4, 14.84);
        duct.quaternion.multiply(
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(1, 0, 0),
            Math.PI / 2,
          ),
        );
        extractionDucts.push(duct);
        for (const z of [-7.3, 7.3]) {
          extractionRims.push(localTransform(station + z, side * 4.4, 14.84));
          for (let blade = 0; blade < 8; blade += 1) {
            const grille = localTransform(station + z, side * 4.4, 14.84);
            grille.quaternion.multiply(
              new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 0, 1),
                (blade * Math.PI) / 8,
              ),
            );
            extractionGrilles.push(grille);
          }
          extractionHangers.push(
            localTransform(station + z * 0.8, side * 4.4, 15.55),
          );
        }
      }
    }
  }
  for (let s = tunnelStart, bay = 0; s <= tunnelEnd; s += 24, bay += 1) {
    const frame = track.sample(s);
    for (let i = 0; i < vault.length - 1; i += 1)
      ribBeams.push(
        beamTransform(
          framePoint(frame, ...vault[i]),
          framePoint(frame, ...vault[i + 1]),
          0.35,
          0.62,
        ),
      );
    for (const side of [-1, 1]) {
      tunnelLampBodies.push(localTransform(s, side * 10.4, 13.76));
      tunnelFixtures.push(localTransform(s, side * 10.4, 13.55));
      for (const z of [-2.1, 2.1])
        tunnelLampBrackets.push(localTransform(s + z, side * 10.4, 14.12));
      tunnelPanels.push(localTransform(s, side * 16.06, 4.1));
      evacuationStripes.push(localTransform(s, side * 15.95, 0.78));
    }
    const side = bay % 2 ? -1 : 1;
    lightFixtures.push({
      distance: s,
      position: framePoint(frame, side * 10.4, 13.51),
      target: framePoint(frame, side * 7.2, 0.3),
      intensity: 560,
      color: 0xffd4a6,
    });
  }
  for (const side of [-1, 1]) {
    sweep(
      'Transit vault recessed service channel',
      boxProfile(side * 16.12, 2.1, 0.16, 0.36),
      darkSteel,
      { start: tunnelStart, end: tunnelEnd, step: 4 },
    );
    sweep(
      'Transit vault low-level guide light',
      boxProfile(side * 16, 2.16, 0.05, 0.047),
      blueLamp,
      { start: tunnelStart, end: tunnelEnd, step: 4 },
    );
    sweep(
      'Transit vault upper cable containment',
      boxProfile(side * 15.99, 8.72, 0.22, 0.27),
      darkSteel,
      { start: tunnelStart, end: tunnelEnd, step: 4 },
    );
  }
  addInstances(
    'Transit vault structural ribs',
    new THREE.BoxGeometry(1, 1, 1),
    darkSteel,
    ribBeams,
    true,
  );
  addInstances(
    'Transit vault articulated light cassettes',
    new THREE.BoxGeometry(1.12, 0.38, 5.3),
    darkSteel,
    tunnelLampBodies,
  );
  addInstances(
    'Transit vault warm ceiling optics',
    new THREE.BoxGeometry(0.8, 0.038, 4.91),
    lamp,
    tunnelFixtures,
  );
  addInstances(
    'Transit vault luminaire mounting brackets',
    new THREE.BoxGeometry(1.3, 0.68, 0.18),
    steel,
    tunnelLampBrackets,
  );
  addInstances(
    'Vault removable panel shadow joints',
    new THREE.BoxGeometry(0.2, 3.52, 10.75),
    tunnelPlinth,
    panelRecesses,
  );
  addInstances(
    'Vault anodized wall cladding panels',
    new THREE.BoxGeometry(0.09, 3.39, 10.61),
    tunnelCladding,
    wallPanels,
  );
  addInstances(
    'Vault cladding standing seams',
    new THREE.BoxGeometry(0.025, 3.34, 0.028),
    steel,
    panelLapSeams,
  );
  addInstances(
    'Vault wall extraction recesses',
    new THREE.BoxGeometry(0.18, 1.47, 10.9),
    tunnelPlinth,
    ventRecesses,
  );
  addInstances(
    'Vault wall extraction louvers',
    new THREE.BoxGeometry(0.12, 0.075, 10.42),
    steel,
    ventSlats,
  );
  addInstances(
    'Vault cladding captive fixings',
    new THREE.BoxGeometry(0.038, 0.105, 0.105),
    steel,
    panelFasteners,
  );
  addInstances(
    'Vault paired cylindrical extraction units',
    new THREE.CylinderGeometry(0.69, 0.69, 14.45, 16),
    tunnelPlinth,
    extractionDucts,
    true,
  );
  addInstances(
    'Vault extraction intake collars',
    new THREE.TorusGeometry(0.66, 0.067, 6, 18),
    steel,
    extractionRims,
  );
  addInstances(
    'Vault extraction protective radial grilles',
    new THREE.BoxGeometry(0.035, 1.22, 0.075),
    darkSteel,
    extractionGrilles,
  );
  addInstances(
    'Vault extraction suspended brackets',
    new THREE.BoxGeometry(1.71, 0.18, 0.56),
    steel,
    extractionHangers,
  );
  addInstances(
    'Vault maintenance cabinets',
    new THREE.BoxGeometry(0.42, 2.4, 2.1),
    darkSteel,
    tunnelPanels,
  );
  addInstances(
    'Vault evacuation direction tiles',
    new THREE.BoxGeometry(0.08, 0.19, 2.3),
    stripe,
    evacuationStripes,
  );

  // Western gallery is deliberately open toward the city: concrete knife fins,
  // folded roof blades and structural tie beams, not another enclosed tunnel.
  const galleryStart = track.length * 0.564;
  const galleryEnd = track.length * 0.618;
  const galleryFins = [],
    galleryRoof = [],
    galleryTies = [],
    galleryLights = [],
    galleryBases = [];
  for (let s = galleryStart; s <= galleryEnd; s += 18) {
    const frame = track.sample(s);
    for (const side of [-1, 1]) {
      galleryFins.push(
        beamTransform(
          framePoint(frame, side * 16.5, 0.1),
          framePoint(frame, side * 13.4, 13.8),
          0.7,
          2.3,
        ),
      );
      galleryBases.push(localTransform(s, side * 16.1, -0.35));
    }
    galleryRoof.push(
      beamTransform(
        framePoint(frame, -13.4, 13.8),
        framePoint(frame, 13.4, 13.8),
        0.5,
        1.85,
      ),
    );
    galleryTies.push(
      beamTransform(
        framePoint(frame, -16.5, 0.2),
        framePoint(frame, -13.4, 13.8),
        0.19,
        0.24,
      ),
    );
    galleryLights.push(localTransform(s, -10.4, 13.36));
  }
  addInstances(
    'West gallery outward leaning fins',
    new THREE.BoxGeometry(1, 1, 1),
    concrete,
    galleryFins,
    true,
  );
  addInstances(
    'West gallery roof blades',
    new THREE.BoxGeometry(1, 1, 1),
    edgeConcrete,
    galleryRoof,
    true,
  );
  addInstances(
    'West gallery stainless reinforcement',
    new THREE.BoxGeometry(1, 1, 1),
    steel,
    galleryTies,
  );
  addInstances(
    'West gallery pier deck consoles',
    new THREE.BoxGeometry(3, 0.9, 3.4),
    concrete,
    galleryBases,
    true,
  );
  addInstances(
    'West gallery linear safety lighting',
    new THREE.BoxGeometry(0.26, 0.06, 3.1),
    lamp,
    galleryLights,
  );
  for (const side of [-1, 1])
    sweep(
      'West gallery top longitudinal restraint',
      boxProfile(side * 13.4, 13.8, 0.42, 0.44),
      darkSteel,
      { start: galleryStart, end: galleryEnd },
    );

  // A bowstring bridge describes the circuit crossing from both the upper route
  // and the start below. Hanging rods leave the 28 m racing surface completely clear.
  const bridgeStart = track.length * 0.716;
  const bridgeEnd = track.length * 0.776;
  const archRibs = [],
    archHangers = [],
    archDiagonals = [],
    archCrossheads = [],
    bridgeBearings = [];
  const archPoint = (s, side) => {
    const u = (s - bridgeStart) / (bridgeEnd - bridgeStart);
    return framePoint(
      track.sample(s),
      side * 17,
      3.8 + Math.sin(u * Math.PI) * 37,
    );
  };
  const archSegments = 28;
  for (let i = 0; i < archSegments; i += 1) {
    const s = THREE.MathUtils.lerp(bridgeStart, bridgeEnd, i / archSegments);
    const next = THREE.MathUtils.lerp(
      bridgeStart,
      bridgeEnd,
      (i + 1) / archSegments,
    );
    for (const side of [-1, 1]) {
      archRibs.push(
        beamTransform(archPoint(s, side), archPoint(next, side), 1.05, 1.6),
      );
      archHangers.push(
        beamTransform(
          framePoint(track.sample(s), side * 16.1, -1),
          archPoint(s, side),
          0.16,
          0.16,
        ),
      );
      if (i % 2 === 0)
        archDiagonals.push(
          beamTransform(
            framePoint(track.sample(s), side * 16.1, -0.4),
            archPoint(next, side),
            0.11,
            0.11,
          ),
        );
    }
    if (i > 3 && i < archSegments - 3 && i % 3 === 0)
      archCrossheads.push(
        beamTransform(archPoint(s, -1), archPoint(s, 1), 0.44, 0.6),
      );
  }
  for (const s of [bridgeStart, bridgeEnd])
    for (const side of [-1, 1])
      bridgeBearings.push(localTransform(s, side * 16.6, 1));
  addInstances(
    'Meridian steel bowstring arches',
    new THREE.BoxGeometry(1, 1, 1),
    steel,
    archRibs,
    true,
  );
  addInstances(
    'Meridian stainless suspension rods',
    new THREE.BoxGeometry(1, 1, 1),
    steel,
    archHangers,
  );
  addInstances(
    'Meridian diagonal cable stays',
    new THREE.BoxGeometry(1, 1, 1),
    darkSteel,
    archDiagonals,
  );
  addInstances(
    'Meridian overhead wind braces',
    new THREE.BoxGeometry(1, 1, 1),
    darkSteel,
    archCrossheads,
    true,
  );
  addInstances(
    'Meridian bridge bearing seats',
    new THREE.BoxGeometry(3.4, 3.2, 4.4),
    concrete,
    bridgeBearings,
    true,
  );
  for (const side of [-1, 1])
    sweep(
      'Meridian edge box beam',
      boxProfile(side * 16.25, -1, 0.85, 1.65),
      darkSteel,
      { start: bridgeStart, end: bridgeEnd },
      true,
    );

  const maintenanceDecks = [],
    maintenanceRails = [],
    cabinets = [],
    vents = [],
    steps = [],
    ladderRungs = [],
    ladderStiles = [],
    outboardBraces = [];
  for (let s = 170; s < track.length; s += 252) {
    const side = Math.round(s / 252) % 2 ? -1 : 1;
    const frame = track.sample(s);
    maintenanceDecks.push(localTransform(s, side * 18, -0.65));
    maintenanceRails.push(localTransform(s, side * 20.3, 1));
    cabinets.push(localTransform(s + 1, side * 18.7, 0.88));
    for (let row = 0; row < 5; row += 1)
      vents.push(localTransform(s + 1, side * 18.24, 0.7 + row * 0.16));
    for (let z = -2; z <= 2; z += 2)
      outboardBraces.push(
        beamTransform(
          framePoint(frame, side * 13.4, -3.8, z),
          framePoint(frame, side * 20.1, -0.9, z),
          0.28,
          0.4,
        ),
      );
    for (let step = 0; step < 5; step += 1)
      steps.push(
        localTransform(s - 2.7 + step * 0.27, side * 17.25, -0.1 - step * 0.13),
      );
    for (let y = -4.8; y < -0.7; y += 0.36)
      ladderRungs.push(localTransform(s + 3.4, side * 15.95, y));
    for (const z of [3.08, 3.72])
      ladderStiles.push(localTransform(s + z, side * 15.95, -2.7));
  }
  addInstances(
    'Cantilevered maintenance refuge decks',
    new THREE.BoxGeometry(5.2, 0.72, 7.3),
    concrete,
    maintenanceDecks,
    true,
  );
  addInstances(
    'Maintenance refuge outer guard panels',
    new THREE.BoxGeometry(0.12, 1.25, 6.9),
    darkSteel,
    maintenanceRails,
  );
  addInstances(
    'Service refuge control cabinets',
    new THREE.BoxGeometry(0.9, 1.72, 1.7),
    steel,
    cabinets,
    true,
  );
  addInstances(
    'Service cabinet intake louvers',
    new THREE.BoxGeometry(0.035, 0.045, 1.43),
    darkSteel,
    vents,
  );
  addInstances(
    'Refuge support diagonal struts',
    new THREE.BoxGeometry(1, 1, 1),
    darkSteel,
    outboardBraces,
    true,
  );
  addInstances(
    'Maintenance access steps',
    new THREE.BoxGeometry(1.1, 0.13, 0.3),
    steel,
    steps,
  );
  addInstances(
    'Underside inspection ladder rungs',
    new THREE.BoxGeometry(0.3, 0.055, 0.71),
    steel,
    ladderRungs,
  );
  addInstances(
    'Underside inspection ladder stiles',
    new THREE.BoxGeometry(0.13, 4.7, 0.09),
    darkSteel,
    ladderStiles,
  );

  const gantryS = 54;
  addInstances(
    'Start gantry structural columns',
    new THREE.BoxGeometry(0.86, 11.6, 1.5),
    darkSteel,
    [-1, 1].map((side) => localTransform(gantryS, side * 16.9, 5.05)),
    true,
  );
  addInstances(
    'Gantry outboard deck consoles',
    new THREE.BoxGeometry(4.1, 1.2, 3.9),
    concrete,
    [-1, 1].map((side) => localTransform(gantryS, side * 16.25, -0.75)),
    true,
  );
  addInstances(
    'Gantry bearing collars',
    new THREE.BoxGeometry(1.9, 0.64, 2.7),
    steel,
    [-1, 1].map((side) => localTransform(gantryS, side * 16.9, 0.2)),
  );
  addInstances(
    'Start gantry identification beam',
    new THREE.BoxGeometry(35, 2.1, 1.6),
    steel,
    [localTransform(gantryS, 0, 10.25)],
    true,
  );
  addInstances(
    'Gantry vermilion identifiers',
    new THREE.BoxGeometry(2.35, 2.13, 1.64),
    vermilion,
    [-1, 1].map((side) => localTransform(gantryS, side * 15.9, 10.25)),
  );
  addInstances(
    'Gantry inspection walkway',
    new THREE.BoxGeometry(34.2, 0.16, 1.5),
    darkSteel,
    [localTransform(gantryS, 0, 11.38, 1.1)],
    true,
  );
  const timingStripe = [];
  for (let x = -13.5; x < 14; x += 1)
    for (let row = 0; row < 2; row += 1)
      if ((Math.round(x + 13.5) + row) % 2 === 0)
        timingStripe.push(localTransform(gantryS, x, 0.035, row - 0.5));
  addInstances(
    'Physical start timing stripe',
    new THREE.BoxGeometry(1, 0.016, 1),
    stripe,
    timingStripe,
  );
  const grid = [],
    gridSide = [];
  for (let row = 0; row < 4; row += 1)
    for (const side of [-1, 1]) {
      grid.push(localTransform(8 + row * 10, side * 4.7, 0.026));
      gridSide.push(localTransform(10 + row * 10, side * 4.7 - 1.75, 0.026));
      gridSide.push(localTransform(10 + row * 10, side * 4.7 + 1.75, 0.026));
    }
  addInstances(
    'Grid stall end paint',
    new THREE.BoxGeometry(3.6, 0.015, 0.16),
    stripe,
    grid,
  );
  addInstances(
    'Grid stall side paint',
    new THREE.BoxGeometry(0.12, 0.015, 4),
    stripe,
    gridSide,
  );

  function addSign(
    name,
    s,
    x,
    y,
    width,
    height,
    main,
    secondary,
    direction = 0,
    forward = 0,
  ) {
    const texture = ownTexture(signTexture(main, secondary, -direction));
    const faceMaterial = material({
      color: 0xffffff,
      map: texture,
      roughness: 0.67,
      metalness: 0.08,
      emissive: 0xffffff,
      emissiveMap: texture,
      emissiveIntensity: 0.11,
    });
    const face = addMesh(
      name,
      new THREE.PlaneGeometry(width, height),
      faceMaterial,
    );
    const frame = track.sample(s);
    face.position.copy(framePoint(frame, x, y, forward));
    face.quaternion
      .copy(frame.quaternion)
      .multiply(new THREE.Quaternion().setFromAxisAngle(WORLD_UP, Math.PI));
  }
  addSign(
    'Halcyon start identifier',
    gantryS,
    0,
    10.25,
    27.2,
    1.88,
    'HALCYON / 07',
    'VECTOR NOVA     •     MERIDIAN VIADUCT',
    0,
    -0.812,
  );
  const signPosts = [],
    signBacking = [],
    signConsoles = [],
    signLights = [];
  const advisories = [
    [0.075, 'CROWN', '62° BANK   /   NORTH ASCENT', 1],
    [0.293, 'CASCADE', 'DESCENT   /   REVERSE CURVE', -1],
    [0.366, 'TRANSIT', 'VAULT 07   /   CLEARANCE 14 M', 1],
    [0.532, 'WEST GALLERY', 'VENTILATION DISTRICT   /   RISE', 1],
    [0.699, 'MERIDIAN', 'SKYBRIDGE   /   ELEVATION 105 M', 1],
    [0.798, 'INNER CASCADE', 'LINKED TURNS   /   DESCENT', 1],
    [0.926, 'RETURN', 'TIGHTENING TURN   /   GRID', 1],
  ];
  for (const [fraction, main, secondary, direction] of advisories) {
    const s = track.length * fraction;
    signPosts.push(localTransform(s, -17.7, 2.6));
    signBacking.push(localTransform(s, -17.7, 5.7));
    signConsoles.push(localTransform(s, -16.55, -0.54));
    signLights.push(localTransform(s, -17.7, 6.38, -0.22));
    addSign(
      'Physical district advisory',
      s,
      -17.7,
      5.7,
      8.5,
      1.56,
      main,
      secondary,
      direction,
      -0.181,
    );
  }
  addInstances(
    'Advisory board upright supports',
    new THREE.BoxGeometry(0.22, 6.5, 0.24),
    steel,
    signPosts,
    true,
  );
  addInstances(
    'Advisory board metal backing',
    new THREE.BoxGeometry(8.7, 1.75, 0.32),
    darkSteel,
    signBacking,
  );
  addInstances(
    'Advisory board reinforced deck consoles',
    new THREE.BoxGeometry(4.6, 0.9, 2.1),
    concrete,
    signConsoles,
    true,
  );
  addInstances(
    'Advisory shielded wash lights',
    new THREE.BoxGeometry(4.2, 0.09, 0.19),
    lamp,
    signLights,
  );
  addSign(
    'Transit vault entrance identifier',
    tunnelStart + 1,
    0,
    14.75,
    13.5,
    1.24,
    'TRANSIT VAULT',
    'HALCYON INFRASTRUCTURE   /   07',
  );

  // Direction boards share one atlas texture and one material per direction.
  for (const direction of [-1, 1]) {
    const chevronTexture = ownTexture(signTexture('', '', -direction));
    const chevronSurface = material({
      color: 0xffffff,
      map: chevronTexture,
      roughness: 0.68,
      metalness: 0.12,
    });
    const chevrons = [],
      backs = [],
      supports = [];
    for (const [start, end, side, turn] of [
      [0.145, 0.265, -1, 1],
      [0.325, 0.347, 1, -1],
      [0.362, 0.383, -1, 1],
      [0.625, 0.685, -1, 1],
      [0.805, 0.886, -1, 1],
      [0.935, 0.966, -1, 1],
    ]) {
      if (turn !== direction) continue;
      for (let s = track.length * start; s < track.length * end; s += 30) {
        const f = track.sample(s);
        const entry = localTransform(s, side * 15.72, 2.75);
        entry.quaternion = f.quaternion
          .clone()
          .multiply(new THREE.Quaternion().setFromAxisAngle(WORLD_UP, Math.PI));
        chevrons.push(entry);
        backs.push(localTransform(s, side * 15.72, 2.75, 0.08));
        supports.push(localTransform(s, side * 15.72, 1.34));
      }
    }
    addInstances(
      'Directional amber chevron faces',
      new THREE.PlaneGeometry(3.2, 1.4),
      chevronSurface,
      chevrons,
    );
    addInstances(
      'Chevron board steel backing',
      new THREE.BoxGeometry(3.28, 1.47, 0.13),
      darkSteel,
      backs,
    );
    addInstances(
      'Chevron board brackets',
      new THREE.BoxGeometry(0.12, 2.68, 0.16),
      steel,
      supports,
    );
  }

  lightFixtures.sort((a, b) => a.distance - b.distance);
  const practicalLights = Array.from({ length: 3 }, () => {
    const light = new THREE.SpotLight(0xffd2a0, 0, 54, 1.04, 0.7, 2);
    light.name = 'Nearest authored fixture / practical pool';
    light.castShadow = false;
    group.add(light, light.target);
    return light;
  });
  let disposed = false;
  function update(distance) {
    const wrapped = ((distance % track.length) + track.length) % track.length;
    const nearest = lightFixtures
      .map((fixture) => {
        let delta = fixture.distance - wrapped;
        if (delta < -track.length / 2) delta += track.length;
        if (delta > track.length / 2) delta -= track.length;
        return { fixture, delta, score: Math.abs(delta - 20) };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, practicalLights.length);
    nearest.forEach(({ fixture, delta }, index) => {
      const light = practicalLights[index];
      light.position.copy(fixture.position);
      light.target.position.copy(fixture.target);
      light.color.setHex(fixture.color);
      light.intensity =
        fixture.intensity *
        THREE.MathUtils.smoothstep(135 - Math.abs(delta), 0, 55);
      light.updateMatrix();
      light.target.updateMatrix();
    });
  }
  group.userData = {
    asset: 'original authored Halcyon circuit / editable procedural source',
    representativeSection: { start: 0, end: track.length },
    groundY: track.groundY,
    sectionShowcases: track.showcases,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of geometries) geometry.dispose();
      for (const surface of materials) surface.dispose();
      for (const texture of textures) texture.dispose();
      for (const light of practicalLights) light.dispose();
    },
  };
  group.traverse((object) => {
    if (object !== group) {
      object.updateMatrix();
      object.matrixAutoUpdate = false;
    }
  });
  update(0);
  return group;
}
