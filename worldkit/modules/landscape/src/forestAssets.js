// Compatibility facade: canonical helpers are split so narrow consumers do not
// pull optional floor/path assets into their Vite build.
export {
  loadForestKit,
  disposeForestKit,
  prepareForestParts,
} from './forestKit.js';
export { loadForestTextures } from './forestTextures.js';
export { LANDSCAPE_ASSETS } from './landscapeAssetURLs.js';
export { FOREST_KIT_URL } from './forestKitURL.js';
