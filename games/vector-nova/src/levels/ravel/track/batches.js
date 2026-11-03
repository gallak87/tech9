import { BatchedMesh, BufferGeometry, Matrix4 } from 'three';

// The grid builder normally provides an already padded sphere. Preserve it;
// Three's addGeometry clones that sphere along with the chunk's packed data.
function boundedGeometry(geometry, deforming) {
  if (geometry.boundingSphere) return geometry;
  const bounded = new BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes))
    bounded.setAttribute(name, attribute);
  if (geometry.index) bounded.setIndex(geometry.index);
  bounded.computeBoundingSphere();
  if (deforming) bounded.boundingSphere.radius += 12;
  return bounded;
}

/** Pack world-coordinate road chunks while retaining per-chunk frustum culling.
 * Materials and source meshes remain borrowed; each result owns its buffers
 * and BatchedMesh textures and is released with result.dispose().
 */
export function batchRavelRoad(entries) {
  const byMaterial = new Map();
  for (const mesh of entries) {
    const position = mesh.geometry?.getAttribute('position');
    if (!position || !mesh.material)
      throw new Error('Ravel road batches require geometry and a material.');
    if (!position.count || mesh.geometry.index?.count === 0) continue;
    const driving = Boolean(mesh.userData.drivingSurface);
    const deforming = Boolean(mesh.userData.deforming);
    const key = `${Number(driving)}:${Number(deforming)}`;
    if (!byMaterial.has(mesh.material))
      byMaterial.set(mesh.material, new Map());
    const groups = byMaterial.get(mesh.material);
    if (!groups.has(key)) groups.set(key, { driving, deforming, meshes: [] });
    groups.get(key).meshes.push(mesh);
  }

  const results = [];
  const identity = new Matrix4();
  try {
    for (const [material, groups] of byMaterial) {
      for (const { driving, deforming, meshes } of groups.values()) {
        const vertices = meshes.reduce(
          (sum, mesh) => sum + mesh.geometry.getAttribute('position').count,
          0,
        );
        const indices = meshes.reduce(
          (sum, mesh) => sum + (mesh.geometry.index?.count ?? 0),
          0,
        );
        const first = meshes[0];
        const batch = new BatchedMesh(
          meshes.length,
          vertices,
          indices,
          material,
        );
        results.push(batch);
        batch.name = first.name;
        batch.userData = {
          ...first.userData,
          drivingSurface: driving,
          roadSurface: driving,
          deforming,
          aoExclude: deforming,
          chunkCount: meshes.length,
        };
        batch.receiveShadow = !deforming;
        batch.castShadow = false;
        batch.layers.mask = first.layers.mask;
        batch.renderOrder = first.renderOrder;
        batch.perObjectFrustumCulled = true;
        batch.sortObjects = false;
        for (const mesh of meshes) {
          const geometry = boundedGeometry(mesh.geometry, deforming);
          const geometryId = batch.addGeometry(geometry);
          const instanceId = batch.addInstance(geometryId);
          batch.setMatrixAt(instanceId, identity);
          if (geometry !== mesh.geometry) geometry.dispose();
        }
        batch.computeBoundingSphere();
      }
    }
    return results;
  } catch (error) {
    for (const batch of results) batch.dispose();
    throw error;
  }
}
