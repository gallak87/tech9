import * as THREE from 'three';
import { SharedKTX2Loader } from '../../../assets/ktx2-loader.js';
import { assetURL } from '../../../assets/url.js';

// A single owned set serves Cindercoil road cassettes and their structural bodies.
// UVs are metres; the grain remains square through bends and the furnace roll.
export const CERAMIC_REPEAT = Object.freeze([3, 3]);
export function createCindercoilCeramicMaps(renderer, materials) {
  const textures = new Set();
  let disposed = false;
  const manager = new THREE.LoadingManager();
  const loader = renderer
    ? new SharedKTX2Loader(manager).detectSupport(renderer)
    : null;
  const ready = loader
    ? Promise.allSettled(
        ['color', 'normal', 'arm'].map(async (name) => {
          const texture = await loader.loadAsync(
            assetURL(`assets/levels/cindercoil/ceramic/${name}.ktx2`),
          );
          if (disposed) {
            texture.dispose();
            return null;
          }
          texture.name = `Cindercoil heat ceramic / ${name}`;
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(1 / CERAMIC_REPEAT[0], 1 / CERAMIC_REPEAT[1]);
          texture.anisotropy = Math.min(
            8,
            renderer.capabilities.getMaxAnisotropy(),
          );
          texture.colorSpace =
            name === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          textures.add(texture);
          return texture;
        }),
      )
        .then((results) => {
          const failure = results.find(
            (result) => result.status === 'rejected',
          );
          if (failure)
            throw new Error('Cindercoil ceramic finish failed to load', {
              cause: failure.reason,
            });
          if (disposed) return;
          const [color, normal, arm] = results.map((result) => result.value);
          for (const material of materials) {
            material.map = color;
            material.normalMap = normal;
            if (material.isMeshPhysicalMaterial)
              material.clearcoatNormalMap = normal;
            material.roughnessMap = arm;
            material.needsUpdate = true;
          }
        })
        .finally(() => loader.dispose())
    : Promise.resolve();
  return {
    ready,
    dispose() {
      if (disposed) return;
      disposed = true;
      manager.abort();
      textures.forEach((texture) => texture.dispose());
      textures.clear();
    },
  };
}
