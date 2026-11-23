import { collectProductionSolids } from '../../physics/production-solids.js';
import { createVesperRoad } from './track/road.js';

export function createVesperCollisionWorld({ track }) {
  return collectProductionSolids({
    track,
    id: 'vesper-forest-jump-solids',
    geometryId: 'cast-ribbon-v3-deck-owned-decals',
    fullDeck: true,
    road: createVesperRoad({ track }),
  });
}
