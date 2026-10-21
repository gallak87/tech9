import * as T from 'three';

/** Authored surface images are borrowed. The empty leaf placeholder is owned. */
export function createLivingForestMaterials({ textures = {} } = {}) {
  const owned = [];
  let leafMap = textures.leaf?.map;
  if (!leafMap) {
    // No opaque card rectangles while an asynchronous consumer loads the spray.
    leafMap = new T.DataTexture(
      new Uint8Array([255, 255, 255, 0]),
      1,
      1,
      T.RGBAFormat,
    );
    leafMap.needsUpdate = true;
    owned.push(leafMap);
  }
  const wood = new T.MeshStandardMaterial({
    name: 'Living Forest / silver weathered fluted bark',
    map: textures.wood?.map ?? null,
    bumpMap: textures.wood?.bumpMap ?? null,
    bumpScale: 0.28,
    normalMap: textures.wood?.normalMap ?? null,
    normalScale: new T.Vector2(0.65, 0.65),
    roughnessMap: textures.wood?.roughnessMap ?? null,
    color: '#a8b3a9',
    roughness: 0.91,
    vertexColors: true,
  });
  const leaf = new T.MeshStandardMaterial({
    name: 'Living Forest / dense attached jade leaf sprays',
    map: leafMap,
    color: '#d5e0d0',
    roughness: 0.8,
    side: T.DoubleSide,
    vertexColors: true,
    alphaTest: 0.5,
    alphaToCoverage: true,
    transparent: false,
    depthWrite: true,
  });
  const rock = new T.MeshStandardMaterial({
    name: 'Living Forest / blue slate with sage lichens',
    color: '#a1ad9c',
    roughness: 0.95,
    vertexColors: true,
  });
  const materials = [wood, leaf, rock];
  let disposed = false;
  return {
    wood,
    leaf,
    rock,
    textures: owned,
    materials,
    dispose() {
      if (disposed) return;
      disposed = true;
      materials.forEach((m) => m.dispose());
      owned.forEach((t) => t.dispose());
    },
  };
}
