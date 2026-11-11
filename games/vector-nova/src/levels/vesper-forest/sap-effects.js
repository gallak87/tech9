import * as T from 'three';
import { createShipContactOutline } from '../../effects/ship-contact-outline.js';

const count = 32;
const fraction = (value) => T.MathUtils.euclideanModulo(value, 1);

/** Contact-only resin spray: no heat/fire state and no changes to the hull skin. */
export function createVesperSapEffects() {
  const group = new T.Group();
  group.name = 'Vesper / sticky sap contact droplets';
  group.visible = false;
  const geometry = new T.SphereGeometry(1, 6, 4);
  const material = new T.MeshStandardMaterial({
    name: 'Vesper / honey-gold sap droplets',
    color: 0xeeb84d,
    emissive: 0x91600b,
    emissiveIntensity: 0.4,
    roughness: 0.24,
    metalness: 0,
  });
  const droplets = new T.InstancedMesh(geometry, material, count);
  droplets.name = 'Vesper / trailing sticky sap spray';
  droplets.frustumCulled = false;
  droplets.instanceMatrix.setUsage(T.DynamicDrawUsage);
  droplets.userData.aoExclude = droplets.userData.reflectionExclude = true;
  group.add(droplets);
  const outline = createShipContactOutline({
    color: '#ffd256',
    label: 'Vesper sap',
  });
  const pose = new T.Object3D();
  let disposed = false;
  return {
    group,
    update({
      ship,
      motion,
      state = {},
      settings = {},
      time = 0,
      mode,
      reviewing,
    } = {}) {
      if (disposed) return;
      const local = motion?.motion ?? motion;
      const contact = Boolean(
        ship?.group &&
        !reviewing &&
        ['racing', 'paused'].includes(mode) &&
        local?.mode === 'magnetic' &&
        local.surface?.id === 'sap',
      );
      outline.update(
        ship?.group,
        contact ? (settings.reducedMotion ? 0.28 : 0.6) : 0,
      );
      group.visible = contact && !settings.reducedMotion;
      if (!group.visible) return;
      const bounds = ship.group.userData.bounds ?? {
        min: [-2.25, -0.12, -3.5],
        max: [2.25, 1.8, 3.7],
      };
      ship.group.updateWorldMatrix(true, false);
      const halfWidth = (bounds.max[0] - bounds.min[0]) * 0.5;
      droplets.count = settings.quality === 'low' ? 12 : count;
      for (let i = 0; i < droplets.count; i++) {
        const age = fraction(time * 1.65 + i * 0.61803398875);
        const seed = fraction(Math.sin(i * 127.1 + 73.7) * 43758.5453);
        const side = i % 2 ? 1 : -1;
        pose.position.set(
          side * (halfWidth * 0.78 + age * (0.4 + seed)),
          bounds.min[1] +
            0.18 +
            Math.sin(age * Math.PI) * (0.5 + seed) -
            age * 0.5,
          bounds.min[2] +
            0.7 -
            age * (3.5 + Math.min(4, (state.speed ?? 0) * 0.035)),
        );
        pose.position.applyMatrix4(ship.group.matrixWorld);
        ship.group.getWorldQuaternion(pose.quaternion);
        const radius = (0.11 + seed * 0.15) * (1 - age * 0.65);
        pose.scale.set(radius, radius * (1.3 + age), radius);
        pose.updateMatrix();
        droplets.setMatrixAt(i, pose.matrix);
      }
      droplets.instanceMatrix.needsUpdate = true;
    },
    reset() {
      group.visible = false;
      outline.reset();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      outline.dispose();
      group.removeFromParent();
      droplets.dispose();
      geometry.dispose();
      material.dispose();
      group.clear();
    },
  };
}

export function withVesperSapEffects(environment) {
  const effects = createVesperSapEffects();
  environment.group.add(effects.group);
  let disposed = false;
  return {
    ...environment,
    update(frame) {
      if (disposed) return;
      environment.update?.(frame);
      effects.update(frame);
    },
    reset(frame) {
      if (disposed) return;
      environment.reset?.(frame);
      effects.reset();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      effects.dispose();
      environment.dispose();
    },
  };
}
