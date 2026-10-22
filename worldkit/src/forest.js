export {
  LANDSCAPE_ASSETS,
  FOREST_KIT_URL,
  loadForestKit,
  disposeForestKit,
  loadForestTextures,
  prepareForestParts,
} from '../modules/landscape/src/forestAssets.js';
export { FOREST_MATERIAL_ASSETS } from './forest-materials.js';
export { softenShadowSampling } from '../modules/landscape/src/softShadows.js';
export { BARK_MATERIAL_ASSETS } from './bark-materials.js';

export const ROCK_FORMS_URL = new URL('../modules/landscape/assets/runtime/rock-forms.glb', import.meta.url).href;
