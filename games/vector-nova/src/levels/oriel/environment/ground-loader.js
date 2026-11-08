import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetURL } from '../../../assets/url.js';

export const ORIEL_GROUND_VERSION = 'oriel-terraced-inner-shell-v1';
export const ORIEL_GROUND_URL = assetURL(
  'assets/levels/oriel/oriel-ground.glb',
);

/** Load twelve owned, world-baked inner-shell sectors. The consumer owns their
 * shared finish; all source materials are released before this factory returns.
 */
export async function loadOrielGround({
  loadAsset = (url) => new GLTFLoader().loadAsync(url),
} = {}) {
  const { scene } = await loadAsset(ORIEL_GROUND_URL);
  scene.updateMatrixWorld(true);
  const geometries = [];
  const sourceGeometries = new Set();
  const sourceMaterials = new Set();
  const meshes = [];
  scene.traverse((object) => {
    if (object.isMesh) meshes.push(object);
  });
  meshes.sort((a, b) => a.name.localeCompare(b.name));
  for (const mesh of meshes) {
    sourceGeometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material]) {
      if (material) sourceMaterials.add(material);
    }
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    geometry.name = mesh.name;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometries.push(geometry);
  }
  for (const geometry of sourceGeometries) geometry.dispose();
  for (const material of sourceMaterials) material.dispose();
  if (
    geometries.length !== 12 ||
    geometries.some(
      (geometry) =>
        !geometry.index ||
        !geometry.attributes.normal ||
        !geometry.attributes.uv,
    )
  ) {
    for (const geometry of geometries) geometry.dispose();
    throw new Error(
      'Oriel ground must supply twelve indexed sectors with normals and UVs',
    );
  }
  let disposed = false;
  return {
    geometries,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of geometries) geometry.dispose();
    },
  };
}
