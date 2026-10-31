import { collectProductionSolids } from '../../physics/production-solids.js';
import { buildNacreTrack } from './track/production.js';

export function createNacreCollisionWorld({ track }) {
  return collectProductionSolids({
    track,
    id: 'nacre-jump-solids',
    geometryId: 'pressure-causeway-v2-flush-panels',
    road: buildNacreTrack(track),
    select(object) {
      if (object.userData.drivingSurface) return { kind: 'deck' };
      if (/curb|containment fins|gill spines/.test(object.name))
        return { kind: 'rail', roadBoundary: true };
      if (
        /running bed|hull cheeks|deep keel|fin footing|under-ribs|support shoulders|catch engineering/.test(
          object.name,
        )
      )
        return { kind: 'structure' };
      return null;
    },
  });
}
