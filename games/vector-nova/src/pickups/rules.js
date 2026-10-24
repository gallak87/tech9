// Shared authored lifetimes for gameplay and presentation-only previews.
export const AEGIS_DURATION = 6;
export const AEGIS_BREAK_DURATION = 0.65;

// Collision pulses keep their established height. Their visible discharge sits
// just below the hull's hover datum, centered along the ship rather than aft.
export const ARC_SHOT_HEIGHT = 0.3;
export const ARC_MUZZLE_HEIGHT = -0.15;
export const ARC_TARGET_HALF_LENGTH = 4.5;
export const LANCE_SPEED = 490;
export const LANCE_LIFETIME = 1.1;

// Ion uses the same road-local contact footprint for damage and visual exposure.
export const ION_WAKE_RADIUS = 4.3;
export const ION_WAKE_HEIGHT = 2.5;
