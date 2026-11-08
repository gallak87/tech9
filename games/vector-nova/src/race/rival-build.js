import {
  ENHANCEMENTS,
  AVAILABLE_EQUIPMENT,
  STANDARD_EQUIPMENT_SLOTS,
  MAX_EQUIPMENT_SLOTS,
} from '../progression/catalog.js';
import { IS_DEMO } from '../progression/edition.js';
import { createLcgRandom } from '../environment/random.js';
import { RACE_OPPONENTS } from './roster.js';

export const RIVAL_BONUS_SCALES = Object.freeze({
  easy: 0.5,
  medium: 0.75,
  hard: 1,
});

// One run's immutable, JSON-safe build. The scale applies to earned bonuses;
// every rival retains its own chassis and receives the same selected scale.
export function createRivalFieldBuild({
  enhancements = {},
  equipmentPool = [],
  slots = STANDARD_EQUIPMENT_SLOTS,
  seed = 0,
  difficulty = 'easy',
} = {}) {
  if (!Object.hasOwn(RIVAL_BONUS_SCALES, difficulty))
    throw new Error('Unknown rival build difficulty');
  if (
    !enhancements ||
    typeof enhancements !== 'object' ||
    Array.isArray(enhancements)
  )
    throw new Error('Rival enhancement ranks must be an object');
  const ranks = Object.fromEntries(
    ENHANCEMENTS.map(({ id, gains }) => {
      const rank = enhancements[id] ?? 0;
      if (!Number.isInteger(rank) || rank < 0 || rank >= gains.length)
        throw new Error(`Invalid rival enhancement rank: ${id}`);
      return [id, rank];
    }),
  );
  if (
    !Array.isArray(equipmentPool) ||
    equipmentPool.some(
      (id) => !AVAILABLE_EQUIPMENT.some((item) => item.id === id),
    )
  )
    throw new Error('Invalid rival equipment pool');
  if (
    slots !== STANDARD_EQUIPMENT_SLOTS &&
    (IS_DEMO || slots !== MAX_EQUIPMENT_SLOTS)
  )
    throw new Error('Invalid rival equipment capacity');
  if (!Number.isSafeInteger(seed))
    throw new Error('Rival equipment seed must be an integer');
  const pool = AVAILABLE_EQUIPMENT.filter((item) =>
    equipmentPool.includes(item.id),
  ).map((item) => item.id);
  const random = createLcgRandom(seed >>> 0);
  const opponents = RACE_OPPONENTS.map(({ id }) => {
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const other = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[other]] = [shuffled[other], shuffled[i]];
    }
    return Object.freeze({
      id,
      equipment: Object.freeze(shuffled.slice(0, slots)),
    });
  });
  return Object.freeze({
    seed: seed >>> 0,
    difficulty,
    bonusScale: RIVAL_BONUS_SCALES[difficulty],
    enhancements: Object.freeze(ranks),
    equipmentPool: Object.freeze(pool),
    slots,
    opponents: Object.freeze(opponents),
  });
}

// Vehicle states own their mutable copies; runtime cooldowns never mutate this
// configuration or another actor's loadout. No build preserves stock fixtures.
export function rivalBuildState(fieldBuild, id) {
  if (!fieldBuild) return {};
  const opponent = fieldBuild.opponents.find((entry) => entry.id === id);
  if (!opponent) throw new Error(`Unknown rival build actor: ${id}`);
  return {
    enhancements: { ...fieldBuild.enhancements },
    enhancementScale: fieldBuild.bonusScale,
    equipment: [...opponent.equipment],
  };
}

export function validateRivalFieldBuild(fieldBuild) {
  const normalized = createRivalFieldBuild(fieldBuild);
  if (JSON.stringify(fieldBuild) !== JSON.stringify(normalized))
    throw new Error('Rival field build mismatch');
  return normalized;
}

export function matchesRivalBuild(state, fieldBuild, id) {
  const expected = rivalBuildState(fieldBuild, id);
  return ['enhancements', 'enhancementScale', 'equipment'].every(
    (key) => JSON.stringify(state[key]) === JSON.stringify(expected[key]),
  );
}
