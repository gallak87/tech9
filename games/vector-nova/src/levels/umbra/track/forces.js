import * as T from 'three';
import { RING_CENTER } from '../environment/constants.js';

const smooth = (x) => {
  const t = T.MathUtils.clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

// Explicit authored intervals. Neither quality nor presentation changes forces.
export function tidalResponse(track, distance, lateral = 0) {
  const s = ((distance % track.length) + track.length) % track.length;
  const zone = track.tidalZones?.find(
    (item) => s >= item.start && s < item.end,
  );
  if (!zone)
    return {
      active: false,
      strength: 0,
      lateralAcceleration: 0,
      forwardAcceleration: 0,
      zone: null,
    };
  const edge = zone.ramp ?? Math.min(65, (zone.end - zone.start) / 3);
  const strength =
    (zone.strength ?? 4) *
    smooth((s - zone.start) / edge) *
    smooth((zone.end - s) / edge);
  const frame = track.sample(distance);
  const direction = new T.Vector3(...RING_CENTER)
    .sub(frame.position)
    .addScaledVector(frame.right, -lateral)
    .normalize();
  return {
    active: strength > 0.001,
    zone: zone.id,
    strength,
    lateralAcceleration: direction.dot(frame.right) * strength,
    forwardAcceleration: direction.dot(frame.tangent) * strength * 0.25,
  };
}

// Each crossing specifies a bounded world field, not a target-seeking controller.
// Position and velocity are integrated by shared swept flight; misses remain real.
export function airborneGravity({ jump, position }) {
  if (jump.airAcceleration) return new T.Vector3(...jump.airAcceleration);
  const center = new T.Vector3(...(jump.gravityCenter ?? RING_CENTER));
  const delta = center.sub(position);
  delta.y = 0;
  return delta.normalize().multiplyScalar(jump.gravityStrength ?? 22);
}
