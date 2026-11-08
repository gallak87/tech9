import { IS_DEMO } from '../progression/edition.js';

// Technical catalogs include locked courses for previews and validation.
// Player-facing pickers and direct entry share these derived access rules.
export const BONUS_LEVEL_IDS = Object.freeze(['ravel', 'nomad', 'oriel']);
export const MODE_UNLOCKS = Object.freeze(
  [
    {
      mode: 'freestyle',
      label: 'Freestyle',
      cupId: 'founders',
      cupName: 'Founders Cup',
      levelIds: ['launchworks'],
    },
    {
      mode: 'eliminator',
      label: 'Eliminator',
      cupId: 'frontier',
      cupName: 'Frontier Cup',
      levelIds: ['crucible'],
    },
    {
      mode: 'interceptor',
      label: 'Interceptor',
      cupId: 'horizon',
      cupName: 'Horizon Cup',
      levelIds: ['interceptor', 'interceptor-helion', 'interceptor-nightweir'],
    },
  ].map((unlock) =>
    Object.freeze({ ...unlock, levelIds: Object.freeze(unlock.levelIds) }),
  ),
);

export function modeUnlockRequirement(mode) {
  return MODE_UNLOCKS.find((unlock) => unlock.mode === mode) ?? null;
}

export function levelUnlockRequirement(id) {
  return MODE_UNLOCKS.find((unlock) => unlock.levelIds.includes(id)) ?? null;
}

export function modeAvailable(mode, { cupWins = [], developer = false } = {}) {
  const requirement = modeUnlockRequirement(mode);
  if (!requirement) return true;
  if (IS_DEMO) return false;
  return (
    developer === true ||
    (Array.isArray(cupWins) && cupWins.includes(requirement.cupId))
  );
}

export function levelAvailable(
  id,
  { complete = false, cupWins = [], developer = false } = {},
) {
  const requirement = levelUnlockRequirement(id);
  if (requirement)
    return modeAvailable(requirement.mode, { cupWins, developer });
  return !BONUS_LEVEL_IDS.includes(id) || complete || developer;
}

export function lockedLevelMessage(id) {
  const requirement = levelUnlockRequirement(id);
  if (requirement)
    return IS_DEMO
      ? `${requirement.label} is available in the full game.`
      : `Win ${requirement.cupName} to unlock ${requirement.label}.`;
  return 'Complete all 28 career unlocks to open this course.';
}

export function filterAvailableLevels(levels, access = {}) {
  return levels.filter(({ id }) => levelAvailable(id, access));
}
