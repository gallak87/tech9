import { BUILDINGS, SERVICES, TIERS } from './content.js';
import { serviceAvailable } from './progression.js';

const shortfall = (state, cost) =>
  Object.entries(cost)
    .filter(([id, amount]) => (state.resources[id] || 0) < amount)
    .map(
      ([id, amount]) =>
        `${Math.ceil(amount - (state.resources[id] || 0))} more ${id}`,
    );

// These are the existing vendor actions and authored milestones, not a separate
// progression system. Shopping and repeatable services never increase a counter.
export function vendorAction(state, object) {
  const service = object.service || 'provisions',
    def = SERVICES[service],
    available = service === 'rest' || serviceAvailable(state, service);
  const requirement = available
    ? ''
    : `Requires ${TIERS[(def?.tier || 1) - 1]}, Kaida level ${def?.level || 1}${def?.requires ? ' and a ' + BUILDINGS[def.requires].name : ''}.`;
  if (object.id === 'haventide_smith') {
    const complete = !!state.flags.smith_calibration_complete,
      started = !!state.flags.smith_calibration_started,
      hasChip = (state.inventory.data_chip || 0) > 0;
    return {
      action: 'story:smith_calibration',
      label: complete
        ? 'Ask about the restored tools'
        : 'A word about the forge',
      description: complete
        ? 'Hear how Bran’s calibrated forge is helping repair the settlement.'
        : 'Help Bran recalibrate his forge with one unequipped Data Chip. Reward: 150 XP, 35 ore and 2 Ether Cells.',
      progress: { completed: Number(complete), total: 1 },
      status:
        'A Gentler Hand · ' +
        (complete
          ? 'Complete'
          : started
            ? hasChip
              ? 'Return to Bran'
              : 'A salvaged interpreter'
            : 'Available'),
    };
  }
  if (service === 'archivist') {
    const complete = !!state.flags.research_concord,
      missing = shortfall(state, { ore: 80, energy: 70 });
    return {
      action: 'research',
      label: complete
        ? 'Concord researched'
        : 'Research Concord · 80 ore / 70 energy',
      description:
        'Permanently adds +6 Intellect and +6 Technique (stats) to every current and future crew member. One-time research shared by all settlements.',
      progress: { completed: Number(complete), total: 1 },
      status: complete
        ? 'Research complete · bonuses active'
        : requirement ||
          (missing.length
            ? 'Need ' + missing.join(' · ') + '.'
            : 'Research available'),
      disabled: complete || !available || missing.length > 0,
      serviceLocked: !available,
    };
  }
  if (service === 'inn' || service === 'rest') {
    const cost = state.flags.mara_shelter
      ? 0
      : Math.max(0, 8 - (state.buildings.walls || 0) * 2);
    return {
      action: 'rest',
      label: 'Rest by the lantern',
      primary: true,
      description: `Recover the whole crew’s HP and MP. ${cost ? 'Share up to ' + cost + ' food; travelers with empty pockets are still welcome.' : 'Rest free of charge.'}`,
      status: requirement || 'Repeatable · everyone welcome',
      disabled: !available,
      serviceLocked: !available,
    };
  }
  if (service === 'trainer') {
    const missing = shortfall(state, { food: 30, energy: 20 });
    return {
      action: 'train',
      label: 'Train · 30 food / 20 energy',
      primary: true,
      description: `Practice together: every current crew member gains ${300 + state.tier * 100} XP.`,
      status:
        requirement ||
        (missing.length
          ? 'Need ' + missing.join(' · ') + '.'
          : 'Repeatable training'),
      disabled: !available || missing.length > 0,
      serviceLocked: !available,
    };
  }
  return null;
}
