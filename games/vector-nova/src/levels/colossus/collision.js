import {
  createCollisionWorld,
  indexedTriangles,
} from '../../physics/collision-world.js';
import { createColossusRoad } from './track/road.js';
export function createColossusCollisionWorld({ track }) {
  const triangles = [];
  const road = createColossusRoad({
    track,
    shape: true,
    collectSolid({ name, geometry, ...info }) {
      triangles.push(
        ...indexedTriangles(
          geometry.attributes.position.array,
          geometry.index.array,
          { id: name, ...info },
          undefined,
          geometry.attributes.roadCoord,
        ),
      );
    },
  });
  road.dispose();
  return createCollisionWorld({
    id: 'colossus-machine-surfaces',
    version: 1,
    geometryId: track.geometryVersion,
    triangles,
  });
}
