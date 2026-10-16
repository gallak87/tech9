import {
  createCollisionWorld,
  indexedTriangles,
} from '../../physics/collision-world.js';
import { createNightweirRoad } from './track/road.js';
import mineral from '../../../assets/levels/nightweir/collision-kit.json' with { type: 'json' };
const worlds = new WeakMap();
export function createNightweirCollisionWorld({ track }) {
  if (worlds.has(track)) return worlds.get(track);
  const triangles = [],
    targets = [];
  const road = createNightweirRoad({
    track,
    collectSolid({ name, geometry, matrix, ...info }) {
      const positions = geometry.attributes.position.array,
        indices =
          geometry.index?.array ??
          Array.from({ length: positions.length / 3 }, (_, i) => i);
      const id = 'nightweir-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
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
  for (const triangle of indexedTriangles(
    mineral.positions.flat(),
    mineral.indices,
    {
      id: mineral.id,
      kind: 'structure',
    },
  ))
    triangles.push(triangle);
  const bounds = mineral.positions.reduce(
    (b, p) => {
      for (let i = 0; i < 3; i++) {
        b.min[i] = Math.min(b.min[i], p[i]);
        b.max[i] = Math.max(b.max[i], p[i]);
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
    name: 'Nightweir / inhabited stormwater city and gates',
    kind: 'structure',
    min: bounds.min,
    max: bounds.max,
  });
  const world = createCollisionWorld({
    id: 'nightweir-sprint-solids',
    version: 3,
    geometryId: track.geometryVersion + ':blender-v3',
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
