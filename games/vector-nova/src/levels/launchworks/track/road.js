import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sweepGeometry } from '../../../track/geometry.js';
import { disposeGroup } from '../../../pickups/geometry.js';
import { createZephyrWeave } from '../../zephyr/track/weave.js';
import { finishZephyrMaterial } from '../../zephyr/environment/materials.js';
import {
  MESH_STEPS,
  quadTriangles,
} from '../../shatterline/track/tube-tessellation.js';

function tubeGeometry(track, chunk) {
  const positions = [],
    normals = [],
    uv = [],
    coordinates = [],
    lower = [],
    upper = [];
  for (const distance of chunk.stations)
    for (let column = 0; column <= MESH_STEPS.columns; column++) {
      const point = track.tubeMesh.sheetVertex(distance, column);
      positions.push(...point.position.toArray());
      normals.push(...point.up.toArray());
      uv.push(point.lateral / 12, distance / 18);
      coordinates.push(distance, point.lateral);
    }
  const stride = MESH_STEPS.columns + 1;
  for (let row = 0; row < chunk.stations.length - 1; row++)
    for (let column = 0; column < MESH_STEPS.columns; column++) {
      const a = row * stride + column,
        profile = track.tubeProfile(
          (chunk.stations[row] + chunk.stations[row + 1]) / 2,
        ),
        lateral = T.MathUtils.lerp(
          -profile.halfWidth,
          profile.halfWidth,
          (column + 0.5) / MESH_STEPS.columns,
        ),
        indices =
          Math.abs(profile.curvature * lateral) <= Math.PI / 2 + 0.02
            ? lower
            : upper;
      for (const face of quadTriangles(a, a + 1, a + stride, a + stride + 1))
        indices.push(...face);
    }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.setAttribute(
    'roadCoord',
    new T.Float32BufferAttribute(coordinates, 2),
  );
  geometry.setIndex([...lower, ...upper]);
  geometry.addGroup(0, lower.length, 0);
  if (upper.length) geometry.addGroup(lower.length, upper.length, 1);
  geometry.computeBoundingSphere();
  return geometry;
}
export function createLaunchworksRoad({ track, shape = false }) {
  const group = new T.Group();
  group.name = 'Skywell / suspended bronze and woven transfer works';
  const borrowed = new Set(),
    textures = shape ? [] : createZephyrWeave();
  const surface = new T.MeshStandardMaterial({
    name: 'Skywell / Zephyr graphite metric twill',
    color: '#859398',
    metalness: 0.2,
    roughness: 0.56,
    map: textures[0] ?? null,
    normalMap: textures[1] ?? null,
    roughnessMap: textures[2] ?? null,
    normalScale: new T.Vector2(0.35, 0.35),
  });
  const stone = new T.MeshStandardMaterial({
    name: 'Skywell / Zephyr ivory limestone shoulders',
    color: '#c2baa5',
    metalness: 0.05,
    roughness: 0.76,
  });
  const bronze = new T.MeshStandardMaterial({
    name: 'Skywell / seated bronze load carriers',
    color: '#927044',
    metalness: 0.67,
    roughness: 0.5,
  });
  const dark = new T.MeshStandardMaterial({
    name: 'Skywell / recessed graphite keel',
    color: '#28363d',
    roughness: 0.63,
    metalness: 0.3,
  });
  if (!shape)
    for (const material of [stone, bronze]) finishZephyrMaterial(material);
  const amber = new T.MeshStandardMaterial({
    name: 'Skywell / steady amber launch margins',
    color: '#e5a955',
    emissive: '#9f4b17',
    emissiveIntensity: 0.5,
    roughness: 0.5,
  });
  const mint = new T.MeshStandardMaterial({
    name: 'Skywell / turquoise receiver inlay',
    color: '#7ac6bb',
    emissive: '#235e59',
    emissiveIntensity: 0.5,
    roughness: 0.45,
  });
  const glass = new T.MeshPhysicalMaterial({
    name: 'Skywell / clear silica induction throat',
    color: '#b9d6cd',
    metalness: 0.02,
    roughness: 0.24,
    transparent: true,
    opacity: 0.38,
    side: T.DoubleSide,
    depthWrite: false,
  });
  const materials = [surface, stone, bronze, dark, amber, mint, glass];
  const zones = [];
  function add(name, geometry, material, driving = false) {
    const mesh = new T.Mesh(geometry, material);
    mesh.name = name;
    mesh.receiveShadow = ![material].flat().every((part) => part.transparent);
    mesh.castShadow = ![material].flat().some((part) => part.transparent);
    if (driving)
      mesh.userData.drivingSurface = mesh.userData.roadSurface = true;
    group.add(mesh);
    return mesh;
  }
  function sweep(name, start, end, profile, material, driving = false) {
    if (end <= start + 0.01) return null;
    return add(
      name,
      sweepGeometry(
        track,
        profile.map(([lateral, height]) => [
          (lateral * track.width) / 38,
          height,
        ]),
        {
          start,
          end,
          step: 2,
          transverseStep: driving ? 1.5 : undefined,
          uvScale: 2.5,
        },
      ),
      material,
      driving,
    );
  }
  const runs = [];
  let start = 0;
  for (const jump of track.jumps) {
    runs.push([start, jump.takeoff]);
    start = jump.landingStart;
  }
  runs.push([start, track.length]);
  const ribbons = [];
  for (const [a, b] of runs) {
    let from = a;
    for (const tube of track.tubes) {
      if (tube.end <= from || tube.start >= b) continue;
      if (tube.start > from) ribbons.push([from, tube.start]);
      from = Math.max(from, tube.end);
    }
    if (from < b) ribbons.push([from, b]);
  }
  for (const [a, b] of ribbons) {
    sweep(
      'Woven structural running deck',
      a,
      b,
      [
        [-19, 0],
        [19, 0],
      ],
      surface,
      true,
    );
    sweep(
      'Bronze folded box keel',
      a,
      b,
      [
        [-19, -0.08],
        [-17, -3.2],
        [17, -3.2],
        [19, -0.08],
      ],
      bronze,
    );
    for (const side of [-1, 1]) {
      sweep(
        'Ivory containment shoulder',
        a,
        b,
        [
          [side * 17.9, 0.025],
          [side * 19, 0.025],
        ],
        stone,
      );
      sweep(
        'Low outboard rail',
        a,
        b,
        [
          [side * 19, 0],
          [side * 19, 0.8],
          [side * 19.55, 0.8],
        ],
        bronze,
      );
      sweep(
        'Receiver edge induction',
        a,
        b,
        [
          [side * 17.5, 0.035],
          [side * 17.78, 0.035],
        ],
        mint,
      );
    }
    for (let joint = a + 28; joint < b - 2; joint += 28)
      sweep(
        'Flush expansion joint',
        joint,
        joint + 0.1,
        [
          [-17.4, 0.025],
          [17.4, 0.025],
        ],
        dark,
      );
  }
  for (const chunk of track.tubeMesh.chunks)
    add(
      'Tube driving shell / shared Shatterline facets',
      tubeGeometry(track, chunk),
      [stone, glass],
      true,
    );
  // The rims sit outside the real driving skin. They communicate the throat's
  // cross section without closing the luminous flight corridor with a hoop.
  for (const tube of track.tubes)
    for (let s = tube.start + 28; s < tube.end - 20; s += 54) {
      const profile = track.tubeProfile(s),
        positions = [];
      for (let i = 0; i <= 96; i++) {
        const lateral = T.MathUtils.lerp(
            -profile.halfWidth,
            profile.halfWidth,
            i / 96,
          ),
          f = track.sampleSurface(s, lateral);
        positions.push(f.position.clone().addScaledVector(f.up, -0.8));
      }
      const curve = new T.CatmullRomCurve3(positions);
      add(
        'Tube outboard bronze rib',
        new T.TubeGeometry(curve, 96, 0.42, 5, false),
        bronze,
      );
    }
  for (const [i, jump] of track.jumps.entries()) {
    for (let mark = 0; mark < 7; mark++) {
      const s = jump.takeoff - 83 + mark * 11;
      sweep(
        'Launch timing inlay',
        s,
        s + 1.3,
        [
          [-15.2, 0.04],
          [15.2, 0.04],
        ],
        amber,
      );
    }
    if (jump.receiverType !== 'tube') {
      // A muted woven inlay communicates the receiving face without painting
      // over its material or implying that the whole width is an aiming gate.
      const arrival = surface.clone();
      arrival.name = 'Skywell / woven turquoise receiver inlay';
      arrival.color.set('#6f9e97');
      arrival.emissive.set('#235e59');
      arrival.emissiveIntensity = 0.16;
      const zone = sweep(
        'Receiving bank / turquoise arrival field',
        jump.landingStart + 12,
        Math.min(jump.landingEnd, jump.landingStart + 220),
        [
          [-12.8, 0.045],
          [12.8, 0.045],
        ],
        arrival,
      );
      zones.push({ id: jump.id, zone });
    }
    const frame = track.sample(jump.landingStart + 15);
    for (const side of [-1, 1]) {
      const crown = i === 0,
        height = crown ? 200 : 34,
        elevation = crown ? 88 : 12;
      const mast = new T.Mesh(new T.BoxGeometry(2.5, height, 4), bronze);
      mast.name = `Receiver ${i + 1} / outboard approach lantern`;
      mast.position
        .copy(frame.position)
        .addScaledVector(frame.right, side * 27)
        .addScaledVector(frame.up, elevation);
      mast.quaternion.copy(frame.quaternion);
      group.add(mast);
      const lamp = new T.Mesh(
        new T.BoxGeometry(2.7, crown ? 70 : 13, 1.2),
        mint,
      );
      lamp.position
        .copy(mast.position)
        .addScaledVector(frame.up, crown ? 55 : 0)
        .addScaledVector(frame.tangent, -2.2);
      lamp.quaternion.copy(frame.quaternion);
      group.add(lamp);
      // Crown's receiving bank falls below its convex launch crest. Tall,
      // physically rooted lanterns remain visible before committing to it.
      const foot = add(
        'Receiver lantern / limestone footing',
        new T.BoxGeometry(7, crown ? 11 : 6, 8),
        stone,
      );
      foot.position
        .copy(frame.position)
        .addScaledVector(frame.right, side * 27)
        .addScaledVector(frame.up, crown ? -11 : -6);
      foot.quaternion.copy(frame.quaternion);
      const arm = add(
        'Receiver lantern / keel attachment',
        new T.BoxGeometry(9, 4, 6),
        bronze,
      );
      arm.position
        .copy(frame.position)
        .addScaledVector(frame.right, side * 23)
        .addScaledVector(frame.up, -4);
      arm.quaternion.copy(frame.quaternion);
    }
  }
  for (const name of [
    'Flush expansion joint',
    'Launch timing inlay',
    'Receiver edge induction',
  ]) {
    const parts = group.children.filter((mesh) => mesh.name === name);
    if (!parts.length) continue;
    add(
      name,
      mergeGeometries(parts.map((part) => part.geometry)),
      parts[0].material,
    );
    for (const part of parts) {
      part.removeFromParent();
      part.geometry.dispose();
    }
  }
  return {
    group,
    setReflection(texture) {
      borrowed.add(texture);
      for (const material of materials) {
        material.envMap = texture;
        material.needsUpdate = true;
      }
    },
    update(frame) {
      const fs = frame.motion?.freestyle ?? frame.motion?.motion?.freestyle;
      if (!fs) return;
      for (const { id, zone } of zones) {
        const leg = fs.legs.find((entry) => entry.id === id);
        zone.material.emissiveIntensity =
          0.16 +
          (leg?.clean && !frame.settings.reducedMotion
            ? Math.exp(-Math.max(0, fs.clock - leg.at) * 6) * 0.9
            : 0);
      }
    },
    dispose() {
      disposeGroup(group);
      materials.forEach((material) => material.dispose());
      textures.forEach((texture) => {
        if (!borrowed.has(texture)) texture.dispose();
      });
      group.clear();
    },
  };
}
