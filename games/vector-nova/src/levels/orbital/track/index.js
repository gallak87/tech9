import * as THREE from 'three';
import { sweepGeometry, boxProfile } from '../../../track/geometry.js';
import { framePoint } from '../../../track/frames.js';
export { createLevel2Track } from './model.js';

// Deliberately plain massing: the early human gate concerns the route itself.
export function buildLevel2Blockout(track) {
  const group = new THREE.Group();
  group.name = 'Asterion Orbital / bare track for human shape review';
  const geometries = new Set();
  const materials = new Set();
  const material = (parameters) => {
    const result = new THREE.MeshStandardMaterial(parameters);
    materials.add(result);
    return result;
  };
  const road = material({ color: 0x394751, roughness: 0.95 });
  const underside = material({ color: 0x75828a, roughness: 0.86 });
  const edge = material({ color: 0xd4d8d5, roughness: 0.9 });
  const rail = material({ color: 0x8d9b9f, roughness: 0.85 });
  const direction = material({ color: 0xd1a25f, roughness: 0.9 });
  const add = (name, geometry, surface) => {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.name = name;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const half = track.width / 2;
  const surface = add(
    'Bare running surface',
    sweepGeometry(
      track,
      [
        [-half, 0],
        [half, 0],
      ],
      { step: 3 },
    ),
    road,
  );
  surface.userData.drivingSurface = true;
  add(
    'Visible slab sides and underside',
    sweepGeometry(
      track,
      [
        [half, 0],
        [half, -2.6],
        [-half, -2.6],
        [-half, 0],
      ],
      { step: 3 },
    ),
    underside,
  );
  for (const side of [-1, 1]) {
    add(
      'Light road edge',
      sweepGeometry(
        track,
        [
          [side * (half - 0.6) - 0.25, 0.035],
          [side * (half - 0.6) + 0.25, 0.035],
        ],
        { step: 3 },
      ),
      edge,
    );
    add(
      'Simple safety rail',
      sweepGeometry(track, boxProfile(side * (half + 0.4), 0.65, 0.65, 1.3), {
        step: 3,
      }),
      rail,
    );
  }

  // Sparse raised chevrons identify travel direction without decorating the road.
  // Each triangle uses a single exact sampled road frame; a 12 cm clearance and
  // short 2 m footprint keep these clear of the curved surface through all banks.
  const markerPositions = [];
  const markerNormals = [];
  for (let distance = 30; distance < track.length; distance += 90) {
    const frame = track.sample(distance);
    for (const [x, z] of [
      [-0.85, -1],
      [0, 1.2],
      [0.85, -1],
    ]) {
      const point = framePoint(frame, x, 0.12, z);
      markerPositions.push(point.x, point.y, point.z);
      markerNormals.push(frame.up.x, frame.up.y, frame.up.z);
    }
  }
  const markers = new THREE.BufferGeometry();
  markers.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(markerPositions, 3),
  );
  markers.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(markerNormals, 3),
  );
  markers.computeBoundingSphere();
  add('Sparse direction markers', markers, direction);

  const planetMaterial = material({ color: 0x8c999f, roughness: 1 });
  const planet = add(
    'Planet / neutral scale blockout',
    new THREE.SphereGeometry(track.review.planet.radius, 64, 40),
    planetMaterial,
  );
  planet.position.fromArray(track.review.planet.center);
  planet.userData.contextOnly = true;
  group.userData.reviewKind = 'bare-track';
  group.userData.dispose = () => {
    for (const geometry of geometries) geometry.dispose();
    for (const surfaceMaterial of materials) surfaceMaterial.dispose();
    geometries.clear();
    materials.clear();
  };
  return group;
}

export { buildOrbitalTrack } from './production.js';
