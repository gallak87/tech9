import {
  BatchedMesh,
  BufferAttribute,
  BufferGeometry,
  FloatType,
  Matrix4,
  Vector3,
} from 'three';

function pieceGeometry(source, triangles) {
  const vertices = new Map(),
    indices = [];
  for (const index of triangles) {
    if (!vertices.has(index)) vertices.set(index, vertices.size);
    indices.push(vertices.get(index));
  }
  const result = new BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const original = attribute.isInterleavedBufferAttribute
      ? attribute.data.array
      : attribute.array;
    const stride = attribute.isInterleavedBufferAttribute
      ? attribute.data.stride
      : attribute.itemSize;
    const offset = attribute.isInterleavedBufferAttribute
      ? attribute.offset
      : 0;
    const values = new original.constructor(vertices.size * attribute.itemSize);
    for (const [index, destination] of vertices)
      for (let axis = 0; axis < attribute.itemSize; axis++)
        values[destination * attribute.itemSize + axis] =
          original[index * stride + offset + axis];
    const copy = new BufferAttribute(
      values,
      attribute.itemSize,
      attribute.normalized,
    );
    copy.gpuType = attribute.gpuType;
    result.setAttribute(name, copy);
  }
  result.setIndex(indices);
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

// Retained static city/terrain exports often join entire districts into one
// bound. Keep every triangle and attribute, but cull small spatial pieces in
// both beauty and shadow cameras. Batches borrow materials and own only copies
// of geometry; callers retain their normal material/texture lifecycle.
export function batchStaticWorld(
  root,
  { cellSize = 640, minTriangles = 2000 } = {},
) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const groups = new Map(),
    originals = [],
    retiredGeometry = new Set();
  const point = new Vector3();
  root.traverseVisible((object) => {
    const geometry = object.geometry;
    if (
      !object.isMesh ||
      object.children.length ||
      object.isInstancedMesh ||
      object.isBatchedMesh ||
      object.isSkinnedMesh ||
      !geometry ||
      Array.isArray(object.material) ||
      object.material.transparent ||
      geometry.groups.length ||
      Object.keys(geometry.morphAttributes).length ||
      geometry.drawRange.start !== 0 ||
      geometry.drawRange.count !== Infinity
    )
      return;
    // Three's BatchedMesh copies attributes into plain BufferAttributes. Keep
    // half-float decoding and integer shader inputs with their original mesh.
    if (
      Object.values(geometry.attributes).some(
        (attribute) =>
          attribute.isFloat16BufferAttribute || attribute.gpuType !== FloatType,
      )
    )
      return;
    const position = geometry.attributes.position;
    const index = geometry.index;
    const count = index?.count ?? position.count;
    if (count / 3 < minTriangles) return;
    const matrix = new Matrix4().multiplyMatrices(inverse, object.matrixWorld);
    const cells = new Map();
    for (let triangle = 0; triangle < count; triangle += 3) {
      const ids = [0, 1, 2].map((corner) =>
        index ? index.getX(triangle + corner) : triangle + corner,
      );
      point.set(0, 0, 0);
      for (const id of ids) {
        point.x += position.getX(id) / 3;
        point.y += position.getY(id) / 3;
        point.z += position.getZ(id) / 3;
      }
      point.applyMatrix4(matrix);
      const key = `${Math.floor(point.x / cellSize)},${Math.floor(point.y / cellSize)},${Math.floor(point.z / cellSize)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(...ids);
    }
    const layout = Object.entries(geometry.attributes)
      .map(
        ([name, attribute]) =>
          `${name}:${attribute.itemSize}:${attribute.normalized}:${(attribute.array ?? attribute.data.array).constructor.name}`,
      )
      .join('|');
    const key = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}:${object.renderOrder}:${object.layers.mask}:${!!object.userData.aoExclude}:${!!object.userData.reflectionExclude}:${layout}`;
    if (!groups.has(key)) groups.set(key, { source: object, entries: [] });
    for (const triangles of cells.values())
      groups.get(key).entries.push({
        geometry: pieceGeometry(geometry, triangles),
        matrix,
        name: object.name,
      });
    originals.push(object);
    retiredGeometry.add(geometry);
  });
  const batches = [];
  try {
    for (const { source, entries } of groups.values()) {
      const vertexCount = entries.reduce(
        (sum, entry) => sum + entry.geometry.attributes.position.count,
        0,
      );
      const indexCount = entries.reduce(
        (sum, entry) => sum + entry.geometry.index.count,
        0,
      );
      const batch = new BatchedMesh(
        entries.length,
        vertexCount,
        indexCount,
        source.material,
      );
      batches.push(batch);
      batch.name = `Spatially culled / ${source.material.name || source.name}`;
      batch.castShadow = source.castShadow;
      batch.receiveShadow = source.receiveShadow;
      batch.renderOrder = source.renderOrder;
      batch.layers.mask = source.layers.mask;
      batch.userData = {
        ...source.userData,
        sourceNames: [...new Set(entries.map((entry) => entry.name))],
      };
      for (const { geometry, matrix } of entries) {
        const id = batch.addGeometry(geometry);
        batch.setMatrixAt(batch.addInstance(id), matrix);
      }
      batch.computeBoundingSphere();
    }
  } catch (error) {
    for (const batch of batches) batch.dispose();
    throw error;
  } finally {
    for (const { entries } of groups.values())
      for (const { geometry } of entries) geometry.dispose();
  }
  for (const object of originals) object.removeFromParent();
  for (const geometry of retiredGeometry) geometry.dispose();
  if (batches.length) root.add(...batches);
  const stats = {
    sourceMeshes: originals.length,
    batches: batches.length,
    pieces: [...groups.values()].reduce(
      (sum, group) => sum + group.entries.length,
      0,
    ),
  };
  root.userData.spatialBatches = stats;
  return stats;
}
