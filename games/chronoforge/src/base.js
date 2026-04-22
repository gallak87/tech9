// Chronoforge — Phase 4 base scene.
//
// Fixed-slot settlement (18 slots, 6×3). Click empty slot → building picker
// modal → pick type → deducts cost → places tier 1. Click occupied slot →
// upgrade modal → pay cost → advances tier, sprite swaps automatically.
//
// Economy tick happens in game.js main update (overworld OR base view per spec).
//
// UX simplifications decided in plan (Phase 4 UX decisions):
//   1. Fixed-slot placement (polish phase may upgrade to free placement).
//   2. No workers — buildings tick automatically once placed.
//   3. Single shared base (all cities share this settlement).
//   4. No raids in v1 (walls are visual/tier-progress only).

import { drawSprite } from './sprites.js';
import { playSfx } from './audio.js';

export const TICK_MS = 5000;

// --- building catalog (gamedesign-output.md §3) ---
// `yields[tier]`     — resource delta applied each tick when building is at that tier.
// `tierCost[tier]`   — resource cost to **build or upgrade into** that tier.
// `tierGate[tier]`   — tech tier required to reach that building tier.
//                      null = no gate beyond resource cost.

export const BUILDINGS = {
  town_center: {
    name: 'Town Center',
    blurb: 'Settlement core. Upgrading it advances the tech tier rank of the city.',
    tileSize: 4,
    sprite: (t) => `town_center_t${t}`,
    yields:   [null, null,             null,                         null,                         null],
    tierCost: [null, null,             { ore: 120, food: 40 },       { ore: 300, energy: 40 },     { ore: 700, energy: 120 }],
    tierGate: [null, null,             null,                         null,                         null],
  },
  farm: {
    name: 'Farm',
    blurb: 'Generates food each tick. Food feeds heals and training.',
    tileSize: 2,
    sprite: (t) => `farm_t${t}`,
    yields:   [null, { food: 2 },      { food: 3 },                  { food: 5 },                  { food: 8 }],
    tierCost: [null, { ore: 20 },      { ore: 60 },                  { ore: 150, energy: 10 },     { ore: 340, energy: 45 }],
    tierGate: [null, null,             null,                         'Ascendant',                  'Transcendent'],
  },
  mine: {
    name: 'Mine',
    blurb: 'Extracts ore each tick. Ore powers all upgrades.',
    tileSize: 3,
    sprite: (t) => `mine_t${t}`,
    yields:   [null, { ore: 1 },       { ore: 2 },                   { ore: 3 },                   { ore: 4 }],
    tierCost: [null, { ore: 30 },      { ore: 80 },                  { ore: 200, energy: 15 },     { ore: 450, energy: 55 }],
    tierGate: [null, null,             null,                         'Ascendant',                  'Transcendent'],
  },
  energy_extractor: {
    name: 'Energy Extractor',
    blurb: 'Generates energy each tick. Requires Reclaimer tier.',
    tileSize: 2,
    sprite: (t) => `energy_extractor_t${t}`,
    yields:   [null, { energy: 1 },    { energy: 2 },                { energy: 3 },                { energy: 5 }],
    tierCost: [null, { ore: 50 },      { ore: 140, energy: 5 },      { ore: 320, energy: 40 },    { ore: 700, energy: 110 }],
    tierGate: [null, 'Reclaimer',      'Reclaimer',                  'Ascendant',                  'Transcendent'],
  },
  barracks: {
    name: 'Barracks',
    blurb: 'Hero training grounds. Unlocks higher unit cap per tier.',
    tileSize: 2,
    sprite: (t) => `barracks_t${t}`,
    yields:   [null, null,             null,                         null,                         null],
    tierCost: [null, { ore: 40, food: 20 }, { ore: 120, food: 40 }, { ore: 280, energy: 25 },   { ore: 640, energy: 80 }],
    tierGate: [null, 'Reclaimer',      'Reclaimer',                  'Ascendant',                  'Transcendent'],
  },
  forge: {
    name: 'Forge',
    blurb: 'Crafts gear. Unlocks higher gear tiers.',
    tileSize: 2,
    sprite: (t) => `forge_t${t}`,
    yields:   [null, null,             null,                         null,                         null],
    tierCost: [null, { ore: 60 },      { ore: 160, energy: 10 },     { ore: 360, energy: 35 },    { ore: 800, energy: 100 }],
    tierGate: [null, 'Ascendant',      'Ascendant',                  'Ascendant',                  'Transcendent'],
  },
  research_lab: {
    name: 'Research Lab',
    blurb: 'Researches techs and passives. Gates Transcendent tier.',
    tileSize: 2,
    sprite: (t) => `research_lab_t${t}`,
    yields:   [null, { renown: 1 },    { renown: 2 },                { renown: 3 },                { renown: 5 }],
    tierCost: [null, { ore: 80, energy: 30 }, { ore: 200, energy: 50 }, { ore: 450, energy: 90 }, { ore: 900, energy: 160 }],
    tierGate: [null, 'Ascendant',      'Ascendant',                  'Ascendant',                  'Transcendent'],
  },
  wall: {
    name: 'Wall',
    blurb: 'Fortification. Raids come post-release; cosmetic tier flair for now.',
    tileSize: 2,
    sprite: (t) => `wall_t${t}`,
    yields:   [null, null,             null,                         null,                         null],
    tierCost: [null, { ore: 20 },      { ore: 50 },                  { ore: 120, energy: 10 },    { ore: 280, energy: 40 }],
    tierGate: [null, null,             null,                         'Ascendant',                  'Transcendent'],
  },
};

const BUILDING_ORDER = ['town_center', 'farm', 'mine', 'energy_extractor', 'barracks', 'forge', 'research_lab'];

// --- tier ladder ---
const TIER_ORDER = ['Survivor', 'Reclaimer', 'Ascendant', 'Transcendent'];

const TIER_UP_REQS = {
  Reclaimer:    { renown: 100, oreSpent: 50 },
  Ascendant:    { renown: 300, researchBuilt: true },
  Transcendent: { renown: 800, brokenCrown: true },
};

// --- scene state ---
export function initBase() {
  const slots = [];
  for (let i = 0; i < 18; i++) slots.push({ building: null });
  // slot 0 is pre-placed Town Center T1 (free start).
  slots[0].building = { type: 'town_center', tier: 1 };
  return {
    slots,
    lastTickAt: 0,
    pickerOpen: false,
    upgradeOpen: false,
    activeSlot: -1,
    hoverSlot: -1,
    pickerHover: -1,
    pickerCursor: 0,
    upgradeCursor: 0, // 0 = UPGRADE, 1 = DEMOLISH
    msg: null,
    msgExpire: 0,
    researchBuilt: false,
    oreSpent: 0,
    version: 0,
  };
}

export function initTierState() {
  return {
    tier: 'Survivor',
    tierUpAvailable: false,
  };
}

function canAfford(res, cost) {
  if (!cost) return true;
  for (const k in cost) if ((res[k] || 0) < cost[k]) return false;
  return true;
}

function pay(game, cost) {
  if (!cost) return;
  for (const k in cost) game.resources[k] -= cost[k];
  if (cost.ore) game.base.oreSpent = (game.base.oreSpent || 0) + cost.ore;
}

function meetsTierGate(game, gate) {
  if (!gate) return true;
  return TIER_ORDER.indexOf(game.tier) >= TIER_ORDER.indexOf(gate);
}

function describeCost(cost) {
  if (!cost) return 'free';
  return Object.entries(cost).map(([k, v]) => `${v} ${k}`).join(' + ');
}

// --- tick loop (called from game.js main update) ---
export function maybeTick(game, nowMs) {
  if (nowMs - game.base.lastTickAt < TICK_MS) return;
  game.base.lastTickAt = nowMs;

  for (const slot of game.base.slots) {
    const b = slot.building;
    if (!b) continue;
    const def = BUILDINGS[b.type];
    const y = def.yields[b.tier];
    if (!y) continue;
    for (const k in y) game.resources[k] = (game.resources[k] || 0) + y[k];
  }
  refreshTierUpAvailable(game);
}

export function refreshTierUpAvailable(game) {
  const nextIdx = TIER_ORDER.indexOf(game.tier) + 1;
  if (nextIdx >= TIER_ORDER.length) { game.tierUpAvailable = false; return; }
  const nextTier = TIER_ORDER[nextIdx];
  const req = TIER_UP_REQS[nextTier];
  let ok = (game.resources.renown || 0) >= req.renown;
  if (req.oreSpent) ok = ok && (game.base.oreSpent || 0) >= req.oreSpent;
  if (req.researchBuilt) ok = ok && game.base.researchBuilt;
  if (req.brokenCrown) ok = ok && !!game.quests?.brokenCrown;
  game.tierUpAvailable = ok;
}

export function tryTierUp(game) {
  refreshTierUpAvailable(game);
  if (!game.tierUpAvailable) return;
  const nextIdx = TIER_ORDER.indexOf(game.tier) + 1;
  game.tier = TIER_ORDER[nextIdx];
  playSfx('ui_tab', { pitch: 1.3, gain: 0.8 });
  toast(game.base, `Tech tier advanced: ${game.tier}`);
  refreshTierUpAvailable(game);
}

function toast(base, msg) {
  base.msg = msg;
  base.msgExpire = performance.now() + 2400;
}

// --- layout helpers ---
function slotGrid(game) {
  const { width: w, height: h } = game;
  const cols = 6, rows = 3;
  const cellW = 140, cellH = 150;
  const gap = 14;
  const totalW = cols * cellW + (cols - 1) * gap;
  const totalH = rows * cellH + (rows - 1) * gap;
  const x0 = Math.floor((w - totalW) / 2);
  const y0 = Math.floor((h - totalH) / 2) + 20;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        x: x0 + c * (cellW + gap),
        y: y0 + r * (cellH + gap),
        w: cellW, h: cellH,
      });
    }
  }
  return cells;
}

function pickerRect(game) {
  const w = 560, h = 480;
  return { x: (game.width - w) / 2, y: (game.height - h) / 2, w, h };
}

function upgradeRect(game) {
  const w = 480, h = 320;
  return { x: (game.width - w) / 2, y: (game.height - h) / 2, w, h };
}

function tierUpBtnRect(game) {
  return { x: game.width - 200, y: 16, w: 180, h: 40 };
}

function backToOverworldBtnRect(game) {
  return { x: 20, y: game.height - 56, w: 200, h: 40 };
}

// --- input ---
export function handleBaseMouseDown(game, mx, my) {
  const b = game.base;

  // modal precedence
  if (b.pickerOpen) {
    handlePickerClick(game, mx, my);
    return;
  }
  if (b.upgradeOpen) {
    handleUpgradeClick(game, mx, my);
    return;
  }

  // tier-up button
  const tubr = tierUpBtnRect(game);
  if (game.tierUpAvailable && hit(mx, my, tubr)) {
    tryTierUp(game);
    return;
  }

  // back button
  if (hit(mx, my, backToOverworldBtnRect(game))) {
    playSfx('ui_click', { gain: 0.6 });
    game.setState('overworld');
    return;
  }

  // slot click
  const cells = slotGrid(game);
  for (let i = 0; i < cells.length; i++) {
    if (!hit(mx, my, cells[i])) continue;
    const slot = b.slots[i];
    if (slot.building) {
      b.upgradeOpen = true;
      b.activeSlot = i;
      b.upgradeCursor = 0;
      playSfx('ui_click', { gain: 0.5 });
    } else {
      b.pickerOpen = true;
      b.activeSlot = i;
      b.pickerCursor = 0;
      playSfx('ui_click', { gain: 0.5 });
    }
    return;
  }
}

export function handleBaseMouseMove(game, mx, my) {
  game.base.hoverSlot = -1;
  game.base.pickerHover = -1;
  if (game.base.pickerOpen) {
    const rects = pickerItemRects(game);
    for (let i = 0; i < rects.length; i++) {
      if (rects[i].type === '__close') continue;
      if (hit(mx, my, rects[i])) { game.base.pickerHover = i; break; }
    }
    return;
  }
  if (game.base.upgradeOpen) return;
  const cells = slotGrid(game);
  for (let i = 0; i < cells.length; i++) {
    if (hit(mx, my, cells[i])) { game.base.hoverSlot = i; break; }
  }
}

export function handleBaseKey(game, k) {
  const b = game.base;
  if (k === 'Escape' || k === 'Tab') {
    if (b.pickerOpen) { b.pickerOpen = false; return true; }
    if (b.upgradeOpen) { b.upgradeOpen = false; return true; }
    return false;
  }
  if (b.pickerOpen) {
    const items = pickerItemRects(game).filter(r => r.type !== '__close');
    const n = items.length;
    if (k === 'ArrowUp' || k === 'w' || k === 'W') {
      b.pickerCursor = (b.pickerCursor - 1 + n) % n;
      return true;
    }
    if (k === 'ArrowDown' || k === 's' || k === 'S') {
      b.pickerCursor = (b.pickerCursor + 1) % n;
      return true;
    }
    if (k === 'Enter' || k === ' ') {
      const item = items[b.pickerCursor];
      if (item) tryBuild(game, b.activeSlot, item.type);
      return true;
    }
    return true;
  }
  if (b.upgradeOpen) {
    if (k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'ArrowRight' || k === 'd' || k === 'D') {
      b.upgradeCursor = b.upgradeCursor === 0 ? 1 : 0;
      return true;
    }
    if (k === 'Enter' || k === ' ') {
      if (b.upgradeCursor === 0) {
        const slot = b.slots[b.activeSlot];
        if (slot?.building) tryUpgrade(game, b.activeSlot);
      } else {
        demolish(game, b.activeSlot);
      }
      return true;
    }
    return true;
  }
  if (k === 'o' || k === 'O') { game.setState('overworld'); return true; }
  if (k === 't' || k === 'T') { tryTierUp(game); return true; }
  return false;
}

function hit(mx, my, r) {
  return mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
}

// --- picker modal click routing ---
function pickerItemRects(game) {
  const mr = pickerRect(game);
  const padX = 24, padY = 74;
  const rowH = 48;
  const rects = [];
  BUILDING_ORDER.forEach((type, i) => {
    if (type === 'town_center') return; // not buildable, only pre-placed
    rects.push({
      x: mr.x + padX, y: mr.y + padY + rects.length * (rowH + 6),
      w: mr.w - padX * 2, h: rowH,
      type,
    });
  });
  // close button
  rects.push({ x: mr.x + mr.w - 36, y: mr.y + 10, w: 24, h: 24, type: '__close' });
  return rects;
}

function handlePickerClick(game, mx, my) {
  const b = game.base;
  const rects = pickerItemRects(game);
  for (const r of rects) {
    if (!hit(mx, my, r)) continue;
    if (r.type === '__close') {
      b.pickerOpen = false;
      return;
    }
    tryBuild(game, b.activeSlot, r.type);
    return;
  }
  // click outside closes
  const mr = pickerRect(game);
  if (!hit(mx, my, mr)) b.pickerOpen = false;
}

function tryBuild(game, slotIdx, type) {
  const b = game.base;
  const def = BUILDINGS[type];
  const cost = def.tierCost[1];
  const gate = def.tierGate[1];
  if (!meetsTierGate(game, gate)) {
    toast(b, `Requires ${gate} tier`);
    playSfx('ui_click', { pitch: 0.6, gain: 0.5 });
    return;
  }
  if (!canAfford(game.resources, cost)) {
    toast(b, `Not enough — need ${describeCost(cost)}`);
    playSfx('ui_click', { pitch: 0.6, gain: 0.5 });
    return;
  }
  pay(game, cost);
  b.slots[slotIdx].building = { type, tier: 1 };
  if (type === 'research_lab') b.researchBuilt = true;
  b.version++;
  b.pickerOpen = false;
  refreshTierUpAvailable(game);
  playSfx('ui_tab', { pitch: 1.15, gain: 0.7 });
  toast(b, `Built ${def.name}`);
}

// --- upgrade modal click routing ---
function upgradeBtnRects(game) {
  const mr = upgradeRect(game);
  return {
    upgrade: { x: mr.x + 40, y: mr.y + mr.h - 70, w: 180, h: 44 },
    demolish: { x: mr.x + mr.w - 220, y: mr.y + mr.h - 70, w: 180, h: 44 },
    close: { x: mr.x + mr.w - 36, y: mr.y + 10, w: 24, h: 24 },
  };
}

function handleUpgradeClick(game, mx, my) {
  const b = game.base;
  const rects = upgradeBtnRects(game);
  if (hit(mx, my, rects.close)) { b.upgradeOpen = false; return; }
  if (hit(mx, my, rects.upgrade)) { tryUpgrade(game, b.activeSlot); return; }
  if (hit(mx, my, rects.demolish)) { demolish(game, b.activeSlot); return; }
  if (!hit(mx, my, upgradeRect(game))) b.upgradeOpen = false;
}

function tryUpgrade(game, slotIdx) {
  const b = game.base;
  const slot = b.slots[slotIdx];
  if (!slot?.building) return;
  const { type, tier } = slot.building;
  const def = BUILDINGS[type];
  const nextTier = tier + 1;
  if (nextTier > 4) { toast(b, 'Max tier reached'); return; }
  const cost = def.tierCost[nextTier];
  const gate = def.tierGate[nextTier];
  if (!meetsTierGate(game, gate)) {
    toast(b, `Requires ${gate} tier`);
    playSfx('ui_click', { pitch: 0.6, gain: 0.5 });
    return;
  }
  if (!canAfford(game.resources, cost)) {
    toast(b, `Not enough — need ${describeCost(cost)}`);
    playSfx('ui_click', { pitch: 0.6, gain: 0.5 });
    return;
  }
  pay(game, cost);
  slot.building.tier = nextTier;
  b.version++;
  if (type === 'town_center') {
    // TC upgrade grants renown to fuel tier advancement
    const renownAward = [0, 0, 40, 120, 320][nextTier];
    game.resources.renown = (game.resources.renown || 0) + renownAward;
    toast(b, `Town Center advanced to tier ${nextTier} (+${renownAward} renown)`);
  } else {
    toast(b, `${def.name} upgraded to tier ${nextTier}`);
  }
  refreshTierUpAvailable(game);
  playSfx('ui_tab', { pitch: 1.15, gain: 0.7 });
}

function demolish(game, slotIdx) {
  const b = game.base;
  const slot = b.slots[slotIdx];
  if (!slot?.building) return;
  if (slot.building.type === 'town_center') {
    toast(b, 'Town Center cannot be demolished');
    playSfx('ui_click', { pitch: 0.6, gain: 0.5 });
    return;
  }
  if (slot.building.type === 'research_lab') b.researchBuilt = false;
  slot.building = null;
  b.version++;
  b.upgradeOpen = false;
  refreshTierUpAvailable(game);
  playSfx('ui_click', { gain: 0.5 });
  toast(b, 'Demolished');
}

// --- rendering ---
const PALETTE = {
  bg:        '#07060d',
  panel:     '#120a22',
  grid:      '#1d1638',
  ink:       '#e7e5ff',
  dim:       '#8a83b8',
  accent:    '#ff2dd4',
  cyan:      '#22e3ff',
  yellow:    '#ffd23f',
  green:     '#3fc870',
  red:       '#ff5e5e',
  slot:      '#1a1236',
  slotHover: '#2a1a4a',
  slotBorder: '#3a2a68',
};

export function drawBaseScene(ctx, game) {
  const { width: w, height: h } = game;

  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, w, h);
  drawGrid(ctx, w, h);
  drawScanlines(ctx, w, h);

  // title & tier badge
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = PALETTE.accent;
  ctx.shadowColor = PALETTE.accent;
  ctx.shadowBlur = 14;
  ctx.font = '700 28px system-ui, sans-serif';
  ctx.fillText('CITY BASE', w / 2, 20);
  ctx.shadowBlur = 0;
  ctx.fillStyle = PALETTE.cyan;
  ctx.font = '600 13px ui-monospace, monospace';
  ctx.fillText(`TIER: ${game.tier.toUpperCase()}`, w / 2, 54);

  // resources HUD strip
  drawResourcesHUD(ctx, game);

  // tier-up button
  if (game.tierUpAvailable) drawTierUpBtn(ctx, game);

  // slot grid
  const cells = slotGrid(game);
  cells.forEach((cell, i) => drawSlot(ctx, game, cell, i));

  // back button
  drawBackBtn(ctx, game);

  // hint
  ctx.fillStyle = PALETTE.dim;
  ctx.textAlign = 'center';
  ctx.font = '400 12px ui-monospace, monospace';
  ctx.fillText('click a slot to build or upgrade   [T] tier-up   [O] overworld   [Esc/Tab] menu', w / 2, h - 14);

  // modals
  if (game.base.pickerOpen) drawPicker(ctx, game);
  if (game.base.upgradeOpen) drawUpgrade(ctx, game);

  // toast renders above modals so "can't afford" feedback is visible
  if (game.base.msg && performance.now() < game.base.msgExpire) {
    drawToast(ctx, game, game.base.msg);
  }
}

export function drawBaseModals(ctx, game) {
  if (game.base.pickerOpen) drawPicker(ctx, game);
  if (game.base.upgradeOpen) drawUpgrade(ctx, game);
  if (game.base.msg && performance.now() < game.base.msgExpire) {
    drawToast(ctx, game, game.base.msg);
  }
}

let _yieldsCache = null;
let _yieldsCacheVersion = -1;
export function aggregateYields(game) {
  if (_yieldsCacheVersion === game.base.version && _yieldsCache) return _yieldsCache;
  const totals = { food: 0, ore: 0, energy: 0, renown: 0 };
  for (const slot of game.base.slots) {
    const b = slot.building;
    if (!b) continue;
    const y = BUILDINGS[b.type].yields[b.tier];
    if (!y) continue;
    for (const k in y) totals[k] = (totals[k] || 0) + y[k];
  }
  _yieldsCache = totals;
  _yieldsCacheVersion = game.base.version;
  return totals;
}

function drawResourcesHUD(ctx, game) {
  const rates = aggregateYields(game);
  const items = [
    { key: 'food',   label: 'FOOD',   color: PALETTE.green },
    { key: 'ore',    label: 'ORE',    color: '#b9c1d9' },
    { key: 'energy', label: 'ENERGY', color: PALETTE.yellow },
    { key: 'renown', label: 'RENOWN', color: PALETTE.accent },
  ];
  const x0 = 20, y0 = 20, gap = 140;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  items.forEach((it, i) => {
    const x = x0 + i * gap;
    drawSprite(ctx, `icon_${it.key}`, x, y0, 14, 14);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '600 10px ui-monospace, monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(it.label, x + 17, y0 + 2);
    ctx.fillStyle = it.color;
    ctx.font = '700 22px ui-monospace, monospace';
    ctx.fillText(String(game.resources[it.key] | 0), x, y0 + 17);

    // subtle rate line — low contrast, small, only shown when something ticks
    const rate = rates[it.key];
    if (rate > 0) {
      ctx.fillStyle = 'rgba(138,131,184,0.7)';
      ctx.font = '500 10px ui-monospace, monospace';
      ctx.fillText(`+${rate}/tick`, x, y0 + 40);
    }
  });
}

function drawTierUpBtn(ctx, game) {
  const r = tierUpBtnRect(game);
  ctx.fillStyle = PALETTE.accent;
  ctx.shadowColor = PALETTE.accent;
  ctx.shadowBlur = 12;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  ctx.fillStyle = '#07060d';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 13px ui-monospace, monospace';
  ctx.fillText('◆ ADVANCE TIER [T]', r.x + r.w / 2, r.y + r.h / 2);
}

function drawBackBtn(ctx, game) {
  const r = backToOverworldBtnRect(game);
  ctx.strokeStyle = PALETTE.slotBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  ctx.fillStyle = PALETTE.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 12px ui-monospace, monospace';
  ctx.fillText('← OVERWORLD [O]', r.x + r.w / 2, r.y + r.h / 2);
}

const YIELD_COLOR = { food: PALETTE.green, ore: '#b9c1d9', energy: PALETTE.yellow, renown: PALETTE.accent };

function drawSlot(ctx, game, cell, idx) {
  const slot = game.base.slots[idx];
  const hovered = game.base.hoverSlot === idx;

  ctx.fillStyle = hovered ? PALETTE.slotHover : PALETTE.slot;
  ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
  ctx.strokeStyle = hovered ? PALETTE.accent : PALETTE.slotBorder;
  ctx.lineWidth = hovered ? 2 : 1;
  ctx.strokeRect(cell.x + 0.5, cell.y + 0.5, cell.w - 1, cell.h - 1);

  if (slot.building) {
    const { type, tier } = slot.building;
    const def = BUILDINGS[type];
    const sprW = 96, sprH = 96;
    drawSprite(ctx, def.sprite(tier), cell.x + (cell.w - sprW) / 2, cell.y + 16, sprW, sprH);

    ctx.fillStyle = PALETTE.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(def.name, cell.x + cell.w / 2, cell.y + 120);

    // tier chip
    ctx.fillStyle = PALETTE.cyan;
    ctx.font = '700 10px ui-monospace, monospace';
    ctx.fillText(`T${tier}`, cell.x + cell.w / 2, cell.y + 138);

    // yield + progress bar at the bottom
    const y = def.yields[tier];
    const barX = cell.x + 10, barY = cell.y + cell.h - 18, barW = cell.w - 20, barH = 8;
    if (y) {
      const [resKey, resVal] = Object.entries(y)[0];
      const color = YIELD_COLOR[resKey] || PALETTE.cyan;
      const progress = Math.min(1, (performance.now() - game.base.lastTickAt) / TICK_MS);

      // yield label
      ctx.fillStyle = color;
      ctx.font = '600 10px ui-monospace, monospace';
      const bits = Object.entries(y).map(([k, v]) => `+${v} ${k}`).join(' ');
      ctx.fillText(bits, cell.x + cell.w / 2, cell.y + 152);

      // progress bar
      ctx.fillStyle = '#0f0920';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = color;
      ctx.fillRect(barX, barY, barW * progress, barH);
      ctx.strokeStyle = PALETTE.slotBorder;
      ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, barH - 1);
    } else {
      ctx.fillStyle = PALETTE.dim;
      ctx.font = '500 10px ui-monospace, monospace';
      ctx.fillText('no passive yield', cell.x + cell.w / 2, cell.y + 152);
    }
  } else {
    // empty slot: plus glyph + hint
    ctx.fillStyle = PALETTE.dim;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 40px system-ui, sans-serif';
    ctx.fillText('+', cell.x + cell.w / 2, cell.y + cell.h / 2 - 18);

    ctx.font = '600 11px ui-monospace, monospace';
    ctx.fillStyle = PALETTE.cyan;
    ctx.fillText('BUILD TO EARN', cell.x + cell.w / 2, cell.y + cell.h / 2 + 16);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '400 10px ui-monospace, monospace';
    ctx.fillText('click to choose', cell.x + cell.w / 2, cell.y + cell.h / 2 + 34);

    // dim empty progress track for visual parity with built slots
    const barX = cell.x + 10, barY = cell.y + cell.h - 18, barW = cell.w - 20, barH = 8;
    ctx.fillStyle = '#0f0920';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.strokeStyle = PALETTE.slotBorder;
    ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, barH - 1);
  }
}

function drawPicker(ctx, game) {
  const mr = pickerRect(game);
  // backdrop
  ctx.fillStyle = 'rgba(7,6,13,0.78)';
  ctx.fillRect(0, 0, game.width, game.height);
  // panel
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(mr.x, mr.y, mr.w, mr.h);
  ctx.strokeStyle = PALETTE.accent;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(mr.x + 0.5, mr.y + 0.5, mr.w - 1, mr.h - 1);

  // title
  ctx.fillStyle = PALETTE.accent;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = '700 18px system-ui, sans-serif';
  ctx.fillText('SELECT BUILDING', mr.x + 22, mr.y + 20);
  ctx.fillStyle = PALETTE.dim;
  ctx.font = '500 11px ui-monospace, monospace';
  ctx.fillText(`SLOT ${game.base.activeSlot + 1} / 18`, mr.x + 22, mr.y + 44);

  // close
  ctx.fillStyle = PALETTE.ink;
  ctx.textAlign = 'center';
  ctx.font = '700 18px system-ui, sans-serif';
  ctx.fillText('×', mr.x + mr.w - 24, mr.y + 20);

  // items
  const rects = pickerItemRects(game);
  rects.forEach((r, i) => {
    if (r.type === '__close') return;
    const def = BUILDINGS[r.type];
    const cost = def.tierCost[1];
    const gate = def.tierGate[1];
    const affordable = canAfford(game.resources, cost);
    const gateOK = meetsTierGate(game, gate);
    const enabled = affordable && gateOK;
    const hovered = game.base.pickerHover === i || game.base.pickerCursor === i;

    if (hovered && enabled) {
      ctx.fillStyle = '#2a1a4a';
    } else if (hovered) {
      ctx.fillStyle = '#1a0f2e';
    } else {
      ctx.fillStyle = enabled ? '#1a1236' : '#0f0920';
    }
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = hovered && enabled ? PALETTE.accent : enabled ? PALETTE.slotBorder : '#1d1638';
    ctx.lineWidth = hovered ? 2 : 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    ctx.lineWidth = 1;

    // tier-1 sprite thumbnail
    drawSprite(ctx, def.sprite(1), r.x + 6, r.y + 6, 36, 36);

    ctx.fillStyle = enabled ? PALETTE.ink : PALETTE.dim;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.fillText(def.name, r.x + 52, r.y + 8);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '400 10px ui-monospace, monospace';
    ctx.fillText(def.blurb, r.x + 52, r.y + 26);

    // cost / gate readout on right
    ctx.textAlign = 'right';
    if (!gateOK) {
      ctx.fillStyle = PALETTE.red;
      ctx.font = '600 11px ui-monospace, monospace';
      ctx.fillText(`needs ${gate}`, r.x + r.w - 10, r.y + 10);
    } else {
      ctx.fillStyle = affordable ? PALETTE.green : PALETTE.red;
      ctx.font = '600 11px ui-monospace, monospace';
      ctx.fillText(describeCost(cost), r.x + r.w - 10, r.y + 10);
    }
  });
}

function drawUpgrade(ctx, game) {
  const slot = game.base.slots[game.base.activeSlot];
  if (!slot?.building) return;
  const { type, tier } = slot.building;
  const def = BUILDINGS[type];
  const mr = upgradeRect(game);

  ctx.fillStyle = 'rgba(7,6,13,0.78)';
  ctx.fillRect(0, 0, game.width, game.height);

  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(mr.x, mr.y, mr.w, mr.h);
  ctx.strokeStyle = PALETTE.cyan;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(mr.x + 0.5, mr.y + 0.5, mr.w - 1, mr.h - 1);

  // title
  ctx.fillStyle = PALETTE.cyan;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = '700 18px system-ui, sans-serif';
  ctx.fillText(`${def.name.toUpperCase()}  —  TIER ${tier}`, mr.x + 22, mr.y + 20);

  // close
  ctx.fillStyle = PALETTE.ink;
  ctx.textAlign = 'center';
  ctx.font = '700 18px system-ui, sans-serif';
  ctx.fillText('×', mr.x + mr.w - 24, mr.y + 20);

  // current stats
  ctx.fillStyle = PALETTE.dim;
  ctx.textAlign = 'left';
  ctx.font = '400 11px ui-monospace, monospace';
  ctx.fillText(def.blurb, mr.x + 22, mr.y + 54);

  const curY = def.yields[tier];
  ctx.fillStyle = PALETTE.ink;
  ctx.font = '600 12px ui-monospace, monospace';
  ctx.fillText('current yield:', mr.x + 22, mr.y + 90);
  ctx.fillStyle = PALETTE.green;
  ctx.fillText(curY ? Object.entries(curY).map(([k, v]) => `+${v} ${k}`).join('  ') : 'no passive yield', mr.x + 140, mr.y + 90);

  // next tier line
  if (tier < 4) {
    const nextTier = tier + 1;
    const nextY = def.yields[nextTier];
    const cost = def.tierCost[nextTier];
    const gate = def.tierGate[nextTier];
    const affordable = canAfford(game.resources, cost);
    const gateOK = meetsTierGate(game, gate);

    ctx.fillStyle = PALETTE.ink;
    ctx.fillText('after upgrade:', mr.x + 22, mr.y + 114);
    ctx.fillStyle = nextY ? PALETTE.green : PALETTE.dim;
    ctx.fillText(nextY ? Object.entries(nextY).map(([k, v]) => `+${v} ${k}`).join('  ') : 'no passive yield', mr.x + 140, mr.y + 114);

    ctx.fillStyle = PALETTE.ink;
    ctx.fillText('cost:', mr.x + 22, mr.y + 138);
    ctx.fillStyle = affordable ? PALETTE.green : PALETTE.red;
    ctx.fillText(describeCost(cost), mr.x + 140, mr.y + 138);

    if (!gateOK) {
      ctx.fillStyle = PALETTE.red;
      ctx.font = '600 12px ui-monospace, monospace';
      ctx.fillText(`requires ${gate} tier`, mr.x + 22, mr.y + 168);
    }
  } else {
    ctx.fillStyle = PALETTE.yellow;
    ctx.fillText('TIER 4 — MAX REACHED', mr.x + 22, mr.y + 138);
  }

  // buttons
  const btns = upgradeBtnRects(game);
  const nextTier = tier + 1;
  const nextCost = nextTier <= 4 ? def.tierCost[nextTier] : null;
  const nextGate = nextTier <= 4 ? def.tierGate[nextTier] : null;
  const upgradeEnabled = nextTier <= 4 && canAfford(game.resources, nextCost) && meetsTierGate(game, nextGate);

  // upgrade — three visual states: enabled (cyan), disabled (muted panel + hatched feel), max
  const maxed = nextTier > 4;
  const upgSel = game.base.upgradeCursor === 0;
  ctx.fillStyle = maxed ? '#0f0920' : upgradeEnabled ? PALETTE.cyan : '#2a1a4a';
  ctx.fillRect(btns.upgrade.x, btns.upgrade.y, btns.upgrade.w, btns.upgrade.h);
  ctx.strokeStyle = upgSel ? PALETTE.ink : upgradeEnabled ? PALETTE.ink : PALETTE.slotBorder;
  ctx.lineWidth = upgSel ? 3 : upgradeEnabled ? 2 : 1;
  ctx.strokeRect(btns.upgrade.x + 0.5, btns.upgrade.y + 0.5, btns.upgrade.w - 1, btns.upgrade.h - 1);
  ctx.lineWidth = 1;
  ctx.fillStyle = upgradeEnabled ? '#07060d' : PALETTE.dim;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 13px ui-monospace, monospace';
  const label = maxed
    ? 'MAX TIER'
    : upgradeEnabled
      ? '▲ UPGRADE'
      : !meetsTierGate(game, nextGate)
        ? `▲ NEEDS ${nextGate.toUpperCase()}`
        : '▲ NOT ENOUGH';
  ctx.fillText(label, btns.upgrade.x + btns.upgrade.w / 2, btns.upgrade.y + btns.upgrade.h / 2);

  // demolish
  const canDemolish = type !== 'town_center';
  const demSel = game.base.upgradeCursor === 1;
  ctx.fillStyle = canDemolish ? '#2a0e14' : '#0f0920';
  ctx.fillRect(btns.demolish.x, btns.demolish.y, btns.demolish.w, btns.demolish.h);
  ctx.strokeStyle = demSel ? PALETTE.red : canDemolish ? PALETTE.red : PALETTE.slotBorder;
  ctx.lineWidth = demSel ? 3 : 1;
  ctx.strokeRect(btns.demolish.x + 0.5, btns.demolish.y + 0.5, btns.demolish.w - 1, btns.demolish.h - 1);
  ctx.lineWidth = 1;
  ctx.fillStyle = canDemolish ? PALETTE.red : PALETTE.dim;
  ctx.font = '700 13px ui-monospace, monospace';
  ctx.fillText('✕ DEMOLISH', btns.demolish.x + btns.demolish.w / 2, btns.demolish.y + btns.demolish.h / 2);
}

function drawToast(ctx, game, msg) {
  const w = 360, h = 38;
  const x = (game.width - w) / 2;
  const y = game.height - 120;
  ctx.fillStyle = 'rgba(18,10,34,0.92)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = PALETTE.accent;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = PALETTE.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillText(msg, x + w / 2, y + h / 2);
}

function drawGrid(ctx, w, h) {
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < w; x += 32) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let y = 0; y < h; y += 32) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();
}

function drawScanlines(ctx, w, h) {
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
}
