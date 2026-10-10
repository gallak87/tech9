// Propulsion only. Steering, grip, braking, reserve and airborne forces retain
// the shared fleet handling; downhill momentum is never clamped at a lip.
export const SHATTERLINE_PACE = Object.freeze({
  cruiseScale: 1.25,
  boostScale: 1.15,
  aerodynamicDragScale: 0.55,
  overspeedDeceleration: 0.4,
});
