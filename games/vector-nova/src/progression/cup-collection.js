import { cupChampion } from '../race/cup.js';

export const CUP_COLLECTION_KEY = 'vector-nova.cup-collection.v1';
// Preserve awards from the other edition when both share the same profile.
const ids = ['demo', 'founders', 'frontier', 'horizon', 'apex'];
const copy = (value) => structuredClone(value);
export function readCupCollection(raw) {
  if (!raw) return {};
  const data = JSON.parse(raw);
  if (
    data?.version !== 1 ||
    !data.cups ||
    typeof data.cups !== 'object' ||
    Array.isArray(data.cups)
  )
    throw Error('Invalid trophy collection');
  return Object.fromEntries(
    Object.entries(data.cups)
      .filter(
        ([id, value]) =>
          ids.includes(id) &&
          value &&
          Number.isSafeInteger(value.earnedAt) &&
          value.earnedAt > 0 &&
          ['easy', 'medium', 'hard'].includes(value.difficulty) &&
          Number.isSafeInteger(value.points) &&
          value.points > 0,
      )
      .map(([id, value]) => [
        id,
        {
          earnedAt: value.earnedAt,
          difficulty: value.difficulty,
          points: value.points,
        },
      ]),
  );
}

export function createCupCollection(
  storage = () => localStorage,
  now = Date.now,
) {
  let cups = {},
    notice = '',
    saved = true;
  try {
    cups = readCupCollection(storage().getItem(CUP_COLLECTION_KEY));
  } catch {
    notice = 'Trophy collection unavailable. New trophies last for this visit.';
    saved = false;
  }
  return {
    snapshot: () => ({ cups: copy(cups), notice, saved }),
    reload() {
      cups = readCupCollection(storage().getItem(CUP_COLLECTION_KEY));
      notice = '';
      saved = true;
    },
    award(state) {
      const champion = cupChampion(state);
      if (!champion) return false;
      // Merge other tabs' earned cups before writing; never clear an award when
      // the active run is retried, restarted, abandoned or loses a later attempt.
      try {
        cups = {
          ...readCupCollection(storage().getItem(CUP_COLLECTION_KEY)),
          ...cups,
        };
      } catch {
        /* Keep this visit's collection when storage is unavailable. */
      }
      const earned = !cups[state.cupId];
      if (!earned && saved) return false;
      cups[state.cupId] ??= {
        earnedAt: now(),
        difficulty: state.difficulty,
        points: champion.points,
      };
      try {
        storage().setItem(
          CUP_COLLECTION_KEY,
          JSON.stringify({ version: 1, cups }),
        );
        notice = '';
        saved = true;
      } catch {
        notice = 'Trophy earned. Could not save it on this device.';
        saved = false;
      }
      return earned;
    },
  };
}
