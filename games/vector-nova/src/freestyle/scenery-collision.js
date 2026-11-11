import * as T from 'three';
import {
  createCollisionWorld,
  indexedTriangles,
} from '../physics/collision-world.js';
import { collectProductionSolids } from '../physics/production-solids.js';
import { createSkywellRoad } from '../levels/zephyr-skywell/track/road.js';

const decode = (encoded, Type) =>
  new Type(
    Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
      .buffer,
  );

// Presentation-free, current collision data extracted from the actual placed
// architecture. Each descriptor imports only its own course, on demand.
export async function createFreestyleCollisionWorld({
  track,
  id,
  loadScenery,
}) {
  const { default: kit } = await loadScenery();
  if (
    kit.version !== 1 ||
    kit.course !== id ||
    kit.geometryVersion !== track.geometryVersion
  )
    throw new Error(`Freestyle landing scenery must be rebuilt for ${id}`);
  const base = collectProductionSolids({
    track,
    id: `${id}-solids`,
    geometryId: track.geometryVersion,
    road: createSkywellRoad({ track, shape: true }),
    select: (object) =>
      object.userData.drivingSurface
        ? { kind: 'deck' }
        : /Low outboard rail/.test(object.name)
          ? { kind: 'rail', roadBoundary: true }
          : null,
  });
  try {
    const buffers = kit.buffers.map((part) => ({
      positions: decode(part.positions, Float32Array),
      indices: decode(part.indices, Uint32Array),
    }));
    const triangles = [...base.triangles],
      targets = [...base.targets];
    for (const [index, part] of kit.instances.entries()) {
      const geometry = buffers[part.geometry];
      const faces = indexedTriangles(
        geometry.positions,
        geometry.indices,
        {
          id: `${id}-receiver-scenery-${index}`,
          kind: 'structure',
          receiverId: part.receiver,
        },
        new T.Matrix4().fromArray(part.matrix),
      );
      const bounds = new T.Box3();
      for (const face of faces)
        for (const point of face.points)
          bounds.expandByPoint(new T.Vector3(...point));
      targets.push({
        id: faces[0].id,
        name: part.name,
        kind: 'structure',
        receiverId: part.receiver,
        min: bounds.min.toArray(),
        max: bounds.max.toArray(),
      });
      for (const face of faces) triangles.push(face);
    }
    const world = createCollisionWorld({
      id: base.id,
      version: 2,
      geometryId: `${base.rulesId}:receiver-scenery-v1:${kit.fingerprint}`,
      triangles,
    });
    return Object.freeze({ ...world, targets: Object.freeze(targets) });
  } finally {
    base.dispose();
  }
}
