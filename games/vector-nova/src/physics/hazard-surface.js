import { toughness } from '../progression/catalog.js';
// Full exposure matches the forward bite of Colossus's crossfeed grinders.
// The level owns contact/coverage and its authored severity; AI difficulty never
// changes these forces. Speed-scaled resistance leaves a way out at low speed.
export const HAZARD_SURFACE_RULES = Object.freeze({
  version: 1,
  resistance: 1.45,
  maximumDrag: 100,
  thrustLoss: 0.55,
});
const clamp = (value) => Math.max(0, Math.min(1, value));
export function sampleHazardSurface(speed, severity, exposure = 1) {
  const strength = clamp(severity) * clamp(exposure);
  return {
    hazard: true,
    drag:
      Math.min(
        HAZARD_SURFACE_RULES.maximumDrag,
        (Number.isFinite(speed) ? Math.max(0, speed) : 0) *
          HAZARD_SURFACE_RULES.resistance,
      ) * strength,
    thrustScale: 1 - HAZARD_SURFACE_RULES.thrustLoss * strength,
  };
}

// Authored surface hazards opt in. Physical contacts never pass through here.
export function mitigateHazardSurface(surface, state) {
  const reduction = toughness(state);
  if (!surface?.hazard || !reduction) return surface;
  return {
    ...surface,
    drag: (surface.drag ?? 0) * (1 - reduction),
    thrustScale: 1 - (1 - (surface.thrustScale ?? 1)) * (1 - reduction),
    ...(surface.grip < 1
      ? { grip: 1 - (1 - surface.grip) * (1 - reduction) }
      : {}),
    ...(surface.lateralAcceleration == null
      ? {}
      : { lateralAcceleration: surface.lateralAcceleration * (1 - reduction) }),
    ...(surface.forwardAcceleration < 0
      ? { forwardAcceleration: surface.forwardAcceleration * (1 - reduction) }
      : {}),
  };
}
