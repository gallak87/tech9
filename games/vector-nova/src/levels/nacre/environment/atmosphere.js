import * as T from 'three';

export const NACRE_AIR_COLOR = new T.Color('#81959a');
export const NACRE_WATER_COLOR = new T.Color('#174957');
export const NACRE_HORIZON_COLOR = new T.Color(0.07, 0.115, 0.145);
// The generated panorama's pearl eye is at u=.81; share its azimuth alignment
// between direct sky radiance and the ocean's borrowed reflection sampler.
export const NACRE_SKY_YAW = 0.81 - Math.atan2(0.42, -0.55) / (Math.PI * 2);

// Actual camera height, never race distance, controls both fog and sky.
export function sampleNacreWater(cameraY, waterY = 0) {
  const submerged = 1 - T.MathUtils.smoothstep(cameraY - waterY, -8, 4);
  const depth = Math.max(0, waterY - cameraY);
  // Salt-laden air gives distant spires depth without washing out nearby road.
  // Higher exposed reaches retain a clearer view over the low marine layer.
  const airDensity = T.MathUtils.lerp(
    0.00034,
    0.00028,
    T.MathUtils.smoothstep(cameraY - waterY, 55, 240),
  );
  return {
    submerged,
    depth,
    fogDensity: T.MathUtils.lerp(
      airDensity,
      0.0025 + Math.min(depth / 100, 1) * 0.001,
      submerged,
    ),
  };
}

export function nacreWaterCrossingBlend(cameraY, waterY = 0) {
  return T.MathUtils.smoothstep(Math.abs(cameraY - waterY), 6, 18);
}

// Mirrors the surface shader's world-space fade for numerical crossing checks.
export function nacreWaterLocalVisibility(
  cameraY,
  surfaceDistance,
  waterY = 0,
) {
  return T.MathUtils.lerp(
    T.MathUtils.smoothstep(surfaceDistance, 35, 110),
    1,
    nacreWaterCrossingBlend(cameraY, waterY),
  );
}
