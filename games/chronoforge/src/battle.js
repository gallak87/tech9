// Chronoforge — ATB battle system (Phase 3).
// Gauges fill at SPD/100 per frame while !paused. When gauge hits 100, hero
// enters action-select. Enemies AI-picks an action when their gauge fills.
// Crits trigger 250ms time-freeze + screen-shake. Victory → XP/Renown.

import { drawSprite } from './sprites.js';
import { playSfx } from './audio.js';
import { CITIES } from './world.js';

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
  rust_scrapper:     { name: 'Rust Scrapper',   hp: 80,  str: 12, def: 6,  spd: 9,  xp: 40,  renown: 4 },
  drone_sentinel:    { name: 'Drone Sentinel',  hp: 60,  str: 10, def: 4,  spd: 14, xp: 55,  renown: 5 },
  mutant_hound:      { name: 'Mutant Hound',    hp: 95,  str: 14, def: 5,  spd: 12, xp: 60,  renown: 6 },
  gravbot:           { name: 'Gravbot',         hp: 140, str: 11, def: 14, spd: 7,  xp: 80,  renown: 8 },
  neon_cultist:      { name: 'Neon Cultist',    hp: 90,  str: 9,  def: 6,  spd: 11, xp: 75,  renown: 8 },
  sandworm_hatchling:{ name: 'Sandworm',        hp: 110, str: 13, def: 8,  spd: 8,  xp: 70,  renown: 7 },
  wraith_core:       { name: 'Wraith Core',     hp: 130, str: 15, def: 9,  spd: 13, xp: 110, renown: 12 },
};

function cloneHero(id) {
  const t = HERO_TEMPLATES[id];
  return { id, ...t, hp: t.hp, mp: t.mp, maxHp: t.hp, maxMp: t.mp, atb: Math.random() * 40, shield: 0, flash: 0 };
}

function cloneEnemy(id, slot) {
  const t = ENEMY_TEMPLATES[id] || ENEMY_TEMPLATES.rust_scrapper;
  return { id, slot, ...t, hp: t.hp, maxHp: t.hp, atb: Math.random() * 20, int: 10, tec: 6, crit: 4, flash: 0 };
}

// --- battle state ---
export function initBattle(game, encounter) {
  const enemies = [];
  const count = encounter.count || 1;
  for (let i = 0; i < count; i++) enemies.push(cloneEnemy(encounter.enemy, i));
  game.battle = {
    heroes: ['kaida', 'vex', 'rune'].map(cloneHero),
    enemies,
    phase: 'active',       // active | win | lose
    timeFreeze: 0,
    shake: 0,
    floaters: [],
    vfx: [],
    menu: null,            // { heroIdx, view: 'root'|'tech'|'target', techIdx, targetIdx }
    log: [`${enemies.length === 1 ? 'An' : 'A group of'} ${ENEMY_TEMPLATES[encounter.enemy].name}${enemies.length > 1 ? 's' : ''} appears!`],
    winTime: 0,
    comboFlash: 0,          // portrait-flash screen for crits / techs
    comboText: '',
  };
  playSfx('ow_encounter', { gain: 0.7 });
}

export function updateBattle(game, dt) {
  const b = game.battle;
  if (!b) return;
  if (b.timeFreeze > 0) { b.timeFreeze -= dt; return; }
  if (b.shake > 0) b.shake = Math.max(0, b.shake - dt);
  if (b.comboFlash > 0) b.comboFlash = Math.max(0, b.comboFlash - dt);

  // update floaters
  b.floaters = b.floaters.filter(f => (f.life -= dt) > 0);
  b.vfx = b.vfx.filter(v => (v.life -= dt) > 0);

  // hero flash decay
  for (const h of b.heroes) if (h.flash > 0) h.flash = Math.max(0, h.flash - dt);
  for (const e of b.enemies) if (e.flash > 0) e.flash = Math.max(0, e.flash - dt);

  if (b.phase !== 'active') {
    b.winTime += dt;
    if (b.phase === 'win' && b.winTime > 2200) endBattle(game, true);
    if (b.phase === 'lose' && b.winTime > 2500) endBattle(game, false);
    return;
  }

  // while a hero has a menu open → pause ATB
  if (b.menu !== null) return;

  // tick gauges
  for (const h of b.heroes) if (h.hp > 0 && h.atb < 100) {
    h.atb = Math.min(100, h.atb + h.spd / 100 * (dt / 16.67));
    if (h.atb >= 100 && !h._readyBeep) { playSfx('bt_atb_fill'); h._readyBeep = true; }
  }
  for (const e of b.enemies) if (e.hp > 0 && e.atb < 100) {
    e.atb = Math.min(100, e.atb + e.spd / 100 * (dt / 16.67));
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
        const t = hero.techs[0];
        if (hero.mp < t.mp) { playSfx('bt_miss'); return; }
        m.view = t.aoe || t.el === 'support' ? 'confirm' : 'target';
        m.action = 'tech'; m.techIdx = 0;
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
  } else if (m.view === 'confirm') {
    if (key === 'Enter' || key === ' ') executeAction(game, hero, m);
  }
}

// --- action execution ---
function executeAction(game, hero, m) {
  const b = game.battle;
  if (m.action === 'attack') {
    const tgt = b.enemies[m.targetIdx];
    basicAttack(game, hero, tgt);
  } else if (m.action === 'tech') {
    const tech = hero.techs[m.techIdx];
    hero.mp = Math.max(0, hero.mp - tech.mp);
    if (tech.el === 'support') {
      // Aegis Field — shield whole party
      for (const h of b.heroes) if (h.hp > 0) h.shield = (h.shield || 0) + Math.floor(hero.tec * 3);
      spawnFloater(b, b.heroes[0], `+SHIELD`, PALETTE.accent2);
      b.log.push(`${hero.name} casts ${tech.name} — party shielded.`);
      playSfx('bt_heal');
      flashPortrait(b, hero.name, tech.name);
    } else if (tech.aoe) {
      const alive = b.enemies.filter(e => e.hp > 0);
      alive.forEach(tgt => techHit(game, hero, tgt, tech));
      flashPortrait(b, hero.name, tech.name);
    } else {
      techHit(game, hero, b.enemies[m.targetIdx], tech);
      flashPortrait(b, hero.name, tech.name);
    }
  }
  hero.atb = 0;
  b.menu = null;
  checkBattleEnd(game);
}

function basicAttack(game, atk, tgt) {
  const b = game.battle;
  const baseRand = 0.9 + Math.random() * 0.2;
  const raw = atk.str * 1.5 - tgt.def * 0.8;
  let dmg = Math.max(1, Math.round(raw * baseRand));
  const isCrit = Math.random() < (0.05 + (atk.crit || 0) / 100);
  if (isCrit) {
    dmg = Math.round(dmg * 1.8);
    b.timeFreeze = 260;
    b.shake = 360;
    playSfx('bt_crit_hit', { gain: 0.85 });
    spawnFloater(b, tgt, `${dmg}!`, PALETTE.warn, true);
  } else {
    playSfx('bt_basic_attack', { gain: 0.7 });
    spawnFloater(b, tgt, `${dmg}`, PALETTE.ink);
  }
  applyDamage(b, tgt, dmg);
  b.log.push(`${atk.name} hits ${tgt.name} for ${dmg}${isCrit ? ' (CRIT)' : ''}.`);
  b.vfx.push({ kind: 'slash', x: targetX(b, tgt), y: targetY(b, tgt), life: 240, maxLife: 240, color: PALETTE.accent });
}

function techHit(game, atk, tgt, tech) {
  const b = game.battle;
  const statVal = atk[tech.stat];
  let dmg = Math.max(1, Math.round(tech.power * statVal + statVal * 0.5 - tgt.def * 0.5));
  const isCrit = Math.random() < 0.1 + (atk.crit || 0) / 100;
  if (isCrit) {
    dmg = Math.round(dmg * 1.8);
    b.timeFreeze = 260;
    b.shake = 360;
    playSfx('bt_crit_hit', { gain: 0.9 });
  } else {
    playSfx('bt_tech_cast', { gain: 0.85 });
  }
  applyDamage(b, tgt, dmg);
  spawnFloater(b, tgt, `${dmg}`, tech.el === 'void' ? '#c77bff' : tech.el === 'ice' ? '#7bd8ff' : PALETTE.warn, isCrit);
  b.log.push(`${atk.name} casts ${tech.name} → ${tgt.name} (${dmg})${isCrit ? ' CRIT!' : ''}.`);
  b.vfx.push({ kind: tech.el === 'void' ? 'void' : 'tech', x: targetX(b, tgt), y: targetY(b, tgt), life: 360, maxLife: 360, color: PALETTE.accent2 });
}

function enemyTurn(game, enemy) {
  const b = game.battle;
  const aliveIdx = b.heroes.map((h, i) => h.hp > 0 ? i : -1).filter(i => i !== -1);
  if (aliveIdx.length === 0) return;
  const tgt = b.heroes[aliveIdx[Math.floor(Math.random() * aliveIdx.length)]];
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
  tgt.flash = 240;
  playSfx('bt_hurt', { gain: 0.7 });
  b.log.push(`${enemy.name} strikes ${tgt.name} for ${dmg}.`);
  b.shake = 180;
  enemy.atb = 0;
  checkBattleEnd(game);
}

function applyDamage(b, tgt, dmg) {
  tgt.hp = Math.max(0, tgt.hp - dmg);
  tgt.flash = 220;
}

function spawnFloater(b, target, text, color, big = false) {
  b.floaters.push({
    x: targetX(b, target), y: targetY(b, target),
    dx: (Math.random() - 0.5) * 30, dy: -28 + (Math.random() - 0.5) * 10,
    text, color, life: 900, maxLife: 900, big,
  });
}

function flashPortrait(b, name, techName) {
  b.comboFlash = 520;
  b.comboText = `${name.toUpperCase()} — ${techName.toUpperCase()}`;
  playSfx('bt_combo_intro', { gain: 0.7 });
}

function checkBattleEnd(game) {
  const b = game.battle;
  if (b.enemies.every(e => e.hp <= 0)) {
    b.phase = 'win'; b.winTime = 0;
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
    enc.cleared = true;
    const xpGain = b.enemies.reduce((s, e) => s + (e.xp || 0), 0);
    const renownGain = b.enemies.reduce((s, e) => s + (e.renown || 0), 0);
    const oreGain = Math.floor(xpGain / 10);
    game.resources.renown += renownGain;
    game.resources.ore += oreGain;
    game.toast(`Victory — +${renownGain} Renown, +${oreGain} Ore`);
  } else {
    const home = CITIES[0];
    game.party.x = home.x; game.party.y = home.y;
    game.party.fromX = home.x; game.party.fromY = home.y;
    game.toast('Defeated — returned to Haventide');
  }
  game.pendingEncounter = null;
  game.battle = null;
  game.setState('overworld');
}

// --- rendering ---
const HERO_X = 260;
const ENEMY_X_BASE = 900;
const HERO_Y_BASE = 340;
const ENEMY_Y_BASE = 300;
const HERO_SPACING = 130;
const ENEMY_SPACING = 140;

function heroPos(i) { return { x: HERO_X, y: HERO_Y_BASE + i * HERO_SPACING - 130 }; }
function enemyPos(i) { return { x: ENEMY_X_BASE, y: ENEMY_Y_BASE + i * ENEMY_SPACING - 140 }; }

function targetX(b, tgt) {
  if (b.heroes.includes(tgt)) return heroPos(b.heroes.indexOf(tgt)).x + 48;
  return enemyPos(b.enemies.indexOf(tgt)).x + 48;
}
function targetY(b, tgt) {
  if (b.heroes.includes(tgt)) return heroPos(b.heroes.indexOf(tgt)).y;
  return enemyPos(b.enemies.indexOf(tgt)).y;
}

export function drawBattle(ctx, game) {
  const b = game.battle;
  const { width: w, height: h } = game;

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
    const p = enemyPos(i);
    if (e.hp <= 0) {
      ctx.globalAlpha = 0.25;
      drawSprite(ctx, `${e.id}_idle`, p.x, p.y, 96, 96);
      ctx.globalAlpha = 1;
      return;
    }
    // flash
    if (e.flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = e.flash / 240 * 0.8;
      drawSprite(ctx, `${e.id}_idle`, p.x, p.y, 96, 96);
      ctx.restore();
    }
    drawSprite(ctx, `${e.id}_idle`, p.x, p.y, 96, 96);
    // HP bar
    drawBar(ctx, p.x, p.y + 104, 96, 8, e.hp / e.maxHp, PALETTE.bad);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '600 11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(e.name, p.x + 48, p.y + 126);
  });

  // draw heroes
  b.heroes.forEach((hero, i) => {
    const p = heroPos(i);
    if (hero.hp <= 0) {
      ctx.globalAlpha = 0.3;
      drawSprite(ctx, `${hero.id}_battle_idle`, p.x, p.y, 96, 96);
      ctx.globalAlpha = 1;
    } else {
      drawSprite(ctx, `${hero.id}_battle_idle`, p.x, p.y, 96, 96);
      if (hero.flash > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = hero.flash / 240 * 0.6;
        drawSprite(ctx, `${hero.id}_battle_idle`, p.x, p.y, 96, 96);
        ctx.restore();
      }
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
    const t = 1 - b.comboFlash / 520;
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

function drawVfx(ctx, v) {
  const t = 1 - v.life / v.maxLife;
  const alpha = Math.min(1, v.life / 120);
  ctx.save();
  ctx.globalAlpha = alpha;
  if (v.kind === 'slash') {
    ctx.strokeStyle = v.color;
    ctx.lineWidth = 3 + (1 - t) * 4;
    ctx.beginPath();
    ctx.moveTo(v.x - 30, v.y - 30 + t * 20);
    ctx.lineTo(v.x + 30, v.y + 30 - t * 20);
    ctx.stroke();
  } else if (v.kind === 'tech' || v.kind === 'void') {
    ctx.fillStyle = v.color;
    ctx.globalAlpha = alpha * 0.4;
    const r = 20 + t * 60;
    ctx.beginPath();
    ctx.arc(v.x, v.y + 20, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = v.color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(v.x, v.y + 20, r, 0, Math.PI * 2);
    ctx.stroke();
  }
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
  });

  // menu
  if (b.menu) drawActionMenu(ctx, game);

  // log tail
  ctx.textAlign = 'right';
  ctx.fillStyle = PALETTE.dim;
  ctx.font = '400 11px ui-monospace, monospace';
  const lines = b.log.slice(-4);
  lines.forEach((l, i) => ctx.fillText(l, w - 16, h - panelH - 14 - (lines.length - 1 - i) * 14));
}

function drawActionMenu(ctx, game) {
  const b = game.battle;
  const m = b.menu;
  const hero = b.heroes[m.heroIdx];
  const { width: w, height: h } = game;

  const mx = w - 280;
  const my = h - 300;

  ctx.fillStyle = 'rgba(7,6,13,0.92)';
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
      { id: 'tech', label: `Tech  (${hero.techs[0].name} · ${hero.techs[0].mp} MP)` },
      { id: 'defend', label: 'Defend' },
    ];
    const sel = m.rootSel || 'attack';
    opts.forEach((o, i) => {
      const y = my + 36 + i * 24;
      const active = o.id === sel;
      const canDo = o.id !== 'tech' || hero.mp >= hero.techs[0].mp;
      ctx.fillStyle = active ? PALETTE.accent : 'transparent';
      if (active) ctx.fillRect(mx + 6, y - 2, 248, 22);
      ctx.fillStyle = !canDo ? PALETTE.dim : active ? PALETTE.bg : PALETTE.ink;
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillText(`${active ? '▸ ' : '  '}${o.label}`, mx + 14, y);
    });
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '400 10px ui-monospace, monospace';
    ctx.fillText('[W/S] select  [Enter] confirm', mx + 12, my + 118);
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
    ctx.fillText('[A/D] cycle  [Enter] fire  [B] back', mx + 12, my + 118);

    // reticle
    const p = enemyPos(m.targetIdx);
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
