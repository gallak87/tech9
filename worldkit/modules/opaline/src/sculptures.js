import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const opalineSculptureURLs = Object.freeze({
  high: new URL('../assets/mineral-sculptures-high.glb', import.meta.url).href,
  low: new URL('../assets/mineral-sculptures-low.glb', import.meta.url).href,
  distant: new URL('../assets/mineral-sculptures-distant.glb', import.meta.url)
    .href,
});

/** Authored mineral assemblies. Consumers borrow their geometry and own placement/materials. */
export async function loadOpalineSculptures({
  loader = new GLTFLoader(),
} = {}) {
  const owned = new Set();
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const resource of owned) resource.dispose();
    owned.clear();
  };
  const result = {};
  try {
    // Sequential acquisition keeps partial-failure cleanup deterministic.
    for (const [detail, url] of Object.entries(opalineSculptureURLs)) {
      const gltf = await loader.loadAsync(url);
      const parts = {};
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((object) => {
        if (!object.isMesh) return;
        const geometry = object.geometry;
        geometry.applyMatrix4(object.matrixWorld);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        const name = object.name.replace(/-(high|low|distant)$/, '');
        parts[name] = { geometry, bounds: geometry.boundingBox.clone() };
        owned.add(geometry);
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material])
          if (material) owned.add(material);
      });
      for (const key of [
        'mineral-buttress-1',
        'mineral-buttress-2',
        'mineral-buttress-3',
        'mineral-curl-crust',
        'mineral-curl-emerald',
      ])
        if (!parts[key])
          throw new Error(`Missing Opaline sculpture ${key}/${detail}`);
      result[detail] = parts;
    }
    return { ...result, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
