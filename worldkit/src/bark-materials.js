/** Bark-only canonical URLs for consumers that do not need the complete art kit. */
export const BARK_MATERIAL_ASSETS = Object.freeze({
  barkColor: new URL(
    '../modules/landscape/assets/art/textures/bark_brown_02_diff_1k.jpg',
    import.meta.url,
  ).href,
  barkNormal: new URL(
    '../modules/landscape/assets/art/textures/bark_brown_02_nor_gl_1k.jpg',
    import.meta.url,
  ).href,
  barkRoughness: new URL(
    '../modules/landscape/assets/art/textures/bark_brown_02_rough_1k.jpg',
    import.meta.url,
  ).href,
});
