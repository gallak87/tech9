/** Reusable porcelain geology; placement, route surfaces and lighting stay with the game. */
export {
  createOpalineKit,
  createOpalineMaterials,
  createOpalineMassGeometry,
  createOpalineArchGeometry,
} from '../modules/opaline/src/index.js';
/** Canonical original color image. Consumers own loading and texture lifetime. */
export const opalineStoneURL = new URL(
  '../modules/opaline/assets/porcelain-color-v1.png',
  import.meta.url,
).href;
