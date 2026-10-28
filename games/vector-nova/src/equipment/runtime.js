import { equipmentById, MAX_EQUIPMENT_SLOTS } from '../progression/catalog.js';
import { vehicleHandling } from '../ships/catalog.js';
const copy = (value) => structuredClone(value);
export function createEquipmentSystem({
  motion,
  combat,
  actorId = 'player',
  tuning = {},
}) {
  for (const [id, rule] of Object.entries(tuning)) {
    if (
      !equipmentById(id) ||
      !rule ||
      Object.keys(rule).some(
        (key) => !['cooldown', 'autoRepeat'].includes(key),
      ) ||
      (rule.cooldown !== undefined &&
        (!Number.isFinite(rule.cooldown) ||
          rule.cooldown < 0.15 ||
          rule.cooldown > 120)) ||
      (rule.autoRepeat !== undefined && typeof rule.autoRepeat !== 'boolean')
    )
      throw new Error('Invalid issued equipment tuning.');
  }
  const itemFor = (id) => {
    const item = equipmentById(id);
    return item ? { ...item, ...tuning[id] } : null;
  };
  let slots = [],
    held = Array(MAX_EQUIPMENT_SLOTS).fill(false),
    time = 0,
    shield = false;
  function reset({ reason, state } = {}) {
    if (['recover', 'manual-recover'].includes(reason)) {
      for (const slot of slots) if (slot) slot.active = 0;
      shield = false;
      held = Array(MAX_EQUIPMENT_SLOTS).fill(false);
      return;
    }
    slots = (state?.equipment ?? [])
      .slice(0, MAX_EQUIPMENT_SLOTS)
      .map((id) =>
        equipmentById(id)
          ? {
              id,
              ...(tuning[id] ? { cooldown: itemFor(id).cooldown } : {}),
              remaining: 0,
              active: 0,
            }
          : null,
      );
    held = Array(MAX_EQUIPMENT_SLOTS).fill(false);
    time = 0;
    shield = false;
  }
  function activate(slot, state) {
    const item = itemFor(slot.id);
    if (slot.remaining > 0) return false;
    if (slot.id === 'jump' && !motion.jump?.(state)) return false;
    if (slot.id === 'injector') {
      if (state.energy >= 100) return false;
      state.energy = Math.min(100, state.energy + 45);
    }
    if (slot?.id === 'slipstream' && !combat?.draftTarget(actorId))
      return false;
    if (slot.id === 'lance' && !combat?.fireLance(actorId)) return false;
    if (slot.id === 'deflector') shield = true;
    slot.remaining = item.cooldown;
    slot.active = item.duration;
    return true;
  }
  return {
    reset,
    beforeStep(state, input, dt, { enabled = true } = {}) {
      time += dt;
      const events = [];
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (!slot) {
          held[i] = false;
          continue;
        }
        const wasActive = slot.active > 0;
        slot.remaining = Math.max(0, slot.remaining - dt);
        slot.active = Math.max(0, slot.active - dt);
        if (wasActive && slot.active === 0)
          events.push({ type: 'equipment-expire', payload: { kind: slot.id } });
        if (slot.id === 'deflector' && !slot.active) shield = false;
        const pressed = enabled && !!input?.[`equipment${i + 1}`];
        if (
          pressed &&
          (!held[i] || itemFor(slot.id).autoRepeat) &&
          activate(slot, state)
        )
          events.push({
            type: 'equipment-activate',
            payload: { kind: slot.id, slot: i, time },
          });
        held[i] = pressed;
      }
      const slip = slots.some(
        (slot) => slot?.id === 'slipstream' && slot.active > 0,
      );
      const stabilizer = slots.some(
        (slot) => slot?.id === 'stabilizer' && slot.active > 0,
      );
      const handling = vehicleHandling(state);
      return {
        events,
        modifiers: {
          ...(slip
            ? {
                propulsion: {
                  cruiseSpeed: Math.min(200, handling.boostSpeed * 1.12),
                  thrust: handling.boostThrust * 2,
                },
              }
            : {}),
          ...(stabilizer ? { airControl: 3.5, airDamping: 1.8 } : {}),
        },
      };
    },
    absorbHit() {
      if (!shield) return false;
      shield = false;
      const slot = slots.find((entry) => entry?.id === 'deflector');
      if (slot) slot.active = 0;
      return true;
    },
    snapshot: () => ({
      version: 1,
      time,
      slots: copy(slots),
      held: [...held],
      shield,
    }),
    restore(data) {
      if (
        !data ||
        data.version !== 1 ||
        !Number.isFinite(data.time) ||
        data.time < 0 ||
        !Array.isArray(data.slots) ||
        data.slots.length > MAX_EQUIPMENT_SLOTS ||
        data.slots.some(
          (slot) =>
            slot !== null &&
            (!equipmentById(slot.id) ||
              !Number.isFinite(slot.remaining) ||
              slot.remaining < 0 ||
              slot.remaining > itemFor(slot.id).cooldown ||
              (slot.cooldown !== undefined &&
                slot.cooldown !== itemFor(slot.id).cooldown) ||
              !Number.isFinite(slot.active) ||
              slot.active < 0 ||
              slot.active > equipmentById(slot.id).duration),
        ) ||
        !Array.isArray(data.held) ||
        ![2, MAX_EQUIPMENT_SLOTS].includes(data.held.length) ||
        data.held.length < data.slots.length ||
        data.held.some((v) => typeof v !== 'boolean') ||
        typeof data.shield !== 'boolean'
      )
        throw new Error('Invalid equipment replay state.');
      ({ time, slots, held, shield } = copy(data));
      held = Array.from(
        { length: MAX_EQUIPMENT_SLOTS },
        (_, i) => held[i] ?? false,
      );
    },
  };
}
