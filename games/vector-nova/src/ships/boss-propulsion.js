import { MathUtils } from 'three';

// Call once after the existing shared propulsion.update(frame). This utility
// owns no geometry/materials and leaves approved ordinary-rival defaults alone.
// Mouth radii follow the factory's explicit Exhaust_L/R/C anchor order.
export function fitBossPropulsion(propulsion, frame, scale, mouthRadii) {
  const { group } = propulsion;
  if (group.userData.quality !== 'low') {
    for (const plume of group.children) plume.scale.multiply(scale);
    return;
  }
  // Low's six-sided cone has a 0.28 m root and constant shared opacity. Large
  // boss multipliers otherwise turn it into an opaque plate across the mouth.
  const pressure = group.userData.pressure;
  const velocity = MathUtils.clamp((frame.speed ?? 0) / 150, 0, 1);
  const thrust = MathUtils.lerp(
    MathUtils.smoothstep(velocity, 0.08, 0.65),
    1,
    pressure,
  );
  for (let index = 0; index < group.children.length; index++) {
    const plume = group.children[index];
    const mouthRadius = mouthRadii[index];
    if (!Number.isFinite(mouthRadius) || mouthRadius <= 0)
      throw new Error(
        'Boss propulsion requires a positive radius for every exhaust mouth',
      );
    const width = (mouthRadius * 0.42) / 0.28;
    plume.scale.x *= width;
    plume.scale.y *= width;
    plume.scale.z *= scale.z;
    // A visible idle core keeps Low's powered blue cue without filling the
    // aperture. Driving/full-boost endpoints retain the existing translucency.
    plume.material.opacity =
      Math.min(0.7, 0.18 + thrust * 0.295 + pressure * 0.22) *
      MathUtils.clamp(
        Number.isFinite(frame.drivePower) ? frame.drivePower : 1,
        0,
        1,
      );
  }
}
