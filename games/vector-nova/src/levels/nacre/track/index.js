import * as THREE from 'three';
import { sweepGeometry, boxProfile } from '../../../track/geometry.js';
export { createLevel3Track } from './model.js';
export { createNacreRuntime } from './runtime.js';

// Every road, shell and edge sweep is split at the exact open intervals. There
// are no transparent stand-ins or invisible collision bridges across either gap.
export function buildLevel3Blockout(track) {
  const group = new THREE.Group();
  group.name = 'Nacre Tempest / route and flight review';
  const geometries = new Set();
  const materials = new Set();
  const material = (parameters) => {
    const result = new THREE.MeshStandardMaterial(parameters);
    materials.add(result);
    return result;
  };
  const road = material({ color: 0x6f8184, roughness: 0.84, metalness: 0.1 });
  const shell = material({ color: 0x9ba5a1, roughness: 0.82 });
  const edge = material({ color: 0xe5e6d4, roughness: 0.65 });
  const teal = material({ color: 0x195861, roughness: 0.42, metalness: 0.32 });
  const beacon = material({
    color: 0xe7ad67,
    emissive: 0xd98e3d,
    emissiveIntensity: 0.32,
    roughness: 0.62,
  });
  const pearl = material({ color: 0xe2e4cf, roughness: 0.26, metalness: 0.25 });
  const insert = material({
    color: 0x438e95,
    transparent: true,
    opacity: 0.75,
    metalness: 0.38,
    roughness: 0.23,
  });
  const add = (name, geometry, mat) => {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = name;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const runs = [];
  let from = 0;
  for (const jump of track.jumps) {
    runs.push([from, jump.takeoff]);
    from = jump.landingStart;
  }
  runs.push([from, track.length]);
  const half = track.width / 2;
  for (const [start, end] of runs) {
    const options = { start, end, step: 2.8 };
    const surface = add(
      'Neutral disconnected driving surface',
      sweepGeometry(
        track,
        [
          [-half, 0],
          [half, 0],
        ],
        options,
      ),
      road,
    );
    surface.userData.drivingSurface = true;
    surface.userData.interval = [start, end];
    add(
      'Disconnected slab and underside',
      sweepGeometry(
        track,
        [
          [half, 0],
          [half, -2.2],
          [-half, -2.2],
          [-half, 0],
        ],
        options,
      ),
      shell,
    );
    for (const side of [-1, 1]) {
      add(
        'Pale edge guide',
        sweepGeometry(
          track,
          [
            [side * (half - 0.75) - 0.24, 0.045],
            [side * (half - 0.75) + 0.24, 0.045],
          ],
          options,
        ),
        edge,
      );
      add(
        'Low neutral containment plinth',
        sweepGeometry(
          track,
          boxProfile(side * (half + 0.35), 0.5, 0.6, 1),
          options,
        ),
        teal,
      );
    }
  }
  const instance = (name, geometry, mat, entries) => {
    geometries.add(geometry);
    const mesh = new THREE.InstancedMesh(geometry, mat, entries.length);
    mesh.name = name;
    const transform = new THREE.Object3D();
    entries.forEach(
      ({ distance, x = 0, y = 0, scale = [1, 1, 1], rotation = 0 }, i) => {
        const f = track.sample(distance);
        transform.position
          .copy(f.position)
          .addScaledVector(f.right, x)
          .addScaledVector(f.up, y);
        transform.quaternion
          .copy(f.quaternion)
          .multiply(
            new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(0, 1, 0),
              rotation,
            ),
          );
        transform.scale.fromArray(scale);
        transform.updateMatrix();
        mesh.setMatrixAt(i, transform.matrix);
      },
    );
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const markers = [];
  const gates = [];
  for (const jump of track.jumps) {
    for (const distance of [
      jump.takeoff - 26,
      jump.takeoff - 14,
      jump.takeoff - 3,
      jump.landingStart + 4,
      jump.landingEnd - 4,
      jump.recovery,
    ]) {
      for (const side of [-1, 1])
        gates.push({
          distance,
          x: side * (half + 1.3),
          y: 3,
          scale: [1.2, 6, 1.2],
        });
    }
    markers.push({
      distance: jump.takeoff - 4,
      y: 0.065,
      scale: [track.width - 2, 0.11, 1.5],
    });
    markers.push({
      distance: jump.landingStart + 4,
      y: 0.065,
      scale: [track.width - 2, 0.11, 1.5],
    });
  }
  instance(
    'Takeoff and landing beacons',
    new THREE.BoxGeometry(1, 1, 1),
    beacon,
    gates,
  );
  instance(
    'Jump edge warning stripe',
    new THREE.BoxGeometry(1, 1, 1),
    beacon,
    markers,
  );
  // A deliberately small 96 m material/silhouette sample for the early art gate.
  const scales = [];
  const glazing = [];
  const fins = [];
  for (let d = 24; d < 120; d += 8) {
    for (const side of [-1, 1]) {
      scales.push({
        distance: d,
        x: side * 7,
        y: 0.1,
        scale: [12.4, 0.16, 7.7],
        rotation: side * 0.065,
      });
      fins.push({
        distance: d,
        x: side * (half + 0.8),
        y: 0.05,
        scale: [side, 1, 1],
      });
    }
    glazing.push({ distance: d, y: 0.22, scale: [1.45, 0.13, 6.6] });
  }
  instance(
    'Representative overlapping pearl scales',
    new THREE.BoxGeometry(1, 1, 1),
    pearl,
    scales,
  );
  instance(
    'Representative translucent pressure inserts',
    new THREE.BoxGeometry(1, 1, 1),
    insert,
    glazing,
  );
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.bezierCurveTo(1.1, 2.4, 0.7, 5.5, -0.4, 6.5);
  finShape.bezierCurveTo(3.5, 5.6, 4.6, 1.2, 4.8, 0);
  finShape.closePath();
  const finGeometry = new THREE.ExtrudeGeometry(finShape, {
    depth: 1,
    bevelEnabled: false,
    curveSegments: 8,
  });
  finGeometry.rotateY(Math.PI / 2);
  instance(
    'Representative swept fin containment ribs',
    finGeometry,
    pearl,
    fins,
  );
  group.userData.surfaceCoverage = track.surfaceCoverage;
  group.userData.openSpans = track.jumps.map(
    ({ id, takeoff, landingStart }) => ({
      id,
      start: takeoff,
      end: landingStart,
    }),
  );
  group.userData.reviewKind = 'bare-track';
  group.userData.dispose = () => {
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    geometries.clear();
    materials.clear();
  };
  return group;
}

export { buildNacreTrack } from './production.js';
