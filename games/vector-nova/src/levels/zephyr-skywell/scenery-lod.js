import * as T from 'three';
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';

const MIN_TRIANGLES = 5000;
const MAX_ERROR = 0.025;
const SUPPORTED_ATTRIBUTES = new Set([
  'position',
  'normal',
  'color',
  'uv',
  'uv1',
  'uv2',
  'uv3',
]);

// Far scenery retains the authored surfaces, openings and vertex-colour bake.
// Near meshes and their canonical Zephyr geometry remain completely borrowed.
export async function createSkywellSceneryLods(geometries) {
  const sources = [...new Set(geometries)].filter(
    (geometry) => geometry?.isBufferGeometry,
  );
  const far = new Map(sources.map((geometry) => [geometry, geometry]));
  const owned = new Set();
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    owned.forEach((geometry) => geometry.dispose());
    owned.clear();
    far.clear();
  };
  if (!MeshoptSimplifier.supported) return { far, dispose };
  try {
    await MeshoptSimplifier.ready;
  } catch {
    return { far, dispose };
  }
  for (const [sourceIndex, source] of sources.entries()) {
    // Yield without changing the result on a slower host. The canonical kit
    // is bounded; hardware speed must never choose a different world mesh.
    if (sourceIndex && sourceIndex % 8 === 0)
      await new Promise((resolve) => setTimeout(resolve, 0));
    const position = source.attributes.position;
    const indexCount = source.index?.count ?? position?.count ?? 0;
    if (
      !position ||
      position.itemSize !== 3 ||
      indexCount / 3 < MIN_TRIANGLES ||
      indexCount % 3 ||
      source.groups.length ||
      source.drawRange.start !== 0 ||
      source.drawRange.count < indexCount ||
      Object.values(source.morphAttributes).some(
        (attributes) => attributes.length,
      ) ||
      Object.keys(source.attributes).some(
        (name) => !SUPPORTED_ATTRIBUTES.has(name),
      )
    )
      continue;
    // GLBs split vertices at hard normals and baked-colour seams. Exact-position
    // welding supplies real mesh adjacency without changing a single point.
    const points = new Float32Array(position.count * 3);
    for (let vertex = 0; vertex < position.count; vertex++) {
      points[vertex * 3] = position.getX(vertex);
      points[vertex * 3 + 1] = position.getY(vertex);
      points[vertex * 3 + 2] = position.getZ(vertex);
    }
    if (points.some((value) => !Number.isFinite(value))) continue;
    const remap = MeshoptSimplifier.generatePositionRemap(points, 3);
    const indices = new Uint32Array(indexCount);
    for (let i = 0; i < indexCount; i++)
      indices[i] = remap[source.index ? source.index.getX(i) : i];
    const target =
      Math.max(128, Math.min(4000, Math.floor((indexCount / 3) * 0.16))) * 3;
    let simplified, error;
    try {
      [simplified, error] = MeshoptSimplifier.simplify(
        indices,
        points,
        3,
        target,
        MAX_ERROR,
        ['LockBorder', 'Sparse'],
      );
      // Natural strata contain authored, unstitched fissure seams. The normal
      // topology-preserving solver can collapse those boundary details while
      // retaining the same surface and error bound; no sloppy/proxy mode is used.
      if (simplified.length > indexCount * 0.75)
        [simplified, error] = MeshoptSimplifier.simplify(
          indices,
          points,
          3,
          target,
          MAX_ERROR,
          ['Sparse'],
        );
    } catch {
      continue;
    }
    // A difficult open mesh may legitimately resist decimation. Retain its
    // source rather than prune pieces, close apertures or invent a proxy hull.
    if (
      !Number.isFinite(error) ||
      error > MAX_ERROR ||
      simplified.length < 3 ||
      simplified.length > indexCount * 0.75
    )
      continue;
    const representatives = [];
    const compact = new Map();
    const reduced = new Uint32Array(simplified.length);
    for (let i = 0; i < simplified.length; i++) {
      const representative = simplified[i];
      if (!compact.has(representative)) {
        compact.set(representative, representatives.length);
        representatives.push(representative);
      }
      reduced[i] = compact.get(representative);
    }
    const geometry = new T.BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes)) {
      if (name === 'normal') continue;
      const values = new Float32Array(
        representatives.length * attribute.itemSize,
      );
      for (let i = 0; i < representatives.length; i++)
        for (let component = 0; component < attribute.itemSize; component++)
          values[i * attribute.itemSize + component] = attribute.getComponent(
            representatives[i],
            component,
          );
      geometry.setAttribute(
        name,
        new T.Float32BufferAttribute(values, attribute.itemSize),
      );
    }
    geometry.setIndex(new T.BufferAttribute(reduced, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.name = `${source.name || 'Zephyr scenery'} / distant authored surface`;
    geometry.userData.skywellLod = {
      source: source.uuid,
      sourceTriangles: indexCount / 3,
      triangles: reduced.length / 3,
      error,
    };
    owned.add(geometry);
    far.set(source, geometry);
  }
  return { far, dispose };
}
