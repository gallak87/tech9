// Bonus courses remain in the technical catalog for previews and validation.
// Every player-facing picker and entry point uses the same career gate.
export const BONUS_LEVEL_IDS = Object.freeze(['ravel', 'nomad', 'oriel']);

export function levelAvailable(
  id,
  { complete = false, developer = false } = {},
) {
  return !BONUS_LEVEL_IDS.includes(id) || complete || developer;
}

export function filterAvailableLevels(levels, access = {}) {
  return levels.filter(({ id }) => levelAvailable(id, access));
}
