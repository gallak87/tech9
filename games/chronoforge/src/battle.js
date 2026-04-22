// Chronoforge — ATB battle system (Phase 3).
// Gauges fill at SPD/100 per frame while !paused. When gauge hits 100, hero
// enters action-select. Enemies AI-picks an action when their gauge fills.
// Crits trigger 250ms time-freeze + screen-shake. Victory → XP/Renown.

import { drawSprite, preloadSprites } from './sprites.js';
import { playSfx } from './audio.js';
import { ALL_CITIES, PLAYER_START } from './world.js';
import { computeStats, SKILL_TREES, awardXp, checkQuestProgress, ITEM_DEFS } from './progression.js';

const PALETTE = {
  bg: '#07060d', panel: 'rgba(18,10,34,0.88)', ink: '#e7e5ff', dim: '#8a83b8',
  accent: '#ff2dd4', accent2: '#22e3ff', warn: '#ffd23f', bad: '#ff4a5a',
  good: '#4af2a1', border: '#1d1638',
};

// --- hero/enemy templates ---
const HERO_TEMPLATES = {
  kaida: { name: 'Kaida', hp: 140, mp: 40, str: 18, int: 6, tec: 8, def: 10, spd: 14, crit: 6,
    techs: [{ id: 'rift_cleave', name: 'Rift Cleave', mp: 8, power: 2.0, stat: 'str', el: 'phys', aoe: true }] },
  vex:   { name: 'Vex',   hp: 100, mp: 80, str: 6, int: 18, tec: 10, def: 7, spd: 12, crit: 5,
    techs: [{ id: 'void_lance', name: 'Void Lance', mp: 14, power: 2.3, stat: 'int', el: 'void', aoe: false }] },
  rune:  { name: 'Rune',  hp: 170, mp: 50, str: 10, int: 8, tec: 16, def: 14, spd: 10, crit: 4,
    techs: [{ id: 'aegis_field', name: 'Aegis Field', mp: 10, power: 0, stat: 'tec', el: 'support', aoe: false, buff: 'shield' }] },
};

const ENEMY_TEMPLATES = {
  // T1 — early enemies
  rust_scrapper:     { name: 'Rust Scrapper',   tier: 1, hp: 80,  str: 12, def: 6,  spd: 9,  xp: 40,  renown: 4,  drops: [{ itemId: 'bog_fang', chance: 0.08 }] },
  drone_sentinel:    { name: 'Drone Sentinel',  tier: 1, hp: 60,  str: 10, def: 4,  spd: 14, xp: 55,  renown: 5,  drops: [{ itemId: 'slag_tooth', chance: 0.08 }] },
  bog_stalker:       { name: 'Bog Stalker',     tier: 1, hp: 75,  str: 13, def: 5,  spd: 11, xp: 48,  renown: 5,  drops: [{ itemId: 'bog_fang', chance: 0.14 }] },
  slag_rat:          { name: 'Slag Rat',        tier: 1, hp: 55,  str: 9,  def: 3,  spd: 15, xp: 42,  renown: 4,  drops: [{ itemId: 'slag_tooth', chance: 0.14 }] },

  // T2 — mid
  mutant_hound:      { name: 'Mutant Hound',    tier: 2, hp: 95,  str: 14, def: 5,  spd: 12, xp: 60,  renown: 6,  drops: [{ itemId: 'glacial_claw', chance: 0.1 }, { itemId: 'moss_ward', chance: 0.05 }] },
  gravbot:           { name: 'Gravbot',         tier: 2, hp: 140, str: 11, def: 14, spd: 7,  xp: 80,  renown: 8,  drops: [{ itemId: 'moss_ward', chance: 0.1 }] },
  mire_hulk:         { name: 'Mire Hulk',       tier: 2, hp: 130, str: 15, def: 9,  spd: 7,  xp: 78,  renown: 7,  drops: [{ itemId: 'moss_ward', chance: 0.15 }] },
  glacier_wolf:      { name: 'Glacier Wolf',    tier: 2, hp: 105, str: 13, def: 6,  spd: 13, xp: 70,  renown: 7,  drops: [{ itemId: 'glacial_claw', chance: 0.15 }] },

  // T3 — stronger
  neon_cultist:      { name: 'Neon Cultist',    tier: 3, hp: 90,  str: 9,  def: 6,  spd: 11, xp: 75,  renown: 8,  drops: [{ itemId: 'ember_core', chance: 0.1 }] },
  sandworm_hatchling:{ name: 'Sandworm',        tier: 3, hp: 110, str: 13, def: 8,  spd: 8,  xp: 90,  renown: 9,  drops: [{ itemId: 'frost_plate', chance: 0.08 }] },
  ember_golem:       { name: 'Ember Golem',     tier: 3, hp: 170, str: 14, def: 13, spd: 6,  xp: 110, renown: 10, drops: [{ itemId: 'ember_core', chance: 0.15 }] },
  frost_revenant:    { name: 'Frost Revenant',  tier: 3, hp: 120, str: 13, def: 10, spd: 11, xp: 100, renown: 10, drops: [{ itemId: 'frost_plate', chance: 0.15 }] },

  // T4 — heavy
  wraith_core:       { name: 'Wraith Core',     tier: 4, hp: 150, str: 16, def: 9,  spd: 13, xp: 130, renown: 13, drops: [{ itemId: 'void_scepter', chance: 0.15 }] },
  mire_warden:       { name: 'Mire Warden',     tier: 4, hp: 165, str: 15, def: 11, spd: 10, xp: 140, renown: 14, drops: [{ itemId: 'void_scepter', chance: 0.2 }] },
  magma_behemoth:    { name: 'Magma Behemoth',  tier: 4, hp: 220, str: 18, def: 14, spd: 6,  xp: 170, renown: 16, drops: [{ itemId: 'magma_blade', chance: 0.2 }] },

  // T5 — bosses / elites
  architect_herald:  { name: 'Architect Herald',tier: 5, hp: 220, str: 19, def: 13, spd: 11, xp: 180, renown: 20, drops: [{ itemId: 'titan_shard', chance: 0.5 }, { itemId: 'ember_crown', chance: 0.25 }] },
  frost_colossus:    { name: 'Frost Colossus',  tier: 5, hp: 280, str: 20, def: 16, spd: 7,  xp: 220, renown: 22, drops: [{ itemId: 'titan_shard', chance: 0.4 }] },
  ember_lord:        { name: 'Ember Lord',      tier: 5, hp: 260, str: 22, def: 14, spd: 10, xp: 240, renown: 25, drops: [{ itemId: 'ember_crown', chance: 0.4 }] },
};

// Combat properties for each skill (referenced by id from progression.js skill trees)
const TECH_DATA = {
  rift_cleave:   { id: 'rift_cleave',   name: 'Rift Cleave',   mp: 8,  power: 2.0, stat: 'str', el: 'phys',    aoe: true  },
  chrono_strike: { id: 'chrono_strike', name: 'Chrono Strike', mp: 10, power: 1.8, stat: 'str', el: 'phys',    aoe: false },
  time_sever:    { id: 'time_sever',    name: 'Time Sever',    mp: 18, power: 4.5, stat: 'str', el: 'phys',    aoe: false },
  void_lance:    { id: 'void_lance',    name: 'Void Lance',    mp: 14, power: 2.3, stat: 'int', el: 'void',    aoe: false },
  null_field:    { id: 'null_field',    name: 'Null Field',    mp: 20, power: 1.8, stat: 'int', el: 'void',    aoe: true  },
  entropy_surge: { id: 'entropy_surge', name: 'Entropy Surge', mp: 28, power: 1.5, stat: 'int', el: 'void',    aoe: true  },
  aegis_field:   { id: 'aegis_field',   name: 'Aegis Field',   mp: 10, power: 0,   stat: 'tec', el: 'support', aoe: false, buff: 'shield' },
  bulwark:       { id: 'bulwark',       name: 'Bulwark',       mp: 8,  power: 0,   stat: 'tec', el: 'support', aoe: false, buff: 'taunt'  },
  temporal_wall: { id: 'temporal_wall', name: 'Temporal Wall', mp: 32, power: 0,   stat: 'tec', el: 'support', aoe: true,  buff: 'immunity' },
};

function buildTechs(skills) {
  return Object.keys(skills)
    .filter(id => skills[id] && TECH_DATA[id])
    .map(id => TECH_DATA[id]);
}

// Build a battle-ready hero from the persistent game hero object.
function heroFromGame(gh) {
  const stats = computeStats(gh);
  return {
    id: gh.id,
    name: gh.name,
    hp: gh.hp, maxHp: stats.maxHp,
    mp: gh.mp, maxMp: stats.maxMp,
    str: stats.str, int: stats.int, tec: stats.tec,
    def: stats.def, spd: stats.spd, crit: stats.crit,
    atb: Math.random() * 40, shield: 0, flash: 0,
    techs: buildTechs(gh.skills),
    spriteState: 'idle', spriteTimer: 0,
  };
}

function cloneHero(id) {
  const t = HERO_TEMPLATES[id];
  return { id, ...t, hp: t.hp, mp: t.mp, maxHp: t.hp, maxMp: t.mp, atb: Math.random() * 40, shield: 0, flash: 0, spriteState: 'idle', spriteTimer: 0 };
}

function cloneEnemy(id, slot) {
  const t = ENEMY_TEMPLATES[id] || ENEMY_TEMPLATES.rust_scrapper;
  const tier = t.tier || 1;
  const atbHead = (tier - 1) * 8; // T1=0, T2=8, T3=16, T4=24, T5=32
  return { id, slot, ...t, hp: t.hp, maxHp: t.hp, atb: atbHead + Math.random() * 20, int: 10, tec: 6, crit: 4, flash: 0, spriteState: 'idle', spriteTimer: 0 };
}

function setSpriteState(actor, state, durationMs) {
  actor.spriteState = state;
  actor.spriteTimer = durationMs;
}

function heroSpriteName(hero) {
  const s = hero.spriteState;
  return `${hero.id}_battle_${s}`;
}

function enemySpriteName(e) {
  const s = e.spriteState;
  return `${e.id}_${s}`;
}

const HERO_STATES = ['idle', 'attack', 'cast', 'hurt', 'victory'];
const ENEMY_STATES = ['idle', 'attack', 'hurt', 'death'];

export function preloadBattleSprites() {
  const names = [];
  for (const id of Object.keys(HERO_TEMPLATES))
    for (const s of HERO_STATES) names.push(`${id}_battle_${s}`);
  for (const id of Object.keys(ENEMY_TEMPLATES))
    for (const s of ENEMY_STATES) names.push(`${id}_${s}`);
  preloadSprites(names);
}

// --- battle state ---
export function initBattle(game, encounter) {
  const enemies = [];
  const count = encounter.count || 1;
  for (let i = 0; i < count; i++) enemies.push(cloneEnemy(encounter.enemy, i));
  // use persistent heroes if available, else fall back to templates
  const battleHeroes = game.heroes
    ? game.heroes.map(gh => heroFromGame(gh))
    : ['kaida', 'vex', 'rune'].map(cloneHero);
  game.battle = {
    heroes: battleHeroes,
    enemies,
    phase: 'active',       // active | win | lose
    timeFreeze: 0,
    shake: 0,
    floaters: [],
    vfx: [],
    menu: null,            // { heroIdx, view: 'root'|'tech'|'target', techIdx, targetIdx }
    log: [(() => {
      const tpl = ENEMY_TEMPLATES[encounter.enemy] || ENEMY_TEMPLATES.rust_scrapper;
      const name = tpl.name;
      if (enemies.length > 1) return `A group of ${name}s appears!`;
      const article = /^[aeiou]/i.test(name) ? 'An' : 'A';
      return `${article} ${name} appears!`;
    })()],
    winTime: 0,
    comboFlash: 0,          // portrait-flash screen for crits / techs
    comboText: '',
    actions: [],            // queued deferred hits — gates ATB while present
  };
  playSfx('ow_encounter', { gain: 0.7 });
}

export function updateBattle(game, dt) {
  const b = game.battle;
  if (!b) return;
  b._width = game.width;
  if (b.timeFreeze > 0) { b.timeFreeze -= dt; return; }
  if (b.shake > 0) b.shake = Math.max(0, b.shake - dt);
  if (b.comboFlash > 0) b.comboFlash = Math.max(0, b.comboFlash - dt);

  // update floaters
  b.floaters = b.floaters.filter(f => (f.life -= dt) > 0);
  b.vfx = b.vfx.filter(v => (v.life -= dt) > 0);

  // hero flash + sprite state decay
  for (const h of b.heroes) {
    if (h.flash > 0) h.flash = Math.max(0, h.flash - dt);
    if (h.spriteTimer > 0) {
      h.spriteTimer = Math.max(0, h.spriteTimer - dt);
      if (h.spriteTimer === 0 && h.spriteState !== 'victory') h.spriteState = 'idle';
    }
  }
  for (const e of b.enemies) {
    if (e.flash > 0) e.flash = Math.max(0, e.flash - dt);
    if (e.spriteTimer > 0) {
      e.spriteTimer = Math.max(0, e.spriteTimer - dt);
      if (e.spriteTimer === 0 && e.spriteState !== 'death') e.spriteState = 'idle';
    }
  }

  // lunge tick (paused during freeze via the early return above)
  for (const a of b.heroes) if (a.lunge && a.lunge.life > 0) a.lunge.life = Math.max(0, a.lunge.life - dt);
  for (const a of b.enemies) if (a.lunge && a.lunge.life > 0) a.lunge.life = Math.max(0, a.lunge.life - dt);

  // queued actions — block ATB / new turns until empty
  if (b.actions.length > 0) {
    b.actions[0].delay -= dt;
    while (b.actions.length && b.actions[0].delay <= 0) b.actions.shift().fn();
    if (b.actions.length > 0) return;
  }

  if (b.phase !== 'active') {
    b.winTime += dt;
    if (b.phase === 'win' && b.winTime > 2200) endBattle(game, true);
    if (b.phase === 'lose' && b.winTime > 2500) endBattle(game, false);
    return;
  }

  // while a hero has a menu open → pause ATB
  if (b.menu !== null) return;

  // tick gauges — battleSpeed only affects regen, not animations
  const regenDt = dt * (game.battleSpeed || 1);
  for (const h of b.heroes) if (h.hp > 0 && h.atb < 100) {
    h.atb = Math.min(100, h.atb + h.spd / 59 * (regenDt / 16.67));
    if (h.atb >= 100 && !h._readyBeep) { playSfx('bt_atb_fill'); h._readyBeep = true; }
  }
  for (const e of b.enemies) if (e.hp > 0 && e.atb < 100) {
    e.atb = Math.min(100, e.atb + e.spd / 74 * (regenDt / 16.67));
  }

  // first ready hero → open menu
  const readyHero = b.heroes.findIndex(h => h.hp > 0 && h.atb >= 100);
  if (readyHero !== -1) {
    b.menu = { heroIdx: readyHero, view: 'root', techIdx: 0, targetIdx: firstAliveEnemy(b) };
    b.heroes[readyHero]._readyBeep = false;
    return;
  }

  // first ready enemy → AI action
  const readyEnemy = b.enemies.findIndex(e => e.hp > 0 && e.atb >= 100);
  if (readyEnemy !== -1) {
    enemyTurn(game, b.enemies[readyEnemy]);
  }
}

function firstAliveEnemy(b) {
  return b.enemies.findIndex(e => e.hp > 0);
}
function firstAliveHero(b) {
  return b.heroes.findIndex(h => h.hp > 0);
}

// --- input ---
export function handleBattleKey(game, key) {
  const b = game.battle;
  if (!b) return;
  if (b.phase !== 'active') return;
  if (b.menu === null) return;

  const m = b.menu;
  const hero = b.heroes[m.heroIdx];

  if (key === 'Escape') { b.menu = null; return; } // cancel defers until next ready
  if (key === 'Backspace' || key === 'b' || key === 'B') {
    if (m.view !== 'root') { m.view = 'root'; playSfx('ui_click'); }
    return;
  }

  if (m.view === 'root') {
    const opts = ['attack', 'tech', 'defend'];
    const idx = opts.indexOf(m.rootSel || 'attack');
    if (key === 'ArrowUp' || key === 'w' || key === 'W') {
      m.rootSel = opts[(idx - 1 + opts.length) % opts.length]; playSfx('ui_tab', { gain: 0.4 });
    } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
      m.rootSel = opts[(idx + 1) % opts.length]; playSfx('ui_tab', { gain: 0.4 });
    } else if (key === 'Enter' || key === ' ') {
      const sel = m.rootSel || 'attack';
      if (sel === 'attack') { m.view = 'target'; m.action = 'attack'; playSfx('bt_action_select'); }
      else if (sel === 'tech') {
        if (hero.techs.length === 0) return;
        m.view = 'tech'; m.techSel = 0;
        playSfx('bt_action_select');
      } else if (sel === 'defend') {
        hero.shield = Math.floor(hero.def * 3);
        hero.atb = 0;
        b.log.push(`${hero.name} braces for impact.`);
        playSfx('ui_click');
        b.menu = null;
      }
    }
  } else if (m.view === 'target') {
    const alive = b.enemies.map((e, i) => e.hp > 0 ? i : -1).filter(i => i !== -1);
    const curPos = alive.indexOf(m.targetIdx);
    if (key === 'ArrowLeft' || key === 'a' || key === 'A' ||
        key === 'ArrowUp' || key === 'w' || key === 'W') {
      m.targetIdx = alive[(curPos - 1 + alive.length) % alive.length]; playSfx('ui_tab', { gain: 0.4 });
    } else if (key === 'ArrowRight' || key === 'd' || key === 'D' ||
               key === 'ArrowDown' || key === 's' || key === 'S') {
      m.targetIdx = alive[(curPos + 1) % alive.length]; playSfx('ui_tab', { gain: 0.4 });
    } else if (key === 'Enter' || key === ' ') {
      executeAction(game, hero, m);
    }
  } else if (m.view === 'tech') {
    const n = hero.techs.length;
    if (key === 'ArrowUp' || key === 'w' || key === 'W') {
      m.techSel = (m.techSel - 1 + n) % n; playSfx('ui_tab', { gain: 0.4 });
    } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
      m.techSel = (m.techSel + 1) % n; playSfx('ui_tab', { gain: 0.4 });
    } else if (key === 'Enter' || key === ' ') {
      const t = hero.techs[m.techSel];
      if (hero.mp < t.mp) { playSfx('bt_miss'); return; }
      m.techIdx = m.techSel;
      m.action = 'tech';
      m.view = t.aoe || t.el === 'support' ? 'confirm' : 'target';
      playSfx('bt_action_select');
    } else if (key === 'b' || key === 'B' || key === 'Escape') {
      m.view = 'root'; playSfx('ui_tab', { gain: 0.4 });
    }
  } else if (m.view === 'confirm') {
    if (key === 'Enter' || key === ' ') executeAction(game, hero, m);
    else if (key === 'b' || key === 'B' || key === 'Escape') { m.view = 'tech'; playSfx('ui_tab', { gain: 0.4 }); }
  }
}

// --- action execution ---
function executeAction(game, hero, m) {
  const b = game.battle;
  if (m.action === 'attack') {
    const tgt = b.enemies[m.targetIdx];
    triggerLunge(b, hero, tgt, 440);
    scheduleAction(b, 385, () => {
      basicAttack(game, hero, tgt);
      checkBattleEnd(game);
    });
  } else if (m.action === 'tech') {
    const tech = hero.techs[m.techIdx];
    hero.mp = Math.max(0, hero.mp - tech.mp);
    if (tech.el === 'support') {
      for (const h of b.heroes) if (h.hp > 0) h.shield = (h.shield || 0) + Math.floor(hero.tec * 3);
      spawnFloater(b, b.heroes[0], `+SHIELD`, PALETTE.accent2);
      b.log.push(`${hero.name} casts ${tech.name} — party shielded.`);
      playSfx('bt_heal');
      flashPortrait(b, hero.name, tech.name);
    } else if (tech.aoe) {
      const alive = b.enemies.filter(e => e.hp > 0);
      const focus = alive[0] || b.enemies[0];
      triggerLunge(b, hero, focus, 400);
      scheduleAction(b, 455, () => {
        alive.forEach(tgt => techHit(game, hero, tgt, tech));
        flashPortrait(b, hero.name, tech.name);
        checkBattleEnd(game);
      });
    } else {
      const tgt = b.enemies[m.targetIdx];
      triggerLunge(b, hero, tgt, 440);
      scheduleAction(b, 455, () => {
        techHit(game, hero, tgt, tech);
        flashPortrait(b, hero.name, tech.name);
        checkBattleEnd(game);
      });
    }
  }
  hero.atb = 0;
  b.menu = null;
}

// --- tween helpers ---
function scheduleAction(b, delay, fn) { b.actions.push({ delay, fn }); }

function triggerLunge(b, attacker, target, peakDist = 64) {
  const ax = targetX(b, attacker), ay = targetY(b, attacker);
  const tx = targetX(b, target), ty = targetY(b, target);
  const dx = tx - ax, dy = ty - ay;
  const len = Math.hypot(dx, dy) || 1;
  attacker.lunge = {
    life: 675, maxLife: 675,
    dx: dx / len * peakDist, dy: dy / len * peakDist,
  };
}

function triggerHitReact(b, attacker, target, dist = 18) {
  const ax = targetX(b, attacker), ay = targetY(b, attacker);
  const tx = targetX(b, target), ty = targetY(b, target);
  const dx = tx - ax, dy = ty - ay;
  const len = Math.hypot(dx, dy) || 1;
  target.lunge = {
    life: 390, maxLife: 390,
    dx: dx / len * dist, dy: dy / len * dist,
  };
}

function lungeOffset(actor) {
  if (!actor.lunge || actor.lunge.life <= 0) return { dx: 0, dy: 0, scale: 1 };
  const t = 1 - actor.lunge.life / actor.lunge.maxLife;
  const peak = 0.45;
  let k;
  if (t < peak) {
    const u = t / peak;
    k = u * u * (3 - 2 * u);
  } else {
    const u = (t - peak) / (1 - peak);
    k = 1 - u * u * (3 - 2 * u);
  }
  return { dx: actor.lunge.dx * k, dy: actor.lunge.dy * k, scale: 1 + 0.08 * k };
}

function basicAttack(game, atk, tgt) {
  const b = game.battle;
  const baseRand = 0.9 + Math.random() * 0.2;
  const raw = atk.str * 1.5 - tgt.def * 0.8;
  let dmg = Math.max(1, Math.round(raw * baseRand));
  const isCrit = Math.random() < (0.05 + (atk.crit || 0) / 100);
  setSpriteState(atk, 'attack', 595);
  setSpriteState(tgt, 'hurt', 490);
  if (isCrit) {
    dmg = Math.round(dmg * 1.8);
    b.timeFreeze = 325;
    b.shake = 450;
    playSfx('bt_crit_hit', { gain: 0.85 });
    spawnFloater(b, tgt, `${dmg}!`, PALETTE.warn, true);
    b.vfx.push({ kind: 'timefreeze', x: targetX(b, tgt), y: targetY(b, tgt), life: 475, maxLife: 475 });
  } else {
    playSfx('bt_basic_attack', { gain: 0.7 });
    spawnFloater(b, tgt, `${dmg}`, PALETTE.ink);
  }
  applyDamage(b, tgt, dmg);
  triggerHitReact(b, atk, tgt, isCrit ? 34 : 22);
  b.log.push(`${atk.name} hits ${tgt.name} for ${dmg}${isCrit ? ' (CRIT)' : ''}.`);
  b.vfx.push({ kind: 'slash', x: targetX(b, tgt), y: targetY(b, tgt), life: 350, maxLife: 350 });
}

const EL_VFX = { void: 'void_rift', phys: 'slash', ice: 'ice_shard', flame: 'flame', heal: 'heal_sparkle' };
function techVfxKind(el) { return EL_VFX[el] || 'burst'; }

function techHit(game, atk, tgt, tech) {
  const b = game.battle;
  const statVal = atk[tech.stat];
  let dmg = Math.max(1, Math.round(tech.power * statVal + statVal * 0.5 - tgt.def * 0.5));
  const isCrit = Math.random() < 0.1 + (atk.crit || 0) / 100;
  setSpriteState(atk, 'cast', 700);
  setSpriteState(tgt, 'hurt', 490);
  if (isCrit) {
    dmg = Math.round(dmg * 1.8);
    b.timeFreeze = 325;
    b.shake = 450;
    playSfx('bt_crit_hit', { gain: 0.9 });
  } else {
    playSfx('bt_tech_cast', { gain: 0.85 });
  }
  applyDamage(b, tgt, dmg);
  triggerHitReact(b, atk, tgt, isCrit ? 30 : 18);
  spawnFloater(b, tgt, `${dmg}`, tech.el === 'void' ? '#c77bff' : tech.el === 'ice' ? '#7bd8ff' : PALETTE.warn, isCrit);
  b.log.push(`${atk.name} casts ${tech.name} → ${tgt.name} (${dmg})${isCrit ? ' CRIT!' : ''}.`);
  b.vfx.push({ kind: techVfxKind(tech.el), x: targetX(b, tgt), y: targetY(b, tgt), life: 450, maxLife: 450 });
}

function enemyTurn(game, enemy) {
  const b = game.battle;
  const aliveIdx = b.heroes.map((h, i) => h.hp > 0 ? i : -1).filter(i => i !== -1);
  if (aliveIdx.length === 0) return;
  const tgt = b.heroes[aliveIdx[Math.floor(Math.random() * aliveIdx.length)]];
  triggerLunge(b, enemy, tgt, 440);
  enemy.atb = 0;
  scheduleAction(b, 385, () => {
    setSpriteState(enemy, 'attack', 595);
    setSpriteState(tgt, 'hurt', 490);
    const raw = enemy.str * 1.5 - tgt.def * 0.8;
    let dmg = Math.max(1, Math.round(raw * (0.9 + Math.random() * 0.2)));
    if (tgt.shield > 0) {
      const absorbed = Math.min(tgt.shield, dmg);
      tgt.shield -= absorbed;
      dmg -= absorbed;
      if (dmg > 0) tgt.hp = Math.max(0, tgt.hp - dmg);
      spawnFloater(b, tgt, `-${absorbed + dmg} (shield)`, PALETTE.accent2);
    } else {
      tgt.hp = Math.max(0, tgt.hp - dmg);
      spawnFloater(b, tgt, `${dmg}`, PALETTE.bad);
    }
    tgt.flash = 300;
    triggerHitReact(b, enemy, tgt, 22);
    b.vfx.push({ kind: 'slash', x: targetX(b, tgt), y: targetY(b, tgt), life: 325, maxLife: 325 });
    playSfx('bt_hurt', { gain: 0.7 });
    b.log.push(`${enemy.name} strikes ${tgt.name} for ${dmg}.`);
    b.shake = 180;
    checkBattleEnd(game);
  });
}

function applyDamage(b, tgt, dmg) {
  tgt.hp = Math.max(0, tgt.hp - dmg);
  tgt.flash = 275;
}

function spawnFloater(b, target, text, color, big = false) {
  b.floaters.push({
    x: targetX(b, target), y: targetY(b, target),
    dx: (Math.random() - 0.5) * 30, dy: -28 + (Math.random() - 0.5) * 10,
    text, color, life: 1125, maxLife: 1125, big,
  });
}

function flashPortrait(b, name, techName) {
  b.comboFlash = 650;
  b.comboText = `${name.toUpperCase()} — ${techName.toUpperCase()}`;
  playSfx('bt_combo_intro', { gain: 0.7 });
}

function checkBattleEnd(game) {
  const b = game.battle;
  if (b.enemies.every(e => e.hp <= 0)) {
    b.phase = 'win'; b.winTime = 0;
    for (const e of b.enemies) setSpriteState(e, 'death', Infinity);
    for (const h of b.heroes) if (h.hp > 0) setSpriteState(h, 'victory', Infinity);
    playSfx('bt_victory', { gain: 0.8 });
    return;
  }
  if (b.heroes.every(h => h.hp <= 0)) {
    b.phase = 'lose'; b.winTime = 0;
    playSfx('bt_defeat', { gain: 0.8 });
  }
}

function endBattle(game, victory) {
  const b = game.battle;
  const enc = game.pendingEncounter;
  if (victory) {
    const wasCleared = enc.cleared;
    enc.cleared = true;
    const xpGain = b.enemies.reduce((s, e) => s + (e.xp || 0), 0);
    // roll drops per enemy
    const dropCounts = {};
    for (const e of b.enemies) {
      if (!e.drops) continue;
      for (const d of e.drops) {
        const tierBonus = 1 + (e.tier - 1) * 0.15; // T1=1×, T2=1.15×, T3=1.3×, T4=1.45×, T5=1.6×
        if (Math.random() < (d.chance || 0) * tierBonus) {
          game.inventory.push({ id: d.itemId });
          dropCounts[d.itemId] = (dropCounts[d.itemId] || 0) + 1;
        }
      }
    }
    if (game.heroes) {
      awardXp(game, xpGain);
      if (!wasCleared) checkQuestProgress(game, { type: 'encounter_cleared', encounterId: enc.id });
    }
    const rewards = [{ icon: 'icon_skill_point', label: 'XP', amount: xpGain }];
    if (!wasCleared) {
      const renownGain = b.enemies.reduce((s, e) => s + (e.renown || 0), 0);
      const oreGain = Math.floor(xpGain / 10);
      game.resources.renown += renownGain;
      game.resources.ore += oreGain;
      rewards.unshift(
        { icon: 'icon_renown', label: 'Renown', amount: renownGain },
        { icon: 'icon_ore',    label: 'Ore',    amount: oreGain },
      );
    }
    for (const [itemId, amt] of Object.entries(dropCounts)) {
      const def = ITEM_DEFS[itemId];
      if (!def) continue;
      rewards.push({ icon: `icon_${def.slot || 'weapon'}`, label: def.name, amount: amt });
    }
    game.showRewards(rewards);
    // restore heroes to full HP/MP after victory
    if (game.heroes) {
      for (const h of game.heroes) { h.hp = h.maxHp; h.mp = h.maxMp; }
    }
  } else {
    const home = ALL_CITIES.find(c => c.id === 'haventide') || ALL_CITIES[0];
    game.party.mapId = home.mapId || PLAYER_START.mapId;
    game.party.x = home.x; game.party.y = home.y;
    game.party.fromX = home.x; game.party.fromY = home.y;
    game.cameraX = undefined; game.cameraY = undefined;
    // return at half HP
    if (game.heroes) {
      for (const h of game.heroes) {
        h.hp = Math.max(1, Math.floor(h.maxHp * 0.5));
        h.mp = Math.max(0, Math.floor(h.maxMp * 0.5));
      }
    }
    game.toast('Defeated — returned to Haventide');
  }
  game.pendingEncounter = null;
  game.battle = null;
  game.setState('overworld');
}

// --- rendering ---
// Formation centered on canvas; sides ~200px from center for close-quarters feel.
const SPRITE_PX = 96;
const HALF_GAP = 300;
const HERO_Y_BASE = 340;
const ENEMY_Y_BASE = 300;
const HERO_SPACING = 130;
const ENEMY_SPACING = 140;

function getBattleWidth(b) { return b._width || 1280; }

function heroPos(i, b) {
  const cx = getBattleWidth(b) / 2 - HALF_GAP;
  return { x: Math.round(cx - SPRITE_PX / 2), y: HERO_Y_BASE + i * HERO_SPACING - 130 };
}
function enemyPos(i, b) {
  const cx = getBattleWidth(b) / 2 + HALF_GAP;
  return { x: Math.round(cx - SPRITE_PX / 2), y: ENEMY_Y_BASE + i * ENEMY_SPACING - 140 };
}

function targetX(b, tgt) {
  if (b.heroes.includes(tgt)) return heroPos(b.heroes.indexOf(tgt), b).x + 48;
  return enemyPos(b.enemies.indexOf(tgt), b).x + 48;
}
function targetY(b, tgt) {
  if (b.heroes.includes(tgt)) return heroPos(b.heroes.indexOf(tgt), b).y;
  return enemyPos(b.enemies.indexOf(tgt), b).y;
}

function drawWithScale(ctx, scale, cx, cy, fn) {
  if (scale === 1) { fn(); return; }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
  fn();
  ctx.restore();
}

export function drawBattle(ctx, game) {
  const b = game.battle;
  const { width: w, height: h } = game;
  if (b) b._width = w;

  // shake
  let shakeX = 0, shakeY = 0;
  if (b && b.shake > 0) {
    const s = b.shake / 360 * 8;
    shakeX = (Math.random() - 0.5) * s;
    shakeY = (Math.random() - 0.5) * s;
  }

  ctx.save();
  ctx.translate(shakeX, shakeY);

  // backdrop gradient
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#2a0b3c');
  bg.addColorStop(1, '#07060d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // subtle ground
  const grd = ctx.createRadialGradient(w / 2, h - 120, 60, w / 2, h - 120, Math.max(w, h));
  grd.addColorStop(0, 'rgba(255,45,212,0.08)');
  grd.addColorStop(1, 'rgba(7,6,13,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  if (!b) { ctx.restore(); return; }

  // draw enemies
  b.enemies.forEach((e, i) => {
    const p = enemyPos(i, b);
    const lo = lungeOffset(e);
    const dx = p.x + lo.dx, dy = p.y + lo.dy;
    if (e.hp <= 0) {
      ctx.globalAlpha = 0.25;
      drawSprite(ctx, enemySpriteName(e), p.x, p.y, 128, 128);
      ctx.globalAlpha = 1;
      return;
    }
    drawWithScale(ctx, lo.scale, dx + 48, dy + 48, () => {
      drawSprite(ctx, enemySpriteName(e), dx, dy, 128, 128);
      if (e.flash > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = e.flash / 240 * 0.8;
        drawSprite(ctx, enemySpriteName(e), dx, dy, 128, 128);
        ctx.restore();
      }
    });
    // HP bar (anchored, doesn't tween)
    drawBar(ctx, p.x, p.y + 104, 96, 8, e.hp / e.maxHp, PALETTE.bad);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '600 11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(e.name, p.x + 48, p.y + 126);
  });

  // draw heroes
  b.heroes.forEach((hero, i) => {
    const p = heroPos(i, b);
    const lo = lungeOffset(hero);
    const dx = p.x + lo.dx, dy = p.y + lo.dy;
    if (hero.hp <= 0) {
      ctx.globalAlpha = 0.3;
      drawSprite(ctx, heroSpriteName(hero), p.x, p.y, 128, 128);
      ctx.globalAlpha = 1;
    } else {
      drawWithScale(ctx, lo.scale, dx + 48, dy + 48, () => {
        drawSprite(ctx, heroSpriteName(hero), dx, dy, 128, 128);
        if (hero.flash > 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = hero.flash / 240 * 0.6;
          drawSprite(ctx, heroSpriteName(hero), dx, dy, 128, 128);
          ctx.restore();
        }
      });
      if (hero.shield > 0) {
        ctx.strokeStyle = PALETTE.accent2;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(p.x + 48, p.y + 52, 60, 72, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  });

  // VFX
  for (const v of b.vfx) drawVfx(ctx, v);

  // floaters
  for (const f of b.floaters) {
    const t = 1 - f.life / f.maxLife;
    const alpha = Math.min(1, f.life / 400);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = f.color;
    ctx.textAlign = 'center';
    ctx.font = f.big ? '800 28px system-ui, sans-serif' : '700 18px system-ui, sans-serif';
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = 3;
    const fx = f.x + f.dx * t;
    const fy = f.y + f.dy * t + (t * t) * 40;
    ctx.strokeText(f.text, fx, fy);
    ctx.fillText(f.text, fx, fy);
    ctx.restore();
  }

  // portrait flash (combo intro)
  if (b.comboFlash > 0) {
    const t = 1 - b.comboFlash / 650;
    ctx.save();
    const stripeH = 80;
    const y = h / 2 - stripeH / 2;
    ctx.fillStyle = 'rgba(255,45,212,0.82)';
    const expand = Math.min(1, t * 3);
    ctx.fillRect(0, y, w * expand, stripeH);
    ctx.fillStyle = PALETTE.bg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 30px system-ui, sans-serif';
    if (expand > 0.5) ctx.fillText(b.comboText, w / 2, h / 2);
    ctx.restore();
  }

  ctx.restore();

  // HUD (no shake)
  drawBattleHud(ctx, game);

  // phase overlays
  if (b.phase === 'win') {
    ctx.fillStyle = 'rgba(7,6,13,0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = PALETTE.warn;
    ctx.textAlign = 'center';
    ctx.font = '800 72px system-ui, sans-serif';
    ctx.shadowColor = PALETTE.warn; ctx.shadowBlur = 22;
    ctx.fillText('VICTORY', w / 2, h / 2);
    ctx.shadowBlur = 0;
  } else if (b.phase === 'lose') {
    ctx.fillStyle = 'rgba(7,6,13,0.7)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = PALETTE.bad;
    ctx.textAlign = 'center';
    ctx.font = '800 72px system-ui, sans-serif';
    ctx.fillText('DEFEATED', w / 2, h / 2);
  }
}

const VFX_SPRITE = {
  slash:            'vfx_slash_trail',
  burst:            'vfx_burst',
  void_rift:        'vfx_void_rift',
  timefreeze:       'vfx_timefreeze_pulse',
  heal_sparkle:     'vfx_heal_sparkle',
  flame:            'vfx_flame',
  ice_shard:        'vfx_ice_shard',
};

function drawVfx(ctx, v) {
  const t = 1 - v.life / v.maxLife;
  const alpha = Math.sin(t * Math.PI);
  const scale = 0.6 + t * 1.0;
  const spriteName = VFX_SPRITE[v.kind];
  if (!spriteName) return;
  const sz = 96;
  const cx = v.x, cy = v.y;
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  drawSprite(ctx, spriteName, -sz / 2, -sz / 2, sz, sz);
  ctx.restore();
}

function drawBar(ctx, x, y, w, h, pct, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * pct), h - 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function drawBattleHud(ctx, game) {
  const b = game.battle;
  const { width: w, height: h } = game;

  // bottom panel
  const panelH = 150;
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(0, h - panelH, w, panelH);
  ctx.strokeStyle = PALETTE.border;
  ctx.strokeRect(0.5, h - panelH + 0.5, w - 1, panelH - 1);

  // hero rows
  b.heroes.forEach((hero, i) => {
    const rowY = h - panelH + 14 + i * 42;
    const rowX = 20;
    // name
    ctx.fillStyle = hero.hp > 0 ? PALETTE.ink : PALETTE.dim;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.fillText(hero.name, rowX, rowY);
    // HP
    ctx.font = '400 11px ui-monospace, monospace';
    ctx.fillStyle = PALETTE.dim;
    ctx.fillText(`HP ${hero.hp}/${hero.maxHp}   MP ${hero.mp}/${hero.maxMp}`, rowX + 90, rowY + 2);
    drawBar(ctx, rowX + 300, rowY + 2, 160, 10, hero.hp / hero.maxHp, PALETTE.good);
    drawBar(ctx, rowX + 300, rowY + 14, 160, 6, hero.mp / hero.maxMp, PALETTE.accent2);
    // ATB
    const atbColor = hero.atb >= 100 ? PALETTE.warn : PALETTE.accent;
    drawBar(ctx, rowX + 480, rowY + 4, 220, 14, hero.atb / 100, atbColor);
    ctx.fillStyle = hero.atb >= 100 ? PALETTE.warn : PALETTE.ink;
    ctx.font = '700 10px ui-monospace, monospace';
    ctx.fillText(hero.atb >= 100 ? 'READY' : `${Math.floor(hero.atb)}%`, rowX + 710, rowY + 6);
    // status icons
    let statusX = rowX + 750;
    if (hero.shield > 0) { drawSprite(ctx, 'icon_shield', statusX, rowY, 18, 18); statusX += 22; }
  });

  // log tail (drawn before menu so menu overlay covers any overlap)
  ctx.textAlign = 'right';
  ctx.fillStyle = PALETTE.dim;
  ctx.font = '400 11px ui-monospace, monospace';
  const lines = b.log.slice(-4);
  lines.forEach((l, i) => ctx.fillText(l, w - 16, h - panelH - 14 - (lines.length - 1 - i) * 14));

  // menu (on top of log)
  if (b.menu) drawActionMenu(ctx, game);
}

function drawActionMenu(ctx, game) {
  const b = game.battle;
  const m = b.menu;
  const hero = b.heroes[m.heroIdx];
  const { width: w, height: h } = game;

  const mx = w - 280;
  const my = h - 300;

  ctx.fillStyle = 'rgba(7,6,13,1)';
  ctx.fillRect(mx, my, 260, 140);
  ctx.strokeStyle = PALETTE.accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(mx + 0.5, my + 0.5, 259, 139);

  ctx.fillStyle = PALETTE.accent;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.fillText(`${hero.name.toUpperCase()} READY`, mx + 12, my + 10);

  if (m.view === 'root') {
    const opts = [
      { id: 'attack', label: 'Attack' },
      { id: 'tech',   label: `Tech ▸` },
      { id: 'defend', label: 'Defend' },
    ];
    const sel = m.rootSel || 'attack';
    opts.forEach((o, i) => {
      const y = my + 36 + i * 24;
      const active = o.id === sel;
      const canDo = o.id !== 'tech' || hero.techs.some(t => hero.mp >= t.mp);
      ctx.fillStyle = active ? PALETTE.accent : 'transparent';
      if (active) ctx.fillRect(mx + 6, y - 2, 248, 22);
      ctx.fillStyle = !canDo ? PALETTE.dim : active ? PALETTE.bg : PALETTE.ink;
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillText(`${active ? '▸ ' : '  '}${o.label}`, mx + 14, y);
    });
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '400 10px ui-monospace, monospace';
    ctx.fillText('[W/S] select  [Enter] confirm', mx + 12, my + 118);
  } else if (m.view === 'tech') {
    ctx.fillStyle = PALETTE.ink;
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText('Choose Tech:', mx + 12, my + 28);
    hero.techs.forEach((t, i) => {
      const y = my + 48 + i * 22;
      const active = i === (m.techSel || 0);
      const canAfford = hero.mp >= t.mp;
      ctx.fillStyle = active ? PALETTE.accent : 'transparent';
      if (active) ctx.fillRect(mx + 6, y - 2, 248, 20);
      ctx.fillStyle = !canAfford ? PALETTE.dim : active ? PALETTE.bg : PALETTE.ink;
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillText(`${active ? '▸ ' : '  '}${t.name}`, mx + 14, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = !canAfford ? PALETTE.dim : active ? PALETTE.bg : PALETTE.accent2;
      ctx.fillText(`${t.mp} MP`, mx + 252, y);
      ctx.textAlign = 'left';
    });
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '400 10px ui-monospace, monospace';
    ctx.fillText('[W/S] select  [Enter] pick  [B] back', mx + 12, my + 118);
  } else if (m.view === 'target') {
    ctx.fillStyle = PALETTE.ink;
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText('Select target:', mx + 12, my + 36);
    const tgt = b.enemies[m.targetIdx];
    ctx.fillStyle = PALETTE.warn;
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.fillText(`▸ ${tgt.name}  (HP ${tgt.hp}/${tgt.maxHp})`, mx + 14, my + 58);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '400 10px ui-monospace, monospace';
    ctx.fillStyle = PALETTE.accent2;
    ctx.fillText('[A/D] cycle  [Enter] fire  [B] back to menu', mx + 12, my + 118);

    // reticle
    const p = enemyPos(m.targetIdx, b);
    drawReticle(ctx, p.x + 48, p.y + 48, game.time);
  } else if (m.view === 'confirm') {
    const tech = hero.techs[m.techIdx];
    ctx.fillStyle = PALETTE.ink;
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(`Cast ${tech.name}?`, mx + 12, my + 40);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '400 11px ui-monospace, monospace';
    ctx.fillText(tech.el === 'support' ? 'Supports whole party.' : 'Hits all enemies.', mx + 12, my + 62);
    ctx.font = '400 10px ui-monospace, monospace';
    ctx.fillText('[Enter] confirm  [B] back', mx + 12, my + 118);
  }
}

function drawReticle(ctx, x, y, time) {
  const pulse = 0.7 + Math.sin(time * 0.012) * 0.3;
  ctx.strokeStyle = `rgba(255,210,63,${pulse})`;
  ctx.lineWidth = 2;
  const r = 44;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  // corner ticks
  [[-r, 0], [r, 0], [0, -r], [0, r]].forEach(([dx, dy]) => {
    ctx.beginPath();
    ctx.moveTo(x + dx, y + dy);
    ctx.lineTo(x + dx + (dx ? -dx / 4 : 0), y + dy + (dy ? -dy / 4 : 0));
    ctx.stroke();
  });
}
