import * as T from 'three';
import { createEngineResponse } from './engine-response.js';
import {
  createOrbitalPlumeGeometry,
  createOrbitalPlumeMaterial,
} from './orbital-plume.js';

// Rival exhaust uses the exported nozzle anchors. No per-rival lights, heat
// targets or textures; Low owns only ordinary unlit tapered meshes.
export function createRivalPropulsion(hull, settings = {}) {
  const anchors = [];
  const power = new Map();
  hull.traverse((object) => {
    if (/^Exhaust_[LRC]$/.test(object.name)) anchors.push(object);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material])
      if (material?.emissive && /_Ion$/.test(material.name))
        power.set(material, material.emissiveIntensity);
  });
  if (!anchors.length)
    throw new Error('Rival chassis is missing exhaust anchors.');
  const group = new T.Group();
  group.name = 'Rival / propulsion';
  hull.updateMatrixWorld(true);
  const positions = anchors.map((anchor) =>
    hull.worldToLocal(anchor.getWorldPosition(new T.Vector3())),
  );
  hull.add(group);
  let tier,
    geometry,
    material,
    plumes = [],
    disposed = false;
  const respond = createEngineResponse();
  const release = () => {
    group.clear();
    geometry?.dispose();
    material?.dispose();
  };
  function setQuality(quality) {
    const next = quality === 'low' ? 'low' : 'high';
    if (next === tier) return;
    release();
    tier = next;
    if (tier === 'high') {
      geometry = createOrbitalPlumeGeometry();
      material = createOrbitalPlumeMaterial({ samples: 8 });
    } else {
      geometry = new T.ConeGeometry(0.28, 1, 6, 2, true);
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, 0, -0.5);
      const colors = [];
      for (let i = 0; i < geometry.attributes.position.count; i++) {
        const aft = -geometry.attributes.position.getZ(i);
        const color = new T.Color().lerpColors(
          new T.Color(0x9ee9ff),
          new T.Color(0x144eb6),
          aft,
        );
        colors.push(color.r, color.g, color.b, (1 - aft) ** 1.4);
      }
      geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 4));
      material = new T.MeshBasicMaterial({
        vertexColors: true,
        side: T.DoubleSide,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        toneMapped: false,
      });
    }
    plumes = positions.map((position) => {
      const plume = new T.Mesh(geometry, material);
      plume.name = `Rival exhaust / ${tier}`;
      plume.userData.aoExclude = true;
      plume.position.copy(position);
      group.add(plume);
      return plume;
    });
    group.userData.quality = tier;
  }
  function update({
    speed = 0,
    boost = false,
    catapulting = false,
    time = 0,
    energy = 1,
    quality = settings.quality,
    reducedMotion = false,
    visible = true,
  } = {}) {
    if (disposed) return;
    setQuality(quality);
    group.visible = visible;
    const velocity = T.MathUtils.clamp(speed / 150, 0, 1);
    const { pressure, flowTime } = respond({
      time,
      boosting: catapulting || (boost && energy > 0),
      reducedMotion,
    });
    const thrust = T.MathUtils.lerp(
      T.MathUtils.smoothstep(velocity, 0.08, 0.65),
      1,
      pressure,
    );
    for (const [mat, intensity] of power)
      mat.emissiveIntensity = intensity * (0.8 + thrust * 0.4 + pressure * 0.7);
    if (tier === 'high') {
      const u = material.uniforms;
      u.strength.value = 0.1 + thrust * 0.95 + pressure * 0.8;
      u.flowTime.value = flowTime;
      u.reducedMotion.value = reducedMotion ? 1 : 0;
      u.boostMix.value = pressure;
      u.thrustMix.value = thrust;
      u.glowColor.value.setHex(0x2376ff);
    }
    for (const plume of plumes)
      plume.scale.set(
        1 + thrust * 0.15 + pressure * 0.32,
        1 + thrust * 0.15 + pressure * 0.32,
        0.3 + thrust * 4.1 + pressure * 3.1,
      );
    group.userData.pressure = pressure;
  }
  update();
  return {
    group,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      release();
      for (const [mat, intensity] of power) mat.emissiveIntensity = intensity;
      group.removeFromParent();
    },
  };
}
