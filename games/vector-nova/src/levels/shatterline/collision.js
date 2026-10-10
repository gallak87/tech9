import {
  createCollisionWorld,
  indexedTriangles,
} from '../../physics/collision-world.js';
import { createShatterlineRoad } from './track/road.js';
import { createShatterlineSceneryTriangles } from './environment/placements.js';
import { createShatterlineTerrainTriangles } from './environment/terrain.js';
import { createShatterlinePoleLightTriangles } from './environment/pole-lights.js';

const worlds = new WeakMap();
export function createShatterlineCollisionWorld({ track }) {
  if (worlds.has(track)) return worlds.get(track);
  const triangles = [],
    targets = [];
  const road = createShatterlineRoad({
    track,
    collectSolid({ name, geometry, matrix, ...info }) {
      const positions = geometry.attributes.position.array;
      const indices =
        geometry.index?.array ??
        Array.from({ length: positions.length / 3 }, (_, i) => i);
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      triangles.push(
        ...indexedTriangles(positions, indices, { id, ...info }, matrix),
      );
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox.clone();
      if (matrix) bounds.applyMatrix4(matrix);
      targets.push({
        id,
        name,
        kind: info.kind,
        min: bounds.min.toArray(),
        max: bounds.max.toArray(),
      });
    },
  });
  road.dispose();
  for (const group of [
    createShatterlineSceneryTriangles(track),
    createShatterlineTerrainTriangles(track),
    createShatterlinePoleLightTriangles(track),
  ])
    for (const triangle of group) triangles.push(triangle);
  const world = createCollisionWorld({
    id: 'shatterline-production-solids',
    version: 6,
    geometryId: `${track.geometryVersion}:road-v3:environment-v7`,
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
