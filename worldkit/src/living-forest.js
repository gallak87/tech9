/** Original cloud-forest art; no legacy forest assets or renderer ownership. */
export {
  createLivingForestKit,
  createLivingForestMaterials,
  createWoodGeometry,
  createLeafGeometry,
  createRockGeometry,
} from '../modules/living-forest/src/index.js';
export { createLivingHollow } from '../modules/living-forest/src/hollow.js';

/** Canonical generated bark color image; consumers own loading and texture lifetime. */
export const livingForestBarkURL = new URL(
  '../modules/living-forest/assets/silver-bark-color-v1.png',
  import.meta.url,
).href;

/** Original generated RGBA spray with genuine transparent cutout gaps. */
export const livingForestLeafURL = new URL('../modules/living-forest/assets/leaf-spray-v1.png', import.meta.url).href;
