import * as T from 'three';
import { DEVICE_COLORS } from './theme.js';
import { createIonRibbon } from './ion-ribbon.js';
import { energyCylinder, energyPlane } from './energy-material.js';
import { COMBAT_RULES } from './combat.js';
import { ARC_SHOT_HEIGHT, ARC_MUZZLE_HEIGHT } from './rules.js';
import { disposeGroup } from './geometry.js';

const BOLT_LENGTH = 16;
const BOLT_WIDTH = 2.8;

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
    const shell = energyCylinder('repulsor-shell');
    shell.name = 'Repulsor / compressed charge shell';
    shell.position.y = -0.1;
    group.add(shell);
    root.add(group);
    group.visible = false;
    return { group, fields, shell };
  });
  const flashes = Array.from({ length: 32 }, () => {
    const group = new T.Group();
    group.name = 'Combat / contact or pressure pulse';
    const impact = energyPlane('impact', 2, 2);
    const upright = energyPlane('impact', 2, 2);
    upright.rotation.x = Math.PI / 2;
    const pressure = energyPlane('pressure', 2, 2);
    const crown = energyCylinder('crown');
    group.add(impact, upright, crown, pressure);
    root.add(group);
    group.visible = false;
    return { group, impact, upright, crown, pressure };
  });
  const shots = Array.from({ length: 30 }, () => {
    const group = new T.Group();
    group.name = 'Arc / traveling pulse';
    const flat = energyPlane('bolt', BOLT_WIDTH, BOLT_LENGTH);
    const cross = energyPlane('bolt', BOLT_WIDTH, BOLT_LENGTH);
    // The simulation point is the leading end. Growing its trailing streak
    // from zero prevents a newborn pulse extending behind the firing ship.
    flat.geometry.translate(0, 0, -BOLT_LENGTH / 2);
    cross.geometry.translate(0, 0, -BOLT_LENGTH / 2);
    cross.rotation.z = Math.PI / 2;
    group.add(flat, cross);
    group.visible = false;
    root.add(group);
    return group;
  });
  const ribbon = createIonRibbon(root);
  const visualOffset = new T.Vector3();
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
          const { group, fields, shell } = charges[index];
          group.visible = true;
          group.position.copy(pose.position);
          group.quaternion.copy(pose.quaternion);
          const compression = T.MathUtils.clamp(
            emitter.elapsed / COMBAT_RULES.pulseDelay,
            0,
            1,
          );
          shell.visible = emitter.kind === 'repulsor';
          shell.scale.set(
            4.4 - compression * 0.85,
            1.15,
            4.9 - compression * 0.65,
          );
          tune(
            shell,
            'repulsor',
            settings.reducedMotion ? 0.35 : 0.75,
            compression,
          );
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
              .set(0, ARC_MUZZLE_HEIGHT, 0)
              .applyQuaternion(pose.quaternion)
              .add(pose.position);
            group.quaternion.copy(pose.quaternion);
          }
        }
        const pulse = flash.kind === 'repulsor' && flash.radius > 10;
        const arcHit = flash.kind === 'arc' && !!flash.target;
        const repulsorHit = flash.kind === 'repulsor' && !!flash.target;
        crown.visible = pressure.visible = pulse || repulsorHit;
        impact.visible = upright.visible = !pulse && !repulsorHit;
        const fade =
          (arcHit ? 0.35 : 1) *
          Math.pow(Math.max(0, 1 - flash.age / (muzzle ? 0.12 : 0.55)), 1.5);
        const radius = pulse
          ? Math.max(3.6, flash.radius * Math.min(1, flash.age / 0.3))
          : muzzle
            ? 2.2
            : arcHit
              ? 1.2 + flash.age * 2
              : repulsorHit
                ? 2 + flash.age * 4
                : 2.5 + flash.age * 9;
        crown.scale.set(
          radius,
          Math.max(0.1, (repulsorHit ? 1.1 : 1.7) * (1 - flash.age / 0.55)),
          radius,
        );
        impact.scale.setScalar(radius);
        upright.scale.setScalar(radius);
        pressure.scale.setScalar(radius);
        tune(crown, flash.kind, fade * (settings.reducedMotion ? 0.3 : 0.8));
        tune(impact, flash.kind, fade * (settings.reducedMotion ? 0.25 : 0.5));
        tune(upright, flash.kind, fade * (settings.reducedMotion ? 0.4 : 1));
        tune(
          pressure,
          flash.kind,
          fade * (settings.reducedMotion ? 0.2 : 0.65),
        );
      });
      shots.forEach((mesh, index) => {
        const shot = state.shots[index];
        mesh.visible = !!shot;
        if (!shot) return;
        mesh.position.fromArray(shot.position);
        mesh.quaternion.fromArray(shot.quaternion);
        mesh.position.add(
          visualOffset
            .set(0, ARC_MUZZLE_HEIGHT - ARC_SHOT_HEIGHT, 0)
            .applyQuaternion(mesh.quaternion),
        );
        mesh.scale.z = Math.min(
          1,
          Math.max(0, (shot.age * COMBAT_RULES.arcSpeed) / BOLT_LENGTH),
        );
        for (const plane of mesh.children)
          tune(plane, 'arc', settings.reducedMotion ? 0.8 : 1.15, shot.age);
      });
      ribbon.update(state, combat, settings.reducedMotion);
    },
    dispose() {
      disposeGroup(root);
    },
  };
}
