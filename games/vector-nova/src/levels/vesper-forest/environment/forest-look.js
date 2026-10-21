import * as T from 'three';
import { BARK_MATERIAL_ASSETS } from '@worldkit/environment/forest/kit';

/** Worldkit owns the source scans; this level owns each loaded texture. */
export async function loadForestLook({ signal } = {}) {
  const loader = new T.TextureLoader();
  const results = await Promise.allSettled(
    ['barkColor', 'barkNormal', 'barkRoughness'].map(async (key) => {
      const url = BARK_MATERIAL_ASSETS[key];
      let texture;
      try {
        texture = await loader.loadAsync(url);
      } catch (cause) {
        throw new Error(
          `Vesper Forest could not load Worldkit ${key}: ${url}`,
          { cause },
        );
      }
      texture.name = `Worldkit / Vesper Forest ${key}`;
      texture.wrapS = texture.wrapT = T.RepeatWrapping;
      texture.anisotropy = 8;
      if (key === 'barkColor') texture.colorSpace = T.SRGBColorSpace;
      return texture;
    }),
  );
  if (signal?.aborted) {
    results.forEach((r) => {
      if (r.status === 'fulfilled') r.value.dispose();
    });
    return null;
  }
  if (results.some((r) => r.status === 'rejected')) {
    results.forEach((r) => {
      if (r.status === 'fulfilled') r.value.dispose();
    });
    throw results.find((r) => r.status === 'rejected').reason;
  }
  const [color, normal, roughness] = results.map((r) => r.value);
  const maps = { map: color, normalMap: normal, roughnessMap: roughness };
  for (const texture of Object.values(maps)) texture.repeat.set(1, 1);
  let disposed = false;
  return {
    maps,
    apply(material, kind = 'bark') {
      // Preserve authored broad bark plates; the package adds the finer scan.
      if (material.map && material.map !== maps.map)
        material.woodMacroMap = material.map;
      Object.assign(material, maps);
      material.userData.borrowedTextures = Object.values(maps);
      material.userData.worldkitWood = kind;
      material.userData.vesperBarkProjection = false;
      material.color.set(
        kind === 'cambium'
          ? '#c5a57c'
          : kind === 'sapwood'
            ? '#cfb28b'
            : '#c2c6ac',
      );
      material.normalScale.setScalar(
        kind === 'cambium' ? 0.7 : kind === 'sapwood' ? 0.5 : 0.55,
      );
      material.roughness = kind === 'cambium' ? 0.8 : 0.9;
      material.needsUpdate = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      Object.values(maps).forEach((texture) => texture.dispose());
    },
  };
}
