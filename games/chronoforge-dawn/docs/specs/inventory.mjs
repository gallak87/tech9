// docs/specs/inventory.mjs
// Inventory spec — Phase 1.1 (gamedesign). The 17-item catalog, three
// acquisition paths, the equip stat-diff rule, and the sell-only exchange
// (see agents/gamedesign-output.md SS3 for the shop/forge decision this
// backs). Item name/slot/stats/desc/color are ported VERBATIM from
// games/chronoforge/src/progression.js ITEM_DEFS — this is the copy dev
// re-authors into src/progression/items.js, not a new catalog. `source`
// tags are net-new: they record which of the three acquisition paths
// reach each item, since the donor doesn't declare this anywhere.

export const ITEM_DEFS = {
  // starting kit (5 of these 7 "base" items; see STARTING_KIT below)
  iron_blade:    { name: 'Iron Blade',    slot: 'weapon',    stats: { str: 5 },           desc: 'Crude salvaged steel.',       color: '#aaaaaa', source: ['starting'] },
  void_shard:    { name: 'Void Shard',    slot: 'weapon',    stats: { int: 6, mp: 10 },   desc: 'Crystallized null energy.',   color: '#22e3ff', source: ['starting'] },
  rune_gauntlet: { name: 'Rune Gauntlet', slot: 'weapon',    stats: { tec: 5, def: 3 },   desc: 'Resonant alloy gauntlets.',   color: '#ffd23f', source: ['starting'] },
  scrap_vest:    { name: 'Scrap Vest',    slot: 'armor',     stats: { def: 4 },           desc: 'Layered scrap plate.',        color: '#888888', source: ['starting'] },
  data_chip:     { name: 'Data Chip',     slot: 'accessory', stats: { spd: 3 },           desc: 'Overclocks reflexes.',        color: '#ff9a3c', source: ['starting'] },

  // DEVIATION (recorded in full in agents/gamedesign-output.md SS5): these two
  // are in the donor's ITEM_DEFS catalog but reachable from NOWHERE in the
  // donor — not the starting kit, not any ENEMY_TEMPLATES drop table, not
  // any world drop. Phase 8's own QA gate requires all 17 items reachable,
  // so each gets a new secondary drop entry on a currently single-drop T1/T2
  // enemy (see DROP_TABLE_ADDITIONS below) rather than shipping unreachable.
  bio_weave:     { name: 'Bio-Weave',     slot: 'armor',     stats: { hp: 20, def: 2 },   desc: 'Living alien fiber.',         color: '#4af2a1', source: ['drop'] },
  crit_lens:     { name: 'Crit Lens',     slot: 'accessory', stats: { crit: 5 },          desc: 'Targeting optic implant.',    color: '#ff2dd4', source: ['drop'] },

  // drop-only, tier-scaled rewards — 8 of these 10 double as the one world
  // drop per outdoor region (WORLD_DROPS below); the other 2 are pure drops.
  bog_fang:      { name: 'Bog Fang',      slot: 'weapon',    stats: { str: 3, spd: 2 },   desc: 'Venom-stained tooth.',                  color: '#7ad67a', source: ['drop', 'worlddrop'] },
  swamp_coil:    { name: 'Swamp Coil',    slot: 'accessory', stats: { crit: 3, spd: 2 },  desc: 'Reed-and-copper armband, still damp.',  color: '#7a9e6a', source: ['drop', 'worlddrop'] },
  glacial_claw:  { name: 'Glacial Claw',  slot: 'weapon',    stats: { str: 7, crit: 3 },  desc: 'Icebound rending claw.',                color: '#7bd8ff', source: ['drop', 'worlddrop'] },
  moss_ward:     { name: 'Moss Ward',     slot: 'accessory', stats: { def: 4, hp: 15 },   desc: 'Living bio-weave charm.',               color: '#4af2a1', source: ['drop', 'worlddrop'] },
  ember_core:    { name: 'Ember Core',    slot: 'weapon',    stats: { int: 9, str: 3 },   desc: 'Magma-forged focus.',                   color: '#ff6a2c', source: ['drop', 'worlddrop'] },
  frost_plate:   { name: 'Frost Plate',   slot: 'armor',     stats: { def: 8, hp: 30 },   desc: 'Glacier-plate barding.',                color: '#a9e0ff', source: ['drop', 'worlddrop'] },
  void_scepter:  { name: 'Void Scepter',  slot: 'weapon',    stats: { int: 12, mp: 20 },  desc: 'Null-charged rod.',                     color: '#c77bff', source: ['drop', 'worlddrop'] },
  magma_blade:   { name: 'Magma Blade',   slot: 'weapon',    stats: { str: 12, crit: 4 }, desc: 'Crater-forged greatsword.',             color: '#ff4a2c', source: ['drop', 'worlddrop'] },
  titan_shard:   { name: 'Titan Shard',   slot: 'armor',     stats: { def: 12, hp: 50 },  desc: 'Architect-era alloy.',                  color: '#ffd23f', source: ['drop'] },
  ember_crown:   { name: 'Ember Crown',   slot: 'accessory', stats: { crit: 8, spd: 4 },  desc: 'Smoldering circlet.',                   color: '#ff2dd4', source: ['drop'] },
};

// Ported verbatim from games/chronoforge/src/progression.js initInventory().
export const STARTING_KIT = ['iron_blade', 'void_shard', 'rune_gauntlet', 'scrap_vest', 'data_chip'];

// Ported verbatim from games/chronoforge/src/battle.js ENEMY_TEMPLATES[*].drops,
// PLUS the two new entries fixing the bio_weave/crit_lens reachability gap.
export const ENEMY_DROP_TABLE = {
  rust_scrapper: [{ itemId: 'bog_fang', chance: 0.08 }],
  drone_sentinel: [{ itemId: 'swamp_coil', chance: 0.08 }, { itemId: 'bio_weave', chance: 0.06 }], // +bio_weave, net-new
  bog_stalker: [{ itemId: 'bog_fang', chance: 0.14 }],
  slag_rat: [{ itemId: 'swamp_coil', chance: 0.14 }],
  mutant_hound: [{ itemId: 'glacial_claw', chance: 0.1 }, { itemId: 'moss_ward', chance: 0.05 }],
  gravbot: [{ itemId: 'moss_ward', chance: 0.1 }],
  mire_hulk: [{ itemId: 'moss_ward', chance: 0.15 }],
  glacier_wolf: [{ itemId: 'glacial_claw', chance: 0.15 }, { itemId: 'crit_lens', chance: 0.06 }], // +crit_lens, net-new
  neon_cultist: [{ itemId: 'ember_core', chance: 0.1 }],
  sandworm_hatchling: [{ itemId: 'frost_plate', chance: 0.08 }],
  ember_golem: [{ itemId: 'ember_core', chance: 0.15 }],
  frost_revenant: [{ itemId: 'frost_plate', chance: 0.15 }],
  wraith_core: [{ itemId: 'void_scepter', chance: 0.15 }],
  mire_warden: [{ itemId: 'void_scepter', chance: 0.2 }],
  magma_behemoth: [{ itemId: 'magma_blade', chance: 0.2 }],
  architect_herald: [{ itemId: 'titan_shard', chance: 0.5 }, { itemId: 'ember_crown', chance: 0.25 }],
  frost_colossus: [{ itemId: 'titan_shard', chance: 0.4 }],
  ember_lord: [{ itemId: 'ember_crown', chance: 0.4 }],
};
// tier drop-chance bonus, ported verbatim from battle.js endBattle():
// 1 + (enemyTier - 1) * 0.15  ->  T1=1x, T2=1.15x, T3=1.3x, T4=1.45x, T5=1.6x
export const DROP_TIER_BONUS = tier => 1 + (tier - 1) * 0.15;

// One hidden world drop per outdoor region, ported verbatim from
// games/chronoforge/src/world.js MAPS[*].worldDrop.
export const WORLD_DROPS = {
  haventide_region: 'bog_fang',
  emberline_region: 'glacial_claw',
  forest_veil_region: 'moss_ward',
  mire_bog_region: 'swamp_coil',
  orbital_reach_region: 'ember_core',
  frost_canyon_region: 'frost_plate',
  last_crown_region: 'void_scepter',
  crater_ember_region: 'magma_blade',
};

// --- equip stat-diff preview rule ---
// Reuses computeStats() unchanged (ported verbatim from progression.js): the
// preview is `computeStats(heroWithCandidateEquipped) - computeStats(hero)`,
// per stat, hp/mp folded into maxHp/maxMp exactly as computeStats already
// does. This guarantees the preview and the real equip can never drift,
// because they run the SAME function — no parallel "preview math" to keep
// in sync.
export const STAT_KEYS = ['str', 'int', 'tec', 'def', 'spd', 'crit', 'maxHp', 'maxMp'];
export function statDiff(beforeStats, afterStats) {
  const diff = {};
  for (const k of STAT_KEYS) {
    const d = (afterStats[k] || 0) - (beforeStats[k] || 0);
    if (d !== 0) diff[k] = d;
  }
  return diff; // e.g. { str: 5, def: -2 } — only stats that actually change
}

// --- sell-only exchange (SS3 decision: no buy-shop, no forge crafting in v1) ---
// New formula, no donor baseline to port. Deliberately modest relative to
// the settlement economy (mine yields 1-4 ore/tick, a T2 building costs
// 60-160 ore): a junk common drop nets ~15-25 ore, a rare tier-5 drop nets
// ~100+, enough to matter without turning grinding drops into the ore
// economy's main faucet (that stays the mine/farm/extractor tick).
export function sellPrice(itemId) {
  const def = ITEM_DEFS[itemId];
  if (!def) return 0;
  const statPoints = Object.values(def.stats).reduce((s, v) => s + Math.abs(v), 0);
  return Math.round(5 + statPoints * 3);
}

// --- weapon-socket requirement ---
// Every weapon-slot item needs a DISTINCT mesh on the rig's named weapon
// socket (CONCEPT.md / gamedesign.md hard constraint) so equipping is
// visible in world, battle and portrait. `color` (ported from ITEM_DEFS) is
// the intended material-tint hint for that mesh, not a new design.
export const WEAPON_ITEMS = Object.entries(ITEM_DEFS)
  .filter(([, d]) => d.slot === 'weapon')
  .map(([id, d]) => ({ id, name: d.name, color: d.color, desc: d.desc }));

// --- self-check: `node docs/specs/inventory.mjs` ---
function selfCheck() {
  const failures = [];
  const ids = Object.keys(ITEM_DEFS);
  if (ids.length !== 17) failures.push(`expected 17 items, found ${ids.length}`);

  const bySlot = { weapon: 0, armor: 0, accessory: 0 };
  for (const d of Object.values(ITEM_DEFS)) bySlot[d.slot] = (bySlot[d.slot] || 0) + 1;
  console.log(`slots: weapon=${bySlot.weapon} armor=${bySlot.armor} accessory=${bySlot.accessory}`);
  if (bySlot.weapon !== 8 || bySlot.armor !== 4 || bySlot.accessory !== 5) {
    failures.push(`unexpected slot distribution: ${JSON.stringify(bySlot)}`);
  }

  // reachability: every item must appear in starting kit, some enemy drop
  // table, or some world drop.
  const dropIds = new Set(Object.values(ENEMY_DROP_TABLE).flatMap(list => list.map(d => d.itemId)));
  const worldDropIds = new Set(Object.values(WORLD_DROPS));
  for (const id of ids) {
    const reachable = STARTING_KIT.includes(id) || dropIds.has(id) || worldDropIds.has(id);
    if (!reachable) failures.push(`UNREACHABLE: ${id} is in no starting kit, drop table, or world drop`);
  }

  // every world drop must name a real item (region.mjs will assert this too
  // against real map data once level ports it in Phase 1.2/1.3).
  for (const [region, itemId] of Object.entries(WORLD_DROPS)) {
    if (!ITEM_DEFS[itemId]) failures.push(`world drop for ${region} names unknown item ${itemId}`);
  }

  console.log(`weapon items needing a distinct socket mesh (${WEAPON_ITEMS.length}):`);
  for (const w of WEAPON_ITEMS) console.log(`  ${w.id.padEnd(14)} "${w.name}" ${w.color}`);

  console.log('\nsample sell prices:');
  for (const id of ['iron_blade', 'void_scepter', 'titan_shard', 'ember_crown']) {
    console.log(`  ${id.padEnd(14)} ${sellPrice(id)} ore`);
  }

  if (failures.length) {
    console.error(`\nFAIL - ${failures.length} issue(s):`);
    for (const f of failures) console.error(' - ' + f);
    process.exitCode = 1;
  } else {
    console.log(`\nPASS - all 17 items reachable, slot counts correct.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) selfCheck();
