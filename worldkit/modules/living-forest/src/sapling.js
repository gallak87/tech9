import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createLivingForestMaterials } from './materials.js';
import {
  decodeFoliageWindAttributes,
  transformFoliageWindGeometry,
} from '../../weather/src/foliage-geometry.js';

/** Baked grove variants and crown boughs; images remain consumer-owned. */
export const saplingForestURL = new URL(
  '../assets/sapling-forest-v1.glb',
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

function readPart(scene, name, kind, geometries) {
  const mesh = scene.getObjectByName(name);
  if (!mesh?.isMesh)
    throw new Error(`Sapling forest is missing the ${name} mesh`);
  const geometry = mesh.geometry.clone();
  geometries.add(geometry);
  decodeFoliageWindAttributes(geometry);
  geometry.applyMatrix4(mesh.matrixWorld);
  transformFoliageWindGeometry(geometry, mesh.matrixWorld);
  // Blender's glTF convention expects flipY=false. Worldkit's borrowed
  // TextureLoader maps use flipY=true; restore their matching UV convention.
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
  return { kind, geometry };
}

function measure(parts) {
  const bounds = new T.Box3();
  parts.forEach(({ geometry }) => bounds.union(geometry.boundingBox));
  const height = bounds.max.y - bounds.min.y;
  if (
    !(height > 0) ||
    ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)
  )
    throw new Error('Sapling forest has invalid bounds');
  return {
    bounds,
    height,
    radius: Math.max(
      Math.abs(bounds.min.x),
      Math.abs(bounds.max.x),
      Math.abs(bounds.min.z),
      Math.abs(bounds.max.z),
    ),
  };
}

/**
 * Load four grove prototypes with matched near/far parts and one crown module.
 * Geometry/materials are owned, supplied image maps are borrowed. Placement,
 * lighting, LOD selection and route/camera clearance remain consumer policies.
 */
export async function loadSaplingForestKit({ textures } = {}) {
  const gltf = await new GLTFLoader().loadAsync(saplingForestURL);
  const geometries = new Set();
  let palette;
  try {
    gltf.scene.updateMatrixWorld(true);
    const pair = (prefix, detail = '') => [
      readPart(gltf.scene, `${prefix}_Wood${detail}`, 'wood', geometries),
      readPart(gltf.scene, `${prefix}_Leaves${detail}`, 'leaf', geometries),
    ];
    const prototypes = ['A', 'B', 'C', 'D'].map((variant) => {
      const treeParts = pair(`Grove${variant}`, 'Near');
      const farParts = pair(`Grove${variant}`, 'Far');
      return {
        name: `sapling-grove-${variant.toLowerCase()}`,
        treeParts,
        farParts,
        ...measure([...treeParts, ...farParts]),
      };
    });
    const crownParts = pair('Crown');
    measure(crownParts);
    palette = createLivingForestMaterials({ textures });
    palette.wood.bumpScale = 0.75;
    const allParts = [
      ...prototypes.flatMap(({ treeParts, farParts }) => [
        ...treeParts,
        ...farParts,
      ]),
      ...crownParts,
    ];
    allParts.forEach((part) => (part.material = palette[part.kind]));
    let disposed = false;
    return {
      prototypes,
      crownParts,
      materials: palette,
      dispose() {
        if (disposed) return;
        disposed = true;
        geometries.forEach((geometry) => geometry.dispose());
        palette.dispose();
      },
    };
  } catch (error) {
    geometries.forEach((geometry) => geometry.dispose());
    palette?.dispose();
    throw error;
  } finally {
    releaseImport(gltf);
  }
}
