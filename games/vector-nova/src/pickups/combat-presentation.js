import * as T from 'three';
import { DEVICE_COLORS } from './theme.js';
import { createIonRibbon } from './ion-ribbon.js';
import { energyMaterial, energyPlane } from './energy-material.js';
import { COMBAT_RULES } from './combat.js';
import { disposeGroup } from './geometry.js';

export function createCombatPresentation(scene, combat) {
  const root = new T.Group();
  root.name = 'Automatic combat / pulses, bolts and wakes';
  scene.add(root);
  const charges = Array.from({ length: 10 }, () => {
    const group = new T.Group();
    const fields = Object.fromEntries(
      ['repulsor', 'arc', 'ion'].map((kind) => {
        const mesh = energyPlane(
          kind,
          kind === 'repulsor' ? 9 : 7,
          kind === 'repulsor' ? 9 : 10,
        );
        mesh.position.y = 0.12;
        if (kind === 'ion') mesh.position.z = -3.7;
        group.add(mesh);
        return [kind, mesh];
      }),
    );
    root.add(group);
    group.visible = false;
    return { group, fields };
  });
  const flashes = Array.from({ length: 32 }, () => {
    const group = new T.Group();
    const impact = energyPlane('impact', 2, 2);
    const upright = energyPlane('impact', 2, 2);
    upright.rotation.x = Math.PI / 2;
    const pressure = energyPlane('pressure', 2, 2);
    const crown = new T.Mesh(
      new T.CylinderGeometry(1, 1, 1, 64, 1, true),
      energyMaterial('crown'),
    );
    crown.geometry.translate(0, 0.5, 0);
    crown.userData.aoExclude = crown.userData.reflectionExclude = true;
    group.add(impact, upright, crown, pressure);
    root.add(group);
    group.visible = false;
    return { group, impact, upright, crown, pressure };
  });
  const shots = Array.from({ length: 30 }, () => {
    const group = new T.Group();
    const flat = energyPlane('bolt', 1.5, 16);
    const cross = energyPlane('bolt', 1.5, 16);
    cross.rotation.z = Math.PI / 2;
    group.add(flat, cross);
    group.visible = false;
    root.add(group);
    return group;
  });
  const ribbon = createIonRibbon(root);
  return {
    update({ mode, enabled = true, settings = {} }) {
      root.visible = enabled && ['racing', 'paused'].includes(mode);
      if (!root.visible) return;
      const state = combat.view();
      const tune = (mesh, kind, strength, age = 0) => {
        const u = mesh.material.uniforms;
        u.color.value.setHex(DEVICE_COLORS[kind]);
        u.age.value = age;
        u.time.value = state.time;
        u.strength.value = strength;
        u.motion.value = settings.reducedMotion ? 0 : 1;
      };
      charges.forEach(({ group }) => {
        group.visible = false;
      });
      Object.entries(state.emitters)
        .slice(0, 10)
        .forEach(([id, emitter], index) => {
          const pose = combat.pose(id);
          if (!pose) return;
          const { group, fields } = charges[index];
          group.visible = true;
          group.position.copy(pose.position);
          group.quaternion.copy(pose.quaternion);
          for (const [kind, mesh] of Object.entries(fields)) {
            mesh.visible = kind === emitter.kind;
            tune(
              mesh,
              kind,
              settings.reducedMotion ? 0.45 : 0.8,
              emitter.kind === 'repulsor'
                ? emitter.elapsed / COMBAT_RULES.pulseDelay
                : 0.5,
            );
          }
        });
      flashes.forEach(({ group, impact, upright, crown, pressure }, index) => {
        const flash = state.flashes[index];
        group.visible = !!flash;
        if (!flash) return;
        group.position.fromArray(flash.position);
        group.quaternion.fromArray(flash.quaternion);
        const muzzle = flash.type === 'muzzle';
        if (muzzle) {
          if (flash.age > 0.12) {
            group.visible = false;
            return;
          }
          const pose = combat.pose(flash.source);
          if (pose) {
            group.position
              .set(0, 0.4, 4)
              .applyQuaternion(pose.quaternion)
              .add(pose.position);
            group.quaternion.copy(pose.quaternion);
          }
        }
        const pulse = flash.kind === 'repulsor' && flash.radius > 10;
        crown.visible = pressure.visible = pulse;
        impact.visible = upright.visible = !pulse;
        const fade = Math.pow(
          Math.max(0, 1 - flash.age / (muzzle ? 0.12 : 0.55)),
          1.5,
        );
        const radius = pulse
          ? Math.max(1, flash.radius * Math.min(1, flash.age / 0.3))
          : muzzle
            ? 2.2
            : 2.5 + flash.age * 9;
        crown.scale.set(
          radius,
          Math.max(0.1, 1.4 * (1 - flash.age / 0.55)),
          radius,
        );
        impact.scale.setScalar(radius);
        upright.scale.setScalar(radius);
        pressure.scale.setScalar(radius);
        tune(crown, flash.kind, fade * (settings.reducedMotion ? 0.3 : 0.8));
        tune(impact, flash.kind, fade * (settings.reducedMotion ? 0.25 : 0.5));
        tune(upright, flash.kind, fade * (settings.reducedMotion ? 0.4 : 1));
        tune(pressure, flash.kind, fade * (settings.reducedMotion ? 0.1 : 0.3));
      });
      shots.forEach((mesh, index) => {
        const shot = state.shots[index];
        mesh.visible = !!shot;
        if (!shot) return;
        mesh.position.fromArray(shot.position);
        mesh.quaternion.fromArray(shot.quaternion);
        for (const plane of mesh.children) tune(plane, 'arc', 0.85, shot.age);
      });
      ribbon.update(state, combat, settings.reducedMotion);
    },
    dispose() {
      disposeGroup(root);
    },
  };
}
