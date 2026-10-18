import { createPortalTrusses } from './portal-detail.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createArchitectureMaps } from '../environment/architectural-finish.js';
import { createAsphalt } from './asphalt.js';
import { concreteTexture, signTexture } from './textures.js';
import * as THREE from 'three';
import { RACE_GRID } from '../../../race/racers.js';
import { createTrack } from './model.js';
import { framePoint } from '../../../track/frames.js';
import {
  sweepGeometry,
  boxProfile,
  beamTransform,
  roadSealGeometry,
} from '../../../track/geometry.js';
import { createSupportLayout } from './supports.js';
import { createPracticalFixtures } from './fixtures.js';
import { selectPracticalFixtures } from '../../../track/lighting.js';
export { createTrack };

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export function buildTrackVisual(track, settings, renderer) {
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
  const concreteMap = ownTexture(concreteTexture());
  const asphalt = createAsphalt(renderer, track.width);
  const road = asphalt.material;
  road.envMapIntensity = 0.9;
  const asphaltFinish = road.onBeforeCompile;
  const asphaltKey = road.customProgramCacheKey();
  road.onBeforeCompile = (shader, renderer) => {
    asphaltFinish(shader, renderer);
    // Limit the low sun's direct highlight on this damp coated aggregate;
    // keep the broad sky/building reflections and scan's normal response.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      '#include <lights_fragment_end>\nreflectedLight.directSpecular *= .3;',
    );
  };
  road.customProgramCacheKey = () => asphaltKey + '-halcyon-damp-solar-v1';
  // The district probe is owned/baked by the renderer; never dispose it here.
  let districtReflection = null;
  let finishSettings = settings;
  function updateFinish(next = finishSettings) {
    finishSettings = next;
    const sheen = Number.isFinite(next.halcyonRoadSheen)
      ? THREE.MathUtils.clamp(next.halcyonRoadSheen, 0, 1)
      : 0.8;
    // Halcyon is damp, with broad broken reflections rather than mirror puddles.
    asphalt.update(sheen * 0.72);
    const reflection = next.halcyonRoadReflections ? districtReflection : null;
    if (road.envMap !== reflection) {
      road.envMap = reflection;
      road.needsUpdate = true;
    }
  }
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
  const vaultConcrete = material({ color: 0x9babae, roughness: 0.9 });
  const architecture = createArchitectureMaps(renderer, {
    concrete: [concrete, edgeConcrete, vaultConcrete],
  });
  const steel = material({ color: 0x9caeb5, roughness: 0.34, metalness: 0.76 });
  const darkSteel = material({
    color: 0x30424c,
    roughness: 0.48,
    metalness: 0.7,
  });
  const tunnelCladding = material({
    color: 0xaab9b7,
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
    emissiveIntensity: 2.3,
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

  const runningSurface = sweep(
    'Asphalt running surface / 28 metres',
    [
      [-14, 0],
      [14, 0],
    ],
    road,
  );
  runningSurface.userData.roadSurface = true;
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
    girderSeams.push(localTransform(s, 0, -5.535));
  }
  for (let s = 12; s < 420; s += 21)
    for (const x of [-4.7, 4.7]) laneDashes.push(localTransform(s, x, 0.028));
  const supportLayout = track.supportLayout ?? createSupportLayout(track);
  for (const { distance: s, tops } of supportLayout.standard) {
    crossheads.push(localTransform(s, 0, -6.15));
    for (const top of tops) {
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
  const jointMaterial = material({
    color: 0x29363e,
    roughness: 0.92,
    metalness: 0.08,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    depthWrite: false,
  });
  const seals = addMesh(
    'Deck expansion seals / surface-conforming',
    roadSealGeometry(track, runningSurface.geometry),
    jointMaterial,
  );
  seals.renderOrder = 1;
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
    lightFixtures = createPracticalFixtures(track);
  for (const { distance: s, side } of lightFixtures.filter(
    ({ kind }) => kind === 'street',
  )) {
    lampPoles.push(localTransform(s, side * 15.37, 4.35));
    lampArms.push(localTransform(s, side * 13.82, 8.61));
    lampBodies.push(localTransform(s, side * 12.22, 8.55));
    lampFaces.push(localTransform(s, side * 12.22, 8.4));
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

  const portalRoof = material({
    color: 0x687b83,
    roughness: 0.65,
    metalness: 0.4,
  });
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
  const tunnelStart = track.sections.find(
    (section) => section.id === 'tunnel',
  ).start;
  const tunnelEnd = track.sections.find(
    (section) => section.id === 'tunnel',
  ).end;
  const vault = [
    [16.5, 0],
    [16.5, 9],
    [12.6, 14],
    [0, 17],
    [-12.6, 14],
    [-16.5, 9],
    [-16.5, 0],
  ];
  const vaultParts = new Map();
  function vaultDetail(name, profile, surface, options, shadows = false) {
    const key = surface.uuid + shadows;
    const entry = vaultParts.get(key) ?? { name, surface, shadows, parts: [] };
    entry.parts.push(sweepGeometry(track, profile, options));
    vaultParts.set(key, entry);
  }
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
      vaultConcrete,
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
      // Suspended metal ceiling cassettes sit below the structural shell, with
      // dark reveal gaps and returned edges. They remain well above the racers.
      for (const along of [3, 25]) {
        const end = Math.min(s + along + 18, bayEnd - 1);
        if (end <= s + along) continue;
        const x0 = side * 2.2,
          x1 = side * 11.8;
        const ceiling = [
          [x0, 16.12],
          [x1, 13.84],
          [x1, 13.54],
          [x0, 15.82],
        ];
        vaultDetail(
          'Vault suspended zinc ceiling cassette',
          ceiling,
          portalRoof,
          { start: s + along, end, step: 4 },
          true,
        );
        vaultDetail(
          'Vault cassette recessed backing',
          [
            [x0, 16.21],
            [x1, 13.93],
          ],
          darkSteel,
          { start: s + along - 0.4, end: Math.min(end + 0.4, bayEnd), step: 4 },
        );
      }
      vaultDetail(
        'Vault upper service trunk',
        boxProfile(side * 13.5, 12.75, 0.42, 0.52),
        darkSteel,
        { start: s, end: bayEnd, step: 4 },
      );
      vaultDetail(
        'Vault upper copper conduit',
        boxProfile(side * 13.1, 12.45, 0.13, 0.15),
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
  for (const { name, surface, shadows, parts } of vaultParts.values()) {
    const geometry = mergeGeometries(parts);
    parts.forEach((g) => g.dispose());
    addMesh(name, geometry, surface, shadows);
  }
  for (let s = tunnelStart; s <= tunnelEnd; s += 24) {
    const frame = track.sample(s);
    for (let i = 0; i < vault.length - 1; i += 1)
      ribBeams.push(
        beamTransform(
          framePoint(frame, ...vault[i]),
          framePoint(frame, ...vault[i + 1]),
          0.65,
          1.1,
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
  const ribParts = [
    new THREE.BoxGeometry(1, 1, 0.18).translate(0, 0, -0.41),
    new THREE.BoxGeometry(1, 1, 0.18).translate(0, 0, 0.41),
    new THREE.BoxGeometry(0.22, 1, 0.64),
  ];
  const ribSection = mergeGeometries(ribParts);
  ribParts.forEach((g) => g.dispose());
  addInstances(
    'Transit vault built-up structural ribs',
    ribSection,
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
  const galleryStart = track.sections.find(
    (section) => section.id === 'gallery',
  ).start;
  const galleryEnd = track.sections.find(
    (section) => section.id === 'gallery',
  ).end;
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

  // Outside portals carry the rolled deck without a pier passing through its
  // racing face. Every complete leg/crosshead/stay passed the 3D clearance test.
  // Built-up open sections stay within the existing tested/collidable envelope.
  // Separate flanges, recessed webs and splice collars reveal actual structural depth.
  const portalParts = [
    new THREE.BoxGeometry(0.18, 1, 1).translate(-0.41, 0, 0),
    new THREE.BoxGeometry(0.18, 1, 1).translate(0.41, 0, 0),
    new THREE.BoxGeometry(0.64, 1, 0.19),
  ];
  const portalSection = mergeGeometries(portalParts);
  portalParts.forEach((g) => g.dispose());
  const portalSteel = material({
    color: 0x71888d,
    roughness: 0.56,
    metalness: 0.5,
  });
  addInstances(
    'Skyline built-up portal flanges and recessed webs',
    portalSection,
    portalSteel,
    supportLayout.portals.map(({ from, to, width, depth }) =>
      beamTransform(from, to, width, depth),
    ),
    true,
  );
  const collars = [],
    plates = [],
    markers = [];
  for (const { from, to, width, depth } of supportLayout.portals) {
    const length = from.distanceTo(to),
      axis = to.clone().sub(from).normalize();
    for (let along = 2; along < length - 1; along += 28) {
      const p = from.clone().addScaledVector(axis, along);
      collars.push(
        beamTransform(
          p.clone().addScaledVector(axis, -0.22),
          p.clone().addScaledVector(axis, 0.22),
          width,
          depth,
        ),
      );
    }
    if (Math.abs(axis.y) > 0.9) {
      for (const sign of [-1, 1]) {
        const a = from.clone().addScaledVector(axis, 3);
        a.z += sign * (depth * 0.5 - 0.06);
        const b = to.clone().addScaledVector(axis, -2);
        b.z += sign * (depth * 0.5 - 0.06);
        plates.push(beamTransform(a, b, width * 0.19, 0.1));
        for (let along = 6; along < length - 4; along += 56) {
          const p = from.clone().addScaledVector(axis, along);
          p.z += sign * (depth * 0.5 - 0.05);
          markers.push({
            position: p,
            scale: new THREE.Vector3(width * 0.7, 0.6, 0.08),
          });
        }
      }
    }
  }
  addInstances(
    'Portal bolted splice collars',
    new THREE.BoxGeometry(1, 1, 1),
    darkSteel,
    collars,
    true,
  );
  addInstances(
    'Portal recessed service panels',
    new THREE.BoxGeometry(1, 1, 1),
    tunnelBronze,
    plates,
  );
  addInstances(
    'Portal maintenance datum markers',
    new THREE.BoxGeometry(1, 1, 1),
    amber,
    markers,
  );
  const trusses = createPortalTrusses(track, supportLayout);
  for (const [name, parts, surface] of [
    ['Portal deep lower chord', trusses.chords, portalSteel],
    ['Portal triangular load-transfer webs', trusses.diagonals, darkSteel],
  ])
    addInstances(
      name,
      new THREE.BoxGeometry(1, 1, 1),
      surface,
      parts.map(({ from, to, width, depth }) =>
        beamTransform(from, to, width, depth),
      ),
      true,
    );
  addInstances(
    'Skyline clear suspension stays',
    new THREE.BoxGeometry(1, 1, 1),
    darkSteel,
    supportLayout.cables.map(({ from, to }) =>
      beamTransform(from, to, 0.38, 0.38),
    ),
    true,
  );
  addInstances(
    'Skyline portal spread foundations',
    new THREE.BoxGeometry(9.8, 1.3, 11.4),
    concrete,
    supportLayout.anchors,
    true,
  );
  const signatureBearers = [];
  for (const { start, end } of supportLayout.zones) {
    for (const side of [-1, 1])
      sweep(
        'Signature structural edge spine',
        boxProfile(side * 17.6, -6.9, 1.1, 2.25),
        darkSteel,
        { start, end, step: 4 },
        true,
      );
    for (let s = start; s < end; s += 36)
      signatureBearers.push(localTransform(s, 0, -6.35));
  }
  addInstances(
    'Corkscrew underside transverse bearers',
    new THREE.BoxGeometry(36.3, 1.8, 1.4),
    darkSteel,
    signatureBearers,
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
    if (supportLayout.zones.some(({ start, end }) => s > start && s < end))
      continue;
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
  // The shared race marker owns checkpoint-zero paint; this gantry is scenery.
  const grid = [],
    gridSide = [];
  for (const { distance, lateral } of Object.values(RACE_GRID)) {
    grid.push(localTransform(distance - 3, lateral, 0.026));
    gridSide.push(localTransform(distance - 1, lateral - 1.75, 0.026));
    gridSide.push(localTransform(distance - 1, lateral + 1.75, 0.026));
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
    [0.027, 'CROWN', '44° BANK   /   RISING APPROACH', 1],
    [0.149, 'EAST CASCADE', 'MEDIUM DESCENT   /   HOLD LINE', 1],
    [0.208, 'TRANSIT', 'VAULT 07   /   CLEARANCE 14 M', 1],
    [0.262, 'WEST GALLERY', 'VENTILATION DISTRICT   /   RISE', 1],
    [0.317, 'SKYLINE ASCENT', 'MERIDIAN   /   360° ROTATION', 0],
    [0.662, 'CASCADE PLUNGE', 'MAGNETIC ADHESION   /   66°', 0],
    [0.838, 'CANAL RISES', 'FINAL BANK   /   DIP TO GRID', 1],
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
  for (const direction of [1]) {
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
      [0.062, 0.162, -1, 1],
      [0.184, 0.223, -1, 1],
      [0.596, 0.664, -1, 1],
      [0.865, 0.955, -1, 1],
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

  const practicalLights = Array.from({ length: 3 }, () => {
    const light = new THREE.SpotLight(0xffd2a0, 0, 54, 1.04, 0.7, 2);
    light.name = 'Nearest authored fixture / practical pool';
    light.castShadow = false;
    group.add(light, light.target);
    return light;
  });
  const lightAssignments = Array(practicalLights.length).fill(-1);
  let disposed = false;
  function update(distance) {
    const selection = selectPracticalFixtures(
      lightFixtures,
      track.length,
      distance,
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
        // Continuous selection crosses each reassignment boundary at zero weight.
        // Scenario teleports may replace all fixtures atomically before drawing.
        light.intensity = 0;
        light.position.copy(fixture.position);
        light.target.position.copy(fixture.target);
        light.color.setHex(fixture.color);
        light.updateMatrix();
        light.target.updateMatrix();
        lightAssignments[slot] = index;
      }
      light.intensity = fixture.intensity * weight;
    }
  }
  group.userData = {
    asset: 'authored Halcyon circuit / CC0 asphalt',
    representativeSection: { start: 0, end: track.length },
    groundY: track.groundY,
    sectionShowcases: track.showcases,
    ready: Promise.all([asphalt.ready, architecture.ready]),
    update,
    updateFinish,
    setReflection(texture) {
      districtReflection = texture;
      updateFinish();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      asphalt.dispose();
      architecture.dispose();
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
  updateFinish();
  update(0);
  return group;
}
