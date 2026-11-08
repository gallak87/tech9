// Bonus courses remain in the technical catalog for previews and validation.
// Every player-facing picker and entry point uses the same career gate.
export const BONUS_LEVEL_IDS = Object.freeze(['ravel', 'nomad', 'oriel']);
export const ENDGAME_EVENT_LEVEL_IDS = Object.freeze([
  'launchworks',
  'crucible',
  'interceptor',
  'interceptor-helion',
  'interceptor-nightweir',
]);

export function levelAvailable(
  id,
  { complete = false, postCareer = false, developer = false } = {},
) {
  if (ENDGAME_EVENT_LEVEL_IDS.includes(id))
    return (complete && postCareer) || developer;
  return !BONUS_LEVEL_IDS.includes(id) || complete || developer;
}

export function filterAvailableLevels(levels, access = {}) {
  return levels.filter(({ id }) => levelAvailable(id, access));
}
