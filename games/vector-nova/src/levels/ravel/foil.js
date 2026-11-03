import * as T from 'three';
import { assetURL } from '../../assets/url.js';

/** One linear height field, shared by the lower and upper sail materials. */
export function createRavelFoilFinish(renderer = null) {
  const borrowers = new Set();
  let texture = null,
    disposed = false;
  const ready = renderer
    ? new T.TextureLoader()
        .loadAsync(assetURL('assets/levels/ravel/sail-foil-height-v1.png'))
        .then((map) => {
          if (disposed) {
            map.dispose();
            return;
          }
          texture = map;
          map.name = 'Ravel / tensioned foil height';
          map.colorSpace = T.NoColorSpace;
          map.wrapS = map.wrapT = T.MirroredRepeatWrapping;
          map.anisotropy = Math.min(
            8,
            renderer.capabilities.getMaxAnisotropy(),
          );
          for (const material of borrowers) {
            material.bumpMap = map;
            material.bumpScale = 1.6;
            material.needsUpdate = true;
          }
        })
        .catch((error) => {
          throw new Error('Ravel sail foil could not load.', { cause: error });
        })
    : Promise.resolve();
  return {
    ready,
    bind(material) {
      borrowers.add(material);
      if (texture) {
        material.bumpMap = texture;
        material.bumpScale = 1.6;
        material.needsUpdate = true;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      borrowers.clear();
      texture?.dispose();
    },
  };
}
