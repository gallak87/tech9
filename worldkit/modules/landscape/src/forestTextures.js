import * as THREE from 'three';
import { LANDSCAPE_ASSETS } from './landscapeAssetURLs.js';

export async function loadForestTextures(renderer, assetURL) {
  const loader = new THREE.TextureLoader();
  const names = [
    'forest-floor-color.jpg',
    'forest-floor-normal.jpg',
    'forest-floor-roughness.jpg',
    'path-color.jpg',
    'path-normal.jpg',
    'path-roughness.jpg',
  ];
  const results = await Promise.allSettled(
    names.map(async (name) => {
      const texture = await loader.loadAsync(
        assetURL
          ? new URL(`textures/${name}`, assetURL).href
          : LANDSCAPE_ASSETS[`textures/${name}`],
      );
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = Math.min(
        8,
        renderer.capabilities.getMaxAnisotropy(),
      );
      if (name.includes('color')) texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    }),
  );
  const failed = results.find((result) => result.status === 'rejected');
  if (failed) {
    for (const result of results)
      if (result.status === 'fulfilled') result.value.dispose();
    throw failed.reason;
  }
  return results.map((result) => result.value);
}
