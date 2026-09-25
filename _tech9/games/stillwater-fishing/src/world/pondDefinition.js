/** One local authored shoreline, shared by terrain, vegetation, casting and walking. */
export const POND = Object.freeze({
  x: 0,
  z: -6,
  radiusX: 17,
  radiusZ: 23,
  level: -0.2,
});
export function shoreShape(angle) {
  return (
    1 + 0.055 * Math.sin(angle * 3 + 0.7) + 0.032 * Math.cos(angle * 5 - 0.4)
  );
}
export function pondRadius(x, z) {
  const dx = (x - POND.x) / POND.radiusX;
  const dz = (z - POND.z) / POND.radiusZ;
  return Math.hypot(dx, dz) / shoreShape(Math.atan2(dz, dx));
}
export function shorePoint(angle, radius = 1) {
  const shape = shoreShape(angle) * radius;
  return [
    POND.x + Math.cos(angle) * POND.radiusX * shape,
    POND.z + Math.sin(angle) * POND.radiusZ * shape,
  ];
}
export const isWater = (x, z) => pondRadius(x, z) < 0.96;
export const isWalkable = (x, z) => pondRadius(x, z) > 1.045;
export const vegetationAllowed = (x, z, margin = 1.13) =>
  pondRadius(x, z) > margin && !(Math.abs(x) < 2.8 && z > 15 && z < 31);

/** x, z, scale x/y/z, yaw. Rendering and walking derive from these same placements. */
export const BANK_ROCKS = Object.freeze(
  [
    [-3.8, 14.4, 1.25, 0.76, 0.93, 0.5],
    [-5.15, 14.7, 0.78, 0.53, 0.71, 1.2],
    [-3.0, 15.35, 0.42, 0.3, 0.61, 2.1],
    [4.1, 15.7, 0.76, 0.5, 0.72, 1.8],
    [-5.8, 18.1, 0.93, 0.59, 0.76, 0.7],
  ].map((rock) => Object.freeze(rock)),
);
