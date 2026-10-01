import { groundGlasswakeSupports } from './grounding.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  sweepGeometry,
  boxProfile,
  beamTransform,
} from '../../../track/geometry.js';
import { framePoint } from '../../../track/frames.js';
import {
  finishIceMaterial,
  finishCrystalPane,
} from '../environment/materials.js';

function bladeGeometry(inset = false) {
  const shape = new THREE.Shape();
  if (inset) {
    shape.moveTo(-1.32, 0.6);
    shape.lineTo(1.35, 0.6);
    shape.lineTo(0.73, 7.2);
    shape.lineTo(-0.3, 9.15);
    shape.lineTo(-0.58, 6.25);
  } else {
    shape.moveTo(-1.8, 0);
    shape.lineTo(1.8, 0);
    shape.lineTo(1.1, 7.6);
    shape.lineTo(-0.18, 10.2);
    shape.lineTo(-1, 6.5);
  }
  shape.closePath();
  const geometry = inset
    ? new THREE.ShapeGeometry(shape)
    : new THREE.ExtrudeGeometry(shape, {
        depth: 0.85,
        bevelEnabled: true,
        bevelThickness: 0.065,
        bevelSize: 0.07,
        bevelSegments: 1,
        curveSegments: 1,
      });
  geometry.rotateY(Math.PI / 2);
  geometry.translate(inset ? 0.53 : -0.425, 0, 0);
  return geometry;
}

export function buildGlasswakeRoad(
  track,
  { shape = false, settings = {} } = {},
) {
  const group = new THREE.Group();
  group.name = shape
    ? 'Glasswake / neutral route and authored fracture gaps'
    : 'Glasswake / ribbed crystal raceway';
  const geometries = new Set();
  const materials = new Set();
  const material = (parameters, physical = false) => {
    const result = new (
      physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial
    )(parameters);
    materials.add(result);
    return result;
  };
  const crystalHigh = material(
    {
      color: 0x8fc3df,
      roughness: 0.34,
      metalness: 0.04,
      specularIntensity: 0.4,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      side: THREE.DoubleSide,
      transmission: 0.1,
      thickness: 1.2,
      ior: 1.34,
      emissive: 0x16354b,
      emissiveIntensity: 0.3,
    },
    true,
  );
  const crystalLow = material({
    color: 0x85b9d8,
    roughness: 0.29,
    metalness: 0.12,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    side: THREE.DoubleSide,
    emissive: 0x16354b,
    emissiveIntensity: 0.3,
  });
  const neutral = material({
    color: 0x829399,
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  const frost = material({
    color: shape ? 0xc3c7c6 : 0xb8d6e2,
    roughness: 0.92,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const cobalt = material({
    color: shape ? 0x596669 : 0x436a87,
    roughness: 0.48,
    metalness: 0.25,
  });
  const deep = material({
    color: shape ? 0x434b50 : 0x102d58,
    roughness: 0.46,
    metalness: 0.3,
  });
  const edge = material({
    color: shape ? 0xd3d9d7 : 0xcce9ed,
    roughness: 0.38,
    metalness: 0.12,
    emissive: shape ? 0x000000 : 0x225e75,
    emissiveIntensity: 0.17,
    side: THREE.DoubleSide,
  });
  const glow = material({
    color: 0xa4e2ed,
    roughness: 0.44,
    emissive: 0x4599b5,
    emissiveIntensity: 0.45,
  });
  const warm = material({
    color: 0xffd6a0,
    roughness: 0.56,
    emissive: 0xc18a3c,
    emissiveIntensity: 0.36,
  });
  const strut = material({
    color: shape ? 0x8b979c : 0x5e8eae,
    roughness: 0.33,
    metalness: 0.22,
  });
  const add = (name, geometry, mat, data = {}) => {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = name;
    mesh.receiveShadow = true;
    Object.assign(mesh.userData, data);
    group.add(mesh);
    return mesh;
  };
  const merge = (name, pieces, mat, data) => {
    if (!pieces.length) return null;
    const result = mergeGeometries(pieces);
    pieces.forEach((piece) => piece.dispose());
    return add(name, result, mat, data);
  };
  const sweepRuns = (name, profile, mat, step = 3) =>
    merge(
      name,
      track.supportedRuns.map(([start, end]) =>
        sweepGeometry(track, profile, { start, end, step }),
      ),
      mat,
      { intervals: track.supportedRuns },
    );
  const half = track.width / 2;
  const tops = { crystal: [], frost: [], reinforcement: [] };
  const walls = [];
  const sillEntries = [];
  const cassetteIntervals = [];
  // Frost and crystal are non-overlapping geometry. Break a cassette at every
  // authored grip boundary so its visible material exactly matches simulation.
  for (const [runStart, runEnd] of track.supportedRuns) {
    const boundaries = new Set([runStart, runEnd]);
    for (let distance = runStart + 12; distance < runEnd; distance += 12)
      boundaries.add(distance);
    for (const zone of track.gripZones)
      for (const distance of [zone.start, zone.end])
        if (distance > runStart && distance < runEnd) boundaries.add(distance);
    const distances = [...boundaries].sort((a, b) => a - b);
    for (let i = 0; i < distances.length - 1; i += 1) {
      const start = distances[i];
      const end = distances[i + 1];
      if (end - start < 0.001) continue;
      const middle = (start + end) / 2;
      const zones = track.gripZones.filter(
        (zone) => middle >= zone.start && middle < zone.end,
      );
      const cuts = [
        ...new Set([
          -half,
          half,
          ...zones.flatMap((zone) => [zone.lateralMin, zone.lateralMax]),
        ]),
      ].sort((a, b) => a - b);
      const seam = Math.min(0.075, (end - start) / 6);
      const reinforcement = !zones.length && Math.floor(middle / 12) % 11 === 7;
      for (let band = 0; band < cuts.length - 1; band += 1) {
        const left = cuts[band];
        const right = cuts[band + 1];
        const frosted = zones.some(
          (zone) =>
            (left + right) / 2 >= zone.lateralMin &&
            (left + right) / 2 <= zone.lateralMax,
        );
        // No longitudinal seam is removed from frost: opaque travel bands begin
        // and end at the exact rule boundaries, including a split cassette.
        const from = frosted ? start : start + seam;
        const to = frosted ? end : end - seam;
        const kind = frosted
          ? 'frost'
          : reinforcement
            ? 'reinforcement'
            : 'crystal';
        tops[kind].push(
          sweepGeometry(
            track,
            [
              [left, 0],
              [right, 0],
            ],
            { start: from, end: to, step: 2.5 },
          ),
        );
        cassetteIntervals.push({
          start: from,
          end: to,
          lateralMin: left,
          lateralMax: right,
          kind,
        });
        // A visible side reveal gives panes thickness without a second clear
        // floor shell. Cobalt sills and longitudinal ribs remain visible below.
        walls.push(
          sweepGeometry(
            track,
            [
              [left, 0],
              [left, -1.15],
            ],
            { start: from, end: to, step: 3 },
          ),
        );
        walls.push(
          sweepGeometry(
            track,
            [
              [right, -1.15],
              [right, 0],
            ],
            { start: from, end: to, step: 3 },
          ),
        );
      }
      sillEntries.push({
        distance: start + seam,
        y: -1.05,
        scale: [track.width + 0.8, 0.65, 0.5],
      });
    }
  }
  const glass = merge(
    'Optically clear crystal deck cassettes',
    tops.crystal,
    shape ? neutral : settings.quality === 'low' ? crystalLow : crystalHigh,
    {
      drivingSurface: true,
      intervals: track.supportedRuns,
      materialRegions: cassetteIntervals.filter(
        (entry) => entry.kind === 'crystal',
      ),
    },
  );
  merge('Bounded frosted travel bands / reduced grip', tops.frost, frost, {
    drivingSurface: true,
    grip: 0.25,
    zones: track.gripZones,
  });
  merge(
    'Occasional opaque cobalt reinforcement cassettes',
    tops.reinforcement,
    cobalt,
    { drivingSurface: true, intervals: track.supportedRuns },
  );
  merge('Lit one-metre crystal cassette reveal walls', walls, strut);
  for (const side of [-1, 1]) {
    sweepRuns(
      'Low cobalt blade plinth',
      boxProfile(side * (half + 0.6), 0.45, 1.2, 0.9),
      deep,
    );
    sweepRuns(
      'Broad pale inner crystal edge',
      boxProfile(side * (half - 0.52), 0.06, 0.64, 0.12),
      edge,
      2.5,
    );
    sweepRuns(
      'Under-deck longitudinal crystal load rib',
      boxProfile(side * 10, -2.2, 1.35, 2.5),
      strut,
    );
    sweepRuns(
      'Deep cobalt lower load chord',
      boxProfile(side * 10, -3.65, 1.7, 0.5),
      deep,
    );
    sweepRuns(
      'Close-readable internal cassette rib',
      boxProfile(side * 4.3, -1.2, 0.38, 0.7),
      cobalt,
    );
  }
  const instance = (name, geometry, mat, entries) => {
    if (!entries.length) {
      geometry.dispose();
      return null;
    }
    geometries.add(geometry);
    const mesh = new THREE.InstancedMesh(geometry, mat, entries.length);
    mesh.name = name;
    mesh.receiveShadow = true;
    const transform = new THREE.Object3D();
    for (const [index, entry] of entries.entries()) {
      if (entry.matrix) {
        entry.matrix.decompose(
          transform.position,
          transform.quaternion,
          transform.scale,
        );
      } else if (entry.from) {
        const beam = beamTransform(
          entry.from,
          entry.to,
          entry.width,
          entry.depth,
        );
        transform.position.copy(beam.position);
        transform.quaternion.copy(beam.quaternion);
        transform.scale.copy(beam.scale);
      } else {
        const frame = track.sample(entry.distance);
        transform.position.copy(
          framePoint(frame, entry.x ?? 0, entry.y ?? 0, entry.z ?? 0),
        );
        transform.quaternion.copy(frame.quaternion);
        if (entry.rotation)
          transform.quaternion.multiply(
            new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(0, 1, 0),
              entry.rotation,
            ),
          );
        transform.scale.fromArray(entry.scale ?? [1, 1, 1]);
      }
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    }
    mesh.computeBoundingSphere();
    mesh.userData.instances = entries.length;
    group.add(mesh);
    return mesh;
  };
  instance(
    'Transverse blue cassette sills visible through glass',
    new THREE.BoxGeometry(1, 1, 1),
    cobalt,
    sillEntries,
  );
  const fins = [],
    faces = [],
    fittings = [],
    supports = [],
    collars = [],
    footings = [];
  const anchors = [];
  const nearGap = (distance, margin = 7) =>
    track.jumps.some(
      (jump) =>
        distance > jump.takeoff - margin &&
        distance < jump.landingStart + margin,
    );
  for (let distance = 10; distance < track.length - 8; distance += 19) {
    if (nearGap(distance)) continue;
    const frame = track.sample(distance);
    for (const side of [-1, 1]) {
      const outer = side * frame.curvature < 0;
      const height = shape ? 0.56 : outer ? 0.94 : 0.7;
      const entry = {
        distance: distance + (side > 0 ? 2 : 0),
        x: side * (half + 0.68),
        y: 0.85,
        scale: [1, height, outer ? 1 : 0.8],
      };
      fins.push(entry);
      faces.push({ ...entry, scale: [-side, height, outer ? 1 : 0.8] });
      if (Math.floor(distance / 19) % 3 === 0)
        fittings.push({
          distance,
          x: side * (half + 0.68),
          y: 1.9,
          scale: [0.95, 0.5, 0.78],
        });
    }
  }
  instance(
    'Tall blue blade fins with dark outer thickness',
    bladeGeometry(),
    deep,
    fins,
  );
  instance(
    'Pale inward faces on tapered blade fins',
    bladeGeometry(true),
    edge,
    faces,
  );
  instance(
    'Amber-white low navigation fittings',
    new THREE.BoxGeometry(1, 1, 1),
    warm,
    fittings,
  );
  for (let distance = 35; distance < track.length - 24; distance += 54) {
    if (nearGap(distance, 18)) continue;
    const frame = track.sample(distance);
    const crossing =
      distance > track.bridge.start && distance < track.bridge.end;
    const depth = crossing ? 112 : 48;
    for (const side of [-1, 1]) {
      const shoulder = framePoint(frame, side * 11, -3.3);
      const knee = framePoint(frame, side * 23, -25);
      const root = framePoint(frame, side * 35, -depth);
      anchors.push({
        distance,
        side,
        knee: knee.clone(),
        nominal: root.clone(),
      });
      for (const offset of [-1.8, 0, 1.8]) {
        const shift = frame.tangent.clone().multiplyScalar(offset);
        supports.push({
          from: shoulder.clone().add(shift),
          to: knee.clone().add(shift),
          width: 1.4,
          depth: 1.2,
        });
        if (shape)
          supports.push({
            from: knee.clone().add(shift),
            to: root.clone().add(shift),
            width: 1.8,
            depth: 1.45,
          });
      }
      collars.push({ distance, x: side * 23, y: -25, scale: [4.8, 3.2, 7.3] });
      if (shape)
        footings.push({
          distance,
          x: side * 35,
          y: -depth,
          scale: [12, 5, 13],
        });
    }
  }
  instance(
    'Bundled articulated crystal compression struts',
    new THREE.BoxGeometry(1, 1, 1),
    strut,
    supports,
  );
  instance(
    'Blue coupling collars at articulated knees',
    new THREE.BoxGeometry(1, 1, 1),
    cobalt,
    collars,
  );
  instance(
    'Fractured bedrock anchor shoes',
    new THREE.BoxGeometry(1, 1, 1),
    deep,
    footings,
  );
  const lipCues = [];
  const ends = [],
    beacons = [],
    warnings = [],
    braces = [];
  for (const jump of track.jumps) {
    for (const [distance, direction] of [
      [jump.takeoff - 0.8, -1],
      [jump.landingStart + 0.8, 1],
    ]) {
      ends.push({ distance, y: -1.65, scale: [track.width + 2.2, 2.6, 1.25] });
      lipCues.push({ distance, y: 0.13, scale: [track.width, 0.2, 0.35] });
      const frame = track.sample(distance);
      const rootFrame = track.sample(distance + direction * 24);
      for (const side of [-1, 1]) {
        beacons.push({
          distance: distance + direction * 1.2,
          x: side * 16.4,
          y: 4,
          scale: [1.45, 8, 1.45],
        });
        beacons.push({
          distance: distance + direction * 10,
          x: side * 16.4,
          y: 2.25,
          scale: [1.15, 4.5, 1.15],
        });
        braces.push({
          from: framePoint(frame, side * 11, -3),
          to: framePoint(rootFrame, side * 12, -17),
          width: 2.2,
          depth: 2.8,
        });
      }
    }
    for (let i = 0; i < 8; i += 1)
      for (const side of [-1, 1])
        warnings.push({
          distance: jump.takeoff - 5 - i * 7,
          x: side * 11,
          y: 0.045,
          scale: [2.4, 0.07, 1.4],
          rotation: side * 0.3,
        });
    for (const distance of [jump.landingStart + 7, jump.landingEnd - 7])
      for (const side of [-1, 1])
        beacons.push({
          distance,
          x: side * 16.4,
          y: 2.1,
          scale: [1.2, 4.2, 1.2],
        });
  }
  instance(
    'Amber cut-edge line / actual fracture boundary',
    new THREE.BoxGeometry(1, 1, 1),
    warm,
    lipCues,
  );
  instance(
    'Fracture lip and catch-deck diaphragms',
    new THREE.BoxGeometry(1, 1, 1),
    cobalt,
    ends,
  );
  instance(
    'Amber fracture alignment marks',
    new THREE.BoxGeometry(1, 1, 1),
    warm,
    warnings,
  );
  instance(
    'Pale takeoff and receiving-shelf beacons',
    new THREE.BoxGeometry(1, 1, 1),
    glow,
    beacons,
  );
  instance(
    'Cantilever crystal launch and receiving braces',
    new THREE.BoxGeometry(1, 1, 1),
    strut,
    braces,
  );
  const grid = [];
  for (let x = -14; x < 15; x += 2)
    grid.push({ distance: 2, x, y: 0.045, scale: [1, 0.065, 1.4] });
  instance(
    'Aurora berth starting grid',
    new THREE.BoxGeometry(1, 1, 1),
    edge,
    grid,
  );
  group.userData.kind = shape ? 'glasswake-shape' : 'glasswake-production';
  group.userData.reviewKind = shape ? 'bare-track' : 'production';
  group.userData.deckThickness = 1.15;
  group.userData.gripZones = track.gripZones;
  group.userData.surfaceRegions = cassetteIntervals;
  group.userData.openSpans = track.jumps.map(
    ({ id, takeoff, landingStart }) => ({
      id,
      start: takeoff,
      end: landingStart,
    }),
  );
  group.userData.surfaceCoverage = track.surfaceCoverage;
  group.userData.sourceBudgets = {
    calls: group.children.length,
    triangles: 0,
    textures: 0,
    textureBytes: 0,
    parts: 0,
  };
  group.traverse((mesh) => {
    if (!mesh.geometry) return;
    group.userData.sourceBudgets.triangles +=
      ((mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) /
        3) *
      (mesh.count ?? 1);
    group.userData.sourceBudgets.parts += mesh.count ?? 1;
  });
  let disposed = false;
  let currentQuality = settings.quality;
  let surfaceTexture = null;
  const ready =
    shape || typeof document === 'undefined'
      ? Promise.resolve(false)
      : new THREE.TextureLoader()
          .loadAsync('/assets/levels/glasswake/ice-surface-v1.png')
          .then((texture) => {
            if (disposed) {
              texture.dispose();
              return false;
            }
            surfaceTexture = texture;
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            texture.anisotropy = 4;
            frost.name = 'Opaque frost travel bands';
            edge.name = 'Pale fractured fin ice';
            for (const mat of [frost, edge]) {
              finishIceMaterial(mat, texture);
              mat.needsUpdate = true;
            }
            for (const mat of [crystalHigh, crystalLow]) {
              finishCrystalPane(mat, texture);
              mat.needsUpdate = true;
            }
            group.userData.sourceBudgets.textures = 1;
            group.userData.sourceBudgets.textureBytes =
              (texture.image.width * texture.image.height * 4 * 4) / 3;
            return true;
          })
          .catch((reason) => {
            throw new Error(
              'Glasswake frost detail failed to load: image request failed',
              { cause: reason },
            );
          });
  return {
    group,
    ready,
    update({ settings: nextSettings = settings } = {}) {
      if (disposed || shape || nextSettings.quality === currentQuality) return;
      currentQuality = nextSettings.quality;
      glass.material = currentQuality === 'low' ? crystalLow : crystalHigh;
    },
    anchorToTerrain(terrain) {
      if (disposed || shape || group.userData.supportContacts) return;
      const contacts = groundGlasswakeSupports(track, anchors, terrain);
      const legs = [],
        shoes = [];
      for (const contact of contacts) {
        const f = track.sample(contact.distance);
        for (const offset of [-1.8, 0, 1.8]) {
          const shift = f.tangent.clone().multiplyScalar(offset);
          legs.push({
            from: contact.knee.clone().add(shift),
            to: contact.root.clone().add(shift),
            width: 1.8,
            depth: 1.45,
          });
        }
        shoes.push({
          matrix: new THREE.Matrix4().compose(
            contact.root,
            new THREE.Quaternion().setFromUnitVectors(
              new THREE.Vector3(0, 1, 0),
              contact.normal,
            ),
            new THREE.Vector3(12, 3.8, 13),
          ),
        });
      }
      instance(
        'Terrain-connected bundled compression legs',
        new THREE.BoxGeometry(1, 1, 1),
        strut,
        legs,
      );
      instance(
        'Anchor shoes embedded in actual geological faces',
        new THREE.BoxGeometry(1, 1, 1),
        deep,
        shoes,
      );
      group.userData.supportContacts = contacts.map((c) => ({
        distance: c.distance,
        side: c.side,
        knee: c.knee.toArray(),
        point: c.point.toArray(),
        root: c.root.toArray(),
        normal: c.normal.toArray(),
        terrain: c.terrain,
        terrainUuid: c.terrainUuid,
        instanceId: c.instanceId,
      }));
      group.userData.sourceBudgets.calls = group.children.length;
      group.userData.sourceBudgets.parts += legs.length + shoes.length;
      group.userData.sourceBudgets.triangles +=
        (legs.length + shoes.length) * 12;
    },
    setReflection(texture) {
      if (disposed) return;
      for (const mat of [crystalHigh, crystalLow]) {
        mat.envMap = texture;
        mat.envMapIntensity = 0.48;
        mat.needsUpdate = true;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      surfaceTexture?.dispose();
      surfaceTexture = null;
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((mat) => mat.dispose());
      geometries.clear();
      materials.clear();
      group.clear();
    },
  };
}
