import * as T from 'three';

// The same snapshot-driven effects serve racing and isolated studio auditions.
export function createEquipmentEffects(scene) {
  const group = new T.Group();
  group.name = 'Player equipment effects';
  scene.add(group);
  const ringGeometry = new T.TorusGeometry(4.3, 0.055, 6, 64);
  const sphereGeometry = new T.IcosahedronGeometry(1, 2);
  const material = new T.MeshBasicMaterial({
    color: 0x72ceff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: T.AdditiveBlending,
    toneMapped: false,
  });
  const rings = Array.from({ length: 3 }, (_, i) => {
    const mesh = new T.Mesh(ringGeometry, material.clone());
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = i * 0.25;
    group.add(mesh);
    return mesh;
  });
  const shieldMaterial = material.clone();
  shieldMaterial.wireframe = true;
  const shield = new T.Mesh(sphereGeometry, shieldMaterial);
  shield.name = 'Deflector / protective field';
  shield.scale.set(3.7, 1.8, 6);
  shield.position.y = 0.4;
  group.add(shield);
  let key = '',
    lastTimes = [],
    pulses = [];
  function reset() {
    key = '';
    lastTimes = [];
    pulses = [];
    group.visible = false;
  }
  reset();
  return {
    group,
    reset,
    update({ equipment, pose, mode, suspended, reducedMotion }) {
      const slots = equipment?.slots ?? [],
        time = equipment?.time ?? 0;
      const next = slots.map((slot) => slot?.id ?? '').join(',');
      if (key !== next) {
        key = next;
        lastTimes = [];
        pulses = [];
      }
      slots.forEach((slot, i) => {
        if (!slot) return;
        if (slot.remaining > (lastTimes[i] ?? 0) + 0.5)
          pulses.push({ kind: slot.id, time });
        lastTimes[i] = slot.remaining;
      });
      pulses = pulses.filter(
        (pulse) => time >= pulse.time && time - pulse.time < 0.8,
      );
      group.visible =
        !suspended &&
        ['racing', 'countdown', 'paused'].includes(mode) &&
        !!pose;
      if (pose) {
        group.position.copy(pose.position);
        group.quaternion.copy(pose.quaternion);
      }
      rings.forEach((ring, i) => {
        const pulse = pulses.at(-1),
          age = pulse ? time - pulse.time : 1;
        const active = slots.find(
          (slot) => slot?.active > 0 && slot.id !== 'deflector',
        );
        const intensity = pulse
          ? Math.max(0, 1 - age / 0.8)
          : active
            ? 0.25
            : 0;
        ring.visible = intensity > 0;
        ring.material.color.set(
          pulse?.kind === 'jump'
            ? 0x66cfff
            : pulse?.kind === 'injector'
              ? 0x9dffb8
              : 0xba85ff,
        );
        ring.material.opacity =
          intensity * (reducedMotion ? 0.22 : 0.65) * (1 - i * 0.2);
        ring.scale.setScalar(1 + age * (reducedMotion ? 0.3 : 2) + i * 0.2);
      });
      shield.visible = !!equipment?.shield;
      shield.material.opacity = reducedMotion
        ? 0.12
        : 0.18 + Math.sin(time * 8) * 0.035;
    },
    dispose() {
      group.removeFromParent();
      ringGeometry.dispose();
      sphereGeometry.dispose();
      material.dispose();
      shieldMaterial.dispose();
      for (const ring of rings) ring.material.dispose();
    },
  };
}
