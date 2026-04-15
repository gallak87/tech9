// Chronoforge — Progression layer (Phase 5).
// Owns: hero definitions, item catalog, skill trees, quest log, XP/level-up,
// equip logic, save/load (localStorage).

import { ALL_CITIES, ALL_ENCOUNTERS, MAPS } from './world.js';

// --- hero base definitions ---
export const HERO_DEFS = {
  kaida: { name: 'Kaida', role: 'Warrior',  color: '#ff2dd4', hp: 140, mp: 40,  str: 18, int: 6,  tec: 8,  def: 10, spd: 14, crit: 6 },
  vex:   { name: 'Vex',   role: 'Mage',     color: '#22e3ff', hp: 100, mp: 80,  str: 6,  int: 18, tec: 10, def: 7,  spd: 12, crit: 5 },
  rune:  { name: 'Rune',  role: 'Sentinel', color: '#ffd23f', hp: 170, mp: 50,  str: 10, int: 8,  tec: 16, def: 14, spd: 10, crit: 4 },
};

// --- skill trees (one per hero) ---
// cost 0 = starting skill (always unlocked)
export const SKILL_TREES = {
  kaida: [
    { id: 'rift_cleave',    name: 'Rift Cleave',    desc: 'AoE physical slash.',          cost: 0, requires: null },
    { id: 'chrono_strike',  name: 'Chrono Strike',  desc: 'Single hit; slows enemy ATB.', cost: 1, requires: null },
    { id: 'time_sever',     name: 'Time Sever',     desc: 'Triple-hit finisher.',          cost: 2, requires: 'chrono_strike' },
  ],
  vex: [
    { id: 'void_lance',     name: 'Void Lance',     desc: 'Piercing void bolt.',           cost: 0, requires: null },
    { id: 'null_field',     name: 'Null Field',     desc: 'AoE void burst, all enemies.',  cost: 1, requires: null },
    { id: 'entropy_surge',  name: 'Entropy Surge',  desc: 'Drains HP+MP from all foes.',   cost: 2, requires: 'null_field' },
  ],
  rune: [
    { id: 'aegis_field',    name: 'Aegis Field',    desc: 'Shields the full party.',       cost: 0, requires: null },
    { id: 'bulwark',        name: 'Bulwark',        desc: 'Taunt — enemies target Rune.', cost: 1, requires: null },
    { id: 'temporal_wall',  name: 'Temporal Wall',  desc: '2-turn party-wide immunity.',   cost: 2, requires: 'bulwark' },
  ],
};

// --- item catalog ---
export const ITEM_DEFS = {
  iron_blade:    { name: 'Iron Blade',    slot: 'weapon',    stats: { str: 5 },           desc: 'Crude salvaged steel.',        color: '#aaaaaa' },
  void_shard:    { name: 'Void Shard',    slot: 'weapon',    stats: { int: 6, mp: 10 },   desc: 'Crystallized null energy.',    color: '#22e3ff' },
  rune_gauntlet: { name: 'Rune Gauntlet', slot: 'weapon',    stats: { tec: 5, def: 3 },   desc: 'Resonant alloy gauntlets.',    color: '#ffd23f' },
  scrap_vest:    { name: 'Scrap Vest',    slot: 'armor',     stats: { def: 4 },            desc: 'Layered scrap plate.',         color: '#888888' },
  bio_weave:     { name: 'Bio-Weave',     slot: 'armor',     stats: { hp: 20, def: 2 },    desc: 'Living alien fiber.',          color: '#4af2a1' },
  data_chip:     { name: 'Data Chip',     slot: 'accessory', stats: { spd: 3 },            desc: 'Overclocks reflexes.',         color: '#ff9a3c' },
  crit_lens:     { name: 'Crit Lens',     slot: 'accessory', stats: { crit: 5 },           desc: 'Targeting optic implant.',     color: '#ff2dd4' },
};

// --- quest definitions ---
export const QUEST_DEFS = [
  {
    id: 'clear_eastern_road',
    title: 'Clear the Eastern Road',
    giver: 'Haventide',
    desc: 'Rust Scrappers block the road east of Haventide. Clear them out so caravans can move.',
    objectives: [
      { text: 'Defeat Rust Scrapper patrol (east road)', encounterId: 'e1' },
      { text: 'Reach Emberline', cityId: 'emberline' },
    ],
    reward: { xp: 80, ore: 30 },
  },
  {
    id: 'elevator_signal',
    title: 'The Elevator Signal',
    giver: 'Emberline',
    desc: 'A distress signal crackles from Orbital Reach. The elevator base is under siege.',
    objectives: [
      { text: 'Neutralize Drone Sentinel patrol', encounterId: 'e3' },
      { text: 'Destroy Gravbot blockade', encounterId: 'e4' },
      { text: 'Reach Orbital Reach', cityId: 'orbital_reach' },
    ],
    reward: { xp: 150, ore: 60 },
  },
  {
    id: 'wraith_convergence',
    title: 'The Wraith Convergence',
    giver: 'Orbital Reach',
    desc: 'Wraith Cores are assembling in the terraform zone. Stop them before they merge.',
    objectives: [
      { text: 'Collapse the Sandworm nest', encounterId: 'e6' },
      { text: 'Destroy the Wraith Core', encounterId: 'e7' },
      { text: 'Reach Last Crown', cityId: 'last_crown' },
    ],
    reward: { xp: 250, ore: 100 },
  },
  {
    id: 'face_the_architect',
    title: 'Face the Void Architect',
    giver: 'Last Crown',
    desc: 'The Void Architect waits at the spire. End this.',
    objectives: [
      { text: "Defeat the Architect's Herald", encounterId: 'e8' },
    ],
    reward: { xp: 500, ore: 200 },
  },
];

// --- init functions ---

export function initHeroes() {
  return Object.keys(HERO_DEFS).map(id => {
    const def = HERO_DEFS[id];
    const skills = {};
    // cost-0 skill is always known
    const starter = SKILL_TREES[id].find(s => s.cost === 0);
    if (starter) skills[starter.id] = true;
    return {
      id,
      name: def.name, role: def.role, color: def.color,
      hp: def.hp, maxHp: def.hp,
      mp: def.mp, maxMp: def.mp,
      str: def.str, int: def.int, tec: def.tec,
      def: def.def, spd: def.spd, crit: def.crit,
      xp: 0, xpNext: 100, level: 1,
      equip: { weapon: null, armor: null, accessory: null },
      skills,
    };
  });
}

export function initInventory() {
  return ['iron_blade', 'void_shard', 'rune_gauntlet', 'scrap_vest', 'data_chip'].map(id => ({ id }));
}

export function initQuests() {
  return QUEST_DEFS.map(def => ({
    id: def.id,
    objectives: def.objectives.map(o => ({ ...o, done: false })),
    complete: false,
    claimedReward: false,
  }));
}

// --- stat helpers ---

// Returns effective stats for a hero including equipment bonuses.
export function computeStats(hero) {
  const s = {
    str: hero.str, int: hero.int, tec: hero.tec,
    def: hero.def, spd: hero.spd, crit: hero.crit,
    hp: hero.hp, maxHp: hero.maxHp,
    mp: hero.mp, maxMp: hero.maxMp,
  };
  for (const slot of ['weapon', 'armor', 'accessory']) {
    const itemId = hero.equip[slot];
    if (!itemId) continue;
    const def = ITEM_DEFS[itemId];
    if (!def) continue;
    for (const [k, v] of Object.entries(def.stats)) {
      if (k === 'hp') { s.maxHp += v; }
      else if (k === 'mp') { s.maxMp += v; }
      else s[k] = (s[k] || 0) + v;
    }
  }
  return s;
}

// --- XP / level-up ---

export function awardXp(game, amount) {
  const leveled = [];
  for (const h of game.heroes) {
    h.xp += amount;
    while (h.xp >= h.xpNext) {
      h.xp -= h.xpNext;
      h.level++;
      h.xpNext = Math.floor(h.xpNext * 1.55);
      const base = HERO_DEFS[h.id];
      h.str  += Math.max(1, Math.round(base.str * 0.07));
      h.int  += Math.max(1, Math.round(base.int * 0.07));
      h.tec  += Math.max(1, Math.round(base.tec * 0.07));
      h.def  += Math.max(1, Math.round(base.def * 0.07));
      h.spd  += Math.round(base.spd * 0.04);
      h.crit += Math.round(base.crit * 0.05);
      h.maxHp = Math.floor(h.maxHp * 1.08);
      h.maxMp = Math.floor(h.maxMp * 1.06);
      h.hp = h.maxHp;
      h.mp = h.maxMp;
      game.resources.skillPoints = (game.resources.skillPoints || 0) + 1;
      leveled.push(h.name);
    }
  }
  if (leveled.length) game.toast(`Level up! ${[...new Set(leveled)].join(', ')} — +1 skill point`);
}

// --- equip ---

export function equipItem(game, heroId, slot, invIdx) {
  const hero = game.heroes.find(h => h.id === heroId);
  const item = game.inventory[invIdx];
  if (!hero || !item) return false;
  const def = ITEM_DEFS[item.id];
  if (!def || def.slot !== slot) return false;
  // send current equip back to inventory
  if (hero.equip[slot]) game.inventory.push({ id: hero.equip[slot] });
  hero.equip[slot] = item.id;
  game.inventory.splice(invIdx, 1);
  return true;
}

export function unequipItem(game, heroId, slot) {
  const hero = game.heroes.find(h => h.id === heroId);
  if (!hero || !hero.equip[slot]) return false;
  game.inventory.push({ id: hero.equip[slot] });
  hero.equip[slot] = null;
  return true;
}

// --- skill tree ---

export function spendSkillPoint(game, heroId, skillId) {
  if (!game.resources.skillPoints) return false;
  const hero = game.heroes.find(h => h.id === heroId);
  if (!hero) return false;
  const tree = SKILL_TREES[heroId] || [];
  const skill = tree.find(s => s.id === skillId);
  if (!skill || skill.cost === 0 || hero.skills[skillId]) return false;
  if (skill.requires && !hero.skills[skill.requires]) return false;
  if (game.resources.skillPoints < skill.cost) return false;
  hero.skills[skillId] = true;
  game.resources.skillPoints -= skill.cost;
  return true;
}

// --- quest progress ---

export function checkQuestProgress(game, event) {
  // event: { type: 'encounter_cleared', encounterId } | { type: 'city_reached', cityId }
  for (const q of game.quests) {
    if (q.complete) continue;
    for (const obj of q.objectives) {
      if (obj.done) continue;
      if (event.type === 'encounter_cleared' && obj.encounterId === event.encounterId) obj.done = true;
      if (event.type === 'city_reached' && obj.cityId === event.cityId) obj.done = true;
    }
    if (!q.complete && q.objectives.every(o => o.done)) {
      q.complete = true;
      if (!q.claimedReward) {
        const def = QUEST_DEFS.find(d => d.id === q.id);
        if (def) {
          awardXp(game, def.reward.xp);
          game.resources.ore = (game.resources.ore || 0) + def.reward.ore;
          // toast delayed slightly so it doesn't clobber the XP/level-up toast
          setTimeout(() => game.toast(`Quest complete: ${def.title} — +${def.reward.ore} Ore`), 800);
        }
        q.claimedReward = true;
      }
    }
  }
}

// --- save / load ---

const SAVE_KEY = 'chronoforge_v1';

export function saveGame(game) {
  try {
    const data = {
      v: 1,
      ts: Date.now(),
      resources: { ...game.resources },
      party: {
        mapId: game.party.mapId,
        x: game.party.x, y: game.party.y,
        facing: game.party.facing,
        worldDropsTaken: { ...game.party.worldDropsTaken },
      },
      explored: Object.fromEntries(
        Object.entries(game.explored).map(([k, s]) => [k, [...s]])
      ),
      heroes: game.heroes.map(h => ({
        ...h,
        equip: { ...h.equip },
        skills: { ...h.skills },
      })),
      inventory: game.inventory.map(i => ({ id: i.id })),
      quests: game.quests.map(q => ({
        id: q.id, complete: q.complete, claimedReward: q.claimedReward,
        objectives: q.objectives.map(o => ({ ...o })),
      })),
      base: {
        slots: game.base.slots.map(s => s.building ? { type: s.building.type, tier: s.building.tier } : null),
        oreSpent: game.base.oreSpent || 0,
        researchBuilt: game.base.researchBuilt || false,
      },
      tier: game.tier,
      cities: ALL_CITIES.map(c => ({ id: c.id, unlocked: c.unlocked })),
      encounters: ALL_ENCOUNTERS.map(e => ({ id: e.id, cleared: !!e.cleared })),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function hasSave() {
  return !!localStorage.getItem(SAVE_KEY);
}

export function getSaveMeta() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    return {
      ts: d.ts,
      tier: d.tier,
      heroLevels: d.heroes?.map(h => h.level) || [],
      resources: d.resources,
    };
  } catch { return null; }
}

export function deleteSave() {
  localStorage.removeItem(SAVE_KEY);
}

export function loadGame(game) {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false;
  try {
    const d = JSON.parse(raw);
    if (d.v !== 1) return false;

    game.resources = { ...d.resources };

    game.party.mapId = d.party.mapId || 'haventide_region';
    game.party.x = d.party.x;
    game.party.y = d.party.y;
    game.party.fromX = d.party.x;
    game.party.fromY = d.party.y;
    game.party.facing = d.party.facing || 'down';
    game.party.moveCooldown = 0;
    game.party.moveStart = -9999;
    game.party.worldDropsTaken = d.party.worldDropsTaken || {};

    if (Array.isArray(d.explored)) {
      // legacy v1 save — single flat explored set, seed into starting map
      game.explored = Object.fromEntries(
        Object.keys(MAPS).map(id => [id, new Set()])
      );
      game.explored[game.party.mapId] = new Set(d.explored);
    } else {
      game.explored = Object.fromEntries(
        Object.keys(MAPS).map(id => [id, new Set(d.explored[id] || [])])
      );
    }

    game.heroes = d.heroes;
    game.inventory = d.inventory;
    game.quests = d.quests;

    // restore base (preserve non-data fields like pickerOpen)
    game.base.slots = d.base.slots.map(s => ({ building: s }));
    game.base.oreSpent = d.base.oreSpent || 0;
    game.base.researchBuilt = d.base.researchBuilt || false;
    game.base.version++;

    game.tier = d.tier;

    for (const cs of d.cities) {
      const city = ALL_CITIES.find(c => c.id === cs.id);
      if (city) city.unlocked = cs.unlocked;
    }
    for (const es of d.encounters) {
      const enc = ALL_ENCOUNTERS.find(e => e.id === es.id);
      if (enc) enc.cleared = es.cleared;
    }

    return true;
  } catch (e) {
    console.error('[chronoforge] load failed:', e);
    return false;
  }
}
