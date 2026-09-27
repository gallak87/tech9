/** One shape contract shared by CPU placement and the water fragment shader. */
export const SHORE_HARMONICS = Object.freeze({
  sinAmplitude: 0.055,
  sinFrequency: 3,
  sinPhase: 0.7,
  cosAmplitude: 0.032,
  cosFrequency: 5,
  cosPhase: -0.4,
});
const h = SHORE_HARMONICS;
const glsl = (value) =>
  Number.isInteger(value) ? `${value}.0` : String(value);
export const SHORE_GLSL = `float shoreShape(float angle) {
  return 1.0 + ${glsl(h.sinAmplitude)} * sin(angle * ${glsl(h.sinFrequency)} + ${glsl(h.sinPhase)})
    + ${glsl(h.cosAmplitude)} * cos(angle * ${glsl(h.cosFrequency)} + ${glsl(h.cosPhase)});
}`;
export function shoreShape(angle) {
  return (
    1 +
    h.sinAmplitude * Math.sin(angle * h.sinFrequency + h.sinPhase) +
    h.cosAmplitude * Math.cos(angle * h.cosFrequency + h.cosPhase)
  );
}

/** Metres, +Y up. The immutable frame is passed to both geometry and shader. */
export function createShoreline({
  x = 0,
  z = -6,
  radiusX = 17,
  radiusZ = 23,
  level = -0.2,
  excludeVegetation = () => false,
} = {}) {
  if (
    ![x, z, radiusX, radiusZ, level].every(Number.isFinite) ||
    radiusX <= 0 ||
    radiusZ <= 0
  )
    throw new TypeError(
      'Shoreline requires finite coordinates/level and positive radii.',
    );
  if (typeof excludeVegetation !== 'function')
    throw new TypeError('excludeVegetation must be a function.');
  const definition = Object.freeze({ x, z, radiusX, radiusZ, level });
  const radius = (px, pz) => {
    const dx = (px - x) / radiusX,
      dz = (pz - z) / radiusZ;
    return Math.hypot(dx, dz) / shoreShape(Math.atan2(dz, dx));
  };
  const point = (angle, scale = 1) => {
    const shape = shoreShape(angle) * scale;
    return [
      x + Math.cos(angle) * radiusX * shape,
      z + Math.sin(angle) * radiusZ * shape,
    ];
  };
  return Object.freeze({
    definition,
    radius,
    point,
    isWater: (px, pz) => radius(px, pz) < 0.96,
    isWalkable: (px, pz) => radius(px, pz) > 1.045,
    vegetationAllowed: (px, pz, margin = 1.13) =>
      radius(px, pz) > margin && !excludeVegetation(px, pz),
    terrainHeight(px, pz, outerHeight) {
      const r = radius(px, pz);
      if (r <= 1) return level - 1.3 * (1 - r ** 3);
      const t = Math.min(1, (r - 1) / 0.27);
      const rim = level + 0.9 * Math.sin((t * Math.PI) / 2);
      const blend = Math.max(0, Math.min(1, (r - 1.27) / 0.45));
      return rim * (1 - blend) + outerHeight(px, pz) * blend;
    },
  });
}
