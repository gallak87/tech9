import * as T from 'three';
import { ARC_MUZZLE_HEIGHT, ARC_SHOT_HEIGHT, LANCE_SPEED } from './rules.js';
import { disposeGroup } from './geometry.js';
import { lowMaterial } from './low-geometry.js';

const BOLT_LENGTH = 14;
const CONTACT_LIFETIME = 0.55;
const MUZZLE_LIFETIME = 0.12;

// Lance shares the swept projectile simulation with Arc, but its visual is a
// thick molten blast and a short fireball, independent of Repulsor pulses.
export const isLanceFlash = (flash) =>
  flash.equipment === 'lance' && flash.kind !== 'aegis';

function fireGlowMaterial() {
  return new T.ShaderMaterial({
    name: 'Lance / soft red-orange fire glow',
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    toneMapped: false,
    uniforms: { time: { value: 0 } },
    vertexShader: `
      varying vec3 vNormal, vEye, vLocal, vEnergy;
      void main() {
        mat3 frame = mat3(instanceMatrix);
        vec3 inverseScale = vec3(dot(frame[0],frame[0]),dot(frame[1],frame[1]),dot(frame[2],frame[2]));
        vNormal = normalize(normalMatrix * frame * (normal / max(inverseScale,vec3(.00001))));
        vec4 p = modelViewMatrix * instanceMatrix * vec4(position,1.);
        vEye = -p.xyz;
        vLocal = position;
        vEnergy = instanceColor;
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: `
      uniform float time;
      varying vec3 vNormal, vEye, vLocal, vEnergy;
      void main() {
        float facing = max(0.,dot(normalize(vNormal),normalize(vEye)));
        float billow = .88 + .12*sin(vLocal.x*19.+vLocal.y*13.+vLocal.z*9.-time*17.);
        float alpha = pow(facing,2.4)*billow*.4;
        gl_FragColor = vec4(vec3(1.,.055,.004)*vEnergy,alpha);
      }`,
  });
}

export function createLancePresentation(parent, { low = false } = {}) {
  const group = new T.Group();
  group.name = 'Lance / molten blast and fireball';
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
    new T.SphereGeometry(0.5, low ? 8 : 12, low ? 6 : 8),
    lowMaterial(0xffd36d),
    30 + 32 * 2,
    'Lance / yellow-hot blast cores',
  );
  const fireMaterial = lowMaterial(0xff5908, low ? 0.8 : 0.7);
  fireMaterial.side = T.FrontSide;
  const fragments = batch(
    new T.IcosahedronGeometry(0.5, low ? 0 : 1),
    fireMaterial,
    30 + 32 * 16,
    'Lance / lava-orange body, fireball and hot fragments',
  );
  const glow = low
    ? null
    : batch(
        new T.SphereGeometry(0.5, 12, 8),
        fireGlowMaterial(),
        30 + 32 * 2,
        'Lance / soft fiery blast halo',
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
  function blob(mesh, local, size, strength) {
    transform.position.copy(local).applyQuaternion(quaternion).add(position);
    transform.quaternion.copy(quaternion);
    transform.scale.set(...size);
    instance(mesh, strength);
  }
  return {
    group,
    update(state, combat, { reducedMotion = false } = {}) {
      for (const mesh of meshes) mesh.count = 0;
      if (glow)
        glow.material.uniforms.time.value = reducedMotion ? 0 : state.time;
      const strength = reducedMotion ? 0.55 : 1;
      for (const shot of state.shots
        .filter((shot) => shot.heavy)
        .slice(0, 30)) {
        quaternion.fromArray(shot.quaternion);
        position
          .fromArray(shot.position)
          .add(
            offset
              .set(0, ARC_MUZZLE_HEIGHT - ARC_SHOT_HEIGHT, 0)
              .applyQuaternion(quaternion),
          );
        const length = Math.min(
          BOLT_LENGTH,
          Math.max(0, shot.age * LANCE_SPEED),
        );
        // The small hot center sits inside a broad orange molten body. Both
        // grow behind the swept leading point instead of crossing the hull.
        blob(
          cores,
          offset.set(0, 0, -length * 0.5),
          [1.5, 1.3, length],
          strength,
        );
        blob(
          fragments,
          offset.set(0, 0, -length * 0.51),
          [3.8, 3.2, length * 0.96],
          strength,
        );
        if (glow)
          blob(
            glow,
            offset.set(0, 0, -length * 0.5),
            [6.4, 5.5, length],
            strength,
          );
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
          const fade = Math.pow(1 - flash.age / lifetime, 0.7);
          blob(
            cores,
            offset.set(0, 0, 1.4),
            [1.2 * fade, 1.1 * fade, 3.2],
            strength,
          );
          blob(
            fragments,
            offset.set(0, 0, 1.8),
            [3.6 * fade, 3.1 * fade, 4.3],
            strength * fade,
          );
          if (glow)
            blob(glow, offset.set(0, 0, 1.8), [5.4, 4.8, 5.2], strength * fade);
          continue;
        }
        const age = Math.max(0, flash.age);
        const fade = Math.pow(1 - age / lifetime, 1.2);
        const growth = reducedMotion
          ? 0.85
          : 0.45 + 0.55 * Math.min(1, age / 0.1);
        const size = growth * Math.pow(fade, 0.25);
        const energy = fade * strength;
        // Orange billows and a soft red halo form the boom. A small yellow-hot
        // center preserves the lava color rather than washing the blast white.
        blob(
          cores,
          offset.set(0, 0, -0.55),
          [2.8 * size, 2.5 * size, 2.5 * size],
          energy,
        );
        blob(
          fragments,
          offset.set(0, 0.4 * size, -0.35),
          [7.2 * size, 6.3 * size, 5.8 * size],
          energy,
        );
        const lobes = low ? 2 : 4;
        for (let i = 0; i < lobes; i++) {
          const angle = i * 2.399;
          const lift = reducedMotion ? 0 : age * 1.5;
          blob(
            fragments,
            offset.set(
              Math.cos(angle) * 2.1 * size,
              Math.sin(angle) * 1.6 * size + lift,
              -0.2 - i * 0.18,
            ),
            [3.8 * size, 3.4 * size, 3.3 * size],
            energy * (0.85 + i * 0.04),
          );
        }
        if (glow) {
          blob(
            glow,
            offset.set(0, 0.3, -0.45),
            [13.5 * size, 11.8 * size, 10.5 * size],
            energy,
          );
          blob(
            glow,
            offset.set(0, 0.7, -0.7),
            [9.4 * size, 8.8 * size, 8.2 * size],
            energy * 0.55,
          );
        }
        const count = low ? 5 : 10;
        const travel = reducedMotion ? 0.5 : 1 + age * 20;
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 + 0.3;
          direction
            .set(Math.cos(angle), Math.sin(angle) * 0.8, -0.45 - (i % 3) * 0.18)
            .normalize();
          transform.position
            .copy(direction)
            .multiplyScalar(travel)
            .applyQuaternion(quaternion)
            .add(position);
          transform.quaternion
            .setFromUnitVectors(zAxis, direction)
            .premultiply(quaternion);
          transform.scale.set(
            0.2 * size,
            0.2 * size,
            (1.4 + (i % 3) * 0.45) * size,
          );
          instance(fragments, energy);
        }
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
