import { CUP_COLLECTION_KEY, createCupCollection } from './cup-collection.js';
// Dynamically imported only by browser builds. Never a durable career writer.
import {
  freshProfile,
  PROFILE_KEY,
  createProfileStore,
  equipmentCapacity,
  starterShip,
} from './profile.js';
import { IS_DEMO } from './edition.js';
import { REWARDS, AVAILABLE_EQUIPMENT } from './catalog.js';
import { CUPS, CUP_STORAGE_KEY, createCupStore } from '../race/cup.js';
import { RACE_OPPONENTS } from '../race/roster.js';
import { SHIPS } from '../ships/catalog.js';
export function createDeveloperSession(parameters) {
  const memory = new Map();
  const storage = {
    isolated: true,
    get length() {
      return memory.size;
    },
    key: (i) => [...memory.keys()][i] ?? null,
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  };
  const state =
    parameters.get('dev') === '2'
      ? freshProfile()
      : createProfileStore().snapshot().state;
  if (parameters.get('dev') === '2') {
    state.wins = 24;
    state.finishes = 24;
    state.points = 120;
    state.cups = CUPS.map((cup) => cup.id);
    state.trialTracks = IS_DEMO ? ['halcyon'] : ['halcyon', 'orbital'];
    state.claims = REWARDS.map((reward) => reward.id);
    state.exoticShip = IS_DEMO
      ? null
      : (SHIPS.find(
          (s) => s.id === (parameters.get('exotic') ?? parameters.get('ship')),
        )?.id ?? starterShip());
    for (const ship of SHIPS)
      state.loadouts[ship.id] = [
        'jump',
        IS_DEMO ? 'deflector' : 'injector',
        ...(state.exoticShip === ship.id
          ? ['deflector', 'lance']
          : [null, null]),
      ];
  }
  const rank = Number(parameters.get('upgrades'));
  if (
    parameters.has('upgrades') &&
    Number.isInteger(rank) &&
    rank >= 0 &&
    rank <= 3
  ) {
    state.claims = state.claims.filter(
      (id) => !REWARDS.some((r) => r.id === id && r.kind === 'enhancement'),
    );
    state.claims.push(
      ...REWARDS.filter((r) => r.kind === 'enhancement' && r.rank <= rank).map(
        (r) => r.id,
      ),
    );
  }
  const loadout = [
    ...new Set(
      parameters
        .get('equipment')
        ?.split(',')
        .filter((id) => AVAILABLE_EQUIPMENT.some((item) => item.id === id)) ??
        [],
    ),
  ];
  if (loadout?.length) {
    const ship =
      SHIPS.find((s) => s.id === parameters.get('ship'))?.id ?? starterShip();
    if (ship !== starterShip() && !state.claims.includes(`ship-${ship}`))
      state.claims.push(`ship-${ship}`);
    for (const id of loadout)
      if (!state.claims.includes(`equipment-${id}`))
        state.claims.push(`equipment-${id}`);
    state.loadouts[ship] = Array.from({ length: 4 }, (_, i) =>
      i < equipmentCapacity(state, ship) ? (loadout[i] ?? null) : null,
    );
  }
  const cup = CUPS.find((entry) => entry.id === parameters.get('cup'));
  if (cup && parameters.get('event') === 'final') {
    const store = createCupStore(() => storage);
    const ship =
      SHIPS.find((entry) => entry.id === parameters.get('ship'))?.id ??
      starterShip();
    if (ship !== starterShip() && !state.claims.includes(`ship-${ship}`))
      state.claims.push(`ship-${ship}`);
    const saved = store.start(cup.id, ship, 'easy');
    saved.eventIndex = cup.tracks.length - 1;
    saved.results = Array.from({ length: saved.eventIndex }, () =>
      ['player', ...RACE_OPPONENTS.map((r) => r.id)].map((id, i) => ({
        id,
        status: 'finished',
        timeMs: 120000 + i * 1000,
      })),
    );
    storage.setItem(CUP_STORAGE_KEY, JSON.stringify(saved));
  }
  const trophies =
    parameters.get('dev') === '2'
      ? Object.fromEntries(
          CUPS.map((cup) => [
            cup.id,
            {
              earnedAt: Date.now(),
              difficulty: 'hard',
              points: cup.tracks.length * 25,
            },
          ]),
        )
      : createCupCollection().snapshot().cups;
  storage.setItem(
    CUP_COLLECTION_KEY,
    JSON.stringify({ version: 1, cups: trophies }),
  );
  storage.setItem(PROFILE_KEY, JSON.stringify(state));
  return {
    storage: () => storage,
    parameters: new URLSearchParams(parameters),
  };
}
