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
