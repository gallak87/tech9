import * as T from 'three';

// Established arcade collision envelope, independent of the selected chassis.
export const VEHICLE_HULL = Object.freeze({
  halfWidth: 2.25,
  halfLength: 3.5,
  hover: 0.72,
});

export function headingExtents(heading = 0, hull = VEHICLE_HULL) {
  return {
    lateral:
      Math.abs(Math.cos(heading)) * hull.halfWidth +
      Math.abs(Math.sin(heading)) * hull.halfLength,
    longitudinal:
      Math.abs(Math.cos(heading)) * hull.halfLength +
      Math.abs(Math.sin(heading)) * hull.halfWidth,
  };
}

export function sweptLateralExtent(before, after, hull = VEHICLE_HULL) {
  const lower = Math.min(before, after),
    upper = Math.max(before, after);
  const peak = Math.atan2(hull.halfLength, hull.halfWidth);
  for (const angle of [peak, -peak])
    if (
      Math.ceil((lower - angle) / Math.PI) <=
      Math.floor((upper - angle) / Math.PI)
    )
      return Math.hypot(hull.halfWidth, hull.halfLength);
  return Math.max(
    headingExtents(before, hull).lateral,
    headingExtents(after, hull).lateral,
  );
}

export const hullAxes = (quaternion) => [
  new T.Vector3(1, 0, 0).applyQuaternion(quaternion),
  new T.Vector3(0, 1, 0).applyQuaternion(quaternion),
  new T.Vector3(0, 0, 1).applyQuaternion(quaternion),
];

export function projectedHullExtent(
  quaternion,
  direction,
  hull = VEHICLE_HULL,
) {
  const axes = hullAxes(quaternion);
  return (
    Math.abs(axes[0].dot(direction)) * hull.halfWidth +
    Math.abs(axes[1].dot(direction)) * hull.hover +
    Math.abs(axes[2].dot(direction)) * hull.halfLength
  );
}
