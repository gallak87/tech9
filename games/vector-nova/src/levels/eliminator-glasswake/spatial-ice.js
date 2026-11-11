import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Bound ordinary instances and already-fitted arch pieces into spatial draw
 * groups without changing geometry, placement or the canonical ice shader.
 * Sources are borrowed. The returned owner alone releases merged arch buffers
 * and instance resources; disposal is safe to repeat.
 */
export function createFractureSpatialIce(
  placements,
  templates,
  archPieces = [],
  { cellSize = 400 } = {},
) {
  if (!Number.isFinite(cellSize) || cellSize <= 0)
    throw new RangeError('Fracture ice cells require a finite positive size');
  const meshes = [],
    mergedGeometries = new Set(),
    instanceGroups = new Map(),
    archGroups = new Map(),
    cells = new Map();
  const report = {
    cellSize,
    placements: 0,
    skippedArches: 0,
    instances: 0,
    instanceMeshes: 0,
    archPieces: archPieces.length,
    archMeshes: 0,
    triangles: 0,
    cells: [],
    instanceBindings: [],
    archBindings: [],
  };
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const mesh of meshes) {
      mesh.removeFromParent();
      mesh.dispose?.();
    }
    for (const geometry of mergedGeometries) geometry.dispose();
  }
  function cellAt(point) {
    const x = Math.floor(point.x / cellSize),
      z = Math.floor(point.z / cellSize),
      key = `${x},${z}`;
    if (!cells.has(key))
      cells.set(key, { key, x, z, instanceMeshes: 0, archMeshes: 0 });
    return key;
  }
  try {
    for (const [placementIndex, placement] of placements.entries()) {
      if (placement.prototype === 'bridge_arch') {
        report.skippedArches++;
        continue;
      }
      const template = templates.get(placement.prototype);
      if (!template?.parts?.length)
        throw new Error(
          `Fracture spatial ice is missing ${placement.prototype}`,
        );
      const cell = cellAt(
        new T.Vector3().setFromMatrixPosition(placement.matrix),
      );
      const castShadow = Boolean(placement.castShadow);
      report.placements++;
      for (const [partIndex, part] of template.parts.entries()) {
        if (Array.isArray(part.material))
          throw new Error(
            'Fracture spatial ice requires material-split source parts',
          );
        const key = `${placement.prototype}:${part.geometry.uuid}:${part.material.uuid}:${castShadow}:${cell}`;
        if (!instanceGroups.has(key))
          instanceGroups.set(key, {
            cell,
            prototype: placement.prototype,
            geometry: part.geometry,
            material: part.material,
            castShadow,
            entries: [],
          });
        instanceGroups.get(key).entries.push({
          placementIndex,
          partIndex,
          matrix: placement.matrix,
        });
      }
    }
    for (const [pieceIndex, piece] of archPieces.entries()) {
      if (
        !piece.geometry?.getAttribute('position') ||
        !piece.material ||
        Array.isArray(piece.material)
      )
        throw new Error(
          'Fracture arch pieces require fitted world geometry and one borrowed material',
        );
      const bounds = new T.Box3().setFromBufferAttribute(
        piece.geometry.getAttribute('position'),
      );
      const cell = cellAt(bounds.getCenter(new T.Vector3()));
      const key = `${piece.material.uuid}:${cell}`;
      if (!archGroups.has(key))
        archGroups.set(key, { cell, material: piece.material, pieces: [] });
      archGroups.get(key).pieces.push({ pieceIndex, geometry: piece.geometry });
    }
    for (const group of instanceGroups.values()) {
      const mesh = new T.InstancedMesh(
        group.geometry,
        group.material,
        group.entries.length,
      );
      const meshIndex = meshes.length;
      meshes.push(mesh);
      mesh.name = `Fracture / ${group.prototype} / ice cell ${group.cell}`;
      mesh.castShadow = group.castShadow;
      mesh.receiveShadow = true;
      for (const [instanceId, entry] of group.entries.entries()) {
        mesh.setMatrixAt(instanceId, entry.matrix);
        report.instanceBindings.push({
          meshIndex,
          instanceId,
          placementIndex: entry.placementIndex,
          partIndex: entry.partIndex,
          cell: group.cell,
        });
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      report.instances += group.entries.length;
      report.instanceMeshes++;
      report.triangles +=
        ((group.geometry.index?.count ??
          group.geometry.getAttribute('position').count) /
          3) *
        group.entries.length;
      cells.get(group.cell).instanceMeshes++;
    }
    for (const group of archGroups.values()) {
      const geometry = mergeGeometries(
        group.pieces.map((piece) => piece.geometry),
        false,
      );
      if (!geometry)
        throw new Error(
          'Fracture spatial arch geometry has incompatible source attributes',
        );
      mergedGeometries.add(geometry);
      const meshIndex = meshes.length,
        mesh = new T.Mesh(geometry, group.material);
      meshes.push(mesh);
      mesh.name = `Fracture / fitted compression arches / ice cell ${group.cell}`;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      let vertexStart = 0,
        indexStart = 0;
      for (const piece of group.pieces) {
        const vertexCount = piece.geometry.getAttribute('position').count,
          indexCount = piece.geometry.index?.count ?? 0;
        report.archBindings.push({
          meshIndex,
          pieceIndex: piece.pieceIndex,
          vertexStart,
          vertexCount,
          indexStart,
          indexCount,
          cell: group.cell,
        });
        vertexStart += vertexCount;
        indexStart += indexCount;
        report.triangles += (indexCount || vertexCount) / 3;
      }
      report.archMeshes++;
      cells.get(group.cell).archMeshes++;
    }
    report.cells = [...cells.values()];
    return { meshes, report, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
