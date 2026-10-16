import {
  createCollisionWorld,
  indexedTriangles,
} from '../../physics/collision-world.js';
import { createWorldspireRoad } from './track/road.js';
import mineral from '../../../assets/levels/worldspire/collision-kit.json' with { type: 'json' };
const worlds = new WeakMap();
export function createWorldspireCollisionWorld({ track }) {
  if (worlds.has(track)) return worlds.get(track);
  const triangles = [],
    targets = [];
  const road = createWorldspireRoad({
    track,
    collectSolid({ name, geometry, matrix, ...info }) {
      const positions = geometry.attributes.position.array,
        indices =
          geometry.index?.array ??
          Array.from({ length: positions.length / 3 }, (_, i) => i);
      const id = 'worldspire-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      triangles.push(
        ...indexedTriangles(positions, indices, { id, ...info }, matrix),
      );
      geometry.computeBoundingBox();
      targets.push({
        id,
        name,
        kind: info.kind,
        min: geometry.boundingBox.min.toArray(),
        max: geometry.boundingBox.max.toArray(),
      });
    },
  });
  road.dispose();
  // Keep large exported worlds below JavaScript's argument-count ceiling.
  for (const triangle of indexedTriangles(
    mineral.positions.flat(),
    mineral.indices,
    {
      id: mineral.id,
      kind: 'structure',
    },
  ))
    triangles.push(triangle);
  const bounds =
    mineral.bounds ??
    mineral.positions.reduce(
      (b, p) => {
        for (let axis = 0; axis < 3; axis++) {
          b.min[axis] = Math.min(b.min[axis], p[axis]);
          b.max[axis] = Math.max(b.max[axis], p[axis]);
        }
        return b;
      },
      {
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity],
      },
    );
  targets.push({
    id: mineral.id,
    name: 'Worldspire / monolith, twin passages and Root Gate',
    kind: 'structure',
    min: bounds.min,
    max: bounds.max,
  });
  const world = createCollisionWorld({
    id: 'worldspire-sprint-solids',
    version: 1,
    geometryId:
      track.geometryVersion + ':blender-' + (mineral.geometryDigest ?? 'v5'),
    triangles,
  });
  const owner = {
    ...world,
    targets,
    dispose() {
      worlds.delete(track);
      world.dispose();
    },
  };
  worlds.set(track, owner);
  return owner;
}
