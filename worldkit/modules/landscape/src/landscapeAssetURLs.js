import { FOREST_KIT_URL } from './forestKitURL.js';
export const LANDSCAPE_ASSETS = Object.freeze({
  'forest-kit.glb': FOREST_KIT_URL,
  'textures/forest-floor-color.jpg': new URL(
    '../assets/runtime/textures/forest-floor-color.jpg',
    import.meta.url,
  ).href,
  'textures/forest-floor-normal.jpg': new URL(
    '../assets/runtime/textures/forest-floor-normal.jpg',
    import.meta.url,
  ).href,
  'textures/forest-floor-roughness.jpg': new URL(
    '../assets/runtime/textures/forest-floor-roughness.jpg',
    import.meta.url,
  ).href,
  'textures/path-color.jpg': new URL(
    '../assets/runtime/textures/path-color.jpg',
    import.meta.url,
  ).href,
  'textures/path-normal.jpg': new URL(
    '../assets/runtime/textures/path-normal.jpg',
    import.meta.url,
  ).href,
  'textures/path-roughness.jpg': new URL(
    '../assets/runtime/textures/path-roughness.jpg',
    import.meta.url,
  ).href,
});
