import { collectProductionSolids } from '../../physics/production-solids.js';
import { buildGlasswakeRoad } from './track/production.js';

export function createGlasswakeCollisionWorld({ track }) {
  return collectProductionSolids({
    track,
    id: 'glasswake-jump-solids',
    geometryId: 'production-corridors-v2-flush-deck',
    road: buildGlasswakeRoad(track, { collisionOnly: true }),
    uvScale: 16,
    select(object) {
      if (object.userData.drivingSurface) return { kind: 'deck' };
      if (/blade plinth|blade fins|inward faces/i.test(object.name))
        return { kind: 'rail', roadBoundary: true };
      if (
        /cassette reveal walls|load rib|load chord|internal cassette rib|support|anchor shoes|fracture|landing/i.test(
          object.name,
        )
      )
        return { kind: 'structure' };
      return null;
    },
  });
}
