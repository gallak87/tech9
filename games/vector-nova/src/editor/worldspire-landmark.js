import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadEditorStaticAsset } from './asset-kit.js';

export async function loadEditorWorldspireLandmark(url) {
  const source = await loadEditorStaticAsset(url);
  source.scene.updateMatrixWorld(true);
  const originals = [];
  source.scene.traverseVisible((object) => {
    if (object.isMesh) originals.push(object);
  });
  if (
    originals.some(
      (mesh) =>
        mesh.isSkinnedMesh ||
        Array.isArray(mesh.material) ||
        mesh.geometry.groups.length ||
        mesh.matrixWorld.determinant() <= 0,
    )
  )
    return source;

  // The landmark's authored sections sit in one assembly. Keeping a small
  // number of height bands retains useful sky/ground culling without one
  // submission per primitive every time the spire enters the chase camera.
  const bands = new Map();
  for (const mesh of originals) {
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    geometry.computeBoundingBox();
    const { min, max } = geometry.boundingBox;
    const altitude = Math.floor(((min.y + max.y) * 0.5) / 2400);
    const key = mesh.material.uuid + ':' + altitude;
    if (!bands.has(key))
      bands.set(key, { material: mesh.material, geometries: [] });
    bands.get(key).geometries.push(geometry);
  }

  const scene = new T.Group();
  scene.name = source.scene.name;
  let complete = true;
  try {
    for (const { material, geometries } of bands.values()) {
      const geometry = mergeGeometries(geometries);
      if (!geometry) {
        complete = false;
        break;
      }
      const mesh = new T.Mesh(geometry, material);
      mesh.name = material.name;
      scene.add(mesh);
    }
  } finally {
    for (const { geometries } of bands.values()) {
      for (const geometry of geometries) geometry.dispose();
    }
  }
  if (!complete) {
    for (const mesh of scene.children) mesh.geometry.dispose();
    return source;
  }
  for (const geometry of new Set(originals.map((mesh) => mesh.geometry)))
    geometry.dispose();
  return { scene };
}
