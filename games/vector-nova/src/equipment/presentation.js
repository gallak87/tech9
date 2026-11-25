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
  let cards = [];
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
    reset() {
      effects.reset();
    },
    update({
      equipment,
      pose,
      mode,
      suspended,
      gamepad,
      reducedMotion,
      settings,
      events,
      motion,
    }) {
      const slots = equipment?.slots ?? [];
      const visible =
        !suspended &&
        (mode === 'racing' || mode === 'countdown') &&
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
          .map((slot, index) => {
            if (!slot) return '';
            const { name } = equipmentById(slot.id);
            const control = EQUIPMENT_CONTROLS[index];
            const gamepadKey = control.gamepad.replace('D-pad ', '');
            return `<button type="button" class="equipment-hud-slot hud-card" data-equipment-slot="${index}" aria-label="Use ${name}" title="${name} · ${control.label}">${rewardIcon(`equipment-${slot.id}`)}<span class="equipment-hud-copy"><strong>${name}</strong><span class="equipment-hud-state"><em></em><i class="equipment-hud-charge" aria-hidden="true"></i></span></span><kbd aria-hidden="true"><span>${control.keyboard}</span><span>${gamepadKey}</span></kbd></button>`;
          })
          .join('');
        cards = slots.map((slot, index) => {
          if (!slot) return null;
          const button = hud.querySelector(`[data-equipment-slot="${index}"]`);
          return {
            button,
            status: button.querySelector('em'),
            item: equipmentById(slot.id),
          };
        });
      }
      hud.classList.toggle('gamepad-hints', Boolean(gamepad));
      slots.forEach((slot, index) => {
        if (!slot) return;
        const { button, status, item } = cards[index];
        const ready = slot.remaining <= 0;
        const active = slot.active > 0;
        button.disabled = !ready || mode !== 'racing' || suspended;
        button.classList.toggle('ready', ready);
        button.classList.toggle('active', active);
        const label = active
          ? `${slot.active.toFixed(1)}s active`
          : ready
            ? 'Ready'
            : slot.remaining < 10
              ? `${(Math.ceil(slot.remaining * 10) / 10).toFixed(1)}s`
              : `${Math.ceil(slot.remaining)}s`;
        if (status.textContent !== label) status.textContent = label;
        const charge = active
          ? slot.active / item.duration
          : 1 - slot.remaining / (slot.cooldown ?? item.cooldown);
        button.style.setProperty('--charge', `${charge * 100}%`);
      });
      effects.update({
        equipment,
        pose,
        mode,
        suspended,
        reducedMotion,
        settings,
        events,
        motion,
      });
    },
    dispose() {
      hud.remove();
      effects.dispose();
    },
  };
}
