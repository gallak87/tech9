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

/** Canonical CC0 cliff scan. Load once; borrowed material maps are never disposed. */
export const opalineStoneURLs = Object.freeze({
  map: new URL(
    '../modules/opaline/assets/marble-cliff-01-color-2k.jpg',
    import.meta.url,
  ).href,
  normalMap: new URL(
    '../modules/opaline/assets/marble-cliff-01-normal-2k.jpg',
    import.meta.url,
  ).href,
  roughnessMap: new URL(
    '../modules/opaline/assets/marble-cliff-01-roughness-2k.jpg',
    import.meta.url,
  ).href,
  heightMap: new URL(
    '../modules/opaline/assets/marble-cliff-01-height-2k.png',
    import.meta.url,
  ).href,
});
export const opalineHeightFieldURL = new URL(
  '../modules/opaline/assets/marble-cliff-01-height-128.u16',
  import.meta.url,
).href;
export const opalineStoneMetrics = Object.freeze({
  source: 'https://polyhaven.com/a/marble_cliff_01',
  sourceTileSizeMeters: 4.299351692199707,
  tileSizeMeters: 16,
  textureScale: 1 / 16,
  heightRangeMeters: null, // The scan does not specify calibrated metric relief.
  heightFieldSize: 128,
  heightFieldDivisor: 65535,
  heightFieldEncoding: 'uint16-le',
  heightFieldRowOrder: 'bottom-to-top',
});

export {
  loadOpalineSculptures,
  opalineSculptureURLs,
} from '../modules/opaline/src/sculptures.js';
