import { IS_DEMO, CAREER_SHIPS, FULL_CUPS, fullCupWins } from './edition.js';
import { SHIPS } from '../ships/catalog.js';
import {
  REWARDS,
  ALL_REWARDS,
  AVAILABLE_EQUIPMENT,
  EQUIPMENT,
  enhancementRanks,
  STANDARD_EQUIPMENT_SLOTS,
  MAX_EQUIPMENT_SLOTS,
} from './catalog.js';
export const PROFILE_KEY = 'vector-nova.career.v1';
export const CAREER_VERSION = 3;
export const raceProgressPoints = (position) =>
  Number.isInteger(position) && position >= 1 && position <= 10
    ? position <= 3
      ? 6 - position
      : position <= 5
        ? 2
        : 1
    : 0;
export const equipmentCapacity = (profile, shipId) =>
  !IS_DEMO && profile.exoticShip === shipId
    ? MAX_EQUIPMENT_SLOTS
    : STANDARD_EQUIPMENT_SLOTS;
const cups = [...FULL_CUPS, 'demo'];
const copy = (value) => structuredClone(value);
export const starterShip = () =>
  SHIPS.some((ship) => ship.id === 'shrike') ? 'shrike' : SHIPS[0].id;
export function freshProfile() {
  return {
    version: CAREER_VERSION,
    wins: 0,
    finishes: 0,
    points: 0,
    raceScores: {},
    raceClaims: [],
    cups: [],
    trialTracks: [],
    claims: [],
    exoticShip: null,
    loadouts: Object.fromEntries(
      CAREER_SHIPS.map((id) => [id, Array(MAX_EQUIPMENT_SLOTS).fill(null)]),
    ),
  };
}
const strings = (value, max, valid = () => true) =>
  Array.isArray(value) &&
  value.length <= max &&
  new Set(value).size === value.length &&
  value.every(
    (entry) => typeof entry === 'string' && entry.length <= 160 && valid(entry),
  );
export function validateProfile(value) {
  if (
    !value ||
    ![1, 2, CAREER_VERSION].includes(value.version) ||
    !Number.isSafeInteger(value.wins) ||
    value.wins < 0 ||
    value.wins > 1000000 ||
    !strings(value.raceClaims, 20000) ||
    !strings(value.cups, cups.length, (id) => cups.includes(id)) ||
    !strings(value.trialTracks, 100) ||
    !strings(value.claims, ALL_REWARDS.length, (id) =>
      ALL_REWARDS.some((reward) => reward.id === id),
    ) ||
    !(value.exoticShip === null || CAREER_SHIPS.includes(value.exoticShip)) ||
    !value.loadouts ||
    typeof value.loadouts !== 'object' ||
    Array.isArray(value.loadouts) ||
    Object.keys(value.loadouts).some((id) => !CAREER_SHIPS.includes(id))
  )
    return null;
  const next = freshProfile();
  for (const key of [
    'wins',
    'raceClaims',
    'cups',
    'trialTracks',
    'claims',
    'exoticShip',
  ])
    next[key] = copy(value[key]);
  if (value.version < 3) {
    // Prior saves only counted wins. Keep every earned reward and credit those wins.
    next.finishes = next.wins;
    next.points = next.wins * 5;
    next.raceScores = Object.fromEntries(next.raceClaims.map((id) => [id, 5]));
  } else {
    if (
      !Number.isSafeInteger(value.finishes) ||
      value.finishes < next.wins ||
      value.finishes > 1000000 ||
      !Number.isSafeInteger(value.points) ||
      value.points < value.finishes ||
      value.points > value.finishes * 5 ||
      !value.raceScores ||
      typeof value.raceScores !== 'object' ||
      Array.isArray(value.raceScores) ||
      Object.keys(value.raceScores).length !== next.raceClaims.length ||
      next.raceClaims.some(
        (id) =>
          !Object.hasOwn(value.raceScores, id) ||
          !Number.isInteger(value.raceScores[id]) ||
          value.raceScores[id] < 1 ||
          value.raceScores[id] > 5,
      )
    )
      return null;
    next.finishes = value.finishes;
    next.points = value.points;
    next.raceScores = copy(value.raceScores);
  }
  if (next.exoticShip && !next.claims.includes('exotic-slot')) return null;
  // Older demos saved only Kestrel. Expand that exact legacy shape; reject
  // partially missing full-game fleets rather than silently repairing damage.
  const legacyDemo =
    Object.keys(value.loadouts).length === 1 &&
    Object.hasOwn(value.loadouts, 'kestrel');
  for (const shipId of CAREER_SHIPS) {
    if (legacyDemo && shipId !== 'kestrel') continue;
    const slots = value.loadouts[shipId];
    const legacy = value.version === 1;
    const limit = legacy
      ? next.exoticShip === shipId
        ? 2
        : 1
      : next.exoticShip === shipId
        ? MAX_EQUIPMENT_SLOTS
        : STANDARD_EQUIPMENT_SLOTS;
    if (
      !Array.isArray(slots) ||
      slots.length !== (legacy ? 2 : MAX_EQUIPMENT_SLOTS) ||
      slots.some(
        (id, i) =>
          id !== null &&
          (i >= limit ||
            !EQUIPMENT.some((item) => item.id === id) ||
            !next.claims.includes(`equipment-${id}`)),
      ) ||
      new Set(slots.filter(Boolean)).size !== slots.filter(Boolean).length
    )
      return null;
    next.loadouts[shipId] = Array.from(
      { length: MAX_EQUIPMENT_SLOTS },
      (_, i) => slots[i] ?? null,
    );
  }
  return next;
}
export function shipUnlocked(profile, id) {
  return (
    SHIPS.some((ship) => ship.id === id) &&
    (id === starterShip() || profile.claims.includes(`ship-${id}`))
  );
}
export function equippedItems(profile, shipId) {
  return (profile.loadouts[shipId] ?? [])
    .slice(0, equipmentCapacity(profile, shipId))
    .map((id) =>
      AVAILABLE_EQUIPMENT.some((item) => item.id === id) ? id : null,
    );
}
export function sessionBuild(profile, shipId, { stock = false } = {}) {
  return {
    version: 1,
    enhancements: stock ? {} : enhancementRanks(profile),
    equipment: stock ? [] : equippedItems(profile, shipId),
  };
}
export function buildIdentity(build) {
  if (
    !build ||
    (!Object.values(build.enhancements ?? {}).some(Boolean) &&
      !build.equipment?.some(Boolean))
  )
    return null;
  return {
    version: 1,
    enhancements: enhancementRanks({
      claims: REWARDS.filter(
        (r) =>
          r.kind === 'enhancement' &&
          r.rank <= (build.enhancements?.[r.stat] ?? 0),
      ).map((r) => r.id),
    }),
    equipment: [...(build.equipment ?? [])],
  };
}
function earned(profile, requirement) {
  if (requirement.after && !profile.claims.includes(requirement.after))
    return false;
  if (requirement.finishes) return profile.finishes >= requirement.finishes;
  if (requirement.points) return profile.points >= requirement.points;
  if (requirement.trials)
    return profile.trialTracks.length >= requirement.trials;
  if (requirement.cup) return profile.cups.includes(requirement.cup);
  return fullCupWins(profile) >= requirement.cups;
}
export function rewardProgress(profile, requirement) {
  if (requirement.finishes)
    return [
      Math.min(profile.finishes, requirement.finishes),
      requirement.finishes,
    ];
  if (requirement.points)
    return [Math.min(profile.points, requirement.points), requirement.points];
  if (requirement.trials)
    return [
      Math.min(profile.trialTracks.length, requirement.trials),
      requirement.trials,
    ];
  if (requirement.cup)
    return [Number(profile.cups.includes(requirement.cup)), 1];
  return [Math.min(fullCupWins(profile), requirement.cups), requirement.cups];
}
export function createProfileStore(storage = () => localStorage) {
  let state = freshProfile(),
    saved = true,
    notice = '';
  const listeners = new Set();
  try {
    const raw = storage()?.getItem(PROFILE_KEY);
    if (raw) {
      const valid = validateProfile(JSON.parse(raw));
      if (valid) state = valid;
      else
        notice =
          'Career save could not be read. Import a backup to restore it.';
    }
  } catch {
    saved = false;
    notice =
      'Career storage is unavailable. Export your progress before closing.';
  }
  function persist(next) {
    state = next;
    try {
      storage().setItem(PROFILE_KEY, JSON.stringify(state));
      saved = true;
      notice = '';
    } catch {
      saved = false;
      notice =
        'Progress is kept for this session. Export a save before closing.';
    }
    for (const listener of listeners) listener(copy(state));
    return copy(state);
  }
  function award(next) {
    const rewards = [];
    for (const reward of REWARDS) {
      if (next.claims.includes(reward.id) || !earned(next, reward.requirement))
        continue;
      next.claims.push(reward.id);
      rewards.push(reward);
    }
    persist(next);
    return copy(rewards);
  }
  return {
    snapshot: () => ({ state: copy(state), saved, notice }),
    reload() {
      const next = validateProfile(JSON.parse(storage().getItem(PROFILE_KEY)));
      if (!next) throw new Error('Invalid career save.');
      state = next;
      saved = true;
      notice = '';
      for (const listener of listeners) listener(copy(state));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    recordRace({
      id,
      position,
      valid = true,
      finished = true,
      won = false,
      cup = null,
    }) {
      const score =
        valid && finished
          ? raceProgressPoints(position ?? (won ? 1 : null))
          : 0;
      if (!score || typeof id !== 'string' || !id || id.length > 160) return [];
      const previous = Object.hasOwn(state.raceScores, id)
        ? state.raceScores[id]
        : 0;
      if (score <= previous) return [];
      const next = copy(state);
      next.points += score - previous;
      if (score === 5) next.wins++;
      if (!previous) {
        next.finishes++;
        next.raceClaims.push(id);
        if (next.raceClaims.length > 20000)
          delete next.raceScores[next.raceClaims.shift()];
      }
      Object.defineProperty(next.raceScores, id, {
        value: score,
        enumerable: true,
        configurable: true,
        writable: true,
      });
      if (score === 5 && cups.includes(cup) && !next.cups.includes(cup))
        next.cups.push(cup);
      return award(next);
    },
    recordCup(id) {
      if (!cups.includes(id) || state.cups.includes(id)) return [];
      const next = copy(state);
      next.cups.push(id);
      return award(next);
    },
    recordTrial(track, valid) {
      if (
        !valid ||
        typeof track !== 'string' ||
        !track ||
        track.length > 160 ||
        state.trialTracks.includes(track)
      )
        return [];
      const next = copy(state);
      next.trialTracks.push(track);
      return award(next);
    },
    equip(ship, slot, id) {
      if (
        !shipUnlocked(state, ship) ||
        !state.loadouts[ship] ||
        !Number.isInteger(slot) ||
        slot < 0 ||
        slot >= equipmentCapacity(state, ship) ||
        (id !== null &&
          (!AVAILABLE_EQUIPMENT.some((item) => item.id === id) ||
            !state.claims.includes(`equipment-${id}`)))
      )
        return false;
      const next = copy(state);
      if (id)
        next.loadouts[ship] = next.loadouts[ship].map((value) =>
          value === id ? null : value,
        );
      next.loadouts[ship][slot] = id;
      persist(next);
      return true;
    },
    chooseExotic(ship) {
      if (
        IS_DEMO ||
        state.exoticShip ||
        !state.claims.includes('exotic-slot') ||
        !shipUnlocked(state, ship)
      )
        return false;
      const next = copy(state);
      next.exoticShip = ship;
      persist(next);
      return true;
    },
  };
}
