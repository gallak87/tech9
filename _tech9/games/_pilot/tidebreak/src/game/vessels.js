import { SHIP_PRESETS } from '../modules/sailing-ships/src/presets.js';

// The chooser and collision footprint share the model's supported dimensions.
const descriptions = {
  schooner: 'A two-masted coastal schooner with fore-and-aft sails.',
  galleon: 'A broad-decked galleon carrying a tall square-rigged sail plan.',
};
export const VESSELS = Object.freeze(
  SHIP_PRESETS.map((profile) =>
    Object.freeze({
      ...profile,
      description: descriptions[profile.id],
    }),
  ),
);

export function getVessel(id) {
  return VESSELS.find((vessel) => vessel.id === id) ?? VESSELS[0];
}
