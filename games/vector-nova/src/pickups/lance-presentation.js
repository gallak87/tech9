import * as T from 'three';
import { ARC_MUZZLE_HEIGHT, ARC_SHOT_HEIGHT, LANCE_SPEED } from './rules.js';
import { disposeGroup } from './geometry.js';
import { lowMaterial } from './low-geometry.js';

const BOLT_LENGTH = 14;
const CONTACT_LIFETIME = 0.32;
const MUZZLE_LIFETIME = 0.075;

// Lance shares the swept projectile simulation with Arc, but its visual is a
// solid penetrator and directional metal fragments, never a pressure front.
export const isLanceFlash = (flash) =>
  flash.equipment === 'lance' && flash.kind !== 'aegis';

function spearGeometry() {
  const geometry = new T.ConeGeometry(0.5, 1, 4, 1, false);
  geometry.rotateX(Math.PI / 2);
  geometry.rotateZ(Math.PI / 4);
  geometry.translate(0, 0, -0.5);
  return geometry;
}

export function createLancePresentation(parent, { low = false } = {}) {
  const group = new T.Group();
  group.name = 'Lance / dense penetrator and armor fragments';
  parent.add(group);
  function batch(geometry, material, capacity, name) {
    const mesh = new T.InstancedMesh(geometry, material, capacity);
    mesh.name = name;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.userData.aoExclude = mesh.userData.reflectionExclude = true;
    mesh.setColorAt(0, new T.Color());
    mesh.instanceColor.setUsage(T.DynamicDrawUsage);
    group.add(mesh);
    return mesh;
  }
  const cores = batch(
    spearGeometry(),
    lowMaterial(0xeaf8ff),
    30,
    'Lance / white-hot spear cores',
  );
  const fragments = batch(
    new T.BoxGeometry(1, 1, 1),
    lowMaterial(0xffc888),
    32 * 9,
    'Lance / directional impact splinters and muzzle snap',
  );
  const glow = low
    ? null
    : batch(
        spearGeometry(),
        new T.MeshBasicMaterial({
          color: 0x6dcaff,
          transparent: true,
          opacity: 0.2,
          depthWrite: false,
          blending: T.AdditiveBlending,
          toneMapped: false,
        }),
        30,
        'Lance / narrow ionized sleeve',
      );
  const transform = new T.Object3D();
  const offset = new T.Vector3();
  const position = new T.Vector3();
  const quaternion = new T.Quaternion();
  const color = new T.Color();
  const direction = new T.Vector3();
  const zAxis = new T.Vector3(0, 0, 1);
  const meshes = [cores, fragments, ...(glow ? [glow] : [])];
  function instance(mesh, strength = 1) {
    transform.updateMatrix();
    mesh.setMatrixAt(mesh.count, transform.matrix);
    mesh.setColorAt(mesh.count++, color.setScalar(strength));
  }
  function shard(local, axis, size, strength) {
    transform.position.copy(local).applyQuaternion(quaternion).add(position);
    transform.quaternion
      .setFromUnitVectors(zAxis, axis)
      .premultiply(quaternion);
    transform.scale.set(...size);
    instance(fragments, strength);
  }
  return {
    group,
    update(state, combat, { reducedMotion = false } = {}) {
      for (const mesh of meshes) mesh.count = 0;
      const strength = reducedMotion ? 0.6 : 1;
      for (const shot of state.shots
        .filter((shot) => shot.heavy)
        .slice(0, 30)) {
        transform.quaternion.fromArray(shot.quaternion);
        transform.position
          .fromArray(shot.position)
          .add(
            offset
              .set(0, ARC_MUZZLE_HEIGHT - ARC_SHOT_HEIGHT, 0)
              .applyQuaternion(transform.quaternion),
          );
        const length = Math.min(
          BOLT_LENGTH,
          Math.max(0, shot.age * LANCE_SPEED),
        );
        transform.scale.set(0.46, 0.4, length);
        instance(cores, strength);
        if (glow) {
          transform.scale.set(0.95, 0.82, length);
          instance(glow, strength);
        }
      }
      for (const flash of state.flashes.filter(isLanceFlash).slice(0, 32)) {
        const muzzle = flash.type === 'muzzle';
        const lifetime = muzzle ? MUZZLE_LIFETIME : CONTACT_LIFETIME;
        if (flash.age >= lifetime) continue;
        position.fromArray(flash.position);
        quaternion.fromArray(flash.quaternion);
        if (muzzle) {
          const pose = combat.pose(flash.source);
          if (pose) {
            quaternion.copy(pose.quaternion);
            position
              .set(0, ARC_MUZZLE_HEIGHT, 0)
              .applyQuaternion(quaternion)
              .add(pose.position);
          }
          // A short forward snap between the equipment owner's charging rails.
          shard(
            offset.set(0, 0, 1),
            zAxis,
            [0.17, 0.16, 2],
            strength * (1 - flash.age / lifetime),
          );
          continue;
        }
        const age = Math.max(0, flash.age);
        const fade = Math.pow(1 - age / lifetime, 1.7) * strength;
        const travel = reducedMotion ? 0 : age * 13;
        // Most fragments leave backwards along the incoming shot. Unequal
        // lengths keep this a localized armor strike rather than a radial ring.
        const count = low ? 4 : 8;
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 + 0.3;
          const spread = 0.45 + (i % 3) * 0.14;
          direction
            .set(Math.cos(angle) * spread, Math.sin(angle) * spread, -1)
            .normalize();
          shard(
            offset.copy(direction).multiplyScalar(travel + 0.18),
            direction,
            [0.07, 0.07, (0.5 + (i % 3) * 0.22) * (reducedMotion ? 0.6 : 1)],
            fade,
          );
        }
        shard(
          offset.set(0, 0, -0.1),
          zAxis,
          [0.6 * fade, 0.5 * fade, 0.28],
          fade,
        );
      }
      for (const mesh of meshes) {
        mesh.visible = mesh.count > 0;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
      }
    },
    dispose() {
      for (const mesh of meshes) mesh.dispose();
      disposeGroup(group);
    },
  };
}
