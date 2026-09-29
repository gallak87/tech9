import * as THREE from 'three';
import { createRouteClearance, groundFrame } from '../placement.js';
import { compileSite, partBounds } from './geometry.js';
import { createOrbitalMaterials } from './materials.js';
import { drydock, solarGarden, habitat, freightPort, relay } from './models.js';
import { fuelDepot, observatory, wheelStation } from './stations.js';

const UP = new THREE.Vector3(0, 1, 0);

function boxClears(clearance, box) {
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  return clearance.clears(
    center.x,
    center.z,
    size.x + 4,
    size.z + 4,
    box.max.y + 2,
    0,
    box.min.y - 2,
  );
}

// These are composed districts, not a random distribution. Large silhouettes
// alternate with open planet vistas. A site's COMPLETE manufactured assembly
// moves outward if its conservative bounds meet the rolled driving envelope;
// clearance never erases ribs or cuts holes into an authored vessel.
const SITES = [
  {
    name: '07 / Asterion survey tender',
    distance: 170,
    offset: 196,
    height: -63,
    yaw: -0.08,
    build: () => drydock(),
  },
  {
    name: 'Limb / thermal sail garden',
    world: [-405, 145, -540],
    yaw: -0.45,
    roll: 0.85,
    build: () => solarGarden({ wings: 3, radiator: true }),
  },
  {
    name: 'Periapsis / cargo exchange',
    distance: 1370,
    offset: 119,
    height: -30,
    yaw: 0,
    build: freightPort,
  },
  {
    name: '12 / unfinished long-range tender',
    world: [-20, 390, 660],
    yaw: 1.3,
    build: () => drydock({ unfinished: true, scale: 1 }),
  },
  {
    name: 'Apogee / observation habitat',
    distance: 2600,
    offset: -116,
    height: -17,
    yaw: -0.3,
    build: habitat,
  },
  {
    name: 'Apogee / power sails',
    distance: 2980,
    offset: -182,
    height: -84,
    yaw: 0.2,
    build: () => solarGarden({ wings: 4 }),
  },
  {
    name: 'Horizon / navigation relay',
    distance: 3340,
    offset: -147,
    height: -50,
    yaw: 0,
    build: relay,
  },
  {
    name: 'Low catch / logistics quay',
    distance: 3830,
    offset: -126,
    height: -30,
    yaw: 0.13,
    build: freightPort,
  },
  {
    name: 'Return / docking control',
    world: [-140, 80, -45],
    yaw: 0.12,
    build: habitat,
  },
  {
    name: 'Periapsis / cryogenic manifold',
    world: [15, 88, -460],
    yaw: -0.2,
    build: fuelDepot,
  },
  {
    name: 'Horizon / paired observatory',
    world: [655, 305, 230],
    yaw: -0.8,
    build: observatory,
  },
  {
    name: 'Far anchorage / station 02',
    world: [-1410, 250, 320],
    yaw: 0.4,
    scale: 1.8,
    build: wheelStation,
  },
  {
    name: 'Far anchorage / station 04',
    world: [1080, 420, 1490],
    yaw: -0.7,
    scale: 1.45,
    build: observatory,
  },
  {
    name: 'Far anchorage / station 06',
    world: [1360, -260, -680],
    yaw: 0.9,
    scale: 1.1,
    build: fuelDepot,
  },
];

export function createOrbitalEnvironment(track) {
  const group = new THREE.Group();
  group.name = 'Asterion / orbital assembly yards';
  const materials = createOrbitalMaterials();
  const clearance = createRouteClearance(track);
  const placements = [];
  const lodSites = [];
  let triangleCount = 0;
  let meshCount = 0;
  let primitiveCount = 0;

  for (const definition of SITES) {
    const parts = definition.build();
    const frame = definition.world
      ? null
      : groundFrame(track, definition.distance);
    const position = definition.world
      ? new THREE.Vector3(...definition.world)
      : frame.position.clone();
    const yaw =
      (frame ? Math.atan2(frame.tangent.x, frame.tangent.z) : 0) +
      definition.yaw;
    const rotation = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    if (definition.roll)
      rotation.multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          definition.roll,
        ),
      );
    const scale = new THREE.Vector3().setScalar(definition.scale ?? 1);
    const transform = new THREE.Matrix4();
    let bounds;
    let chosenOffset = definition.offset ?? 0;
    let accepted = false;
    for (let attempt = 0; attempt <= 16; attempt += 1) {
      if (frame) {
        chosenOffset =
          definition.offset + Math.sign(definition.offset) * attempt * 24;
        position
          .copy(frame.position)
          .addScaledVector(frame.right, chosenOffset);
        position.y += definition.height;
      }
      transform.compose(position, rotation, scale);
      bounds = partBounds(parts, transform);
      if (bounds.every((box) => boxClears(clearance, box))) {
        accepted = true;
        break;
      }
      if (!frame) break;
    }
    if (!accepted) {
      parts.dispose();
      throw new Error(
        `Orbital assembly cannot clear the route: ${definition.name}`,
      );
    }
    const compiled = compileSite(parts, materials, transform, definition.name);
    group.add(compiled.group);
    const siteBounds = new THREE.Box3();
    for (const box of bounds) siteBounds.union(box);
    const sphere = siteBounds.getBoundingSphere(new THREE.Sphere());
    lodSites.push({
      details: compiled.details,
      center: sphere.center,
      radius: sphere.radius,
    });
    placements.push({
      name: definition.name,
      distance: definition.distance ?? null,
      position: position.toArray(),
      offset: chosenOffset,
      primitiveCount: parts.entries.length,
      bounds: bounds.map((box) => [box.min.toArray(), box.max.toArray()]),
    });
    triangleCount += compiled.triangles;
    meshCount += compiled.meshes;
    primitiveCount += parts.entries.length;
    parts.dispose();
  }

  group.userData.metrics = {
    meshCount,
    triangleCount,
    primitiveCount,
    sites: SITES.length,
    textures: 2,
    strategy:
      'Merged material batches per district; distance-limited construction details',
  };
  group.userData.clearanceReport = {
    sampleCount: clearance.sampleCount,
    localVertical: clearance.localVertical,
    halfWidth: clearance.halfWidth,
    extraMargin: 2,
    collisions: 0,
    placements,
  };
  group.userData.update = (cameraPosition) => {
    for (const site of lodSites) {
      const visible =
        cameraPosition.distanceTo(site.center) - site.radius < 760;
      for (const detail of site.details) detail.visible = visible;
    }
  };
  const borrowedTextures = new Set();
  group.userData.setReflection = (texture) => {
    borrowedTextures.add(texture);
    for (const material of Object.values(materials)) {
      material.envMap = texture;
      material.needsUpdate = true;
    }
  };
  let disposed = false;
  group.userData.dispose = () => {
    if (disposed) return;
    disposed = true;
    group.traverse((node) => {
      if (node.isMesh) node.geometry.dispose();
    });
    const textures = new Set();
    for (const material of Object.values(materials)) {
      for (const value of Object.values(material))
        if (value?.isTexture && !borrowedTextures.has(value))
          textures.add(value);
      material.dispose();
    }
    for (const texture of textures) texture.dispose();
  };
  return group;
}
