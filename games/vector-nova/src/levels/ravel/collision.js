import { collectProductionSolids } from '../../physics/production-solids.js';
import { createRavelRoad } from './track/road.js';

export function createRavelCollisionWorld({ track }) {
  return collectProductionSolids({
    track,
    id: 'ravel-sail-solids',
    geometryId: 'ravel-fixed-skin-v2-8m-across-live-bays-analytic',
    fullDeck: true,
    road: createRavelRoad({ track, collisionOnly: true }),
    select(object) {
      // Live membrane support is sampled at each actor's own simulation clock.
      // A baked time-zero triangle must never override the moving road.
      if (object.userData.drivingSurface && !object.userData.deforming)
        return { kind: 'deck' };
      return null;
    },
  });
}
