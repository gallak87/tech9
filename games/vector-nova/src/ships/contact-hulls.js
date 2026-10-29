import { getCollisionHull as fleetHull } from './collision-hulls.js';
import { BOSS_HULLS } from './boss-hulls.js';
export { COLLISION_HULLS_ID } from './collision-hulls.js';

// The authored NPC proxy is independent of generated, approved fleet data.
export function getCollisionHull(id) {
  return Object.hasOwn(BOSS_HULLS, id) ? BOSS_HULLS[id] : fleetHull(id);
}
