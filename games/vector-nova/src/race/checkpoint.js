// Keep the published rival progress order and its two legacy optional fields.
export const REQUIRED_RACE_PROGRESS_FIELDS = Object.freeze([
  'lap',
  'checkpoint',
  'elapsed',
  'lastLap',
  'best',
  'valid',
  'complete',
  'startDistance',
  'history',
  'completedTransfers',
]);
const progressFields = [
  ...REQUIRED_RACE_PROGRESS_FIELDS,
  'splits',
  'completedTime',
];
// Owned checkpoints also carry exact identity, including an already suffixed
// sprint rulesId. These are data fields, never the race's methods or getters.
const ownedFields = [
  'rulesId',
  'course',
  'completedTransfers',
  ...progressFields.filter((key) => key !== 'completedTransfers'),
];
const capture = (race, fields) =>
  Object.fromEntries(fields.map((key) => [key, structuredClone(race[key])]));

export const captureRaceProgress = (race) => capture(race, progressFields);
export const captureOwnedRace = (race) => capture(race, ownedFields);

function restore(race, data, fields) {
  for (const key of fields)
    race[key] = structuredClone(
      key === 'splits'
        ? (data[key] ?? [])
        : key === 'completedTime'
          ? (data[key] ?? 0)
          : data[key],
    );
  return race;
}

// Public callers validate before applying progress. Extra keys cannot replace
// race methods or identity; old payloads retain their established defaults.
export const restoreRaceProgress = (race, data) =>
  restore(race, data, progressFields);
export const restoreOwnedRace = (race, data) =>
  restore(race, data, ownedFields);
