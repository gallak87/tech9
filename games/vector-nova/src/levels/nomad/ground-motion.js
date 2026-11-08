import { Vector3 } from 'three';
import { NOMAD_MOTION_RULES } from './motion.js';

export const NOMAD_GROUND_GROUP = 'nomad-ground';

/** In the convoy frame, fixed salt landmarks travel backward along the grade.
 * The infinite salt plane is invariant under this same tangent translation.
 */
export function sampleNomadGroundMotion(track, time = 0) {
  const speed = NOMAD_MOTION_RULES.convoySpeed;
  const velocity = new Vector3(0, track.saltPlane.grade * speed, -speed);
  return { translation: velocity.clone().multiplyScalar(time), velocity };
}
