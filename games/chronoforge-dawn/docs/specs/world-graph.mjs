// docs/specs/world-graph.mjs
// Phase 1.2 (level) — the twelve-map port + the accepted doorway topology.
//
// PORT SOURCE: games/chronoforge/src/world.js MAPS. Every region, city, build
// plot, encounter, world drop and doorway in that table is carried forward
// here. Nothing was dropped. Two donor defects were fixed and are logged as
// DONOR-4 / DONOR-5 in docs/STATUS.json (see FIXED_FROM_DONOR below).
//
// TOPOLOGY: the donor graph is a TREE — 8 outdoor regions, 7 edges, zero
// cycles, Emberline a cut vertex on 61% of all journeys. This module ships a
// 10-edge graph: the 7 inherited edges plus 3 lateral cycles. The three added
// edges change the per-tier reachability profile by exactly ZERO (each is
// gated at the tier at which both its endpoints were already reachable) —
// they buy travel time, not progression. Argument and cost: agents/level-output.md.
//
// GATES: each edge carries the minimum settlement tech tier required to cross
// it, in EITHER direction. Runtime check stubs to unlocked until settlement
// ships in Phase 9 (CONTRACT.md "Gate data is authored before the system that
// reads it"). Gates are temporary: no gate exceeds Ascendant, so at
// Transcendent every edge traverses both ways. The gate assignment re-applies
// the rule in agents/gamedesign-output.md §4.2 to the new edge set, and
// docs/specs/tech-gates.mjs was updated to match; selfCheck() proves the two
// tables agree rather than trusting that they do.
//
// UNITS: authored in TILES. One tile = TILE_M = 2 m (src/core/const.js).
// Map-local metres have their origin at the map's NW corner, +x east, +z
// south; tile (tx,ty) centre = ((tx+0.5)*2, (ty+0.5)*2). Tiles are authoring
// data and never reach the renderer (CONTRACT.md §4.10).
//
//   node docs/specs/world-graph.mjs     # QA gate for Phase 1.2

import { TILE_M } from '../../src/core/const.js';
import { REGION_EDGES as GATE_TABLE, SETTLEMENT_TIERS } from './tech-gates.mjs';

export { TILE_M, SETTLEMENT_TIERS };

export const MAP_W = 45;              // outdoor map, tiles
export const MAP_H = 30;
export const OUTDOOR_W_M = MAP_W * TILE_M;   // 90 m
export const OUTDOOR_D_M = MAP_H * TILE_M;   // 60 m

/** Tile centre in map-local metres. */
export const tileToM = (t) => (t + 0.5) * TILE_M;

// ── the twelve maps ─────────────────────────────────────────────────────────
// Field-for-field port. `gate` on a doorway is denormalised from REGION_EDGES
// so the runtime never has to join two tables; selfCheck() proves they match.

export const MAPS = {
  haventide_region: {
    id: 'haventide_region', name: 'Haventide Region', tier: 1,
    biome: 'grassland_ruins', backdrop: 'proof', w: MAP_W, h: MAP_H,
    city: {
      id: 'haventide', name: 'Haventide', x: 12, y: 20,
      landmark: 'city_haventide', biome: 'grassland_ruins', unlocked: true,
      blurb: 'Coastal fishing port. Your home base. Pink neon docks, rumor of a lost sister ship.',
      plots: [
        { slotIdx: 1,  x: 8,  y: 16 }, { slotIdx: 2,  x: 12, y: 16 }, { slotIdx: 3,  x: 16, y: 16 },
        { slotIdx: 4,  x: 8,  y: 20 },                                { slotIdx: 5,  x: 16, y: 20 },
        { slotIdx: 6,  x: 8,  y: 24 }, { slotIdx: 7,  x: 12, y: 24 }, { slotIdx: 8,  x: 16, y: 24 },
        { slotIdx: 9,  x: 4,  y: 12 }, { slotIdx: 10, x: 12, y: 11 }, { slotIdx: 11, x: 20, y: 12 },
        { slotIdx: 12, x: 4,  y: 20 },                                { slotIdx: 13, x: 20, y: 20 },
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
      { x: 44, y: 15, to: { mapId: 'emberline_region',   x: 1,  y: 15 }, gate: 'Survivor' }, // DONOR-4 fix
      { x: 28, y: 29, to: { mapId: 'forest_veil_region', x: 1,  y: 12 }, gate: 'Survivor' }, // NEW
    ],
    worldDrop: { x: 40, y: 5, itemId: 'bog_fang' },
    blocked: [],
  },

  emberline_region: {
    id: 'emberline_region', name: 'Emberline Region', tier: 2,
    biome: 'neon_wastes', backdrop: 'desert', w: MAP_W, h: MAP_H,
    city: {
      id: 'emberline', name: 'Emberline', x: 32, y: 17,
      landmark: 'city_emberline', biome: 'neon_wastes', unlocked: false,
      blurb: 'Desert trade hub. Caravans whisper of a collapsing orbital elevator.',
      plots: null,
    },
    encounters: [
      { id: 'e2',  x: 14, y: 16, enemy: 'mutant_hound' },
      { id: 'e3',  x: 24, y: 22, enemy: 'drone_sentinel' },
      { id: 'e4',  x: 40, y: 18, enemy: 'gravbot' },
      { id: 'e22', x: 8,  y: 21, enemy: 'slag_rat' },
      { id: 'e23', x: 38, y: 8,  enemy: 'bog_stalker' },
    ],
    doorways: [
      { x: 1,  y: 15, to: { mapId: 'haventide_region',     x: 44, y: 15 }, gate: 'Survivor' },
      { x: 44, y: 15, to: { mapId: 'orbital_reach_region', x: 1,  y: 20 }, gate: 'Reclaimer' },
      { x: 22, y: 29, to: { mapId: 'forest_veil_region',   x: 30, y: 1  }, gate: 'Survivor' },
      { x: 42, y: 4,  to: { mapId: 'crater_ember_region',  x: 10, y: 28 }, gate: 'Ascendant' },
    ],
    worldDrop: { x: 7, y: 7, itemId: 'glacial_claw' },
    blocked: [],
  },

  forest_veil_region: {
    id: 'forest_veil_region', name: 'Forest Veil', tier: 2,
    biome: 'forest_veil', backdrop: 'forest', w: MAP_W, h: MAP_H,
    city: null,
    encounters: [
      { id: 'e9',  x: 18, y: 22, enemy: 'mutant_hound' },
      { id: 'e10', x: 38, y: 26, enemy: 'mire_hulk' },
      { id: 'e24', x: 30, y: 15, enemy: 'bog_stalker' },
      { id: 'e25', x: 40, y: 18, enemy: 'slag_rat' },
    ],
    doorways: [
      { x: 30, y: 1,  to: { mapId: 'emberline_region',  x: 22, y: 29 }, gate: 'Survivor' },
      { x: 44, y: 22, to: { mapId: 'mire_bog_region',   x: 1,  y: 22 }, gate: 'Survivor' },
      { x: 1,  y: 12, to: { mapId: 'haventide_region',  x: 28, y: 29 }, gate: 'Survivor' }, // NEW
    ],
    worldDrop: { x: 7, y: 3, itemId: 'moss_ward' },
    blocked: [],
  },

  mire_bog_region: {
    id: 'mire_bog_region', name: 'Mire Bog', tier: 2,
    biome: 'mire_bog', backdrop: 'mire_bog', w: MAP_W, h: MAP_H,
    city: null,
    encounters: [
      { id: 'e11', x: 21, y: 19, enemy: 'bog_stalker' },
      { id: 'e12', x: 32, y: 24, enemy: 'mire_hulk' },
      { id: 'e13', x: 44, y: 12, enemy: 'mire_warden' },
      { id: 'e26', x: 10, y: 28, enemy: 'slag_rat' },
      { id: 'e27', x: 40, y: 18, enemy: 'mutant_hound' },
    ],
    doorways: [
      { x: 1,  y: 22, to: { mapId: 'forest_veil_region',   x: 44, y: 22 }, gate: 'Survivor' },
      { x: 44, y: 4,  to: { mapId: 'orbital_reach_region', x: 20, y: 29 }, gate: 'Reclaimer' }, // NEW
    ],
    worldDrop: { x: 30, y: 3, itemId: 'swamp_coil' },
    blocked: [],
  },

  orbital_reach_region: {
    id: 'orbital_reach_region', name: 'Orbital Reach Region', tier: 3,
    biome: 'frozen_ruins', backdrop: 'frozen', w: MAP_W, h: MAP_H,
    city: {
      id: 'orbital_reach', name: 'Orbital Reach', x: 20, y: 18,
      landmark: 'city_orbital_reach', biome: 'neon_wastes', unlocked: false,
      blurb: 'Ruined space-elevator base. Cyan steel piercing the storm clouds.',
      plots: null,
    },
    encounters: [
      { id: 'e5',  x: 14, y: 14, enemy: 'neon_cultist' },
      { id: 'e6',  x: 30, y: 22, enemy: 'sandworm_hatchling' },
      { id: 'e28', x: 42, y: 26, enemy: 'glacier_wolf' },
      { id: 'e29', x: 40, y: 14, enemy: 'frost_revenant' },
    ],
    doorways: [
      { x: 1,  y: 20, to: { mapId: 'emberline_region',    x: 44, y: 15 }, gate: 'Reclaimer' },
      { x: 44, y: 14, to: { mapId: 'last_crown_region',   x: 1,  y: 14 }, gate: 'Ascendant' },
      { x: 10, y: 2,  to: { mapId: 'frost_canyon_region', x: 23, y: 28 }, gate: 'Survivor' },
      { x: 20, y: 29, to: { mapId: 'mire_bog_region',     x: 44, y: 4  }, gate: 'Reclaimer' }, // NEW
    ],
    worldDrop: { x: 42, y: 4, itemId: 'ember_core' },
    blocked: [],
  },

  frost_canyon_region: {
    id: 'frost_canyon_region', name: 'Frost Canyon', tier: 3,
    biome: 'frost_canyon', backdrop: 'frost_canyon', w: MAP_W, h: MAP_H,
    city: null,
    encounters: [
      { id: 'e17', x: 24, y: 21, enemy: 'glacier_wolf' },
      { id: 'e18', x: 27, y: 14, enemy: 'frost_revenant' },
      { id: 'e19', x: 40, y: 20, enemy: 'frost_colossus' },
      { id: 'e30', x: 8,  y: 28, enemy: 'neon_cultist' },
      { id: 'e31', x: 38, y: 26, enemy: 'sandworm_hatchling' },
    ],
    doorways: [
      { x: 23, y: 28, to: { mapId: 'orbital_reach_region', x: 10, y: 2  }, gate: 'Survivor' }, // moved, see MOVED_FROM_DONOR
      { x: 1,  y: 8,  to: { mapId: 'crater_ember_region',  x: 44, y: 20 }, gate: 'Ascendant' }, // NEW
    ],
    worldDrop: { x: 2, y: 20, itemId: 'frost_plate' },
    blocked: [],
  },

  crater_ember_region: {
    id: 'crater_ember_region', name: 'Crater Ember', tier: 4,
    biome: 'crater_ember', backdrop: 'crater_ember', w: MAP_W, h: MAP_H,
    city: null,
    encounters: [
      { id: 'e14', x: 17, y: 15, enemy: 'ember_golem' },
      { id: 'e15', x: 40, y: 27, enemy: 'magma_behemoth' },
      { id: 'e16', x: 42, y: 8, enemy: 'ember_lord' },
      { id: 'e35', x: 19, y: 22, enemy: 'gravbot' },
      { id: 'e36', x: 32, y: 14, enemy: 'neon_cultist' },
    ],
    doorways: [
      { x: 10, y: 28, to: { mapId: 'emberline_region',    x: 42, y: 4 }, gate: 'Ascendant' },
      { x: 44, y: 20, to: { mapId: 'frost_canyon_region', x: 1,  y: 8 }, gate: 'Ascendant' }, // NEW
    ],
    worldDrop: { x: 30, y: 4, itemId: 'magma_blade' },
    blocked: [],
  },

  last_crown_region: {
    id: 'last_crown_region', name: 'Last Crown Region', tier: 4,
    biome: 'alien_terraform', backdrop: 'alien', w: MAP_W, h: MAP_H,
    city: {
      id: 'last_crown', name: 'Last Crown', x: 32, y: 22,
      landmark: 'city_last_crown', biome: 'alien_terraform', unlocked: false,
      blurb: 'The final megacity. Magenta spires where the Void Architect waits.',
      plots: null,
    },
    encounters: [
      { id: 'e7',  x: 20, y: 18, enemy: 'wraith_core' },
      { id: 'e8',  x: 35, y: 21, enemy: 'architect_herald' },
      { id: 'e32', x: 9, y: 25, enemy: 'mire_warden' },
      { id: 'e33', x: 40, y: 12, enemy: 'gravbot' },
      { id: 'e34', x: 41, y: 27, enemy: 'neon_cultist' },
    ],
    doorways: [
      { x: 1, y: 14, to: { mapId: 'orbital_reach_region', x: 44, y: 14 }, gate: 'Ascendant' },
    ],
    worldDrop: { x: 27, y: 27, itemId: 'void_scepter' },
    blocked: [],
  },

  // ── city interiors ────────────────────────────────────────────────────────
  // Entered by the `[C] enter city` mechanism standing on the parent city
  // tile, NOT by a doorway edge. Each carries a single exit doorway back out.
  haventide_interior: {
    id: 'haventide_interior', name: 'Haventide', isInterior: true,
    biome: 'grassland_ruins', backdrop: null, w: 30, h: 20,
    parentCityId: 'haventide', parentMapId: 'haventide_region',
    exitHint: 'walk south to the waterfront to leave',
    plots: [
      { slotIdx: 0,  x: 15, y: 10 },
      { slotIdx: 1,  x: 11, y: 7  }, { slotIdx: 2,  x: 19, y: 7  },
      { slotIdx: 3,  x: 11, y: 13 }, { slotIdx: 4,  x: 19, y: 13 },
      { slotIdx: 5,  x: 7,  y: 5  }, { slotIdx: 6,  x: 15, y: 5  }, { slotIdx: 7,  x: 23, y: 5  },
      { slotIdx: 8,  x: 7,  y: 10 },                                { slotIdx: 9,  x: 23, y: 10 },
      { slotIdx: 10, x: 7,  y: 15 }, { slotIdx: 11, x: 15, y: 15 }, { slotIdx: 12, x: 23, y: 15 },
      { slotIdx: 13, x: 4,  y: 3  }, { slotIdx: 14, x: 26, y: 3  },
      { slotIdx: 15, x: 4,  y: 17 }, { slotIdx: 16, x: 26, y: 17 },
      { slotIdx: 17, x: 15, y: 18 },
    ],
    city: null, encounters: [], worldDrop: null, blocked: [],
    doorways: [
      { x: 15, y: 19, to: { mapId: 'haventide_region', x: 12, y: 22 }, gate: 'Survivor' }, // DONOR-5 fix
    ],
  },
  emberline_interior: {
    id: 'emberline_interior', name: 'Emberline', isInterior: true,
    biome: 'neon_wastes', backdrop: null, w: 35, h: 24,
    parentCityId: 'emberline', parentMapId: 'emberline_region',
    exitHint: 'walk back through the gate arch to leave',
    plots: null, city: null, encounters: [], worldDrop: null, blocked: [],
    doorways: [
      { x: 17, y: 23, to: { mapId: 'emberline_region', x: 32, y: 20 }, gate: 'Survivor' },
    ],
  },
  orbital_reach_interior: {
    id: 'orbital_reach_interior', name: 'Orbital Reach', isInterior: true,
    biome: 'frozen_ruins', backdrop: null, w: 35, h: 24,
    parentCityId: 'orbital_reach', parentMapId: 'orbital_reach_region',
    exitHint: 'walk south through the blast doors to leave',
    plots: null, city: null, encounters: [], worldDrop: null, blocked: [],
    doorways: [
      { x: 17, y: 23, to: { mapId: 'orbital_reach_region', x: 20, y: 22 }, gate: 'Survivor' },
    ],
  },
  last_crown_interior: {
    id: 'last_crown_interior', name: 'Last Crown', isInterior: true,
    biome: 'alien_terraform', backdrop: null, w: 35, h: 24,
    parentCityId: 'last_crown', parentMapId: 'last_crown_region',
    exitHint: 'step back through the void gate to leave',
    plots: null, city: null, encounters: [], worldDrop: null, blocked: [],
    doorways: [
      { x: 17, y: 23, to: { mapId: 'last_crown_region', x: 32, y: 26 }, gate: 'Survivor' },
    ],
  },
};

export const PLAYER_START = { mapId: 'haventide_region', x: 12, y: 18 };

// ── enemy tiers (Phase 1.3) ────────────────────────────────────────────────
// Ported verbatim from games/chronoforge/src/battle.js ENEMY_TEMPLATES[*].tier.
// This is level's READ-ONLY mirror for placement checks; the tables themselves
// belong to gamedesign and the donor. selfCheck() asserts this key set matches
// docs/specs/inventory.mjs ENEMY_DROP_TABLE exactly, so the mirror cannot drift.
export const ENEMY_TIERS = {
  rust_scrapper: 1, drone_sentinel: 1, bog_stalker: 1, slag_rat: 1,
  mutant_hound: 2, gravbot: 2, mire_hulk: 2, glacier_wolf: 2,
  neon_cultist: 3, sandworm_hatchling: 3, ember_golem: 3, frost_revenant: 3,
  wraith_core: 4, mire_warden: 4, magma_behemoth: 4,
  architect_herald: 5, frost_colossus: 5, ember_lord: 5,
};

/** A T5 enemy is an elite / boss, not trash — it is allowed to headline a
 *  region below its own tier as a set-piece. Everything else must sit within
 *  one tier of its region. */
export const TIER_TOLERANCE = 1;

/** Inherited mismatches, each named so it is visible and so a NEW one fails.
 *  Enemy assignment is gamedesign's and the donor's lane, not level's: these
 *  are reported, not retuned. Removing an entry here re-arms the gate for it. */
export const TIER_EXCEPTIONS = [
  { enc: 'e13', region: 'mire_bog_region', enemy: 'mire_warden',
    why: 'T4 in a T2 region (+2). The worst of the set: Mire Bog is inside the ' +
         'Survivor starting web, so a level-5 party meets a T4 enemy with 165 HP. ' +
         'It is also the ONLY pre-Ascendant source of void_scepter (20% drop), so ' +
         'swapping it moves item pacing — gamedesign call, not level.' },
  { enc: 'e19', region: 'frost_canyon_region', enemy: 'frost_colossus',
    why: 'T5 in a T3 region (+2). Reads as a deliberate superboss and is one of ' +
         'only two titan_shard sources. Tolerated under the T5-elite rule.' },
  { enc: 'e35', region: 'crater_ember_region', enemy: 'gravbot',
    why: 'T2 in a T4 region (-2). Trash in endgame content; harmless but limp.' },
  { enc: 'e33', region: 'last_crown_region', enemy: 'gravbot',
    why: 'T2 in a T4 region (-2). Same as above, in the finale region.' },
];

// ── placement rules (Phase 1.3) ────────────────────────────────────────────
// Combat clearance itself is derived in docs/specs/heightfields.mjs from battle
// staging; these are the tile-space rules that sit on top of it.
/** Two encounters closer than one staging disc share a battle stage. */
export const MIN_ENCOUNTER_SEP_TILES = 6;    // 12 m > the 11 m staging disc
/** You should not be ambushed the instant you walk through a door. */
export const MIN_DOORWAY_SEP_TILES = 4;
/** A world drop is the region's ONE secret. It must reward exploring, so it is
 *  kept off the fight economy and off the routes you walk anyway. */
export const DROP_MIN_ENCOUNTER_SEP_TILES = 10;   // 20 m: not a fight reward
export const DROP_MIN_CORRIDOR_SEP_TILES = 6;     // 12 m off every through-route

/** The routes a player walks without exploring: every doorway-to-doorway line
 *  on the map, plus every doorway-to-city line. A drop on one of these is
 *  found by walking through, not by looking. */
export function corridorsOf(mapId) {
  const m = MAPS[mapId], out = [], d = m.doorways;
  for (let i = 0; i < d.length; i++)
    for (let j = i + 1; j < d.length; j++) out.push([d[i].x, d[i].y, d[j].x, d[j].y]);
  if (m.city) for (const w of d) out.push([w.x, w.y, m.city.x, m.city.y]);
  return out;
}

export function pointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export const OUTDOOR_IDS = Object.keys(MAPS).filter(id => !MAPS[id].isInterior);
export const INTERIOR_IDS = Object.keys(MAPS).filter(id => MAPS[id].isInterior);

// ── the accepted edge set ───────────────────────────────────────────────────
// 10 edges. `src` marks provenance so a reviewer can see the delta at a glance.
export const REGION_EDGES = [
  { a: 'haventide_region',    b: 'emberline_region',     gate: 'Survivor',  src: 'donor'  },
  { a: 'emberline_region',    b: 'forest_veil_region',   gate: 'Survivor',  src: 'donor'  },
  { a: 'forest_veil_region',  b: 'mire_bog_region',      gate: 'Survivor',  src: 'donor'  },
  { a: 'haventide_region',    b: 'forest_veil_region',   gate: 'Survivor',  src: 'cycle'  },
  { a: 'emberline_region',    b: 'orbital_reach_region', gate: 'Reclaimer', src: 'donor'  },
  { a: 'mire_bog_region',     b: 'orbital_reach_region', gate: 'Reclaimer', src: 'cycle'  },
  { a: 'orbital_reach_region',b: 'frost_canyon_region',  gate: 'Survivor',  src: 'donor'  },
  { a: 'orbital_reach_region',b: 'last_crown_region',    gate: 'Ascendant', src: 'donor'  },
  { a: 'emberline_region',    b: 'crater_ember_region',  gate: 'Ascendant', src: 'donor'  },
  { a: 'crater_ember_region', b: 'frost_canyon_region',  gate: 'Ascendant', src: 'cycle'  },
];

/** The donor's 7-edge tree, kept only so selfCheck can prove the delta. */
export const INHERITED_TREE = REGION_EDGES.filter(e => e.src === 'donor').map(e => ({ a: e.a, b: e.b }));

/** Not a donor defect — a landform decision. Recorded so nothing moves silently. */
export const MOVED_FROM_DONOR = [
  {
    id: 'LVL-DOOR-1',
    edge: 'orbital_reach_region <-> frost_canyon_region',
    was: 'frost_canyon (30,28)', now: 'frost_canyon (23,28)',
    detail: 'The frost_canyon heightfield puts a 47 m trench down the middle of the map, ' +
            'and tile (30,28) lands mid-wall at 29.5 deg — a doorway on a canyon wall. ' +
            '(23,28) is the canyon mouth: floor of the trench, 3.6 deg, and you now enter ' +
            'Frost Canyon by walking up the ravine. Both sides of the edge moved together.',
  },
];

export const FIXED_FROM_DONOR = [
  {
    id: 'DONOR-4',
    where: 'games/chronoforge/src/world.js:82 (haventide_region.doorways[0])',
    quote: "{ x: 44, y: 15, to: { mapId: 'emberline_region', x: 1, y: 20 } }",
    detail: "Haventide's east door lands the party at Emberline (1,20), but Emberline's " +
            'return door is at (1,15) — five tiles north. The other six inherited edges all ' +
            'land exactly on the reciprocal door, so this one is the outlier. Landing coord ' +
            'corrected to (1,15).',
  },
  {
    id: 'DONOR-5',
    where: 'games/chronoforge/src/world.js:267 (haventide_interior.doorways[0])',
    quote: "{ x: 15, y: 19, to: { mapId: 'haventide_region', x: 12, y: 24 } }",
    detail: 'Leaving the Haventide interior lands on (12,24), which is build plot slotIdx 7. ' +
            'Once that plot is built the party exits the city into the middle of a building. ' +
            'Landing coord moved to (12,22): still south of the city tile (so [C] does not ' +
            'instantly re-trigger), clear of every one of the 17 plots.',
  },
];

// ── queries ────────────────────────────────────────────────────────────────
export const getMap = (id) => MAPS[id] || null;
export const dimsOf = (id) => { const m = MAPS[id]; return m ? { w: m.w, h: m.h } : null; };

export function inBounds(mapId, x, y) {
  const m = MAPS[mapId];
  return !!m && Number.isInteger(x) && Number.isInteger(y) &&
    x >= 0 && y >= 0 && x < m.w && y < m.h;
}

/** Passability is authored, not derived. `blocked` is empty today (the donor
 *  marks every tile passable); the real traversal constraint is heightfield
 *  slope, asserted in docs/specs/heightfields.mjs. */
export function passableAt(mapId, x, y) {
  if (!inBounds(mapId, x, y)) return false;
  return !MAPS[mapId].blocked.some(b => b.x === x && b.y === y);
}

export function doorwayAt(mapId, x, y) {
  const m = MAPS[mapId];
  return m ? (m.doorways.find(d => d.x === x && d.y === y) || null) : null;
}

export const tierIndex = (t) => SETTLEMENT_TIERS.indexOf(t);
export const edgeOpenAt = (edge, tier) => tierIndex(tier) >= tierIndex(edge.gate);

/** Runtime stub. Settlement tiers do not exist until Phase 9; until then every
 *  gate reads open. Phase 9 replaces the body, not the signature. */
export function gateUnlocked(_edgeOrDoorway, _state) { return true; }

function adjacency(edges) {
  const adj = new Map(OUTDOOR_IDS.map(r => [r, []]));
  for (const e of edges) { adj.get(e.a).push(e.b); adj.get(e.b).push(e.a); }
  return adj;
}

export function reachableAt(tier, start = 'haventide_region') {
  const adj = adjacency(REGION_EDGES.filter(e => edgeOpenAt(e, tier)));
  const seen = new Set([start]); const stack = [start];
  while (stack.length) {
    const cur = stack.pop();
    for (const n of adj.get(cur)) if (!seen.has(n)) { seen.add(n); stack.push(n); }
  }
  return seen;
}

/** BFS hop distances from `start` over `edges`. Infinity for unreachable. */
function hops(edges, start, skip = null) {
  const adj = adjacency(edges);
  const d = new Map(OUTDOOR_IDS.map(r => [r, Infinity]));
  if (start === skip) return d;
  d.set(start, 0);
  const q = [start];
  for (let i = 0; i < q.length; i++) {
    const cur = q[i];
    for (const n of adj.get(cur)) {
      if (n === skip || d.get(n) !== Infinity) continue;
      d.set(n, d.get(cur) + 1); q.push(n);
    }
  }
  return d;
}

export function graphMetrics(edges) {
  let sum = 0, pairs = 0, diameter = 0;
  const rowSum = {};
  for (const a of OUTDOOR_IDS) {
    const d = hops(edges, a);
    rowSum[a] = 0;
    for (const b of OUTDOOR_IDS) {
      if (a === b) continue;
      const h = d.get(b);
      rowSum[a] += h;
      if (a < b) { sum += h; pairs++; if (h > diameter) diameter = h; }
    }
  }
  const cutVertices = [];
  for (const v of OUTDOOR_IDS) {
    const start = OUTDOOR_IDS.find(r => r !== v);
    const d = hops(edges, start, v);
    const orphans = OUTDOOR_IDS.filter(r => r !== v && d.get(r) === Infinity);
    if (orphans.length) cutVertices.push({ v, orphans });
  }
  return { meanHops: sum / pairs, diameter, rowSum, cutVertices };
}

// ── self-check ─────────────────────────────────────────────────────────────
const EXPECT = {
  maps: 12, outdoor: 8, interiors: 4, encounters: 36, worldDrops: 8,
  haventidePlots: 17, interiorPlots: 18, edges: 10, doorwayRecords: 24,
  reachProfile: [4, 6, 8, 8],       // must match the inherited tree exactly
  maxMeanHops: 2.0,                  // inherited tree is 2.214
  maxDiameter: 3,                    // inherited tree is 4
  hubMaxSlope: null,
};

async function selfCheck() {
  const fail = [];
  const F = (m) => fail.push(m);

  // 1. shape
  const ids = Object.keys(MAPS);
  if (ids.length !== EXPECT.maps) F(`map count ${ids.length}, expected ${EXPECT.maps}`);
  if (OUTDOOR_IDS.length !== EXPECT.outdoor) F(`outdoor count ${OUTDOOR_IDS.length}`);
  if (INTERIOR_IDS.length !== EXPECT.interiors) F(`interior count ${INTERIOR_IDS.length}`);

  const encTotal = ids.reduce((n, id) => n + MAPS[id].encounters.length, 0);
  if (encTotal !== EXPECT.encounters) F(`encounter count ${encTotal}, expected ${EXPECT.encounters}`);
  const encIds = ids.flatMap(id => MAPS[id].encounters.map(e => e.id));
  if (new Set(encIds).size !== encIds.length) F('duplicate encounter id');

  const drops = OUTDOOR_IDS.filter(id => MAPS[id].worldDrop);
  if (drops.length !== EXPECT.worldDrops) F(`world drops ${drops.length}, expected one per outdoor region`);
  for (const id of INTERIOR_IDS) if (MAPS[id].worldDrop) F(`interior ${id} carries a world drop`);
  const dropItems = drops.map(id => MAPS[id].worldDrop.itemId);
  if (new Set(dropItems).size !== dropItems.length) F('duplicate world-drop itemId');

  if (MAPS.haventide_region.city.plots.length !== EXPECT.haventidePlots)
    F(`Haventide build plots ${MAPS.haventide_region.city.plots.length}`);
  if (MAPS.haventide_interior.plots.length !== EXPECT.interiorPlots)
    F(`Haventide interior plots ${MAPS.haventide_interior.plots.length}`);

  // 2. every doorway: real target, in-bounds, passable, not on top of content
  let doorCount = 0;
  const occupied = (mapId, x, y) => {
    const m = MAPS[mapId]; const hits = [];
    if (m.city && m.city.x === x && m.city.y === y) hits.push('city tile');
    if (m.worldDrop && m.worldDrop.x === x && m.worldDrop.y === y) hits.push('world drop');
    if (m.encounters.some(e => e.x === x && e.y === y)) hits.push('encounter');
    const plots = (m.city && m.city.plots) || m.plots;
    if (plots && plots.some(p => p.x === x && p.y === y)) hits.push('build plot');
    return hits;
  };
  for (const id of ids) {
    for (const d of MAPS[id].doorways) {
      doorCount++;
      if (!inBounds(id, d.x, d.y)) F(`${id} door (${d.x},${d.y}) out of bounds`);
      if (!passableAt(id, d.x, d.y)) F(`${id} door (${d.x},${d.y}) not passable`);
      const self = occupied(id, d.x, d.y);
      if (self.length) F(`${id} door (${d.x},${d.y}) sits on ${self.join(' + ')}`);
      if (!MAPS[d.to.mapId]) { F(`${id} door targets unknown map ${d.to.mapId}`); continue; }
      if (!inBounds(d.to.mapId, d.to.x, d.to.y)) F(`${id}->${d.to.mapId} landing (${d.to.x},${d.to.y}) out of bounds`);
      else if (!passableAt(d.to.mapId, d.to.x, d.to.y)) F(`${id}->${d.to.mapId} landing (${d.to.x},${d.to.y}) not passable`);
      else {
        const hits = occupied(d.to.mapId, d.to.x, d.to.y);
        if (hits.length) F(`${id}->${d.to.mapId} landing (${d.to.x},${d.to.y}) sits on ${hits.join(' + ')}`);
      }
      if (tierIndex(d.gate) === -1) F(`${id} door (${d.x},${d.y}) has bad gate "${d.gate}"`);
    }
  }
  if (doorCount !== EXPECT.doorwayRecords) F(`doorway records ${doorCount}, expected ${EXPECT.doorwayRecords}`);

  // 3. outdoor doorways round-trip: the landing coord IS the reciprocal door
  for (const id of OUTDOOR_IDS) {
    for (const d of MAPS[id].doorways) {
      const back = doorwayAt(d.to.mapId, d.to.x, d.to.y);
      if (!back) { F(`no return door at ${d.to.mapId} (${d.to.x},${d.to.y}) for ${id} (${d.x},${d.y})`); continue; }
      if (back.to.mapId !== id || back.to.x !== d.x || back.to.y !== d.y)
        F(`asymmetric round trip ${id}(${d.x},${d.y}) -> ${d.to.mapId}(${d.to.x},${d.to.y}) -> ${back.to.mapId}(${back.to.x},${back.to.y})`);
      if (back.gate !== d.gate) F(`gate mismatch across ${id}<->${d.to.mapId}: ${d.gate} vs ${back.gate}`);
    }
  }

  // 4. interiors: exit lands on the parent map, off the city tile, off any plot
  for (const id of INTERIOR_IDS) {
    const m = MAPS[id];
    const parent = MAPS[m.parentMapId];
    if (!parent) { F(`${id} parentMapId ${m.parentMapId} unknown`); continue; }
    if (!parent.city || parent.city.id !== m.parentCityId) F(`${id} parentCityId ${m.parentCityId} not on ${m.parentMapId}`);
    if (m.doorways.length !== 1) F(`${id} has ${m.doorways.length} exits, expected 1`);
    const d = m.doorways[0];
    if (d.to.mapId !== m.parentMapId) F(`${id} exit targets ${d.to.mapId}, not its parent`);
    if (parent.city && d.to.x === parent.city.x && d.to.y === parent.city.y)
      F(`${id} exit lands on the city tile — [C] would re-enter immediately`);
    if (MAPS[m.parentMapId].encounters.some(e => e.x === d.to.x && e.y === d.to.y))
      F(`${id} exit lands on an encounter`);
  }

  // 5. edge table <-> doorway table agreement
  const key = (a, b) => [a, b].sort().join('|');
  const fromDoors = new Map();
  for (const id of OUTDOOR_IDS)
    for (const d of MAPS[id].doorways) fromDoors.set(key(id, d.to.mapId), d.gate);
  if (fromDoors.size !== REGION_EDGES.length)
    F(`doorways describe ${fromDoors.size} edges, REGION_EDGES has ${REGION_EDGES.length}`);
  for (const e of REGION_EDGES) {
    const g = fromDoors.get(key(e.a, e.b));
    if (g === undefined) F(`REGION_EDGES ${e.a}<->${e.b} has no doorway pair`);
    else if (g !== e.gate) F(`gate disagreement ${e.a}<->${e.b}: edges say ${e.gate}, doors say ${g}`);
  }

  // 6. the two gate tables agree (docs/specs/tech-gates.mjs)
  const gateMap = new Map(GATE_TABLE.map(e => [key(e.a, e.b), e.gate]));
  if (gateMap.size !== REGION_EDGES.length)
    F(`tech-gates.mjs has ${gateMap.size} edges, world-graph has ${REGION_EDGES.length} — tables disagree`);
  for (const e of REGION_EDGES) {
    const g = gateMap.get(key(e.a, e.b));
    if (g === undefined) F(`tech-gates.mjs is missing edge ${e.a}<->${e.b}`);
    else if (g !== e.gate) F(`tech-gates.mjs gates ${e.a}<->${e.b} at ${g}, world-graph at ${e.gate}`);
  }

  // 7. reachability, per tier, from Haventide
  const profile = SETTLEMENT_TIERS.map(t => reachableAt(t).size);
  for (let i = 0; i < SETTLEMENT_TIERS.length; i++) {
    if (profile[i] !== EXPECT.reachProfile[i])
      F(`reachability at ${SETTLEMENT_TIERS[i]} is ${profile[i]}, inherited tree gives ${EXPECT.reachProfile[i]}`);
  }
  // Walk EVERY tier state, not just max: name the first tier at which each
  // region opens, and fail if any region never opens at all.
  const opensAt = {};
  for (const t of SETTLEMENT_TIERS) {
    for (const r of reachableAt(t)) if (opensAt[r] === undefined) opensAt[r] = t;
  }
  for (const r of OUTDOOR_IDS)
    if (opensAt[r] === undefined) F(`UNREACHABLE at every settlement tier: ${r}`);

  // 8. gates are temporary — nothing stays shut at max tier
  for (const e of REGION_EDGES)
    if (!edgeOpenAt(e, 'Transcendent')) F(`PERMANENT ONE-WAY: ${e.a}<->${e.b} (gate ${e.gate})`);

  // 9. topology delta actually bought something
  const before = graphMetrics(INHERITED_TREE);
  const after = graphMetrics(REGION_EDGES);
  if (after.meanHops > EXPECT.maxMeanHops)
    F(`mean hop count ${after.meanHops.toFixed(3)} exceeds ${EXPECT.maxMeanHops}`);
  if (after.diameter > EXPECT.maxDiameter)
    F(`graph diameter ${after.diameter} exceeds ${EXPECT.maxDiameter}`);
  if (after.cutVertices.some(c => c.v === 'emberline_region'))
    F('Emberline is still a cut vertex — the lateral cycles did not land');
  const badCuts = after.cutVertices.filter(c => !(c.v === 'orbital_reach_region' && c.orphans.length === 1 && c.orphans[0] === 'last_crown_region'));
  if (badCuts.length) F(`unexpected cut vertices: ${badCuts.map(c => `${c.v} -> ${c.orphans.join(',')}`).join('; ')}`);

  // ── Phase 1.3 gates ──────────────────────────────────────────────────────
  // heightfields imports THIS module, so the clearance check is a dynamic
  // import inside selfCheck rather than a static one — at call time both
  // modules are fully initialised and there is no cycle at load.
  const HF = await import('./heightfields.mjs');
  const INV = await import('./inventory.mjs');

  // 10. the enemy mirror cannot drift from the ported drop tables
  const mirrorKeys = Object.keys(ENEMY_TIERS).sort().join(',');
  const dropKeys = Object.keys(INV.ENEMY_DROP_TABLE).sort().join(',');
  if (mirrorKeys !== dropKeys) F('ENEMY_TIERS key set does not match inventory.mjs ENEMY_DROP_TABLE');

  // 11. every encounter names a real enemy; every drop a real item
  for (const id of OUTDOOR_IDS) {
    for (const e of MAPS[id].encounters)
      if (!(e.enemy in ENEMY_TIERS)) F(`${id} ${e.id} names unknown enemy "${e.enemy}"`);
    const d = MAPS[id].worldDrop;
    if (!(d.itemId in INV.ITEM_DEFS)) F(`${id} world drop names unknown item "${d.itemId}"`);
    if (INV.WORLD_DROPS[id] !== d.itemId)
      F(`${id} world drop is "${d.itemId}" but inventory.mjs WORLD_DROPS says "${INV.WORLD_DROPS[id]}"`);
  }
  // no orphans the other way: every WORLD_DROPS region is a real outdoor map
  for (const r of Object.keys(INV.WORLD_DROPS))
    if (!OUTDOOR_IDS.includes(r)) F(`inventory.mjs WORLD_DROPS names non-region "${r}"`);
  // every enemy in the tables is actually placed somewhere
  const placedEnemies = new Set(OUTDOOR_IDS.flatMap(id => MAPS[id].encounters.map(e => e.enemy)));
  const unplaced = Object.keys(ENEMY_TIERS).filter(k => !placedEnemies.has(k));
  if (unplaced.length) F(`enemies defined but never placed: ${unplaced.join(', ')}`);

  // 12. all 17 items reachable (Phase 8 census gate, checked early)
  const dropIds = new Set(Object.values(INV.ENEMY_DROP_TABLE).flat().map(d => d.itemId));
  const wdIds = new Set(Object.values(MAPS).filter(m => m.worldDrop).map(m => m.worldDrop.itemId));
  const unreachable = Object.keys(INV.ITEM_DEFS)
    .filter(i => !INV.STARTING_KIT.includes(i) && !dropIds.has(i) && !wdIds.has(i));
  if (unreachable.length) F(`items unreachable by kit/drop/world-drop: ${unreachable.join(', ')}`);

  // 13. combat clearance on all 36 encounters, on the CURRENT heightfields
  let worstEnc = { v: -1 };
  for (const id of OUTDOOR_IDS) {
    const b = MAPS[id].biome;
    for (const e of MAPS[id].encounters) {
      const c = HF.clearanceAt(b, tileToM(e.x), tileToM(e.y));
      const use = c.stageSpread / HF.STAGE_MAX_SPREAD_M;
      if (use > worstEnc.v) worstEnc = { v: use, id, e, c };
      if (c.stageSpread > HF.STAGE_MAX_SPREAD_M)
        F(`${id} ${e.id} (${e.x},${e.y}): stage spread ${c.stageSpread.toFixed(2)} m > ${HF.STAGE_MAX_SPREAD_M.toFixed(2)}`);
      if (c.stageMaxSlopeDeg > HF.STAGE_MAX_SLOPE_DEG)
        F(`${id} ${e.id} (${e.x},${e.y}): stage slope ${c.stageMaxSlopeDeg.toFixed(1)} deg > ${HF.STAGE_MAX_SLOPE_DEG}`);
      if (c.frameSpread > HF.FRAME_MAX_SPREAD_M)
        F(`${id} ${e.id} (${e.x},${e.y}): frame spread ${c.frameSpread.toFixed(2)} m > ${HF.FRAME_MAX_SPREAD_M}`);
      if (HF.isSubmerged(b, tileToM(e.x), tileToM(e.y)))
        F(`${id} ${e.id} (${e.x},${e.y}): stands below the water plane`);
    }
  }

  // 14. encounter spacing and doorway standoff
  for (const id of OUTDOOR_IDS) {
    const m = MAPS[id];
    for (let i = 0; i < m.encounters.length; i++) {
      const a = m.encounters[i];
      for (const w of m.doorways)
        if (Math.hypot(w.x - a.x, w.y - a.y) < MIN_DOORWAY_SEP_TILES)
          F(`${id} ${a.id} is ${Math.hypot(w.x - a.x, w.y - a.y).toFixed(1)} tiles from door (${w.x},${w.y})`);
      for (let j = i + 1; j < m.encounters.length; j++) {
        const b2 = m.encounters[j], d = Math.hypot(a.x - b2.x, a.y - b2.y);
        if (d < MIN_ENCOUNTER_SEP_TILES)
          F(`${id} ${a.id} and ${b2.id} are ${(d * 2).toFixed(1)} m apart — battle stages overlap`);
      }
    }
  }

  // 15. world-drop siting rule
  for (const id of OUTDOOR_IDS) {
    const m = MAPS[id], d = m.worldDrop, b = m.biome;
    if (!HF.dropSiteOk(b, tileToM(d.x), tileToM(d.y)))
      F(`${id} world drop (${d.x},${d.y}) is not on readable, dry ground`);
    for (const e of m.encounters) {
      const dist = Math.hypot(e.x - d.x, e.y - d.y);
      if (dist < DROP_MIN_ENCOUNTER_SEP_TILES)
        F(`${id} world drop is ${(dist * 2).toFixed(1)} m from ${e.id} — that is a fight reward, not a secret`);
    }
    for (const c of corridorsOf(id)) {
      const dist = pointToSegment(d.x, d.y, ...c);
      if (dist < DROP_MIN_CORRIDOR_SEP_TILES)
        F(`${id} world drop is ${(dist * 2).toFixed(1)} m from the (${c[0]},${c[1]})-(${c[2]},${c[3]}) through-route`);
    }
  }

  // 16. tier coherence
  const tierIssues = [];
  for (const id of OUTDOOR_IDS) {
    const rt = MAPS[id].tier;
    for (const e of MAPS[id].encounters) {
      const et = ENEMY_TIERS[e.enemy];
      if (et === undefined) continue;
      const delta = et - rt;
      if (Math.abs(delta) <= TIER_TOLERANCE) continue;
      const known = TIER_EXCEPTIONS.find(x => x.enc === e.id && x.region === id && x.enemy === e.enemy);
      tierIssues.push({ id, e, et, rt, delta, known: !!known });
      if (!known) F(`${id} (T${rt}) ${e.id} is ${e.enemy} (T${et}), delta ${delta > 0 ? '+' : ''}${delta} — not in TIER_EXCEPTIONS`);
    }
  }

  // ── report ───────────────────────────────────────────────────────────────
  console.log(`Maps ${ids.length}  (outdoor ${OUTDOOR_IDS.length}, interiors ${INTERIOR_IDS.length})`);
  console.log(`Outdoor map size ${MAP_W}x${MAP_H} tiles @ ${TILE_M} m = ${OUTDOOR_W_M} x ${OUTDOOR_D_M} m`);
  console.log(`Encounters ${encTotal}   world drops ${drops.length}   doorway records ${doorCount}   edges ${REGION_EDGES.length}`);
  console.log(`Build plots: Haventide region ${MAPS.haventide_region.city.plots.length}, Haventide interior ${MAPS.haventide_interior.plots.length}`);

  console.log('\nReachability by settlement tier (from Haventide):');
  for (const t of SETTLEMENT_TIERS) {
    const s = reachableAt(t);
    console.log(`  ${t.padEnd(12)} ${s.size}/${OUTDOOR_IDS.length}  [${[...s].sort().map(r => r.replace('_region', '')).join(', ')}]`);
  }

  console.log('  first tier each region opens:');
  for (const r of OUTDOOR_IDS)
    console.log(`    ${r.replace('_region', '').padEnd(14)} ${opensAt[r] ?? 'NEVER'}`);

  console.log('\nTopology delta (hop counts, all edges open):');
  console.log(`  inherited tree : ${INHERITED_TREE.length} edges, mean ${before.meanHops.toFixed(3)}, diameter ${before.diameter}`);
  console.log(`  accepted graph : ${REGION_EDGES.length} edges, mean ${after.meanHops.toFixed(3)}, diameter ${after.diameter}`);
  console.log(`  improvement    : mean -${(100 * (1 - after.meanHops / before.meanHops)).toFixed(1)}%, diameter ${before.diameter} -> ${after.diameter}`);
  console.log('  per-region total hops to the other seven:');
  for (const r of OUTDOOR_IDS) {
    const b = before.rowSum[r], a = after.rowSum[r];
    const tag = a < b ? `  (-${(100 * (1 - a / b)).toFixed(0)}%)` : '';
    console.log(`    ${r.replace('_region', '').padEnd(14)} ${String(b).padStart(2)} -> ${String(a).padStart(2)}${tag}`);
  }
  console.log(`  cut vertices before: ${before.cutVertices.map(c => c.v.replace('_region', '')).join(', ') || 'none'}`);
  console.log(`  cut vertices after : ${after.cutVertices.map(c => `${c.v.replace('_region', '')} (isolates ${c.orphans.map(o => o.replace('_region', '')).join(',')})`).join('; ') || 'none'}`);

  console.log('\nClearance (derived in heightfields.mjs from battle staging):');
  console.log(`  R_STAGE ${HF.R_STAGE_M} m disc, spread <= ${HF.STAGE_MAX_SPREAD_M.toFixed(2)} m, slope <= ${HF.STAGE_MAX_SLOPE_DEG} deg`);
  console.log(`  R_FRAME ${HF.frameRadiusM().toFixed(2)} m disc (push-in ${HF.BATTLE_PUSH_IN}), spread <= ${HF.FRAME_MAX_SPREAD_M} m`);
  console.log(`  tightest of 36: ${worstEnc.id.replace('_region', '')} ${worstEnc.e.id} at ${(100 * worstEnc.v).toFixed(0)}% of the spread budget ` +
    `(${worstEnc.c.stageSpread.toFixed(2)} m, ${worstEnc.c.stageMaxSlopeDeg.toFixed(1)} deg)`);

  console.log('\nContent cross-check:');
  console.log(`  ${encTotal} encounters name ${placedEnemies.size} distinct enemies, all ${Object.keys(ENEMY_TIERS).length} defined enemies placed`);
  console.log(`  ${drops.length} world drops, all in ITEM_DEFS and matching inventory.mjs WORLD_DROPS`);
  console.log(`  all ${Object.keys(INV.ITEM_DEFS).length} items reachable via starting kit (${INV.STARTING_KIT.length}) + drop tables (${dropIds.size}) + world drops (${wdIds.size})`);

  console.log('\nTier coherence (|enemy tier - region tier| <= 1, T5 elites exempt):');
  if (!tierIssues.length) console.log('  clean');
  for (const t of tierIssues)
    console.log(`  ${t.known ? 'KNOWN ' : 'NEW!! '}${t.id.replace('_region', '').padEnd(14)} ${t.e.id} ${t.e.enemy} T${t.et} in a T${t.rt} region (${t.delta > 0 ? '+' : ''}${t.delta})`);

  console.log('\nDonor defects fixed in this port:');
  for (const d of FIXED_FROM_DONOR) console.log(`  ${d.id}  ${d.where}`);
  console.log('Doorways moved for landform reasons:');
  for (const d of MOVED_FROM_DONOR) console.log(`  ${d.id}  ${d.edge}: ${d.was} -> ${d.now}`);

  if (fail.length) {
    console.error(`\nFAIL - ${fail.length} issue(s):`);
    for (const f of fail) console.error('  - ' + f);
    process.exitCode = 1;
  } else {
    console.log(`\nPASS - ${ids.length} maps, ${doorCount} doorway records, ${REGION_EDGES.length} edges; every landing in-bounds, passable and reciprocal; ` +
      `every region opens at some settlement tier and every edge traverses both ways at max; ` +
      `${encTotal} encounters and ${drops.length} world drops all clear combat clearance on the current heightfields, ` +
      `name real enemies/items, and leave all ${Object.keys(INV.ITEM_DEFS).length} items reachable.`);
  }
}

// NOT awaited: selfCheck() dynamically imports heightfields.mjs, which
// statically imports THIS module. A top-level `await` here would block this
// module's evaluation, so that import could never resolve — a deadlock, not a
// slow start. Unawaited, evaluation completes first and the import resolves.
if (import.meta.url === `file://${process.argv[1]}`) {
  selfCheck().catch(err => { console.error(err); process.exitCode = 1; });
}
