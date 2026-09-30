import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  createOrbitalPlumeGeometry,
  createOrbitalPlumeMaterial,
} from './orbital-plume.js';

function resourcesFor(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material))
        if (value?.isTexture) textures.add(value);
    }
  });
  return { geometries, materials, textures };
}

// A supplied parsed model remains reusable. Each ship owns its GPU resources;
// disposing one ship must never invalidate another instance or its source.
function cloneModel(source) {
  const model = source.clone(true);
  const geometries = new Map();
  const materials = new Map();
  const textures = new Map();
  const ownMaterial = (sourceMaterial) => {
    if (!materials.has(sourceMaterial)) {
      const material = sourceMaterial.clone();
      for (const [key, value] of Object.entries(sourceMaterial)) {
        if (!value?.isTexture) continue;
        if (!textures.has(value)) textures.set(value, value.clone());
        material[key] = textures.get(value);
      }
      materials.set(sourceMaterial, material);
    }
    return materials.get(sourceMaterial);
  };
  model.traverse((object) => {
    if (!object.isMesh) return;
    if (!geometries.has(object.geometry))
      geometries.set(object.geometry, object.geometry.clone());
    object.geometry = geometries.get(object.geometry);
    object.material = Array.isArray(object.material)
      ? object.material.map(ownMaterial)
      : ownMaterial(object.material);
  });
  return model;
}

/** Loads the Blender-authored Kestrel before shader warmup and inspection fit.
 * Local +Z is forward, +Y is up; the parent owns the world pose. A supplied
 * parsed model avoids fetching for asset validation and remains caller-owned. */
export async function createShip({ plumeExposure = 1, model } = {}) {
  const hull = model
    ? cloneModel(model)
    : (
        await new GLTFLoader().loadAsync(
          `${import.meta.env?.BASE_URL ?? '/'}assets/ships/kestrel/kestrel.glb`,
        )
      ).scene;
  const group = new THREE.Group();
  group.name = 'Kestrel / jet chassis 07';
  group.add(hull);
  group.updateMatrixWorld(true);
  const resources = resourcesFor(hull);
  const release = () => {
    resources.geometries.forEach((value) => value.dispose());
    resources.materials.forEach((value) => value.dispose());
    resources.textures.forEach((value) => value.dispose());
  };
  const anchors = ['Exhaust_L', 'Exhaust_R'].map((name) =>
    hull.getObjectByName(name),
  );
  if (anchors.some((anchor) => !anchor)) {
    release();
    throw new Error('Kestrel model is missing its exhaust attachment points.');
  }
  hull.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });

  const bounds = new THREE.Box3().setFromObject(hull);
  const size = bounds.getSize(new THREE.Vector3());
  group.userData = {
    asset: 'Kestrel / concept 01',
    provenance:
      'Original Blender model based on the approved generated concept',
    dimensionsMetres: { width: size.x, length: size.z, height: size.y },
    forward: '+Z',
    hoverDatum: 0,
    showcase: { speed: 70, boost: false, steer: 0, time: 0, energy: 1 },
  };
  const plumeMaterial = createOrbitalPlumeMaterial();
  const plumeGeometry = createOrbitalPlumeGeometry();
  resources.materials.add(plumeMaterial);
  resources.geometries.add(plumeGeometry);
  const plumes = anchors.map((anchor) => {
    const plume = new THREE.Mesh(plumeGeometry, plumeMaterial);
    plume.name = 'Ion exhaust';
    group.worldToLocal(anchor.getWorldPosition(plume.position));
    group.add(plume);
    return plume;
  });
  const power = [...resources.materials]
    .filter((material) => /power|emission/i.test(material.name))
    .map((material) => ({ material, intensity: material.emissiveIntensity }));

  let disposed = false;
  function update({ speed = 0, boost = false, time = 0, energy = 1 } = {}) {
    if (disposed) return;
    const velocity = THREE.MathUtils.clamp(
      Number.isFinite(speed) ? speed / 150 : 0,
      0,
      1,
    );
    const t = Number.isFinite(time) ? time : 0;
    const reserve = THREE.MathUtils.clamp(
      Number.isFinite(energy) ? energy : 1,
      0,
      1,
    );
    const activeBoost = boost && reserve > 0;
    for (const { material, intensity } of power)
      material.emissiveIntensity =
        intensity * (0.8 + velocity * 0.2 + (activeBoost ? 0.35 : 0));
    plumeMaterial.uniforms.strength.value =
      (0.12 + velocity * 0.22 + (activeBoost ? 0.75 : 0)) * plumeExposure;
    plumeMaterial.uniforms.flowTime.value = t;
    plumeMaterial.uniforms.boostMix.value = activeBoost ? 1 : 0;
    plumeMaterial.uniforms.glowColor.value.setHex(
      activeBoost ? 0x319eff : 0x2589e8,
    );
    for (let index = 0; index < plumes.length; index++) {
      const pulse = 1 + Math.sin(t * 17 + index * 2) * 0.008;
      const width = (activeBoost ? 1.5 : 0.95 + velocity * 0.42) * pulse;
      plumes[index].scale.set(
        width,
        width,
        (0.38 + velocity * 1.65 + (activeBoost ? 3.5 : 0)) * pulse,
      );
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    // Only asset-owned textures were collected. The runtime's city reflection
    // is borrowed later and remains the renderer's responsibility.
    release();
    group.removeFromParent();
    group.clear();
  }
  update();
  return { group, update, dispose };
}
