import * as THREE from 'three';
import { SharedKTX2Loader } from '../../../assets/ktx2-loader.js';
import { assetURL } from '../../../assets/url.js';

// ambientCG Terrazzo019S, CC0; source and deterministic build are retained in
// assets/levels/nacre/ceramic. Native UVs are x/9 and distance/18 metres.
const REPEAT_METRES = 1.2;
export function createCeramicMaps(renderer, material) {
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
            assetURL(`assets/levels/nacre/ceramic/${name}.ktx2`),
          );
          if (disposed) {
            texture.dispose();
            return null;
          }
          texture.name = `Nacre mineral ceramic / ${name}`;
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(9 / REPEAT_METRES, 18 / REPEAT_METRES);
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
            throw new Error('Nacre ceramic finish failed to load', {
              cause: failure.reason,
            });
          if (disposed) return;
          const [color, normal, arm] = results.map((result) => result.value);
          material.map = color;
          material.normalMap = normal;
          material.normalScale.set(0.2, 0.2);
          material.roughnessMap = arm;
          material.roughness = 1;
          material.clearcoat = 1;
          material.clearcoatRoughness = 0.24;
          material.needsUpdate = true;
        })
        .finally(() => loader.dispose())
    : Promise.resolve();
  return {
    ready,
    get count() {
      return textures.size;
    },
    get bytes() {
      return [...textures].reduce(
        (sum, texture) =>
          sum +
          texture.mipmaps.reduce(
            (bytes, mip) => bytes + mip.data.byteLength,
            0,
          ),
        0,
      );
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      manager.abort();
      textures.forEach((texture) => texture.dispose());
      textures.clear();
    },
  };
}
