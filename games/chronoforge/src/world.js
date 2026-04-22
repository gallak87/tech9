// Chronoforge — World data. Multi-map: each MAPS entry is its own 60×40 grid
// with its own pre-rendered backdrop, city, encounters, doorways, and (optional)
// world-drop. Player state carries mapId; doorways trigger chrono-rift travel.

export const TILE = 64; // px per tile
// always target 60/40 proportion to prevent weird tile placement issues
export const MAP_W = 45;
export const MAP_H = 30;

function rng(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Trivial all-passable tile grid. Backdrop-rendered maps don't use this for
// visuals; we only care about bounds + passability (everything passable).
function buildTilesFor(biomeId, seed, w = MAP_W, h = MAP_H) {
  const rnd = rng(seed);
  const base = BIOME_BASE[biomeId] || ['tile_grass'];
  const grid = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      const t = base[Math.floor(rnd() * base.length)];
      row.push({ t, biome: biomeId, passable: true });
    }
    grid.push(row);
  }
  return grid;
}

const BIOME_BASE = {
  grassland_ruins: ['tile_grass', 'tile_grass', 'tile_dirt'],
  neon_wastes:     ['tile_sand',  'tile_sand',  'tile_rust_patch'],
  alien_terraform: ['tile_bio_moss', 'tile_growth_tile'],
  frozen_ruins:    ['tile_dirt', 'tile_dirt', 'tile_ruin_rubble'],
  forest_veil:     ['tile_grass', 'tile_grass', 'tile_dirt'],
  mire_bog:        ['tile_dirt', 'tile_bio_moss'],
  crater_ember:    ['tile_rust_patch', 'tile_cracked_road'],
  frost_canyon:    ['tile_dirt', 'tile_ruin_rubble'],
};

// Central MAP definition. Each map is self-contained.
export const MAPS = {
  haventide_region: {
    id: 'haventide_region',
    name: 'Haventide Region',
    backdrop: 'proof',
    tier: 1,
    biome: 'grassland_ruins',
    city: {
      id: 'haventide', name: 'Haventide',
      x: 12, y: 20,
      landmark: 'city_haventide',
      biome: 'grassland_ruins',
      unlocked: true,
      blurb: 'Coastal fishing port. Your home base. Pink neon docks, rumor of a lost sister ship.',
      plots: [
        // TC landmark box: city at 12,20. inner ring 4 tiles out, outer ring 8 tiles out.
        // inner ring
        { slotIdx: 1,  x: 8,  y: 16 }, { slotIdx: 2,  x: 12, y: 16 }, { slotIdx: 3,  x: 16, y: 16 },
        { slotIdx: 4,  x: 8,  y: 20 },                                  { slotIdx: 5,  x: 16, y: 20 },
        { slotIdx: 6,  x: 8,  y: 24 }, { slotIdx: 7,  x: 12, y: 24 }, { slotIdx: 8,  x: 16, y: 24 },
        // outer ring
        { slotIdx: 9,  x: 4,  y: 12 }, { slotIdx: 10, x: 12, y: 11 }, { slotIdx: 11, x: 20, y: 12 },
        { slotIdx: 12, x: 4,  y: 20 },                                  { slotIdx: 13, x: 20, y: 20 },
        { slotIdx: 14, x: 4,  y: 28 }, { slotIdx: 15, x: 12, y: 29 }, { slotIdx: 16, x: 20, y: 28 },
        { slotIdx: 17, x: 8,  y: 9  },
      ],
    },
    encounters: [
      { id: 'e1',  x: 30, y: 17, enemy: 'rust_scrapper' },
      { id: 'e20', x: 30, y:  7, enemy: 'bog_stalker' },
      { id: 'e21', x: 40, y: 22, enemy: 'slag_rat' },
    ],
    doorways: [
      { x: 44, y: 15, to: { mapId: 'emberline_region', x: 1, y: 20 } },
    ],
    worldDrop: { x: 38, y: 5, itemId: 'bog_fang' },
  },
  emberline_region: {
    id: 'emberline_region',
    name: 'Emberline Region',
    backdrop: 'desert',
    tier: 2,
    biome: 'neon_wastes',
    city: {
      id: 'emberline', name: 'Emberline',
      x: 32, y: 17,
      landmark: 'city_emberline',
      biome: 'neon_wastes',
      unlocked: false,
      blurb: 'Desert trade hub. Caravans whisper of a collapsing orbital elevator.',
    },
    encounters: [
      { id: 'e2',  x: 14, y: 16, enemy: 'mutant_hound' },
      { id: 'e3',  x: 24, y: 20, enemy: 'drone_sentinel' },
      { id: 'e4',  x: 40, y: 18, enemy: 'gravbot' },
      { id: 'e22', x: 8,  y: 21, enemy: 'slag_rat' },
      { id: 'e23', x: 38, y: 8,  enemy: 'bog_stalker' },
    ],
    doorways: [
      { x: 1,  y: 15, to: { mapId: 'haventide_region',    x: 44, y: 15 } },
      { x: 44, y: 15, to: { mapId: 'orbital_reach_region', x: 1, y: 20 } },
      { x: 22, y: 29, to: { mapId: 'forest_veil_region',   x: 30, y: 1 } },
      { x: 42, y: 4,  to: { mapId: 'crater_ember_region',  x: 10, y: 36 } },
    ],
    worldDrop: { x: 8, y: 8, itemId: 'glacial_claw' },
  },
  orbital_reach_region: {
    id: 'orbital_reach_region',
    name: 'Orbital Reach Region',
    backdrop: 'frozen',
    tier: 3,
    biome: 'frozen_ruins',
    city: {
      id: 'orbital_reach', name: 'Orbital Reach',
      x: 20, y: 18,
      landmark: 'city_orbital_reach',
      biome: 'neon_wastes',
      unlocked: false,
      blurb: 'Ruined space-elevator base. Cyan steel piercing the storm clouds.',
    },
    encounters: [
      { id: 'e5',  x: 14, y: 14, enemy: 'neon_cultist' },
      { id: 'e6',  x: 30, y: 22, enemy: 'sandworm_hatchling' },
      { id: 'e28', x: 42, y: 30, enemy: 'glacier_wolf' },
      { id: 'e29', x: 50, y: 14, enemy: 'frost_revenant' },
    ],
    doorways: [
      { x: 1,  y: 20, to: { mapId: 'emberline_region',   x: 44, y: 15 } },
      { x: 58, y: 14, to: { mapId: 'last_crown_region',  x: 1,  y: 14 } },
      { x: 10, y: 2,  to: { mapId: 'frost_canyon_region', x: 30, y: 36 } },
    ],
    worldDrop: { x: 42, y: 8, itemId: 'ember_core' },
  },
  last_crown_region: {
    id: 'last_crown_region',
    name: 'Last Crown Region',
    backdrop: 'alien',
    tier: 4,
    biome: 'alien_terraform',
    city: {
      id: 'last_crown', name: 'Last Crown',
      x: 32, y: 22,
      landmark: 'city_last_crown',
      biome: 'alien_terraform',
      unlocked: false,
      blurb: 'The final megacity. Magenta spires where the Void Architect waits.',
    },
    encounters: [
      { id: 'e7',  x: 20, y: 18, enemy: 'wraith_core' },
      { id: 'e8',  x: 45, y: 25, enemy: 'architect_herald' },
      { id: 'e32', x: 10, y: 28, enemy: 'mire_warden' },
      { id: 'e33', x: 40, y: 14, enemy: 'gravbot' },
      { id: 'e34', x: 52, y: 30, enemy: 'neon_cultist' },
    ],
    doorways: [
      { x: 1, y: 14, to: { mapId: 'orbital_reach_region', x: 58, y: 14 } },
    ],
    worldDrop: { x: 50, y: 34, itemId: 'void_scepter' },
  },
  forest_veil_region: {
    id: 'forest_veil_region',
    name: 'Forest Veil',
    backdrop: 'forest',
    tier: 2,
    biome: 'forest_veil',
    city: null,
    encounters: [
      { id: 'e9',  x: 18, y: 22, enemy: 'mutant_hound' },
      { id: 'e10', x: 42, y: 30, enemy: 'mire_hulk' },
      { id: 'e24', x: 30, y: 15, enemy: 'bog_stalker' },
      { id: 'e25', x: 52, y: 20, enemy: 'slag_rat' },
    ],
    doorways: [
      { x: 30, y: 1,  to: { mapId: 'emberline_region', x: 22, y: 29 } },
      { x: 58, y: 22, to: { mapId: 'mire_bog_region',  x: 1,  y: 22 } },
    ],
    worldDrop: { x: 10, y: 10, itemId: 'moss_ward' },
  },
  mire_bog_region: {
    id: 'mire_bog_region',
    name: 'Mire Bog',
    backdrop: 'mire_bog',
    tier: 2,
    biome: 'mire_bog',
    city: null,
    encounters: [
      { id: 'e11', x: 20, y: 18, enemy: 'bog_stalker' },
      { id: 'e12', x: 32, y: 24, enemy: 'mire_hulk' },
      { id: 'e13', x: 44, y: 12, enemy: 'mire_warden' },
      { id: 'e26', x: 10, y: 28, enemy: 'slag_rat' },
      { id: 'e27', x: 52, y: 22, enemy: 'mutant_hound' },
    ],
    doorways: [
      { x: 1, y: 22, to: { mapId: 'forest_veil_region', x: 58, y: 22 } },
    ],
    worldDrop: { x: 48, y: 30, itemId: 'slag_tooth' },
  },
  crater_ember_region: {
    id: 'crater_ember_region',
    name: 'Crater Ember',
    backdrop: 'crater_ember',
    tier: 4,
    biome: 'crater_ember',
    city: null,
    encounters: [
      { id: 'e14', x: 22, y: 16, enemy: 'ember_golem' },
      { id: 'e15', x: 36, y: 26, enemy: 'magma_behemoth' },
      { id: 'e16', x: 48, y: 12, enemy: 'ember_lord' },
      { id: 'e35', x: 10, y: 26, enemy: 'gravbot' },
      { id: 'e36', x: 34, y: 10, enemy: 'neon_cultist' },
    ],
    doorways: [
      { x: 10, y: 36, to: { mapId: 'emberline_region', x: 42, y: 4 } },
    ],
    worldDrop: { x: 30, y: 6, itemId: 'magma_blade' },
  },
  frost_canyon_region: {
    id: 'frost_canyon_region',
    name: 'Frost Canyon',
    backdrop: 'frost_canyon',
    tier: 3,
    biome: 'frost_canyon',
    city: null,
    encounters: [
      { id: 'e17', x: 18, y: 20, enemy: 'glacier_wolf' },
      { id: 'e18', x: 32, y: 14, enemy: 'frost_revenant' },
      { id: 'e19', x: 46, y: 24, enemy: 'frost_colossus' },
      { id: 'e30', x: 8,  y: 28, enemy: 'neon_cultist' },
      { id: 'e31', x: 52, y: 34, enemy: 'sandworm_hatchling' },
    ],
    doorways: [
      { x: 30, y: 36, to: { mapId: 'orbital_reach_region', x: 10, y: 2 } },
    ],
    worldDrop: { x: 8, y: 30, itemId: 'frost_plate' },
  },
  haventide_interior: {
    id: 'haventide_interior',
    name: 'Haventide',
    backdrop: null,
    w: 30, h: 20,
    biome: 'grassland_ruins',
    isInterior: true,
    parentCityId: 'haventide',
    parentMapId: 'haventide_region',
    plots: [
      { slotIdx: 0,  x: 15, y: 10 }, // Town Center — center
      { slotIdx: 1,  x: 11, y: 7  }, { slotIdx: 2,  x: 19, y: 7  },
      { slotIdx: 3,  x: 11, y: 13 }, { slotIdx: 4,  x: 19, y: 13 },
      { slotIdx: 5,  x: 7,  y: 5  }, { slotIdx: 6,  x: 15, y: 5  }, { slotIdx: 7,  x: 23, y: 5  },
      { slotIdx: 8,  x: 7,  y: 10 },                                { slotIdx: 9,  x: 23, y: 10 },
      { slotIdx: 10, x: 7,  y: 15 }, { slotIdx: 11, x: 15, y: 15 }, { slotIdx: 12, x: 23, y: 15 },
      { slotIdx: 13, x: 4,  y: 3  }, { slotIdx: 14, x: 26, y: 3  },
      { slotIdx: 15, x: 4,  y: 17 }, { slotIdx: 16, x: 26, y: 17 },
      { slotIdx: 17, x: 15, y: 18 },
    ],
    exitHint: 'walk south to the waterfront to leave',
    city: null, encounters: [], worldDrop: null,
    doorways: [
      { x: 15, y: 19, to: { mapId: 'haventide_region', x: 12, y: 24 } },
    ],
  },
  emberline_interior: {
    id: 'emberline_interior',
    name: 'Emberline',
    backdrop: null,
    w: 35, h: 24,
    biome: 'neon_wastes',
    isInterior: true,
    parentCityId: 'emberline',
    parentMapId: 'emberline_region',
    exitHint: 'walk back through the gate arch to leave',
    plots: null,
    city: null, encounters: [], worldDrop: null,
    doorways: [
      { x: 17, y: 23, to: { mapId: 'emberline_region', x: 32, y: 20 } },
    ],
  },
  orbital_reach_interior: {
    id: 'orbital_reach_interior',
    name: 'Orbital Reach',
    backdrop: null,
    w: 35, h: 24,
    biome: 'frozen_ruins',
    isInterior: true,
    parentCityId: 'orbital_reach',
    parentMapId: 'orbital_reach_region',
    exitHint: 'walk south through the blast doors to leave',
    plots: null,
    city: null, encounters: [], worldDrop: null,
    doorways: [
      { x: 17, y: 23, to: { mapId: 'orbital_reach_region', x: 20, y: 22 } },
    ],
  },
  last_crown_interior: {
    id: 'last_crown_interior',
    name: 'Last Crown',
    backdrop: null,
    w: 35, h: 24,
    biome: 'alien_terraform',
    isInterior: true,
    parentCityId: 'last_crown',
    parentMapId: 'last_crown_region',
    exitHint: 'step back through the void gate to leave',
    plots: null,
    city: null, encounters: [], worldDrop: null,
    doorways: [
      { x: 17, y: 23, to: { mapId: 'last_crown_region', x: 32, y: 26 } },
    ],
  },
};

// Generate tiles once per map (seed from id for determinism).
for (const m of Object.values(MAPS)) {
  let h = 0;
  for (let i = 0; i < m.id.length; i++) h = (h * 31 + m.id.charCodeAt(i)) | 0;
  m.tiles = buildTilesFor(m.biome, h, m.w ?? MAP_W, m.h ?? MAP_H);
}

export function getMap(mapId) {
  return MAPS[mapId] || null;
}

export function tileAt(mapId, x, y) {
  const m = MAPS[mapId];
  if (!m) return null;
  const w = m.w ?? MAP_W;
  const h = m.h ?? MAP_H;
  if (x < 0 || y < 0 || x >= w || y >= h) return null;
  return m.tiles[y][x];
}

export function cityAt(mapId, x, y) {
  const m = MAPS[mapId];
  if (!m || !m.city) return null;
  return (m.city.x === x && m.city.y === y) ? m.city : null;
}

export function encounterAt(mapId, x, y) {
  const m = MAPS[mapId];
  if (!m) return null;
  return m.encounters.find(e => e.x === x && e.y === y && !e.cleared) || null;
}

export function doorwayAt(mapId, x, y) {
  const m = MAPS[mapId];
  if (!m) return null;
  return m.doorways.find(d => d.x === x && d.y === y) || null;
}

export function worldDropAt(mapId, x, y) {
  const m = MAPS[mapId];
  if (!m || !m.worldDrop) return null;
  return (m.worldDrop.x === x && m.worldDrop.y === y) ? m.worldDrop : null;
}

// --- Aggregate accessors for save state + menu UI ---
// Cities tagged with mapId so callers (quest log, fast-travel, minimap)
// can link an entry back to its map.
export const ALL_CITIES = Object.values(MAPS)
  .filter(m => m.city)
  .map(m => {
    m.city.mapId = m.id;
    return m.city;
  });

export const ALL_ENCOUNTERS = Object.values(MAPS)
  .flatMap(m => m.encounters.map(e => {
    e.mapId = m.id;
    return e;
  }));

export const PLAYER_START = { mapId: 'haventide_region', x: 12, y: 18 };

// --- Back-compat shims (menu's full-map view + any stragglers) ---
// Returns current-map tiles. Used only where the old single-map API exists.
export function tilesOf(mapId) {
  const m = MAPS[mapId];
  return m ? m.tiles : null;
}
