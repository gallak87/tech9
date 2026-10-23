import { RACE_OPPONENTS } from './roster.js';
import { SHIPS } from '../ships/catalog.js';

export const CUPS = Object.freeze(
  import.meta.env?.VN_EDITION === 'demo'
    ? [
        Object.freeze({
          id: 'demo',
          name: 'Demo Cup',
          tracks: ['halcyon', 'nacre'],
        }),
      ]
    : [
        Object.freeze({
          id: 'founders',
          name: 'Founders Cup',
          tracks: ['halcyon', 'orbital', 'nacre'],
        }),
        Object.freeze({
          id: 'frontier',
          name: 'Frontier Cup',
          tracks: ['vesper', 'glasswake', 'cindercoil'],
        }),
        Object.freeze({
          id: 'horizon',
          name: 'Horizon Cup',
          tracks: ['saffron', 'zephyr', 'shatterline'],
        }),
        Object.freeze({
          id: 'apex',
          name: 'Apex Cup',
          tracks: ['worldspire', 'helion', 'nightweir', 'umbra', 'colossus'],
        }),
      ],
);
export const CUP_POINTS = Object.freeze([25, 18, 15, 12, 10, 8, 6, 4, 2, 1]);
export const CUP_FINISH_GRACE = 30;
export const CUP_STORAGE_KEY = 'vector-nova.cup.v1';
const VERSION = 1;
const field = ['player', ...RACE_OPPONENTS.map(({ id }) => id)];
const names = Object.fromEntries([
  ['player', 'YOU'],
  ...RACE_OPPONENTS.map(({ id, name }) => [id, name]),
]);
const copy = (value) => structuredClone(value);
const validTime = (value) => Number.isSafeInteger(value) && value > 0;
export const cupDefinition = (id) => CUPS.find((cup) => cup.id === id);
export const cupComplete = (state) =>
  !!state && state.results.length === cupDefinition(state.cupId).tracks.length;

// Grid promotion is earned across completed events, independently of championship
// points. Later cups advance more slowly and punish poor finishes more strongly.
const GRID_PROGRESSION = Object.freeze({
  demo: { advance: 7, setback: 1 },
  founders: { advance: 7, setback: 1 },
  frontier: { advance: 5, setback: 1.25 },
  horizon: { advance: 3.5, setback: 1.5 },
  apex: { advance: 2.5, setback: 2 },
});

// A results screen may preview the next grid. Default callers always use only
// earlier races, so retry/reload cannot promote a player using this race's result.
export function cupGridOrder(state, { next = false } = {}) {
  const completed = state
    ? state.results.slice(0, state.eventIndex + Number(next))
    : [];
  const rivals = completed.length
    ? completed
        .at(-1)
        .filter((row) => row.id !== 'player')
        .map((row) => row.id)
    : RACE_OPPONENTS.map(({ id }) => id);
  const rules = GRID_PROGRESSION[state?.cupId] ?? GRID_PROGRESSION.founders;
  let progress = 0;
  for (const rows of completed) {
    const player = scored(rows).find((row) => row.id === 'player');
    const change =
      player.status !== 'finished'
        ? -2 * rules.setback
        : player.points >= CUP_POINTS[4]
          ? (rules.advance * (player.points - CUP_POINTS[4])) /
            (CUP_POINTS[0] - CUP_POINTS[4])
          : (-rules.setback * (CUP_POINTS[4] - player.points)) /
            (CUP_POINTS[4] - CUP_POINTS.at(-1));
    progress = Math.max(0, Math.min(field.length - 1, progress + change));
  }
  const position = field.length - Math.floor(progress + 1e-9);
  rivals.splice(position - 1, 0, 'player');
  return rivals;
}

// Only actual, valid finishes earn points. Missing times sort behind complete
// totals; equal points/wins/time share a rank, with stable IDs for display only.
export function classifyCupRace(results) {
  if (
    !results ||
    results.standings.length !== field.length ||
    new Set(results.standings.map((r) => r.id)).size !== field.length
  )
    throw new Error('Cup results require the complete field');
  const rows = results.standings.map((row) => {
    if (!field.includes(row.id)) throw new Error('Unknown cup racer');
    const status = !row.finished ? 'dnf' : row.valid ? 'finished' : 'invalid';
    const timeMs =
      status === 'finished' ? Math.round(row.totalTime * 1000) : null;
    if (status === 'finished' && !validTime(timeMs))
      throw new Error('Invalid cup finish time');
    return { id: row.id, status, timeMs };
  });
  rows.sort(
    (a, b) =>
      (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity) ||
      a.id.localeCompare(b.id),
  );
  return rows;
}

function scored(rows) {
  let place = 0;
  return rows.map((row) => ({
    ...row,
    position: row.status === 'finished' ? ++place : null,
    points: row.status === 'finished' ? CUP_POINTS[place - 1] : 0,
  }));
}
export const cupRaceRows = (rows) =>
  scored(rows).map((row) => ({ ...row, name: names[row.id] }));
export function cupStandings(state) {
  const rows = field.map((id) => ({
    id,
    name: names[id],
    points: 0,
    wins: 0,
    timeMs: 0,
    unclassified: 0,
  }));
  for (const result of state.results) {
    for (const entry of scored(result)) {
      const row = rows.find((r) => r.id === entry.id);
      row.points += entry.points;
      row.wins += Number(entry.position === 1);
      row.timeMs += entry.timeMs ?? 0;
      row.unclassified += Number(entry.status !== 'finished');
    }
  }
  const total = (r) => (r.unclassified ? Infinity : r.timeMs);
  const compare = (a, b) =>
    b.points - a.points ||
    b.wins - a.wins ||
    (total(a) === total(b) ? 0 : total(a) - total(b));
  rows.sort((a, b) => compare(a, b) || a.id.localeCompare(b.id));
  rows.forEach((row, i) => {
    row.position =
      i && compare(row, rows[i - 1]) === 0 ? rows[i - 1].position : i + 1;
  });
  return rows;
}
function validate(value) {
  const cup = cupDefinition(value?.cupId);
  if (
    !cup ||
    value.version !== VERSION ||
    !SHIPS.some((s) => s.id === value.shipId) ||
    !['easy', 'medium', 'hard'].includes(value.difficulty) ||
    !['racing', 'results'].includes(value.phase) ||
    !Number.isInteger(value.eventIndex) ||
    value.eventIndex < 0 ||
    value.eventIndex >= cup.tracks.length ||
    !Array.isArray(value.results) ||
    value.results.length !==
      value.eventIndex + Number(value.phase === 'results')
  )
    return null;
  for (const rows of value.results) {
    if (
      !Array.isArray(rows) ||
      rows.length !== field.length ||
      new Set(rows.map((r) => r?.id)).size !== field.length
    )
      return null;
    for (const r of rows)
      if (
        !field.includes(r?.id) ||
        !['finished', 'dnf', 'invalid'].includes(r.status) ||
        (r.status === 'finished' ? !validTime(r.timeMs) : r.timeMs !== null)
      )
        return null;
    rows.sort(
      (a, b) =>
        (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity) ||
        a.id.localeCompare(b.id),
    );
  }
  return {
    version: VERSION,
    cupId: cup.id,
    shipId: value.shipId,
    difficulty: value.difficulty,
    eventIndex: value.eventIndex,
    phase: value.phase,
    results: copy(value.results),
  };
}

export function createCupStore(storage = () => localStorage) {
  let state = null,
    saved = true,
    notice = '';
  try {
    const raw = storage().getItem(CUP_STORAGE_KEY);
    if (raw && raw !== 'null') {
      state = validate(JSON.parse(raw));
      if (!state)
        notice = 'Saved cup is incompatible or damaged. Start a new cup.';
    }
  } catch {
    saved = false;
    notice = 'Cup storage is unavailable. Progress lasts for this page only.';
  }
  function persist(next) {
    state = next;
    try {
      storage().setItem(CUP_STORAGE_KEY, JSON.stringify(next));
      saved = true;
      notice = '';
    } catch {
      saved = false;
      notice =
        'Cup progress could not be saved. Keep this page open; reloading may restore older progress.';
    }
    return copy(state);
  }
  return {
    snapshot: () => ({ state: copy(state), saved, notice }),
    start(cupId, shipId, difficulty) {
      const next = validate({
        version: VERSION,
        cupId,
        shipId,
        difficulty,
        eventIndex: 0,
        phase: 'racing',
        results: [],
      });
      if (!next) throw new Error('Invalid cup setup');
      return persist(next);
    },
    finish(results) {
      if (!state || state.phase !== 'racing') return false;
      const rows = classifyCupRace(results);
      persist({
        ...state,
        phase: 'results',
        results: [...state.results, rows],
      });
      return true;
    },
    next() {
      if (!state || state.phase !== 'results' || cupComplete(state))
        return false;
      persist({ ...state, phase: 'racing', eventIndex: state.eventIndex + 1 });
      return true;
    },
    retry() {
      if (!state) return false;
      persist({
        ...state,
        phase: 'racing',
        results: state.results.slice(0, state.eventIndex),
      });
      return true;
    },
    abandon: () => persist(null),
  };
}
