import { createNightweirBasinMaterial } from '../levels/nightweir/environment/basin-material.js';
import { createNacreOceanNormals } from '../levels/nacre/environment/ocean-normals.js';

// The seeded floodplains vary in elevation. Use the surveyed water triangles
// with the shipped sheltered-water finish and shared filtered ripple normals.
export function createDistrictWater({ owner }, { name, color }) {
  const ripples = createNacreOceanNormals(128);
  const clock = { value: 0 };
  const water = createNightweirBasinMaterial(clock, ripples, { name, color });
  owner.materials.add(water);
  return {
    water,
    ownedTextures: [ripples],
    update({ time, settings }) {
      if (settings?.reducedMotion) return;
      clock.value = time ?? 0;
    },
    dispose() {
      ripples.dispose();
    },
  };
}
