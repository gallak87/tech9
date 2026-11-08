import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetURL } from '../../../assets/url.js';
import manifest from '../../../../assets/levels/oriel/blender/civic-kit-manifest.json' with { type: 'json' };

export const ORIEL_CIVIC_KIT_URL = assetURL(
  'assets/levels/oriel/oriel-civic-kit.glb',
);

/** The source kit owns all geometry and materials. Instances may borrow these
 * parts until dispose; each geometry has its full prototype transform baked in.
 */
export async function createCivicKit({
  loadAsset = (url) => new GLTFLoader().loadAsync(url),
} = {}) {
  const { scene } = await loadAsset(ORIEL_CIVIC_KIT_URL);
  scene.updateMatrixWorld(true);
  const prototypes = {};
  const geometries = new Set();
  const materials = new Set();
  const sourceGeometries = new Set();
  scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const category = mesh.name.split('__')[0];
    if (!category) return;
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometries.add(geometry);
    sourceGeometries.add(mesh.geometry);
    const surfaces = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of surfaces) materials.add(material);
    (prototypes[category] ??= []).push({
      geometry,
      material: mesh.material,
      localMatrix: new THREE.Matrix4(),
    });
  });
  for (const geometry of sourceGeometries) geometry.dispose();
  const required = [
    'pavilion',
    'tower',
    'towerFar',
    'sunBracket',
    'waterfront',
    'waterfrontFar',
    'gardenCourt',
    'gardenCourtFar',
  ];
  const missing = required.filter((name) => !prototypes[name]?.length);
  if (missing.length) {
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    throw new Error(`Oriel civic kit is missing ${missing.join(', ')}`);
  }
  let disposed = false;
  return {
    prototypes,
    plantingAnchors: Object.fromEntries(
      manifest.prototypes.map((entry) => [
        entry.name,
        entry.plantingAnchors ?? [],
      ]),
    ),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      geometries.clear();
      materials.clear();
    },
  };
}
