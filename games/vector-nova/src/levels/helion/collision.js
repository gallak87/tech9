import { collectProductionSolids } from '../../physics/production-solids.js';
import { buildHelionRoad } from './track/index.js';

export function createHelionCollisionWorld({ track }) {
  return collectProductionSolids({
    track,
    id: 'helion-jump-solids',
    geometryId: 'production-corridors-v1',
    road: buildHelionRoad(track),
    uvScale: 16,
    select(object) {
      if (object.userData.drivingSurface) return { kind: 'deck' };
      if (/graphite curbs|edge service caps/i.test(object.name))
        return { kind: 'rail', roadBoundary: true };
      if (
        /slab edges and underside|load spines|feather root|root clamps|support pier|pier lattice|cantilever truss roots|support collar|shield anchor load braces|vault lip|receiving deck root/i.test(
          object.name,
        )
      )
        return { kind: 'structure' };
      return null;
    },
  });
}
