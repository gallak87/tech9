import * as T from 'three';
import { finishUmbraAssets } from './materials.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { UMBRA_ASSET_URL } from './constants.js';

export function collectUmbraAssets(scene) {
  scene.updateMatrixWorld(true);
  finishUmbraAssets(scene);
  const geometries = new Set(),
    materials = new Set();
  scene.traverse((node) => {
    if (node.geometry) geometries.add(node.geometry);
    for (const material of Array.isArray(node.material)
      ? node.material
      : [node.material])
      if (material) materials.add(material);
  });
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  };
  const names = [
    'terrace',
    'gallery',
    'lens',
    'vault',
    'instrument',
    'rib',
    'event_stretched',
    'event_fragmented',
  ];
  // Validate the loaded kit before allocating merged copies. Failed selected
  // assets belong to this loader and must release their originals as well.
  for (const name of names) {
    if (!scene.getObjectByName(name)) {
      dispose();
      throw new Error(`Umbra architecture missing required ${name}`);
    }
  }
  function flatten(root) {
    const byMaterial = new Map();
    const inverse = root.matrixWorld.clone().invert();
    root.traverse((node) => {
      if (!node.isMesh) return;
      const geometry = node.geometry.clone();
      geometry.applyMatrix4(
        new T.Matrix4().multiplyMatrices(inverse, node.matrixWorld),
      );
      // glTF attributes may vary by primitive; geometry here needs only normals/position.
      for (const key of Object.keys(geometry.attributes))
        if (!['position', 'normal'].includes(key))
          geometry.deleteAttribute(key);
      const list = byMaterial.get(node.material) ?? [];
      list.push(geometry.index ? geometry.toNonIndexed() : geometry);
      if (geometry.index) geometry.dispose();
      byMaterial.set(node.material, list);
    });
    return [...byMaterial].map(([material, entries]) => {
      const geometry = mergeGeometries(entries, false);
      entries.forEach((part) => part.dispose());
      geometry.computeBoundingSphere();
      geometries.add(geometry);
      return { geometry, material };
    });
  }
  const templates = {};
  for (const name of names) {
    const root = scene.getObjectByName(name);
    if (!root) throw new Error(`Umbra architecture missing required ${name}`);
    templates[name] = flatten(root);
  }
  const instrument = scene.getObjectByName('instrument');
  const eventPieces = instrument.children.map((piece) => {
    const parts = flatten(piece);
    const bounds = new T.Box3();
    for (const { geometry } of parts) {
      geometry.computeBoundingBox();
      bounds.union(geometry.boundingBox);
    }
    const center = bounds.getCenter(new T.Vector3());
    for (const { geometry } of parts)
      geometry.translate(-center.x, -center.y, -center.z);
    return { center, parts };
  });
  return {
    templates,
    eventPieces,
    dispose,
  };
}

export async function loadUmbraAssets() {
  const asset = await new GLTFLoader().loadAsync(UMBRA_ASSET_URL);
  return collectUmbraAssets(asset.scene);
}

export function assetGroup(parts, name) {
  const group = new T.Group();
  group.name = name;
  for (const { geometry, material } of parts) {
    const mesh = new T.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}

export function createAssetInstances(parts, matrices, name) {
  const group = new T.Group();
  group.name = name;
  for (const { geometry, material } of parts) {
    const mesh = new T.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
