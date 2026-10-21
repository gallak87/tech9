import { collectProductionSolids } from '../../physics/production-solids.js';
import { createVesperRoad } from './track/road.js';

export function createVesperCollisionWorld({ track }) {
  return collectProductionSolids({
    track,
    id: 'vesper-forest-jump-solids',
    geometryId: 'cast-ribbon-v2-road-only',
    road: createVesperRoad({ track }),
    select(object) {
      if (object.userData.drivingSurface) return { kind: 'deck' };
      if (/resin curb|protective divider/.test(object.name))
        return { kind: 'rail', roadBoundary: true };
      if (/resin sides and underside|reinforcement joints/.test(object.name))
        return { kind: 'structure' };
      return null;
    },
  });
}
