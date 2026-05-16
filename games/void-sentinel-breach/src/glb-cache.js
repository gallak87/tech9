import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import GEO_MANIFEST from '../geo-manifest.json';

const _cache = new Map();
const _loader = new GLTFLoader();

// Preload all entities in geo-manifest that have an assetPath field.
// Safe to call before the game loop — uses Promise chain so caller can .then().
export async function preloadGLBs() {
  for (const def of Object.values(GEO_MANIFEST.entities)) {
    if (!def.assetPath) continue;
    try {
      const gltf = await _loader.loadAsync(def.assetPath);
      gltf.scene.traverse(c => {
        if (!c.isMesh) return;
        if (c.material.emissive) {
          // Stamp both intensity AND color so _restoreColors can fully undo hit-flash
          c.material.userData.baseEmissive = c.material.emissiveIntensity;
          c.material.userData.baseEmissiveColor = c.material.emissive.clone();
          c.userData.origColor = c.material.color.clone();
        }
      });
      _cache.set(def.assetPath, gltf.scene);
    } catch (e) {
      console.warn(`[glb] failed to load ${def.assetPath}:`, e);
    }
  }
  console.log('[glb] preload complete', [..._cache.keys()]);
}

// Returns a deep clone with per-instance materials (required for hit-flash isolation).
export function getGLBClone(assetPath) {
  const template = _cache.get(assetPath);
  if (!template) return null;
  const clone = template.clone(true);
  clone.traverse(c => { if (c.isMesh) c.material = c.material.clone(); });
  return clone;
}
