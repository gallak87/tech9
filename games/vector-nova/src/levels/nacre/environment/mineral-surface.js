import * as T from 'three';
import { FOREST_MATERIAL_ASSETS } from '@worldkit/environment/forest';

const samplerProperties = {
  color: 'nacreMineralColor',
  normal: 'nacreMineralNormal',
};

// One level-owned finish; instances share these maps and never clone them.
export function createNacreMineralSurface({ loadTexture } = {}) {
  const owned = new Set();
  const released = new WeakSet();
  const materials = new Set();
  let disposed = false;
  let ready;
  const canLoad = Boolean(loadTexture) || typeof document !== 'undefined';
  function release(texture) {
    if (!released.has(texture)) {
      released.add(texture);
      texture.dispose();
    }
  }
  function publish(kind, texture) {
    finish[kind] = texture;
    for (const material of materials) {
      material[samplerProperties[kind]] = texture;
      material.needsUpdate = true;
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const texture of owned) release(texture);
    owned.clear();
    publish('color', null);
    publish('normal', null);
    materials.clear();
  }
  function load(kind, url, loader) {
    return Promise.resolve()
      .then(() => (disposed ? null : loader(url, kind)))
      .then((texture) => {
        if (disposed) {
          if (texture?.isTexture) release(texture);
          return null;
        }
        if (!texture?.isTexture || owned.has(texture))
          throw new Error('Nacre mineral inputs require two distinct textures');
        owned.add(texture);
        texture.name = `Nacre / shared Worldkit mineral ${kind}`;
        texture.colorSpace =
          kind === 'color' ? T.SRGBColorSpace : T.NoColorSpace;
        texture.wrapS = texture.wrapT = T.RepeatWrapping;
        texture.minFilter = T.LinearMipmapLinearFilter;
        texture.magFilter = T.LinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = 4;
        texture.needsUpdate = true;
        publish(kind, texture);
        return texture;
      });
  }
  const finish = {
    color: null,
    normal: null,
    register(material) {
      if (!disposed) materials.add(material);
      for (const [kind, property] of Object.entries(samplerProperties))
        material[property] = finish[kind];
    },
    get ready() {
      if (ready) return ready;
      if (disposed || !canLoad) return (ready = Promise.resolve(false));
      const textureLoader = loadTexture ? null : new T.TextureLoader();
      const loader = loadTexture ?? ((url) => textureLoader.loadAsync(url));
      ready = Promise.all([
        load('color', FOREST_MATERIAL_ASSETS.rockColor, loader),
        load('normal', FOREST_MATERIAL_ASSETS.rockNormal, loader),
      ])
        .then(([color, normal]) => !disposed && Boolean(color && normal))
        .catch((cause) => {
          dispose();
          throw new Error('Nacre basalt mineral finish could not load', {
            cause,
          });
        });
      return ready;
    },
    dispose,
  };
  return finish;
}
