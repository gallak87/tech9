import { createShoreline } from '../capabilities/pond-water/src/shoreline.js';

/** Authored scene choices; shared queries prevent independent shoreline rules. */
export const shoreline = createShoreline({
  excludeVegetation: (x, z) => Math.abs(x) < 2.8 && z > 15 && z < 31,
});
export const POND = shoreline.definition;
export const pondRadius = shoreline.radius;
export const shorePoint = shoreline.point;
export const isWater = shoreline.isWater;
export const isWalkable = shoreline.isWalkable;
export const vegetationAllowed = shoreline.vegetationAllowed;
export { shoreShape } from '../capabilities/pond-water/src/shoreline.js';

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
