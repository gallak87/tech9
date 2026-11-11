import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createLivingForestMaterials } from './materials.js';

/** One baked Sapling study; the regular Living Forest entry does not emit it. */
export const saplingTreeURL = new URL(
  '../assets/sapling-oak-study-v1.glb',
  import.meta.url,
).href;

function releaseImport(gltf) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set(),
    images = new Set();
  for (const scene of gltf.scenes ?? [gltf.scene])
    scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of Array.isArray(object.material)
        ? object.material
        : object.material
          ? [object.material]
          : []) {
        materials.add(material);
        for (const value of Object.values(material))
          if (value?.isTexture) textures.add(value);
      }
    });
  for (const texture of textures)
    if (texture.source?.data?.close) images.add(texture.source.data);
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
  images.forEach((image) => image.close());
}

/**
 * Load the experimental, metre-scale oak as two ready-to-instance parts.
 * The result owns its geometry/materials and borrows the supplied image maps.
 * Consumers own placement, graphics settings, visibility and route clearance.
 */
export async function loadSaplingTree({ textures } = {}) {
  const gltf = await new GLTFLoader().loadAsync(saplingTreeURL);
  const treeParts = [];
  let palette;
  try {
    gltf.scene.updateMatrixWorld(true);
    for (const [kind, name] of [
      ['wood', 'SaplingWood'],
      ['leaf', 'SaplingLeaves'],
    ]) {
      const mesh = gltf.scene.getObjectByName(name);
      if (!mesh?.isMesh)
        throw new Error(`Sapling study is missing the ${name} mesh`);
      const geometry = mesh.geometry.clone();
      // Own clones so the imported scene can be released immediately, including
      // when callers reuse this geometry in more than one instanced batch.
      treeParts.push({ kind, geometry });
      geometry.applyMatrix4(mesh.matrixWorld);
      // Blender exports glTF UVs for textures with flipY=false. These parts
      // instead borrow ordinary Worldkit/TextureLoader maps (flipY=true), so
      // restore the source convention without mutating those shared textures.
      const uv = geometry.attributes.uv;
      if (uv)
        for (let index = 0; index < uv.count; index++)
          uv.setY(index, 1 - uv.getY(index));
      if (!geometry.attributes.color) {
        const colors = new Float32Array(geometry.attributes.position.count * 3);
        colors.fill(1);
        geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
      }
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
    }
    palette = createLivingForestMaterials({ textures });
    treeParts.forEach((part) => (part.material = palette[part.kind]));
    const bounds = new T.Box3();
    treeParts.forEach(({ geometry }) => bounds.union(geometry.boundingBox));
    const height = bounds.max.y - bounds.min.y;
    if (!(height > 0) || !Number.isFinite(height))
      throw new Error('Sapling study has invalid bounds');
    let disposed = false;
    return {
      name: 'sapling-oak-study',
      treeParts,
      materials: palette,
      bounds,
      height,
      radius: Math.max(
        Math.abs(bounds.min.x),
        Math.abs(bounds.max.x),
        Math.abs(bounds.min.z),
        Math.abs(bounds.max.z),
      ),
      dispose() {
        if (disposed) return;
        disposed = true;
        treeParts.forEach(({ geometry }) => geometry.dispose());
        palette.dispose();
      },
    };
  } catch (error) {
    treeParts.forEach(({ geometry }) => geometry.dispose());
    palette?.dispose();
    throw error;
  } finally {
    releaseImport(gltf);
  }
}
