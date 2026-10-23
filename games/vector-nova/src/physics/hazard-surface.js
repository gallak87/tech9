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
    drag:
      Math.min(
        HAZARD_SURFACE_RULES.maximumDrag,
        (Number.isFinite(speed) ? Math.max(0, speed) : 0) *
          HAZARD_SURFACE_RULES.resistance,
      ) * strength,
    thrustScale: 1 - HAZARD_SURFACE_RULES.thrustLoss * strength,
  };
}
