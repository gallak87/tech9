import * as T from 'three';

// Assemblies own their source resources. Small spatial batches borrow those
// resources; genuine coarse source-mesh LODs retain the distant district forms.
export function batchSkywellScenery(
  objects,
  { cellSize = 520, farGeometries = new Map() } = {},
) {
  const group = new T.Group();
  group.name = 'Skywell / spatially instanced limestone districts';
  const batches = new Map();
  const lods = [];
  const bounds = new T.Box3();
  for (const object of objects) {
    object.updateWorldMatrix(true, true);
    const cell = object.position.clone().divideScalar(cellSize).floor();
    object.traverseVisible((mesh) => {
      if (!mesh.isMesh) return;
      // This established shader uses normalMatrix for its authored across-flow
      // vector. Preserve its full model matrix rather than changing that frame.
      if (mesh.geometry.attributes.flowRight) {
        const draw = new T.Mesh(mesh.geometry, mesh.material);
        draw.matrixAutoUpdate = false;
        draw.matrix.copy(mesh.matrixWorld);
        draw.userData = { ...mesh.userData };
        draw.name = `Skywell / source-framed ${mesh.name}`;
        draw.castShadow = false;
        draw.receiveShadow = true;
        group.add(draw);
        return;
      }
      const materials = [mesh.material].flat();
      const key = `${cell.x},${cell.y},${cell.z}:${mesh.geometry.uuid}:${materials.map((m) => m.uuid).join(',')}`;
      if (!batches.has(key)) batches.set(key, { source: mesh, entries: [] });
      mesh.geometry.computeBoundingBox();
      bounds.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      batches.get(key).entries.push({
        matrix: mesh.matrixWorld.clone(),
        bounds: bounds.clone(),
      });
    });
  }
  function draw(source, geometry, entries, label) {
    const mesh = new T.InstancedMesh(geometry, source.material, entries.length);
    mesh.name = `Skywell ${label} / ${source.name}`;
    mesh.userData = { ...source.userData };
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    entries.forEach((entry, index) => mesh.setMatrixAt(index, entry.matrix));
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  }
  for (const { source, entries } of batches.values()) {
    const near = draw(source, source.geometry, entries, 'near');
    const farGeometry = farGeometries.get(source.geometry);
    if (farGeometry && farGeometry !== source.geometry) {
      const far = draw(source, farGeometry, entries, 'far');
      far.count = 0;
      lods.push({ near, far, entries });
    }
  }
  const lastCamera = new T.Vector3(Infinity, Infinity, Infinity);
  let disposed = false;
  return {
    group,
    update(camera) {
      if (
        disposed ||
        !camera ||
        lastCamera.distanceToSquared(camera.position) < 16 ** 2
      )
        return;
      lastCamera.copy(camera.position);
      for (const { near, far, entries } of lods) {
        let n = 0,
          f = 0;
        for (const entry of entries) {
          const close = entry.bounds.distanceToPoint(camera.position) < 650;
          (close ? near : far).setMatrixAt(close ? n++ : f++, entry.matrix);
        }
        near.count = n;
        far.count = f;
        for (const mesh of [near, far]) {
          mesh.instanceMatrix.needsUpdate = true;
          mesh.computeBoundingBox();
          mesh.computeBoundingSphere();
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const mesh of group.children)
        if (mesh.isInstancedMesh) mesh.dispose();
      group.clear();
    },
  };
}
