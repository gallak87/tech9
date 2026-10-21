import { BARK_MATERIAL_ASSETS } from './bark-materials.js';
/** Canonical source images. Color maps use sRGB; normal/roughness remain linear. */
export const FOREST_MATERIAL_ASSETS = Object.freeze({
  ...BARK_MATERIAL_ASSETS,
  rockColor: new URL(
    '../modules/landscape/assets/art/textures/forest-granite-diff.jpg',
    import.meta.url,
  ).href,
  rockNormal: new URL(
    '../modules/landscape/assets/art/textures/rock_boulder_cracked_nor_gl_1k.jpg',
    import.meta.url,
  ).href,
  rockRoughness: new URL(
    '../modules/landscape/assets/art/textures/rock_boulder_cracked_rough_1k.jpg',
    import.meta.url,
  ).href,
  pineSpray: new URL(
    '../modules/landscape/assets/art/textures/pine-spray.png',
    import.meta.url,
  ).href,
  endgrainColor: new URL(
    '../modules/landscape/assets/art/textures/timber-endgrain.jpg',
    import.meta.url,
  ).href,
});
