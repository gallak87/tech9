import {
  createRivalFieldBuild,
  validateRivalFieldBuild,
} from '../race/rival-build.js';
import { STANDARD_EQUIPMENT_SLOTS } from '../progression/catalog.js';

// The host supplies a seed once per new race. Physics never samples randomness.
export function raceRivalBuild({ build, rivals, difficulty, seed }) {
  return createRivalFieldBuild({
    enhancements: build?.enhancements ?? {},
    equipmentPool:
      rivals?.equipmentPool ?? build?.equipment?.filter(Boolean) ?? [],
    slots: rivals?.slots ?? STANDARD_EQUIPMENT_SLOTS,
    difficulty,
    seed,
  });
}

// A recorded seed may select another loadout, but cannot grant a different
// upgrade budget, locked equipment, slot capacity or difficulty.
export function replayRivalBuild(recorded, context) {
  let normalized;
  try {
    normalized = validateRivalFieldBuild(recorded);
  } catch (error) {
    throw new Error(`Replay rival setup mismatch: ${error.message}`, {
      cause: error,
    });
  }
  const expected = raceRivalBuild({ ...context, seed: normalized.seed });
  if (JSON.stringify(expected) !== JSON.stringify(normalized))
    throw new Error('Replay rival setup mismatch');
  return normalized;
}
