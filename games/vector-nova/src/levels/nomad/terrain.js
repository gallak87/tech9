import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetURL } from '../../assets/url.js';
import { indexedTriangles } from '../../physics/collision-world.js';
import { NOMAD_MOTION_RULES } from './motion.js';
import {
  NOMAD_GROUND_GROUP,
  sampleNomadGroundMotion,
} from './ground-motion.js';
import collisionKit from '../../../assets/levels/nomad/blender/salt-escarpments/salt-escarpments-collision.json' with { type: 'json' };
import manifest from '../../../assets/levels/nomad/blender/salt-escarpments/salt-escarpments-provenance.json' with { type: 'json' };

export const NOMAD_TERRAIN_GEOMETRY_VERSION = `nomad-salt-terraces-v3:${JSON.stringify(
  {
    collision: manifest.hashes['salt-escarpments-collision.json'],
    guides: manifest.hashes['salt-ground-guides.json'],
    convoySpeed: NOMAD_MOTION_RULES.convoySpeed,
    grade: NOMAD_MOTION_RULES.groundGrade,
  },
)}`;

/** The retained meshes already contain their exact final rest-world placement.
 * The connected H(x)-grade*z skin is invariant under ground translation; only
 * the separately sculpted brows travel through the convoy frame.
 */
export function createNomadTerrainPlacements() {
  return manifest.prototypes.map((source) => ({
    id: source.name,
    prototype: source.name,
    motion: source.motion,
    motionGroup:
      source.motion === NOMAD_GROUND_GROUP ? NOMAD_GROUND_GROUP : undefined,
    position: new T.Vector3(),
    quaternion: new T.Quaternion(),
    scale: new T.Vector3(1, 1, 1),
    matrix: new T.Matrix4(),
    bounds: new T.Box3(
      new T.Vector3(...source.bounds.min),
      new T.Vector3(...source.bounds.max),
    ),
  }));
}

export function createNomadTerrainTriangles() {
  const triangles = [];
  for (const placement of createNomadTerrainPlacements()) {
    const source = collisionKit.prototypes.find(
      (part) => part.name === placement.prototype,
    );
    if (!source)
      throw new Error(
        `Nomad salt collision prototype is missing: ${placement.prototype}`,
      );
    for (const triangle of indexedTriangles(
      source.positions,
      source.indices,
      {
        id: `nomad-terrain/${placement.id}`,
        kind: 'terrain',
        ...(placement.motionGroup
          ? { motionGroup: placement.motionGroup }
          : {}),
      },
      placement.matrix,
    ))
      triangles.push(triangle);
  }
  return triangles;
}

/** One owned GLB supplies the exact physical floor and connected salt cuts.
 * floorMaterial is borrowed from the environment; all retained sources remain
 * owned here and unwind on failed load, late completion or repeated disposal.
 */
export function createNomadTerrain({
  track,
  shape = false,
  floorMaterial = null,
  loadAsset = (url) => new GLTFLoader().loadAsync(url),
}) {
  const group = new T.Group();
  group.name = 'Nomad / descending salt terraces';
  group.userData.nomadTerrain = {
    geometryVersion: NOMAD_TERRAIN_GEOMETRY_VERSION,
    shape,
  };
  const placements = createNomadTerrainPlacements();
  const movingRoots = [];
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  let disposed = false;
  const release = () => {
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    geometries.clear();
    materials.clear();
    textures.clear();
  };
  const collect = (source) =>
    source.traverse((mesh) => {
      if (mesh.geometry) geometries.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]) {
        if (!material) continue;
        materials.add(material);
        for (const value of Object.values(material))
          if (value?.isTexture) textures.add(value);
      }
    });
  const ready = Promise.resolve()
    .then(() => loadAsset(assetURL('assets/levels/nomad/salt-escarpments.glb')))
    .then(({ scene }) => {
      collect(scene);
      if (disposed) {
        release();
        return;
      }
      for (const placement of placements) {
        const source = scene.getObjectByName(placement.prototype);
        if (!source)
          throw new Error(
            `Nomad salt terrain prototype is missing: ${placement.prototype}`,
          );
        const root = source.clone(true);
        root.name = `Nomad / ${placement.id}`;
        if (placement.motionGroup) {
          root.userData.motionGroup = placement.motionGroup;
          movingRoots.push(root);
        }
        root.traverse((mesh) => {
          if (!mesh.isMesh) return;
          const floor =
            !placement.motionGroup &&
            mesh.material?.name === 'Nomad terrain / salt profile floor';
          if (floor && floorMaterial) mesh.material = floorMaterial;
          mesh.castShadow = !floor;
          mesh.receiveShadow = true;
        });
        group.add(root);
      }
      update();
    })
    .catch((cause) => {
      group.clear();
      movingRoots.length = 0;
      release();
      throw new Error(
        'The Nomad salt escarpments could not load. Reload to try again.',
        { cause },
      );
    });
  function update() {
    if (disposed) return;
    const translation = sampleNomadGroundMotion(
      track,
      track.presentationTime ?? 0,
    ).translation;
    for (const root of movingRoots) root.position.copy(translation);
  }
  return {
    group,
    placements,
    geometryVersion: NOMAD_TERRAIN_GEOMETRY_VERSION,
    ready,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      movingRoots.length = 0;
      release();
    },
  };
}
