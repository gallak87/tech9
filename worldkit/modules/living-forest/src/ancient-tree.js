import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  decodeFoliageWindAttributes,
  transformFoliageWindGeometry,
  validateFoliageWindGeometry,
} from '../../weather/src/foliage-geometry.js';

const PARTS = [
  { name: 'AncientOak_Bark', material: 'bark', required: true },
  { name: 'AncientOak_Heartwood', material: 'inner', required: true },
  { name: 'AncientOak_Twigs', material: 'bark' },
  { name: 'AncientOak_Leaves', material: 'leaf' },
];

function materialResources(materials) {
  const palettes = new Set(
    Object.values(materials).filter((value) => value?.isMaterial),
  );
  const textures = new Set();
  const images = new Set();
  for (const material of palettes)
    for (const value of Object.values(material))
      if (value?.isTexture) {
        textures.add(value);
        if (value.source?.data) images.add(value.source.data);
      }
  return { materials: palettes, textures, images };
}

function releaseImport(gltf, borrowed) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set(),
    images = new Set();
  for (const scene of new Set([gltf.scene, ...(gltf.scenes ?? [])]))
    scene?.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        if (!material || borrowed.materials.has(material)) continue;
        materials.add(material);
        for (const value of Object.values(material))
          if (value?.isTexture && !borrowed.textures.has(value))
            textures.add(value);
      }
    });
  for (const texture of textures)
    if (
      texture.source?.data?.close &&
      !borrowed.images.has(texture.source.data)
    )
      images.add(texture.source.data);
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
  images.forEach((image) => image.close());
}

function readGeometry(mesh, geometries) {
  const source = mesh.geometry?.getAttribute('position');
  if (!source || source.itemSize !== 3 || source.count < 3)
    throw new Error(`Ancient tree ${mesh.name} has no usable positions`);
  for (const value of source.array)
    if (!Number.isFinite(value))
      throw new Error(`Ancient tree ${mesh.name} positions must be finite`);
  const geometry = mesh.geometry.clone();
  geometries.add(geometry);
  decodeFoliageWindAttributes(geometry);
  if (Object.keys(geometry.attributes).some((name) => name.startsWith('wind')))
    validateFoliageWindGeometry(geometry);
  geometry.applyMatrix4(mesh.matrixWorld);
  transformFoliageWindGeometry(geometry, mesh.matrixWorld);
  // Blender writes glTF UVs for flipY=false. Borrowed Worldkit image maps use
  // TextureLoader's flipY=true; change the private geometry, never those maps.
  const uv = geometry.getAttribute('uv');
  if (uv)
    for (let index = 0; index < uv.count; index++)
      uv.setY(index, 1 - uv.getY(index));
  if (!geometry.hasAttribute('normal')) geometry.computeVertexNormals();
  if (!geometry.hasAttribute('color')) {
    const colors = new Float32Array(source.count * 3).fill(1);
    geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Load an independently sculpted solid tree from a consumer-owned GLB URL.
 * Worldkit owns cloned geometry; caller materials, maps and placement are borrowed.
 * The source has distinct bark/heartwood skins and optional grown twigs/leaves.
 */
export async function loadAncientTree({ url, materials } = {}) {
  const assetURL = url instanceof URL ? url.href : url;
  if (typeof assetURL !== 'string' || !assetURL.trim())
    throw new TypeError('Ancient tree requires a consumer-owned asset URL');
  if (!materials?.bark?.isMaterial || !materials?.inner?.isMaterial)
    throw new TypeError(
      'Ancient tree requires borrowed bark and inner materials',
    );
  const borrowed = materialResources(materials);
  const gltf = await new GLTFLoader().loadAsync(assetURL);
  const group = new T.Group(),
    geometries = new Set();
  group.name = 'Living Forest / sculpted ancient oak';
  try {
    if (!gltf.scene?.isObject3D)
      throw new Error('Ancient tree asset has no scene');
    gltf.scene.updateMatrixWorld(true);
    for (const part of PARTS) {
      const source = gltf.scene.getObjectByName(part.name);
      if (!source && !part.required) continue;
      if (!source?.isMesh)
        throw new Error(`Ancient tree is missing the ${part.name} mesh`);
      const material = materials[part.material];
      if (!material?.isMaterial)
        throw new TypeError(
          `Ancient tree ${part.name} requires a borrowed ${part.material} material`,
        );
      const mesh = new T.Mesh(readGeometry(source, geometries), material);
      mesh.name = part.name;
      mesh.userData.kind = part.material;
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    const metrics = {
      source: 'sculpted-solid-ancient-oak',
      draws: group.children.length,
      triangles: [...geometries].reduce(
        (sum, geometry) =>
          sum +
          (geometry.index?.count ?? geometry.attributes.position.count) / 3,
        0,
      ),
    };
    group.userData.metrics = metrics;
    let disposed = false;
    return {
      group,
      metrics,
      dispose() {
        if (disposed) return;
        disposed = true;
        geometries.forEach((geometry) => geometry.dispose());
        group.clear();
      },
    };
  } catch (error) {
    geometries.forEach((geometry) => geometry.dispose());
    group.clear();
    throw error;
  } finally {
    releaseImport(gltf, borrowed);
  }
}
