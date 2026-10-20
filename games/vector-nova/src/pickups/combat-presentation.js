import * as T from 'three';
import { DEVICE_COLORS } from './theme.js';
import { COMBAT_RULES } from './combat.js';
import { disposeGroup } from './geometry.js';

export function createCombatPresentation(scene, combat) {
  const root = new T.Group();
  root.name = 'Automatic combat / pulses, bolts and wakes';
  scene.add(root);
  function rings(count) {
    return Array.from({ length: count }, () => {
      const geometry = new T.RingGeometry(0.86, 1, 64);
      geometry.rotateX(-Math.PI / 2);
      const mesh = new T.Mesh(
        geometry,
        new T.MeshBasicMaterial({
          transparent: true,
          opacity: 0.7,
          side: T.DoubleSide,
          depthWrite: false,
          blending: T.AdditiveBlending,
          toneMapped: false,
        }),
      );
      mesh.material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            '#include <common>\nvarying vec2 ringCoord;',
          )
          .replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\nringCoord = position.xz;',
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            '#include <common>\nvarying vec2 ringCoord;',
          )
          .replace(
            '#include <color_fragment>',
            '#include <color_fragment>\nfloat radius = length(ringCoord); diffuseColor.a *= smoothstep(.86,.92,radius) * (1.-smoothstep(.94,1.,radius));',
          );
      };
      mesh.material.customProgramCacheKey = () => 'combat-soft-rings-v1';
      mesh.visible = false;
      root.add(mesh);
      return mesh;
    });
  }
  const charges = rings(10),
    flashes = rings(32);
  const shots = Array.from({ length: 30 }, () => {
    const group = new T.Group();
    const glow = new T.Mesh(
      new T.CylinderGeometry(0.55, 0.55, 14, 6),
      new T.MeshBasicMaterial({
        color: DEVICE_COLORS.arc,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: T.AdditiveBlending,
        toneMapped: false,
      }),
    );
    glow.rotation.x = Math.PI / 2;
    const core = new T.Mesh(
      new T.CylinderGeometry(0.13, 0.13, 11, 5),
      new T.MeshBasicMaterial({ color: 0xeaffff, toneMapped: false }),
    );
    core.rotation.x = Math.PI / 2;
    group.add(glow, core);
    group.visible = false;
    root.add(group);
    return group;
  });
  const wakeGeometry = new T.PlaneGeometry(1, 1);
  wakeGeometry.rotateX(-Math.PI / 2);
  const wakeTime = { value: 0 };
  const wakeMaterial = new T.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.65,
    side: T.DoubleSide,
    depthWrite: false,
    blending: T.AdditiveBlending,
    toneMapped: false,
  });
  wakeMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.wakeTime = wakeTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 wakeUv;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nwakeUv = uv;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec2 wakeUv; uniform float wakeTime;',
      )
      .replace(
        '#include <color_fragment>',
        [
          '#include <color_fragment>',
          'float edge = smoothstep(0.0, 0.18, wakeUv.x) * (1.0 - smoothstep(0.82, 1.0, wakeUv.x));',
          'float filament = pow(0.5 + 0.5 * sin(wakeUv.x * 31.4159 + sin(wakeUv.y * 6.283 + wakeTime) * 0.7), 4.0);',
          'diffuseColor.a *= edge * (0.12 + filament * 0.88);',
        ].join('\n'),
      );
  };
  wakeMaterial.customProgramCacheKey = () => 'ion-wake-filaments-v1';
  const ribbons = new T.InstancedMesh(wakeGeometry, wakeMaterial, 256);
  ribbons.instanceMatrix.setUsage(T.DynamicDrawUsage);
  ribbons.frustumCulled = false;
  ribbons.count = 0;
  root.add(ribbons);
  const transform = new T.Object3D();
  return {
    update({ mode, enabled = true, settings = {} }) {
      root.visible = enabled && ['racing', 'paused'].includes(mode);
      if (!root.visible) return;
      const state = combat.view();
      charges.forEach((mesh) => {
        mesh.visible = false;
      });
      Object.entries(state.emitters)
        .slice(0, 10)
        .forEach(([id, emitter], index) => {
          const pose = combat.pose(id);
          if (!pose) return;
          const mesh = charges[index];
          mesh.visible = true;
          mesh.position.copy(pose.position);
          mesh.quaternion.copy(pose.quaternion);
          mesh.material.color.setHex(DEVICE_COLORS[emitter.kind]);
          const fraction =
            emitter.kind === 'repulsor'
              ? emitter.elapsed / COMBAT_RULES.pulseDelay
              : 0.65;
          mesh.scale.setScalar(2.3 + fraction * 1.8);
          mesh.material.opacity = settings.reducedMotion
            ? 0.6
            : 0.35 + fraction * 0.5;
        });
      flashes.forEach((mesh, index) => {
        const flash = state.flashes[index];
        mesh.visible = !!flash;
        if (!flash) return;
        mesh.position.fromArray(flash.position);
        mesh.quaternion.fromArray(flash.quaternion);
        mesh.material.color.setHex(DEVICE_COLORS[flash.kind]);
        mesh.scale.setScalar(
          Math.max(1, flash.radius * Math.min(1, flash.age / 0.25)),
        );
        mesh.material.opacity =
          (1 - flash.age / 0.55) * (settings.reducedMotion ? 0.35 : 0.8);
      });
      shots.forEach((mesh, index) => {
        const shot = state.shots[index];
        mesh.visible = !!shot;
        if (shot) {
          mesh.position.fromArray(shot.position);
          mesh.quaternion.fromArray(shot.quaternion);
        }
      });
      wakeTime.value = settings.reducedMotion ? 0 : state.time * 3;
      ribbons.count = state.wakes.length;
      state.wakes.forEach((wake, index) => {
        const a = new T.Vector3().fromArray(wake.a),
          b = new T.Vector3().fromArray(wake.b);
        const direction = b.clone().sub(a);
        const length = direction.length();
        direction.normalize();
        const normal = new T.Vector3(0, 1, 0).applyQuaternion(
          new T.Quaternion().fromArray(wake.quaternion),
        );
        const right = normal.clone().cross(direction).normalize();
        normal.crossVectors(direction, right).normalize();
        transform.position.copy(a).lerp(b, 0.5).addScaledVector(normal, -0.45);
        transform.quaternion.setFromRotationMatrix(
          new T.Matrix4().makeBasis(right, normal, direction),
        );
        const fade = 1 - wake.age / COMBAT_RULES.wakeLifetime;
        transform.scale.set(4.5, 0.22 * fade, Math.max(0.01, length + 0.1));
        transform.updateMatrix();
        ribbons.setMatrixAt(index, transform.matrix);
        ribbons.setColorAt(
          index,
          new T.Color(DEVICE_COLORS.ion).multiplyScalar(fade),
        );
      });
      ribbons.instanceMatrix.needsUpdate = true;
      if (ribbons.instanceColor) ribbons.instanceColor.needsUpdate = true;
    },
    dispose() {
      disposeGroup(root);
    },
  };
}
