import * as THREE from 'three';
import { getShip } from './catalog.js';
import { loadShipModel } from './model-cache.js';
import { createEngineResponse } from './engine-response.js';
import {
  createOrbitalPlumeGeometry,
  createOrbitalPlumeMaterial,
} from './orbital-plume.js';

export function resourcesFor(root) {
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

/** Loads the selected Blender-authored ship before shader warmup and inspection fit.
 * Local +Z is forward, +Y is up; the parent owns the world pose. A supplied
 * parsed model avoids fetching for asset validation and remains caller-owned. */
export async function createShip({
  id = 'kestrel',
  plumeExposure = 1,
  model,
} = {}) {
  const specification = getShip(id);
  const hull = cloneModel(model ?? (await loadShipModel(specification.id)));
  const group = new THREE.Group();
  group.name = `${specification.name} / racing chassis`;
  group.add(hull);
  group.updateMatrixWorld(true);
  const resources = resourcesFor(hull);
  // Oblique armor/louver surfaces need modest anisotropy at chase distance.
  // These maps are owned clones; renderer environment probes remain borrowed.
  for (const texture of resources.textures) {
    texture.anisotropy = 4;
    texture.needsUpdate = true;
  }
  const release = () => {
    resources.geometries.forEach((value) => value.dispose());
    resources.materials.forEach((value) => value.dispose());
    resources.textures.forEach((value) => value.dispose());
  };
  const anchors = specification.exhausts.map((name) =>
    hull.getObjectByName(name),
  );
  if (anchors.some((anchor) => !anchor)) {
    release();
    throw new Error(
      `${specification.name} model is missing its exhaust attachment points.`,
    );
  }
  hull.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });

  const bounds = new THREE.Box3().setFromObject(hull);
  const size = bounds.getSize(new THREE.Vector3());
  group.userData = {
    shipId: specification.id,
    asset: `${specification.name} / concept 01`,
    provenance:
      'Original Blender model based on the approved generated concept',
    dimensionsMetres: { width: size.x, length: size.z, height: size.y },
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
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
    plume.userData.aoExclude = true;
    // The renderer borrows this local source for its depth-aware heat volume.
    // No extra visible surface or resource is added to the ship asset.
    plume.userData.exhaustHeat = { pressure: 0, velocity: 0, time: 0 };
    group.worldToLocal(anchor.getWorldPosition(plume.position));
    group.add(plume);
    return plume;
  });
  const nozzleLights = plumes.map((plume) => {
    const light = new THREE.PointLight(0x55bfff, 0.2, 1.35, 2);
    light.name = 'Ion throat / local ceramic and titanium spill';
    light.position.copy(plume.position);
    light.position.z += 0.06;
    group.add(light);
    return light;
  });
  const engineResponse = createEngineResponse();
  const power = [...resources.materials]
    .filter((material) => /power|emission/i.test(material.name))
    .map((material) => ({ material, intensity: material.emissiveIntensity }));

  let disposed = false;
  function update({
    speed = 0,
    boost = false,
    time = 0,
    energy = 1,
    reducedMotion = false,
  } = {}) {
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
    const { pressure, flowTime } = engineResponse({
      time: t,
      boosting: activeBoost,
      reducedMotion,
    });
    // Cruise reaches the former boost plume. Boost adds another clear step
    // in volume and emission; idle retains its restrained nozzle glow.
    const thrust = THREE.MathUtils.lerp(
      THREE.MathUtils.smoothstep(velocity, 0.1, 0.7),
      1,
      pressure,
    );
    for (const { material, intensity } of power)
      material.emissiveIntensity =
        intensity * (0.8 + thrust * 0.35 + pressure * 0.45);
    plumeMaterial.uniforms.strength.value =
      (0.12 + velocity * 0.22 + thrust * 0.75 + pressure * 0.8) * plumeExposure;
    plumeMaterial.uniforms.flowTime.value = flowTime;
    plumeMaterial.uniforms.reducedMotion.value = reducedMotion ? 1 : 0;
    plumeMaterial.uniforms.boostMix.value = pressure;
    plumeMaterial.uniforms.thrustMix.value = thrust;
    plumeMaterial.uniforms.glowColor.value.setHex(0x2376ff);
    for (let index = 0; index < plumes.length; index++) {
      const pulse = reducedMotion
        ? 1
        : 1 + Math.sin(flowTime * 17 + index * 2) * 0.008;
      const width =
        THREE.MathUtils.lerp(0.95 + velocity * 0.42, 1.5, thrust) *
        (1 + pressure * 0.32) *
        pulse;
      plumes[index].scale.set(
        width * specification.plumeWidth,
        width * specification.plumeWidth,
        (0.38 + velocity * 1.65 + thrust * 3.5 + pressure * 3.1) * pulse,
      );
      Object.assign(plumes[index].userData.exhaustHeat, {
        pressure,
        velocity,
        time: flowTime,
      });
      nozzleLights[index].intensity = 0.2 + thrust * 0.48 + pressure * 0.7;
      nozzleLights[index].distance = 1.35 + thrust * 0.45 + pressure * 0.55;
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
