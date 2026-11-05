import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetURL } from '../../../assets/url.js';
import { createLifetime } from '../../../core/lifecycle.js';
import { finishHabitatMaterial } from './habitat.js';
import manifest from '../../../../assets/levels/oriel/blender/garden-sector/manifest.json' with { type: 'json' };

export const ORIEL_GARDEN_SECTOR_URL = assetURL(
  'assets/levels/oriel/oriel-garden-sector.glb',
);

/** Reserve only the authored shell patch, including enough height for mature
 * canopy. Angle and radial height keep the opposite cylinder side untouched.
 */
export function getGardenSectorReservation() {
  const bounds = manifest.reservation;
  return {
    id: 'oriel-five-contour-gardens',
    ...bounds,
    contains(position, padding = 0) {
      const angle = Math.atan2(position.x, 1000 - position.y);
      const height = 1000 - Math.hypot(position.x, position.y - 1000);
      return (
        angle >= bounds.angleMin - padding / 1000 &&
        angle <= bounds.angleMax + padding / 1000 &&
        position.z >= bounds.zMin - padding &&
        position.z <= bounds.zMax + padding &&
        height >= bounds.heightMin - padding &&
        height <= bounds.heightMax + padding
      );
    },
  };
}

function worldPlacement(anchor) {
  return {
    kind: anchor.kind,
    category: anchor.category,
    position: new T.Vector3(...anchor.position),
    quaternion: new T.Quaternion().setFromRotationMatrix(
      new T.Matrix4().makeBasis(
        new T.Vector3(...anchor.basisRight),
        new T.Vector3(...anchor.basisUp),
        new T.Vector3(...anchor.basisTangent),
      ),
    ),
    scale: new T.Vector3(...anchor.scale),
  };
}

/** Four owned material batches. Existing ground and borrowed stone maps retain
 * their own lifetimes; civic and Worldkit placements are instantiated by caller.
 */
export async function createGardenSector({
  track,
  lifetime,
  stoneMaps,
  terrainMaterial,
  loadAsset = (url) => new GLTFLoader().loadAsync(url),
} = {}) {
  const resources = createLifetime();
  lifetime?.defer(() => resources.dispose());
  const group = new T.Group();
  group.name = 'Oriel / five connected contour gardens';
  const geometries = new Set();
  const materials = new Set();
  resources.defer(() => group.clear());
  try {
    const { scene } = await loadAsset(ORIEL_GARDEN_SECTOR_URL);
    scene.updateMatrixWorld(true);
    scene.traverse((mesh) => {
      if (!mesh.isMesh) return;
      geometries.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material])
        materials.add(material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.orielGardenSector = true;
    });
    for (const geometry of geometries) resources.own(geometry);
    for (const material of materials) resources.own(material);
    for (const material of materials) {
      finishHabitatMaterial(material, { bounce: 0.14 });
      if (/limestone|path/.test(material.name)) stoneMaps?.apply(material);
    }
    if (track)
      scene.traverse((mesh) => {
        if (mesh.isMesh && /limestone|path/.test(mesh.material.name))
          stoneMaps?.coordinates(mesh.geometry, track);
      });
    if (terrainMaterial)
      scene.traverse((mesh) => {
        if (mesh.isMesh && /soil|cultivated/.test(mesh.material.name))
          mesh.material = terrainMaterial;
      });
    group.add(scene);
    return {
      group,
      materials: [...materials],
      plantingAnchors: manifest.plantingAnchors.map(worldPlacement),
      civicPlacements: manifest.civicPlacements.map(worldPlacement),
      reservation: getGardenSectorReservation(),
      dispose: () => resources.dispose(),
    };
  } catch (error) {
    resources.dispose();
    throw error;
  }
}
