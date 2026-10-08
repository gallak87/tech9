import { collectProductionSolids } from '../../physics/production-solids.js';
import { createZephyrRoad } from './track/index.js';

export function createZephyrCollisionWorld({ track }) {
  return collectProductionSolids({
    track,
    id: 'zephyr-jump-solids',
    geometryId: 'production-corridors-v1',
    road: createZephyrRoad(track),
    uvScale: 2.5,
    select(object) {
      if (object.userData.drivingSurface) return { kind: 'deck' };
      if (/compact curb|curb cap/i.test(object.name))
        return { kind: 'rail', roadBoundary: true };
      if (
        /bridge shoulders|load-bearing keel|curb saddles|tension ties|landing direction pillar/i.test(
          object.name,
        )
      )
        return { kind: 'structure' };
      return null;
    },
  });
}
