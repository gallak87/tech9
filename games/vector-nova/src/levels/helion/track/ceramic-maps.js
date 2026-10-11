import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { assetURL } from '../../../assets/url.js';

// Road-only maps: architecture retains its existing thermal finish.
// Geometry UVs are metres; preserve the source's 2:1 physical aspect ratio.
export const CERAMIC_REPEAT = Object.freeze([4.4, 2.2]);
export function createHelionCeramicMaps(renderer, materials) {
  const textures = new Set();
  let disposed = false;
  const manager = new THREE.LoadingManager();
  const loader = renderer
    ? new KTX2Loader(manager)
        .setTranscoderPath(assetURL('assets/ships/decoder/'))
        .setWorkerLimit(2)
        .detectSupport(renderer)
    : null;
  const ready = loader
    ? Promise.allSettled(
        ['color', 'normal', 'arm'].map(async (name) => {
          const texture = await loader.loadAsync(
            assetURL(`assets/levels/helion/ceramic/${name}.ktx2`),
          );
          if (disposed) {
            texture.dispose();
            return null;
          }
          texture.name = `Helion heat ceramic / ${name}`;
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
            throw new Error('Helion ceramic finish failed to load', {
              cause: failure.reason,
            });
          if (disposed) return;
          const [color, normal, arm] = results.map((result) => result.value);
          for (const material of materials) {
            material.map = color;
            material.normalMap = normal;
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

export function setCeramicCoordinates(geometry) {
  const road = geometry.getAttribute('roadCoord');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < road.count; i++) uv.setXY(i, road.getY(i), road.getX(i));
  uv.needsUpdate = true;
}
