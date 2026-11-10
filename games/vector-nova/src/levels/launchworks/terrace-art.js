import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetURL } from '../../assets/url.js';
import { finishZephyrMaterial } from '../zephyr/environment/materials.js';

const DECORATION = /__(?:bronze|copper|limestone|moss|pale)(?:$|[._\s])/i;

// A reviewed grand-island treatment has its own private source owner. The
// original mineral body and shared canonical resources remain with the ENV.
export async function createSkywellTerraceArt({
  islands = [],
  stoneTexture,
  loadAsset = (url) => new GLTFLoader().loadAsync(url),
} = {}) {
  const group = new T.Group();
  group.name = 'Skywell / fitted limestone garden boundaries';
  const selected = [...new Set(islands)].filter((island) => island?.isObject3D);
  const borrowed = new Set(stoneTexture ? [stoneTexture] : []);
  const hidden = new Map();
  let source,
    disposed = false;

  function materials() {
    const result = new Set();
    source?.traverse((object) => {
      for (const material of [object.material].flat().filter(Boolean))
        result.add(material);
    });
    return result;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const [mesh, visible] of hidden) mesh.visible = visible;
    hidden.clear();
    const geometry = new Set(),
      textures = new Set();
    source?.traverse((object) => {
      if (object.geometry) geometry.add(object.geometry);
    });
    const ownedMaterials = materials();
    for (const material of ownedMaterials)
      for (const value of Object.values(material))
        if (value?.isTexture && !borrowed.has(value)) textures.add(value);
    geometry.forEach((value) => value.dispose());
    ownedMaterials.forEach((value) => value.dispose());
    textures.forEach((value) => value.dispose());
    source = null;
    group.clear();
  }

  const owner = {
    group,
    blockers: [group],
    setReflection(texture) {
      if (disposed) return;
      if (texture) borrowed.add(texture);
      for (const material of materials()) {
        material.envMap = texture;
        material.needsUpdate = true;
      }
    },
    dispose,
  };
  if (!selected.length) return owner;

  try {
    const gltf = await loadAsset(
      assetURL('assets/levels/launchworks/garden-terrace-grand.glb'),
    );
    source = gltf.scene;
    if (!source?.isObject3D)
      throw new Error('Skywell garden boundary asset has no scene');
    source.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.skywellGardenBoundary = true;
    });
    for (const material of materials())
      if (/limestone|pale.*coping/i.test(material.name))
        finishZephyrMaterial(material, { stoneTexture });

    for (const island of selected) {
      island.updateWorldMatrix(true, true);
      const frame = new T.Group();
      frame.name = `${island.name} / fitted garden boundary`;
      frame.matrixAutoUpdate = false;
      frame.matrix.copy(island.matrixWorld);
      frame.add(source.clone(true));
      group.add(frame);
      island.traverse((mesh) => {
        if (!mesh.isMesh || !DECORATION.test(mesh.name)) return;
        hidden.set(mesh, mesh.visible);
        mesh.visible = false;
      });
    }
    group.updateWorldMatrix(true, true);
    return owner;
  } catch (error) {
    dispose();
    throw error;
  }
}
