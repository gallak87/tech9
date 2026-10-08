import { collectProductionSolids } from '../../physics/production-solids.js';
import { buildUmbraRoad } from './track/production.js';

export function createUmbraCollisionWorld({ track }) {
  return collectProductionSolids({
    track,
    id: 'umbra-jump-solids',
    geometryId: 'production-corridors-v1',
    road: buildUmbraRoad(track),
    uvScale: 16,
    select(object) {
      if (/segmented graphite facets/.test(object.name))
        return { kind: 'deck', uvScale: 1 };
      if (object.userData.drivingSurface) return { kind: 'deck' };
      if (/impact curb|formed metal curbs/i.test(object.name))
        return { kind: 'rail', roadBoundary: true };
      if (/deck sides and bottom|structural modules/i.test(object.name))
        return { kind: 'structure' };
      return null;
    },
  });
}
