import { getCollisionHull as fleetHull } from './collision-hulls.js';
import { GOLIATH_HULL } from './interceptor-target-hull.js';
export { COLLISION_HULLS_ID } from './collision-hulls.js';

// The authored NPC proxy is independent of generated, approved fleet data.
export function getCollisionHull(id) {
  return id === 'goliath' ? GOLIATH_HULL : fleetHull(id);
}
