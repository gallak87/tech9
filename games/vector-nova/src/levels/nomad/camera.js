import { MathUtils } from 'three';

/** Preview the lower carrier while retaining ceiling clearance inside a hold.
 * The cap follows the actual eye station and carrier-local roof, so it also
 * works as the new departure ramps rise out through the bow portal.
 */
export function nomadJumpPreviewHeight(track, state, jump) {
  if (!jump) return 10;
  const from = track.sample(jump.takeoff).position;
  const to = track.sample(jump.landingStart).position;
  const scale = MathUtils.smoothstep(from.distanceTo(to), 180, 450);
  // A deep receiver needs an eye above the rising launch deck's silhouette.
  const drop = Math.max(0, from.y - to.y);
  const height =
    MathUtils.lerp(22, 42, scale) + 28 * MathUtils.smoothstep(drop, 260, 350);
  const station = state.distance - 32 - state.speed * 0.025;
  const carrier = track.carrierAt(station);
  const frame = track.sample(station);
  const inverse = carrier.quaternion.clone().invert();
  const local = frame.position
    .clone()
    .addScaledVector(frame.right, (state.lateral ?? 0) * 0.83)
    .sub(carrier.origin)
    .applyQuaternion(inverse)
    .divide(carrier.scale);
  if (Math.abs(local.x) >= 65 || Math.abs(local.z) >= 380 || local.y >= 130)
    return height;
  const rise = frame.up
    .clone()
    .applyQuaternion(inverse)
    .divide(carrier.scale).y;
  if (rise <= 0.1) return height;
  return Math.max(3, Math.min(height, (124 - local.y) / rise));
}

export const NOMAD_CAMERA = {
  preserveFlightView: true,
  chaseHeight: 10,
  chaseDistance: 19,
  lookAhead: (track, state) =>
    track.carrierAt(state.distance).mode === 'cargo' ? 65 : 85,
  jumpPreview: { distance: 360, height: nomadJumpPreviewHeight, back: 32 },
  flightViewScale: 1,
  flightChaseBlend: 0.25,
  safeFrame: { left: -0.86, right: 0.86, bottom: -0.62, top: 0.8 },
};
