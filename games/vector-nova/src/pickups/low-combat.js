import * as T from 'three';
import { DEVICE_COLORS } from './theme.js';
import { COMBAT_RULES } from './combat.js';
import {
  ARC_MUZZLE_HEIGHT,
  ARC_SHOT_HEIGHT,
  ION_WAKE_RADIUS,
} from './rules.js';
import { disposeGroup } from './geometry.js';
import { lowMaterial } from './low-geometry.js';
import { createLancePresentation, isLanceFlash } from './lance-presentation.js';
import { createRoadPulsePresentation } from './road-pulse.js';

// Bounded batches, independent of racer count. Keep every live projectile
// and dangerous wake segment; Low changes presentation, never simulation.
export function createLowCombatPresentation(scene, combat, projection = null) {
  const group = new T.Group();
  group.name = 'Low combat / batches';
  scene.add(group);
  const transform = new T.Object3D(),
    color = new T.Color();
  const offset = new T.Vector3();
  const ring = () => new T.RingGeometry(0.92, 1, 24).rotateX(-Math.PI / 2);
  function batch(geometry, capacity, name) {
    const mesh = new T.InstancedMesh(
      geometry,
      lowMaterial(0xffffff, 0.8),
      capacity,
    );
    mesh.name = name;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.setColorAt(0, new T.Color(0xffffff));
    mesh.instanceColor.setUsage(T.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.userData.aoExclude = mesh.userData.reflectionExclude = true;
    group.add(mesh);
    return mesh;
  }
  const charges = batch(ring(), 10, 'Low combat / charge rings');
  const flashes = batch(ring(), 32, 'Low combat / contact rings');
  const shots = batch(
    new T.BoxGeometry(0.55, 0.4, 1).translate(0, 0, -0.5),
    30,
    'Low Arc / bolts',
  );
  // Rounded caps cover the contact radius even for stationary deposits.
  const rim = [];
  for (const end of [0, 1])
    for (let i = 0; i <= 6; i++) {
      const angle = (i / 6) * Math.PI + (end ? 0 : Math.PI);
      rim.push([end, Math.cos(angle), Math.sin(angle)]);
    }
  const corners = [];
  for (let i = 0; i < rim.length; i++)
    corners.push(rim[i], rim[(i + 1) % rim.length]);
  corners.push([0, 0, 0], [1, 0, 0]);
  const positions = new Float32Array(256 * corners.length * 3);
  const colors = new Float32Array(positions.length);
  const geometry = new T.BufferGeometry();
  geometry.setAttribute(
    'position',
    new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage),
  );
  geometry.setAttribute(
    'color',
    new T.BufferAttribute(colors, 3).setUsage(T.DynamicDrawUsage),
  );
  geometry.setDrawRange(0, 0);
  const material = new T.LineBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    toneMapped: false,
  });
  const wake = new T.LineSegments(geometry, material);
  wake.name = 'Low Ion / live wake footprint';
  wake.frustumCulled = false;
  wake.userData.aoExclude = wake.userData.reflectionExclude = true;
  group.add(wake);
  const lance = createLancePresentation(group, { low: true });
  const roadPulse = projection
    ? createRoadPulsePresentation(group, projection, { low: true })
    : null;
  const a = new T.Vector3(),
    b = new T.Vector3(),
    right = new T.Vector3(),
    up = new T.Vector3();
  const direction = new T.Vector3(),
    point = new T.Vector3(),
    quaternion = new T.Quaternion();
  function instance(mesh, index, kind, strength = 1) {
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    mesh.setColorAt(
      index,
      color.setHex(DEVICE_COLORS[kind]).multiplyScalar(strength),
    );
  }
  function upload(mesh) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  return {
    group,
    update({ mode, enabled = true, settings = {} }) {
      group.visible = enabled && ['racing', 'paused'].includes(mode);
      if (!group.visible) return;
      const state = combat.view();
      roadPulse?.update(state, settings);
      const strength = settings.reducedMotion ? 0.65 : 1;
      charges.count = 0;
      for (const [id, emitter] of Object.entries(state.emitters).slice(0, 10)) {
        const pose = combat.pose(id);
        if (!pose) continue;
        transform.position.copy(pose.position);
        transform.quaternion.copy(pose.quaternion);
        transform.scale.set(2.8, 1, 4.2);
        instance(charges, charges.count++, emitter.kind, strength);
      }
      flashes.count = 0;
      for (const flash of state.flashes.slice(0, 32)) {
        // The bolt itself supplies the muzzle cue; contacts use one small ring.
        if (
          flash.type === 'muzzle' ||
          isLanceFlash(flash) ||
          roadPulse?.handles(flash)
        )
          continue;
        transform.position.fromArray(flash.position);
        transform.quaternion.fromArray(flash.quaternion);
        const pulse = flash.kind === 'repulsor' && flash.radius > 10;
        const radius = pulse
          ? Math.max(3.6, flash.radius * Math.min(1, flash.age / 0.3))
          : 2.5;
        transform.scale.set(radius, 1, radius);
        instance(
          flashes,
          flashes.count++,
          flash.kind,
          strength * Math.max(0, 1 - flash.age / 0.55),
        );
      }
      shots.count = 0;
      for (const shot of state.shots.slice(0, 30)) {
        if (shot.heavy) continue;
        transform.position.fromArray(shot.position);
        transform.quaternion.fromArray(shot.quaternion);
        transform.position.add(
          offset
            .set(0, ARC_MUZZLE_HEIGHT - ARC_SHOT_HEIGHT, 0)
            .applyQuaternion(transform.quaternion),
        );
        transform.scale.set(
          1,
          1,
          Math.min(8, shot.age * COMBAT_RULES.arcSpeed),
        );
        instance(shots, shots.count++, 'arc', strength);
      }
      for (const mesh of [charges, flashes, shots]) upload(mesh);
      lance.update(state, combat, settings);
      const count = Math.min(256, state.wakes.length);
      for (let i = 0; i < count; i++) {
        const segment = state.wakes[i];
        a.fromArray(segment.a);
        b.fromArray(segment.b);
        quaternion.fromArray(segment.quaternion);
        up.set(0, 1, 0).applyQuaternion(quaternion);
        direction.subVectors(b, a).normalize();
        if (direction.lengthSq() < 0.1)
          direction.set(0, 0, 1).applyQuaternion(quaternion);
        right.crossVectors(up, direction).normalize();
        if (right.lengthSq() < 0.1)
          right.set(1, 0, 0).applyQuaternion(quaternion);
        const life = Math.max(
          0.18,
          1 - segment.age / COMBAT_RULES.wakeLifetime,
        );
        color.setHex(DEVICE_COLORS.ion).multiplyScalar(life * strength);
        for (const [j, [end, side, along]] of corners.entries()) {
          const at = (i * corners.length + j) * 3;
          point
            .copy(end ? b : a)
            .addScaledVector(up, -0.15)
            .addScaledVector(right, side * ION_WAKE_RADIUS)
            .addScaledVector(direction, along * ION_WAKE_RADIUS);
          point.toArray(positions, at);
          color.toArray(colors, at);
        }
      }
      geometry.setDrawRange(0, count * corners.length);
      geometry.attributes.position.needsUpdate =
        geometry.attributes.color.needsUpdate = true;
    },
    dispose() {
      for (const mesh of [charges, flashes, shots]) mesh.dispose();
      lance.dispose();
      roadPulse?.dispose();
      disposeGroup(group);
    },
  };
}
