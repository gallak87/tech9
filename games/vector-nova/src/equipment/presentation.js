import { EQUIPMENT_CONTROLS } from './controls.js';
import * as T from 'three';
import { equipmentById } from '../progression/catalog.js';
import { rewardIcon } from '../progression/view.js';
export function createEquipmentPresentation({ host, scene, activate }) {
  const hud = document.createElement('aside');
  hud.className = 'equipment-hud';
  hud.setAttribute('aria-label', 'Equipped abilities');
  host.append(hud);
  const root = new T.Group();
  root.name = 'Player equipment effects';
  scene.add(root);
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
    root.add(mesh);
    return mesh;
  });
  const shieldMaterial = material.clone();
  shieldMaterial.wireframe = true;
  const shield = new T.Mesh(sphereGeometry, shieldMaterial);
  shield.scale.set(3.7, 1.8, 6);
  shield.position.y = 0.4;
  root.add(shield);
  let key = '',
    lastTimes = [],
    pulses = [];
  const click = (event) => {
    const button = event.target.closest('[data-equipment-slot]');
    if (button && !button.disabled) {
      activate(Number(button.dataset.equipmentSlot));
      button.blur();
    }
  };
  hud.addEventListener('pointerdown', (event) => event.stopPropagation());
  hud.addEventListener('click', click);
  return {
    update({ equipment, pose, mode, suspended, reducedMotion }) {
      const slots = equipment?.slots ?? [],
        time = equipment?.time ?? 0;
      const visible =
        !suspended &&
        ['racing', 'countdown', 'paused'].includes(mode) &&
        slots.some(Boolean);
      hud.hidden = !visible;
      const next = slots.map((slot) => slot?.id ?? '').join(',');
      if (key !== next) {
        key = next;
        lastTimes = [];
        pulses = [];
        hud.style.setProperty(
          '--equipment-count',
          Math.max(1, slots.filter(Boolean).length),
        );
        hud.innerHTML = slots
          .map((slot, i) =>
            slot
              ? `<button class="equipment-hud-slot" data-equipment-slot="${i}" aria-label="Use ${equipmentById(slot.id).name}">${rewardIcon(`equipment-${slot.id}`)}<span><small>${EQUIPMENT_CONTROLS[i].label}</small><strong>${equipmentById(slot.id).name}</strong><em></em></span><i></i></button>`
              : '',
          )
          .join('');
      }
      slots.forEach((slot, i) => {
        if (!slot) return;
        const item = equipmentById(slot.id),
          button = hud.querySelector(`[data-equipment-slot="${i}"]`);
        if (!button) return;
        const ready = slot.remaining <= 0;
        button.disabled = !ready || mode !== 'racing' || suspended;
        button.classList.toggle('ready', ready);
        button.classList.toggle('active', slot.active > 0);
        button.querySelector('em').textContent =
          slot.active > 0
            ? `${slot.active.toFixed(1)}s active`
            : ready
              ? 'Ready'
              : `${Math.ceil(slot.remaining)}s`;
        button.style.setProperty(
          '--charge',
          `${(1 - slot.remaining / item.cooldown) * 100}%`,
        );
        if (slot.remaining > (lastTimes[i] ?? Infinity) + 0.5)
          pulses.push({ kind: slot.id, time });
        lastTimes[i] = slot.remaining;
      });
      pulses = pulses.filter(
        (pulse) => time >= pulse.time && time - pulse.time < 0.8,
      );
      root.visible =
        !suspended &&
        ['racing', 'countdown', 'paused'].includes(mode) &&
        !!pose;
      if (pose) {
        root.position.copy(pose.position);
        root.quaternion.copy(pose.quaternion);
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
      hud.remove();
      root.removeFromParent();
      ringGeometry.dispose();
      sphereGeometry.dispose();
      material.dispose();
      shieldMaterial.dispose();
      for (const ring of rings) ring.material.dispose();
    },
  };
}
