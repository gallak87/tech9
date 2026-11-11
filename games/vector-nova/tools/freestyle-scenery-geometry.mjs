import * as T from 'three';
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';

export const SCENERY_COLLISION_ERROR = 0.025;
export const LANDSCAPE_COLLISION_ERROR = 0.25;
export const collisionTolerance = (worldExtent) =>
  worldExtent >= 80 ? LANDSCAPE_COLLISION_ERROR : SCENERY_COLLISION_ERROR;
const sourceCache = new WeakMap();

// Gershgorin bounds the largest eigenvalue of A^T A, including shear from a
// rotated child beneath nonuniformly scaled parents. Column length alone does not.
export function collisionWorldScale(matrix) {
  const e = matrix.elements;
  const columns = [
    new T.Vector3(e[0], e[1], e[2]),
    new T.Vector3(e[4], e[5], e[6]),
    new T.Vector3(e[8], e[9], e[10]),
  ];
  return (
    Math.sqrt(
      Math.max(
        ...columns.map((a) =>
          columns.reduce((sum, b) => sum + Math.abs(a.dot(b)), 0),
        ),
      ),
    ) *
    (1 + 1e-12)
  );
}

function collisionSource(geometry, range, worldScale) {
  let cache = sourceCache.get(geometry);
  if (!cache) sourceCache.set(geometry, (cache = new Map()));
  const scale = Math.ceil(worldScale * 100) / 100;
  const key = `${range.start}:${range.count}:${scale}`;
  if (cache.has(key)) return cache.get(key);
  const positions = [],
    indices = [],
    remap = new Map();
  const source = geometry.attributes.position,
    index = geometry.index;
  for (let k = range.start; k < range.start + range.count; k++) {
    const original = index ? index.getX(k) : k;
    if (!remap.has(original)) {
      remap.set(original, positions.length / 3);
      positions.push(
        source.getX(original),
        source.getY(original),
        source.getZ(original),
      );
    }
    indices.push(remap.get(original));
  }
  const points = new Float32Array(positions),
    faces = new Uint32Array(indices);
  const weld = MeshoptSimplifier.generatePositionRemap(points, 3);
  for (let i = 0; i < faces.length; i++) faces[i] = weld[faces[i]];
  const sourceScale = MeshoptSimplifier.getScale(points, 3);
  const tolerance = collisionTolerance(sourceScale * scale);
  let reduced = faces,
    error = 0;
  if (faces.length > 96 && sourceScale > 0) {
    [reduced, error] = MeshoptSimplifier.simplify(
      faces,
      points,
      3,
      Math.max(96, Math.floor((faces.length * 0.015) / 3) * 3),
      (0.5 * tolerance) / (sourceScale * scale),
      ['LockBorder', 'Sparse'],
    );
    if (reduced.length > faces.length * 0.3)
      [reduced, error] = MeshoptSimplifier.simplify(
        faces,
        points,
        3,
        Math.max(96, Math.floor((faces.length * 0.015) / 3) * 3),
        (0.5 * tolerance) / (sourceScale * scale),
        ['Sparse'],
      );
  }
  if (error * sourceScale * scale > tolerance + 1e-5)
    throw new Error(
      'Receiver scenery exceeded its world-space collision error',
    );
  const result = {
    positions: new T.BufferAttribute(points, 3),
    indices: reduced,
  };
  cache.set(key, result);
  return result;
}

// Authoring-only extraction of real, opaque receiver surroundings. The CPU
// world keeps these faces, not an enclosing box that would seal an archway.
function receiverCorridors(track, jump) {
  const box = new T.Box3(
    new T.Vector3(-(track.width ?? 48) / 2 - 50, -160, -18),
    new T.Vector3((track.width ?? 48) / 2 + 50, 100, 18),
  );
  const frames = [];
  for (let s = jump.landingStart - 120; s <= jump.recovery + 96; s += 24) {
    const frame = track.sample(s);
    const matrix = new T.Matrix4().compose(
      frame.position,
      frame.quaternion ?? new T.Quaternion(),
      new T.Vector3(1, 1, 1),
    );
    frames.push({
      box,
      inverse: matrix.clone().invert(),
      bounds: box.clone().applyMatrix4(matrix),
    });
  }
  return frames;
}

export function receiverBounds(track, jump) {
  const bounds = new T.Box3();
  for (const frame of receiverCorridors(track, jump))
    bounds.union(frame.bounds);
  return bounds;
}

export async function collectReceiverScenery(group, track, jump) {
  await MeshoptSimplifier.ready;
  const corridors = receiverCorridors(track, jump),
    bounds = new T.Box3(),
    parts = [];
  for (const frame of corridors) bounds.union(frame.bounds);
  const instance = new T.Matrix4(),
    matrix = new T.Matrix4();
  const a = new T.Vector3(),
    b = new T.Vector3(),
    c = new T.Vector3();
  const triangleBounds = new T.Box3(),
    localBounds = new T.Box3();
  const triangle = new T.Triangle();
  group.updateWorldMatrix(true, true);
  group.traverseVisible((mesh) => {
    if (
      !mesh.isMesh ||
      mesh.userData.drivingSurface ||
      /^Skywell far \/ /.test(mesh.name)
    )
      return;
    const materials = [mesh.material].flat();
    // Water, leaves, flowers, glass, glows and painted overlays are not solid
    // architecture. In particular, leaf cards must never become invisible walls.
    if (
      !materials.length ||
      materials.some(
        (material) =>
          !material.visible ||
          material.transparent ||
          material.opacity < 1 ||
          material.alphaTest > 0 ||
          /water|foam|foliage|leaf|leaves|flower|blossom|grass|glow|light ribbon|garden canopy/i.test(
            material.name,
          ),
      )
    )
      return;
    const geometry = mesh.geometry;
    const count = mesh.isBatchedMesh
      ? mesh.instanceCount
      : mesh.isInstancedMesh
        ? mesh.count
        : 1;
    for (let i = 0; i < count; i++) {
      if (mesh.isBatchedMesh && !mesh.getVisibleAt(i)) continue;
      matrix.copy(mesh.matrixWorld);
      if (mesh.isInstancedMesh || mesh.isBatchedMesh) {
        mesh.getMatrixAt(i, instance);
        matrix.multiply(instance);
      }
      const range = mesh.isBatchedMesh
        ? mesh.getGeometryRangeAt(mesh.getGeometryIdAt(i))
        : {
            start: geometry.drawRange.start,
            count: Math.min(
              geometry.drawRange.count,
              geometry.index?.count ?? geometry.attributes.position.count,
            ),
          };
      if (mesh.isBatchedMesh)
        mesh.getBoundingBoxAt(mesh.getGeometryIdAt(i), localBounds);
      else {
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        localBounds.copy(geometry.boundingBox);
      }
      if (!bounds.intersectsBox(localBounds.applyMatrix4(matrix))) continue;
      const simplified = collisionSource(
        geometry,
        range,
        collisionWorldScale(matrix),
      );
      const positions = simplified.positions,
        indices = simplified.indices;
      const vertices = [],
        faces = [],
        remap = new Map();
      function vertex(index) {
        if (!remap.has(index)) {
          remap.set(index, vertices.length / 3);
          vertices.push(
            positions.getX(index),
            positions.getY(index),
            positions.getZ(index),
          );
        }
        return remap.get(index);
      }
      for (let k = 0; k < indices.length; k += 3) {
        const corners = [indices[k], indices[k + 1], indices[k + 2]];
        a.fromBufferAttribute(positions, corners[0]).applyMatrix4(matrix);
        b.fromBufferAttribute(positions, corners[1]).applyMatrix4(matrix);
        c.fromBufferAttribute(positions, corners[2]).applyMatrix4(matrix);
        triangleBounds.setFromPoints([a, b, c]);
        if (!bounds.intersectsBox(triangleBounds)) continue;
        if (
          !corridors.some((frame) => {
            if (!frame.bounds.intersectsBox(triangleBounds)) return false;
            triangle.set(
              a.clone().applyMatrix4(frame.inverse),
              b.clone().applyMatrix4(frame.inverse),
              c.clone().applyMatrix4(frame.inverse),
            );
            return frame.box.intersectsTriangle(triangle);
          })
        )
          continue;
        if (new T.Triangle(a, b, c).getArea() < 1e-8) continue;
        faces.push(...corners.map(vertex));
      }
      if (faces.length)
        parts.push({
          name: mesh.name,
          receiver: jump.id,
          matrix: matrix.toArray(),
          positions: vertices,
          indices: faces,
        });
    }
  });
  return parts;
}
