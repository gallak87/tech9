import * as T from 'three';

const BARK_URL = new URL(
  '../../../../assets/levels/vesper-forest/ancient-oak-bark-v1.jpg',
  import.meta.url,
).href;
const HEIGHT_URL = new URL(
  '../../../../assets/levels/vesper-forest/ancient-oak-bark-height-v1.png',
  import.meta.url,
).href;

/** Vesper owns this landmark palette; ordinary grove materials remain borrowed. */
export async function createAncientOakBark({ lifetime, wood }) {
  const loader = new T.TextureLoader();
  let map, bumpMap;
  try {
    map = lifetime.own(await loader.loadAsync(BARK_URL));
    bumpMap = lifetime.own(await loader.loadAsync(HEIGHT_URL));
  } catch (cause) {
    throw new Error('Ancient oak bark could not load. Reload to try again.', {
      cause,
    });
  }
  map.colorSpace = T.SRGBColorSpace;
  bumpMap.colorSpace = T.NoColorSpace;
  for (const texture of [map, bumpMap]) {
    texture.anisotropy = 8;
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    // The baked wood UVs use 6.5m tiles. This palette repeats every 52m,
    // letting broad ancient bark plates survive the distant menu camera.
    texture.repeat.setScalar(0.125);
  }
  const material = lifetime.own(wood.clone());
  material.name = 'Vesper / colossal ancient oak bark';
  material.color.set('#ffffff');
  material.map = map;
  material.bumpMap = bumpMap;
  material.bumpScale = 1.5;
  material.roughness = 0.9;
  material.normalMap = material.roughnessMap = null;
  return material;
}
