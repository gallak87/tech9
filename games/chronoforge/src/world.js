// Chronoforge — World data (Phase 2 deliverable from level agent)
// Handcrafted 60x40 tile grid. Biome regions are hand-placed; within a biome,
// tile variety is seeded so regeneration is deterministic.

export const TILE = 32; // px per tile
export const MAP_W = 60;
export const MAP_H = 40;

// seeded rng (mulberry32)
function rng(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// biome regions — hand-placed rectangles (x0, y0, x1, y1)
const BIOMES = [
  { id: 'grassland_ruins', rect: [0, 0, 22, 40] },
  { id: 'neon_wastes', rect: [22, 0, 44, 40] },
  { id: 'alien_terraform', rect: [44, 0, 60, 40] },
];

const BIOME_TILES = {
  grassland_ruins: {
    base: ['tile_grass', 'tile_grass', 'tile_grass', 'tile_dirt'],
    accent: ['tile_dead_tree', 'tile_ruin_rubble', 'tile_stream'],
    accentChance: 0.08,
  },
  neon_wastes: {
    base: ['tile_sand', 'tile_sand', 'tile_rust_patch'],
    accent: ['tile_barricade', 'tile_neon_cable', 'tile_billboard', 'tile_broken_highway'],
    accentChance: 0.07,
  },
  alien_terraform: {
    base: ['tile_bio_moss', 'tile_bio_moss', 'tile_growth_tile'],
    accent: ['tile_crystal_shard', 'tile_bio_pool', 'tile_alien_tree', 'tile_terraform_pipe'],
    accentChance: 0.1,
  },
};

function biomeAt(x, y) {
  for (const b of BIOMES) {
    const [x0, y0, x1, y1] = b.rect;
    if (x >= x0 && x < x1 && y >= y0 && y < y1) return b.id;
  }
  return 'grassland_ruins';
}

// build the tile grid
function buildTiles() {
  const rnd = rng(0xC410FA);
  const grid = [];
  for (let y = 0; y < MAP_H; y++) {
    const row = [];
    for (let x = 0; x < MAP_W; x++) {
      const biome = biomeAt(x, y);
      const def = BIOME_TILES[biome];
      const r = rnd();
      let tile;
      if (r < def.accentChance) {
        tile = def.accent[Math.floor(rnd() * def.accent.length)];
      } else {
        tile = def.base[Math.floor(rnd() * def.base.length)];
      }
      row.push({ t: tile, biome, passable: tile !== 'tile_stream' && tile !== 'tile_bio_pool' });
    }
    grid.push(row);
  }

  // carve roads between cities — simple straight-ish corridors
  const paths = [
    [[12, 28], [20, 28], [20, 20], [32, 20], [32, 28]],       // Haventide -> Emberline
    [[32, 28], [40, 28], [40, 14], [45, 14]],                  // Emberline -> Orbital Reach
    [[45, 14], [50, 14], [50, 22], [52, 22]],                  // Orbital Reach -> Last Crown
  ];
  for (const path of paths) {
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, ay] = path[i];
      const [bx, by] = path[i + 1];
      const dx = Math.sign(bx - ax), dy = Math.sign(by - ay);
      let x = ax, y = ay;
      while (x !== bx || y !== by) {
        if (grid[y] && grid[y][x]) {
          grid[y][x] = { t: 'tile_cracked_road', biome: biomeAt(x, y), passable: true };
        }
        if (x !== bx) x += dx;
        else if (y !== by) y += dy;
      }
    }
  }

  return grid;
}

export const CITIES = [
  {
    id: 'haventide',
    name: 'Haventide',
    x: 12, y: 28,
    landmark: 'city_haventide',
    biome: 'grassland_ruins',
    unlocked: true, // starting city — always available for fast-travel
    blurb: 'Coastal fishing port. Your home base. Pink neon docks, rumor of a lost sister ship.',
  },
  {
    id: 'emberline',
    name: 'Emberline',
    x: 32, y: 28,
    landmark: 'city_emberline',
    biome: 'neon_wastes',
    unlocked: false,
    blurb: 'Desert trade hub. Caravans whisper of a collapsing orbital elevator.',
  },
  {
    id: 'orbital_reach',
    name: 'Orbital Reach',
    x: 45, y: 14,
    landmark: 'city_orbital_reach',
    biome: 'neon_wastes',
    unlocked: false,
    blurb: 'Ruined space-elevator base. Cyan steel piercing the storm clouds.',
  },
  {
    id: 'last_crown',
    name: 'Last Crown',
    x: 52, y: 22,
    landmark: 'city_last_crown',
    biome: 'alien_terraform',
    unlocked: false,
    blurb: 'The final megacity. Magenta spires where the Void Architect waits.',
  },
];

// encounter zones — visible enemy markers on the map
export const ENCOUNTERS = [
  { id: 'e1', x: 18, y: 25, enemy: 'rust_scrapper', biome: 'grassland_ruins' },
  { id: 'e2', x: 24, y: 32, enemy: 'mutant_hound', biome: 'neon_wastes' },
  { id: 'e3', x: 28, y: 20, enemy: 'drone_sentinel', biome: 'neon_wastes' },
  { id: 'e4', x: 37, y: 22, enemy: 'gravbot', biome: 'neon_wastes' },
  { id: 'e5', x: 42, y: 18, enemy: 'neon_cultist', biome: 'neon_wastes' },
  { id: 'e6', x: 47, y: 10, enemy: 'sandworm_hatchling', biome: 'alien_terraform' },
  { id: 'e7', x: 48, y: 20, enemy: 'wraith_core', biome: 'alien_terraform' },
  { id: 'e8', x: 55, y: 25, enemy: 'architect_herald', biome: 'alien_terraform' },
];

export const TILES = buildTiles();

export function tileAt(x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return null;
  return TILES[y][x];
}

export function cityAt(x, y) {
  return CITIES.find(c => c.x === x && c.y === y);
}

export function encounterAt(x, y) {
  return ENCOUNTERS.find(e => e.x === x && e.y === y);
}

export const PLAYER_START = { x: 12, y: 28 };
