import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
export const LANDSCAPE_ASSETS = Object.freeze({
  'forest-kit.glb': new URL('../assets/runtime/forest-kit.glb', import.meta.url)
    .href,
  'textures/forest-floor-color.jpg': new URL(
    '../assets/runtime/textures/forest-floor-color.jpg',
    import.meta.url,
  ).href,
  'textures/forest-floor-normal.jpg': new URL(
    '../assets/runtime/textures/forest-floor-normal.jpg',
    import.meta.url,
  ).href,
  'textures/forest-floor-roughness.jpg': new URL(
    '../assets/runtime/textures/forest-floor-roughness.jpg',
    import.meta.url,
  ).href,
  'textures/path-color.jpg': new URL(
    '../assets/runtime/textures/path-color.jpg',
    import.meta.url,
  ).href,
  'textures/path-normal.jpg': new URL(
    '../assets/runtime/textures/path-normal.jpg',
    import.meta.url,
  ).href,
  'textures/path-roughness.jpg': new URL(
    '../assets/runtime/textures/path-roughness.jpg',
    import.meta.url,
  ).href,
});

export const loadForestKit = async (assetURL) =>
  (
    await new GLTFLoader().loadAsync(
      assetURL
        ? new URL('forest-kit.glb', assetURL).href
        : LANDSCAPE_ASSETS['forest-kit.glb'],
    )
  ).scene;
export function disposeForestKit(kit) {
  if (!kit) return;
  const resources = new Set(),
    images = new Set();
  kit.traverse((o) => {
    if (o.geometry) resources.add(o.geometry);
    for (const material of Array.isArray(o.material)
      ? o.material
      : o.material
        ? [o.material]
        : []) {
      resources.add(material);
      for (const value of Object.values(material))
        if (value?.isTexture) resources.add(value);
    }
  });
  for (const resource of resources)
    if (resource.isTexture && resource.source?.data?.close)
      images.add(resource.source.data);
  resources.forEach((resource) => resource.dispose());
  images.forEach((image) => image.close());
}
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
/** Clone authored prototype transforms and apply one shared forest material treatment. */
export function prepareForestParts(
  kit,
  name,
  { grassBrightness = 1.48, normalizeTree = false, transmission = false } = {},
) {
  if (name === 'trail_pebble' || name === 'fallen_twig') {
    const pebble = name === 'trail_pebble';
    const geometry = pebble
      ? new THREE.DodecahedronGeometry(0.065, 1)
      : new THREE.CylinderGeometry(0.009, 0.016, 0.5, 5);
    if (pebble) geometry.scale(1, 0.6, 0.8);
    else {
      geometry.rotateZ(Math.PI / 2);
      geometry.translate(0, 0.027, 0);
    }
    const material = new THREE.MeshStandardMaterial({
      color: pebble ? '#a29b83' : '#3b3024',
      roughness: pebble ? 0.99 : 0.98,
    });
    material.userData.weather = { depth: 0, snow: pebble ? 0.18 : 0.3 };
    return [{ geometry, material, plant: false }];
  }
  const root = kit.getObjectByName(name);
  if (!root) throw new Error(`Missing baseline forest asset: ${name}`);
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert(),
    parts = [];
  root.traverse((part) => {
    if (!part.isMesh) return;
    const geometry = part.geometry
      .clone()
      .applyMatrix4(
        new THREE.Matrix4().multiplyMatrices(inverse, part.matrixWorld),
      );
    const material = part.material.clone();
    material.envMapIntensity = 0.3;
    if (material.map) material.map.anisotropy = 8;
    if (name.startsWith('rock')) {
      const uv = geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++)
        uv.setXY(i, uv.getX(i) * 0.4, uv.getY(i) * 0.4);
      material.normalScale?.setScalar(0.55);
    }
    const plant = name.startsWith('grass') || name.startsWith('fern');
    if (plant) {
      material.color.multiplyScalar(
        name.startsWith('grass') ? grassBrightness : 1.34,
      );
      material.normalScale?.setScalar(0.5);
      material.emissive.set('#617c36');
      material.emissiveIntensity = name.startsWith('grass') ? 0.115 : 0.07;
    }
    if (
      material.alphaTest > 0 ||
      material.name.toLowerCase().includes('needle')
    ) {
      material.side = THREE.DoubleSide;
      material.alphaTest = material.name.toLowerCase().includes('needle')
        ? 0.37
        : 0.42;
      material.alphaToCoverage = true;
      material.transparent = false;
      material.roughness = 0.95;
      if (transmission) {
        material.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <lights_fragment_end>',
            '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * .08;',
          );
        };
        material.customProgramCacheKey = () => 'forest-transmission-v1';
      }
    }
    parts.push({ geometry, material, plant });
  });
  if (normalizeTree) {
    const bounds = new THREE.Box3();
    for (const part of parts) {
      part.geometry.computeBoundingBox();
      bounds.union(part.geometry.boundingBox);
    }
    const height = bounds.max.y - bounds.min.y;
    for (const part of parts) {
      part.geometry.translate(0, -bounds.min.y, 0);
      part.geometry.scale(1.22 / height, 1 / height, 1.22 / height);
    }
  }
  return parts;
}
