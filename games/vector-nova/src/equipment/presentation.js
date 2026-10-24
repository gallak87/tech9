import { EQUIPMENT_CONTROLS } from './controls.js';
import { createEquipmentEffects } from './effects.js';
import { equipmentById } from '../progression/catalog.js';
import { rewardIcon } from '../progression/view.js';
export function createEquipmentPresentation({ host, scene, activate }) {
  const hud = document.createElement('aside');
  hud.className = 'equipment-hud';
  hud.setAttribute('aria-label', 'Equipped abilities');
  host.append(hud);
  const effects = createEquipmentEffects(scene);
  let key = '';
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
      const slots = equipment?.slots ?? [];
      const visible =
        !suspended &&
        ['racing', 'countdown', 'paused'].includes(mode) &&
        slots.some(Boolean);
      hud.hidden = !visible;
      const next = slots.map((slot) => slot?.id ?? '').join(',');
      if (key !== next) {
        key = next;
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
      });
      effects.update({ equipment, pose, mode, suspended, reducedMotion });
    },
    dispose() {
      hud.remove();
      effects.dispose();
    },
  };
}
