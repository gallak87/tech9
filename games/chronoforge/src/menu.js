// Chronoforge — Unified pause/menu overlay.
// Tabs: Map, Party, Inventory, Skills, Quests, Save, Settings.
// Map tab is fully live: pan (drag / WASD / arrows), zoom (wheel / +/-),
// fog-of-war, fast-travel on click to unlocked cities.

import { TILE, MAP_W, MAP_H, tilesOf, getMap, MAPS } from './world.js';
import { getMapBackdrop } from './devWorld.js';
import { spriteSettings, drawSprite } from './sprites.js';
import {
  HERO_DEFS, ITEM_DEFS, SKILL_TREES, QUEST_DEFS,
  computeStats, equipItem, unequipItem, spendSkillPoint,
  saveGame, loadGame, hasSave, getSaveMeta, deleteSave,
} from './progression.js';

export const TABS = ['Map', 'Party', 'Inventory', 'Skills', 'Quests', 'Save', 'Settings'];
const TAB_ICONS = TABS.map(n => `tab_${n.toLowerCase()}`);

const PALETTE = {
  bg: '#07060d', bgAlt: '#120a22', panel: '#1a1232',
  ink: '#e7e5ff', dim: '#8a83b8',
  accent: '#ff2dd4', accent2: '#22e3ff', warn: '#ffd23f',
  grid: '#1d1638', fog: 'rgba(7,6,13,0.85)',
};

export const menuState = {
  open: false,
  tab: 0,
  prevTab: 0,
  tabChangeTime: -9999,
  tabDir: 1,
  // map tab
  map: {
    zoom: 1.4,
    cx: 240,
    cy: 480,
    dragging: false,
    dragLastX: 0,
    dragLastY: 0,
  },
  hoverCity: null,
  // inventory tab
  inv: {
    heroIdx: 0,
    selectedItemIdx: -1,  // index into game.inventory (-1 = none)
    dragItemIdx: -1,      // index being dragged (-1 = none)
    dragX: 0, dragY: 0,
    dragStartX: 0, dragStartY: 0,
    hoverSlot: null,      // { heroId, slot }
  },
  // skills tab
  skills: { heroIdx: 0 },
  // quests tab
  quests: { selectedIdx: 0 },
  // save tab
  save: { msg: '', msgExpire: 0 },
};

function resetMapView(game) {
  const mapId = game?.party?.mapId;
  const node = mapId && WORLD_NODE_POS[mapId];
  menuState.map.zoom = 1.4;
  menuState.map.cx = node ? node.vx : 240;
  menuState.map.cy = node ? node.vy : 480;
  menuState.map.dragging = false;
}

const TAB_SLIDE_MS = 180;

function setTab(next, game) {
  if (next === menuState.tab) return;
  menuState.prevTab = menuState.tab;
  menuState.tabDir = next > menuState.tab ? 1 : -1;
  menuState.tab = next;
  menuState.tabChangeTime = game ? game.time : performance.now();
}

export function openMenu(game) { menuState.open = true; resetMapView(game); }
export function closeMenu() { menuState.open = false; menuState.map.dragging = false; }
export function toggleMenu(game) { menuState.open ? closeMenu() : openMenu(game); }

// --- keyboard input routed from game.js when open ---
export function handleMenuKey(key, game) {
  const k = key;
  if (k === 'ArrowLeft' || k === 'q' || k === 'Q') {
    setTab((menuState.tab - 1 + TABS.length) % TABS.length, game);
    return true;
  }
  if (k === 'ArrowRight' || k === 'e' || k === 'E') {
    setTab((menuState.tab + 1) % TABS.length, game);
    return true;
  }
  if (/^[1-7]$/.test(k)) {
    setTab(parseInt(k, 10) - 1, game);
    return true;
  }
  // Map tab panning via WASD when on Map tab
  if (TABS[menuState.tab] === 'Map') {
    const pan = 48 / menuState.map.zoom;
    if (k === 'w' || k === 'W' || k === 'ArrowUp') menuState.map.cy -= pan;
    else if (k === 's' || k === 'S' || k === 'ArrowDown') menuState.map.cy += pan;
    else if (k === 'a' || k === 'A') menuState.map.cx -= pan;
    else if (k === 'd' || k === 'D') menuState.map.cx += pan;
    else if (k === '+' || k === '=') menuState.map.zoom = Math.min(2.5, menuState.map.zoom * 1.15);
    else if (k === '-' || k === '_') menuState.map.zoom = Math.max(0.3, menuState.map.zoom / 1.15);
    else if (k === 'r' || k === 'R' || k === '0') resetMapView(game);
  }
  return true;
}

// --- mouse input ---
export function handleMenuMouseDown(mx, my, game) {
  if (TABS[menuState.tab] === 'Map') {
    const resetBtn = resetBtnRect(game);
    if (pointInRect(mx, my, resetBtn)) {
      resetMapView(game);
      return true;
    }
    const rect = mapRect(game);
    if (pointInRect(mx, my, rect)) {
      const city = pickCity(mx, my, rect, game);
      if (city && (city.unlocked || city.id === 'haventide')) {
        fastTravel(city, game);
        return true;
      }
      menuState.map.dragging = true;
      menuState.map.dragLastX = mx;
      menuState.map.dragLastY = my;
      return true;
    }
  }

  if (TABS[menuState.tab] === 'Inventory') {
    return handleInvMouseDown(mx, my, game);
  }
  if (TABS[menuState.tab] === 'Skills') {
    return handleSkillsMouseDown(mx, my, game);
  }
  if (TABS[menuState.tab] === 'Quests') {
    return handleQuestsMouseDown(mx, my, game);
  }
  if (TABS[menuState.tab] === 'Save') {
    return handleSaveMouseDown(mx, my, game);
  }

  if (TABS[menuState.tab] === 'Settings') {
    const toggle = settingsToggleRect(game);
    if (pointInRect(mx, my, toggle)) {
      spriteSettings.forcePlaceholders = !spriteSettings.forcePlaceholders;
      return true;
    }
  }

  // tab bar
  const tabRects = tabBarRects(game);
  for (let i = 0; i < tabRects.length; i++) {
    if (pointInRect(mx, my, tabRects[i])) {
      setTab(i, game);
      return true;
    }
  }
  return false;
}

export function handleMenuMouseMove(mx, my, game) {
  if (menuState.map.dragging) {
    const dx = mx - menuState.map.dragLastX;
    const dy = my - menuState.map.dragLastY;
    const worldPerPx = 1 / mapScale(game);
    menuState.map.cx -= dx * worldPerPx;
    menuState.map.cy -= dy * worldPerPx;
    menuState.map.dragLastX = mx;
    menuState.map.dragLastY = my;
  } else if (TABS[menuState.tab] === 'Map') {
    const rect = mapRect(game);
    menuState.hoverCity = pickCity(mx, my, rect, game);
  }
  // update drag position for inventory
  if (menuState.inv.dragItemIdx >= 0) {
    menuState.inv.dragX = mx;
    menuState.inv.dragY = my;
    // detect which equip slot is hovered
    menuState.inv.hoverSlot = pickEquipSlot(mx, my, game);
  }
}

export function handleMenuMouseUp(mx, my, game) {
  menuState.map.dragging = false;
  if (menuState.inv.dragItemIdx >= 0 && game) {
    const inv = menuState.inv;
    const target = pickEquipSlot(mx, my, game);
    if (target) {
      if (equipItem(game, target.heroId, target.slot, inv.dragItemIdx)) {
        inv.heroIdx = target.heroIdx;
        inv.selectedItemIdx = -1;
      }
    }
    inv.dragItemIdx = -1;
    inv.hoverSlot = null;
  }
}

export function handleMenuWheel(dy, mx, my, game) {
  if (TABS[menuState.tab] !== 'Map') return false;
  const rect = mapRect(game);
  if (!pointInRect(mx, my, rect)) return false;
  const factor = dy < 0 ? 1.12 : 1 / 1.12;
  menuState.map.zoom = Math.max(0.3, Math.min(2.5, menuState.map.zoom * factor));
  return true;
}

// --- draw ---
export function drawMenu(ctx, game) {
  const { width: w, height: h } = game;

  ctx.fillStyle = 'rgba(7, 6, 13, 0.86)';
  ctx.fillRect(0, 0, w, h);

  const frame = frameRect(game);
  ctx.fillStyle = PALETTE.bgAlt;
  ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
  ctx.strokeStyle = PALETTE.accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(frame.x + 0.5, frame.y + 0.5, frame.w - 1, frame.h - 1);

  // tab bar
  const tabRects = tabBarRects(game);
  TABS.forEach((name, i) => {
    const r = tabRects[i];
    const active = i === menuState.tab;
    ctx.fillStyle = active ? PALETTE.accent : 'transparent';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = active ? PALETTE.accent : PALETTE.grid;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    const iconSz = 32;
    const iconY = r.y + (r.h - iconSz) / 2;
    drawSprite(ctx, TAB_ICONS[i], r.x + 8, iconY, iconSz, iconSz);
    ctx.fillStyle = active ? PALETTE.bg : PALETTE.ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillText(name, r.x + 8 + iconSz + 6, r.y + r.h / 2);
  });

  // body (with slide transition on tab change)
  const slideT = Math.min(1, (game.time - menuState.tabChangeTime) / TAB_SLIDE_MS);
  if (slideT < 1) {
    const eased = 1 - Math.pow(1 - slideT, 3);
    const slideDist = frame.w * 0.12;
    const fadeOut = 1 - eased;
    const offsetOut = eased * slideDist * menuState.tabDir;
    const offsetIn = (1 - eased) * slideDist * menuState.tabDir * -1;
    // outgoing tab fades out + drifts
    ctx.save();
    ctx.globalAlpha = fadeOut;
    ctx.translate(offsetOut, 0);
    drawTabBody(ctx, game, TABS[menuState.prevTab]);
    ctx.restore();
    // incoming tab fades in + drifts into place
    ctx.save();
    ctx.globalAlpha = eased;
    ctx.translate(offsetIn, 0);
    drawTabBody(ctx, game, TABS[menuState.tab]);
    ctx.restore();
  } else {
    drawTabBody(ctx, game, TABS[menuState.tab]);
  }

  // footer hint
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.dim;
  ctx.font = '400 11px ui-monospace, monospace';
  ctx.fillText('[Q/E] tabs   [1-7] jump   [Esc/Tab] close   (Map: drag / WASD / wheel / =-  zoom / R reset)', w / 2, frame.y + frame.h - 14);
}

function drawTabBody(ctx, game, name) {
  switch (name) {
    case 'Map':       drawMapTab(ctx, game); break;
    case 'Party':     drawPartyTab(ctx, game); break;
    case 'Inventory': drawInventoryTab(ctx, game); break;
    case 'Skills':    drawSkillsTab(ctx, game); break;
    case 'Quests':    drawQuestsTab(ctx, game); break;
    case 'Save':      drawSaveTab(ctx, game); break;
    case 'Settings':  drawSettingsTab(ctx, game); break;
  }
}

// ─── Party tab ───────────────────────────────────────────────────────────────

function drawPartyTab(ctx, game) {
  if (!game.heroes) return;
  const f = frameRect(game);
  const bodyY = f.y + 60;
  const bodyH = f.h - 70;
  const cardW = Math.floor((f.w - 60) / 3);
  const cardPad = 20;

  ctx.fillStyle = PALETTE.ink;
  ctx.textAlign = 'left';
  ctx.font = '600 12px ui-monospace, monospace';
  ctx.fillStyle = PALETTE.dim;
  ctx.fillText(`SKILL POINTS: ${game.resources.skillPoints || 0}`, f.x + 24, bodyY - 18);

  game.heroes.forEach((hero, i) => {
    const x = f.x + 20 + i * (cardW + 10);
    const y = bodyY;
    const w = cardW;
    const h = bodyH;

    // card bg
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = hero.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    // portrait circle
    const cx = x + w / 2, cy = y + cardPad + 40;
    const r = 38;
    ctx.fillStyle = hero.color + '33';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hero.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = hero.color;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 26px system-ui, sans-serif`;
    ctx.fillText(hero.name[0], cx, cy);

    let ty = cy + r + 14;

    // name + level
    ctx.fillStyle = PALETTE.ink;
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(hero.name, cx, ty); ty += 18;
    ctx.fillStyle = hero.color;
    ctx.font = '400 13px ui-monospace, monospace';
    ctx.fillText(`${hero.role}  •  Lv ${hero.level}`, cx, ty); ty += 22;

    // HP bar
    const barX = x + cardPad, barW = w - cardPad * 2, barH = 14;
    drawBar(ctx, barX, ty, barW, barH, hero.hp, hero.maxHp, '#ff4a5a', '#3a1520');
    ctx.font = '700 11px ui-monospace, monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3;
    ctx.strokeText(`${hero.hp}/${hero.maxHp}`, barX + barW - 5, ty + barH / 2);
    ctx.fillStyle = PALETTE.ink; ctx.fillText(`${hero.hp}/${hero.maxHp}`, barX + barW - 5, ty + barH / 2); ty += barH + 6;

    // MP bar
    drawBar(ctx, barX, ty, barW, barH, hero.mp, hero.maxMp, '#22e3ff', '#0a2535');
    ctx.strokeText(`${hero.mp}/${hero.maxMp}`, barX + barW - 5, ty + barH / 2);
    ctx.fillStyle = PALETTE.ink; ctx.fillText(`${hero.mp}/${hero.maxMp}`, barX + barW - 5, ty + barH / 2); ty += barH + 6;

    // XP bar
    drawBar(ctx, barX, ty, barW, barH, hero.xp, hero.xpNext, '#ffd23f', '#2a2010');
    ctx.strokeText(`${hero.xp}/${hero.xpNext} xp`, barX + barW - 5, ty + barH / 2);
    ctx.fillStyle = PALETTE.ink; ctx.fillText(`${hero.xp}/${hero.xpNext} xp`, barX + barW - 5, ty + barH / 2); ty += barH + 14;

    // stats grid
    const stats = computeStats(hero);
    const statList = [
      ['STR', stats.str], ['INT', stats.int], ['TEC', stats.tec],
      ['DEF', stats.def], ['SPD', stats.spd], ['CRIT', stats.crit],
    ];
    ctx.textAlign = 'left';
    ctx.font = '400 12px ui-monospace, monospace';
    const colW = (barW) / 2;
    statList.forEach(([label, val], si) => {
      const sx = barX + (si % 2) * colW;
      const sy = ty + Math.floor(si / 2) * 16;
      ctx.fillStyle = PALETTE.dim;
      ctx.fillText(label, sx, sy);
      ctx.fillStyle = PALETTE.ink;
      ctx.textAlign = 'right';
      ctx.fillText(String(val), sx + colW - 4, sy);
      ctx.textAlign = 'left';
    });
    ty += Math.ceil(statList.length / 2) * 16 + 14;

    // equipped items
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '600 12px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('EQUIP', barX, ty); ty += 16;
    for (const slot of ['weapon', 'armor', 'accessory']) {
      const itemId = hero.equip[slot];
      const def = itemId ? ITEM_DEFS[itemId] : null;
      ctx.fillStyle = def ? def.color : PALETTE.grid;
      ctx.fillRect(barX, ty, 8, 8);
      ctx.fillStyle = def ? PALETTE.ink : PALETTE.dim;
      ctx.font = '400 12px ui-monospace, monospace';
      ctx.fillText(def ? def.name : `— (${slot})`, barX + 12, ty);
      ty += 15;
    }
  });
}

// ─── Inventory tab ────────────────────────────────────────────────────────────

const SLOTS = ['weapon', 'armor', 'accessory'];

// Hit-test helpers for inventory layout
function invHeroRect(heroIdx, game) {
  const f = frameRect(game);
  const panelX = f.x + 20 + Math.floor(f.w * 0.46);
  const panelW = f.w - Math.floor(f.w * 0.46) - 40;
  const heroW = Math.floor(panelW / 3);
  return { x: panelX + heroIdx * heroW, y: f.y + 84, w: heroW, h: 38 };
}

function invSlotRect(heroIdx, slotIdx, game) {
  const f = frameRect(game);
  const panelX = f.x + 20 + Math.floor(f.w * 0.46);
  const panelW = f.w - Math.floor(f.w * 0.46) - 40;
  const heroW = Math.floor(panelW / 3);
  return {
    x: panelX + heroIdx * heroW + 4,
    y: f.y + 132 + slotIdx * 84,
    w: heroW - 8, h: 76,
  };
}

// displayPos 0 = top row (newest). Actual inventory index = length-1 - displayPos.
function invItemRect(displayPos, game) {
  const f = frameRect(game);
  const itemW = Math.floor(f.w * 0.44) - 20;
  const itemH = 72;
  const x = f.x + 20;
  const y = f.y + 84 + displayPos * (itemH + 8);
  return { x, y, w: itemW, h: itemH };
}

function displayPosToIdx(displayPos, game) {
  return game.inventory.length - 1 - displayPos;
}

function pickEquipSlot(mx, my, game) {
  if (!game.heroes) return null;
  for (let hi = 0; hi < game.heroes.length; hi++) {
    for (let si = 0; si < SLOTS.length; si++) {
      const r = invSlotRect(hi, si, game);
      if (pointInRect(mx, my, r)) return { heroId: game.heroes[hi].id, slot: SLOTS[si], heroIdx: hi };
    }
  }
  return null;
}

function handleInvMouseDown(mx, my, game) {
  if (!game.heroes) return false;
  const inv = menuState.inv;

  // hero selector
  for (let i = 0; i < game.heroes.length; i++) {
    const r = invHeroRect(i, game);
    if (pointInRect(mx, my, r)) { inv.heroIdx = i; return true; }
  }

  // equip slot click
  const slot = pickEquipSlot(mx, my, game);
  if (slot) {
    if (inv.selectedItemIdx >= 0) {
      // try to equip selected item into this slot
      if (equipItem(game, slot.heroId, slot.slot, inv.selectedItemIdx)) {
        inv.selectedItemIdx = -1;
      }
    } else {
      // click on equipped item → unequip it (puts in inventory, selects it)
      const hero = game.heroes.find(h => h.id === slot.heroId);
      if (hero && hero.equip[slot.slot]) {
        unequipItem(game, slot.heroId, slot.slot);
        // select the last item (just added)
        inv.selectedItemIdx = game.inventory.length - 1;
      }
    }
    return true;
  }

  // item list click or drag start (iterate in display order — newest first)
  for (let dp = 0; dp < game.inventory.length; dp++) {
    const r = invItemRect(dp, game);
    if (pointInRect(mx, my, r)) {
      const i = displayPosToIdx(dp, game);
      if (inv.selectedItemIdx === i) {
        inv.selectedItemIdx = -1; // deselect
      } else {
        inv.selectedItemIdx = i;
        // start drag
        inv.dragItemIdx = i;
        inv.dragX = mx; inv.dragY = my;
        inv.dragStartX = mx; inv.dragStartY = my;
      }
      return true;
    }
  }

  // click empty area → deselect
  inv.selectedItemIdx = -1;
  return false;
}

function drawInventoryTab(ctx, game) {
  if (!game.heroes) return;
  const f = frameRect(game);
  const inv = menuState.inv;
  const splitX = f.x + 20 + Math.floor(f.w * 0.44);

  // --- left: item list ---
  ctx.fillStyle = PALETTE.dim;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = '600 11px ui-monospace, monospace';
  ctx.fillText(`INVENTORY  (${game.inventory.length} items)`, f.x + 20, f.y + 64);

  const isDragging = inv.dragItemIdx >= 0;

  // render newest-first
  for (let dp = 0; dp < game.inventory.length; dp++) {
    const i = displayPosToIdx(dp, game);
    const item = game.inventory[i];
    if (isDragging && i === inv.dragItemIdx) continue; // drawn at cursor below
    const r = invItemRect(dp, game);
    const def = ITEM_DEFS[item.id];
    if (!def) continue;
    const selected = inv.selectedItemIdx === i;
    ctx.fillStyle = selected ? PALETTE.panel + 'cc' : PALETTE.panel + '88';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = selected ? PALETTE.accent : PALETTE.grid;
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

    drawSprite(ctx, `icon_${def.slot}`, r.x + 8, r.y + 10, 28, 28);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = PALETTE.ink;
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillText(def.name, r.x + 44, r.y + 10);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '400 12px ui-monospace, monospace';
    ctx.fillText(Object.entries(def.stats).map(([k, v]) => `+${v} ${k.toUpperCase()}`).join('  '), r.x + 44, r.y + 30);
    ctx.font = '400 11px system-ui, sans-serif';
    ctx.fillText(def.desc, r.x + 44, r.y + 48);
  }

  if (game.inventory.length === 0) {
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '400 13px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('No items in inventory', f.x + 20 + Math.floor(f.w * 0.44) / 2, f.y + 160);
  }

  // divider
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(splitX + 10, f.y + 58);
  ctx.lineTo(splitX + 10, f.y + f.h - 30);
  ctx.stroke();

  // --- right: hero equip panels ---
  const panelX = splitX + 24;
  const panelW = f.x + f.w - 20 - panelX;
  const heroW = Math.floor(panelW / 3);

  ctx.fillStyle = PALETTE.dim;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = '600 11px ui-monospace, monospace';
  ctx.fillText('EQUIP SLOTS', panelX, f.y + 64);

  for (let hi = 0; hi < game.heroes.length; hi++) {
    const hero = game.heroes[hi];
    const hr = invHeroRect(hi, game);
    const active = inv.heroIdx === hi;

    // hero header
    ctx.fillStyle = active ? hero.color + '33' : PALETTE.panel;
    ctx.fillRect(hr.x, hr.y, hr.w, hr.h);
    ctx.strokeStyle = active ? hero.color : PALETTE.grid;
    ctx.lineWidth = active ? 2 : 1;
    ctx.strokeRect(hr.x + 0.5, hr.y + 0.5, hr.w - 1, hr.h - 1);
    ctx.fillStyle = active ? hero.color : PALETTE.ink;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${active ? '700' : '400'} 11px system-ui, sans-serif`;
    ctx.fillText(hero.name, hr.x + hr.w / 2, hr.y + hr.h / 2);

    // equip slots
    for (let si = 0; si < SLOTS.length; si++) {
      const slot = SLOTS[si];
      const sr = invSlotRect(hi, si, game);
      const itemId = hero.equip[slot];
      const def = itemId ? ITEM_DEFS[itemId] : null;

      // highlight if valid drop target for selected/dragged item
      const pendingIdx = isDragging ? inv.dragItemIdx : inv.selectedItemIdx;
      const pendingItem = pendingIdx >= 0 ? game.inventory[pendingIdx] : null;
      const isTarget = pendingItem && ITEM_DEFS[pendingItem.id]?.slot === slot;
      const isHovered = isDragging && isTarget && inv.hoverSlot && inv.hoverSlot.heroId === hero.id && inv.hoverSlot.slot === slot;

      ctx.fillStyle = isHovered ? PALETTE.accent + '55' : (isTarget ? PALETTE.accent + '22' : PALETTE.panel + '88');
      ctx.fillRect(sr.x, sr.y, sr.w, sr.h);
      ctx.strokeStyle = isHovered ? PALETTE.warn : (isTarget ? PALETTE.accent : (def ? PALETTE.grid : PALETTE.grid + '44'));
      ctx.lineWidth = isHovered ? 3 : (isTarget ? 2 : 1);
      ctx.strokeRect(sr.x + 0.5, sr.y + 0.5, sr.w - 1, sr.h - 1);

      drawSprite(ctx, `icon_${slot}`, sr.x + 6, sr.y + 6, 22, 22);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = PALETTE.dim;
      ctx.font = '600 11px ui-monospace, monospace';
      ctx.fillText(slot.toUpperCase(), sr.x + 32, sr.y + 10);

      if (def) {
        ctx.fillStyle = PALETTE.ink;
        ctx.font = '600 13px system-ui, sans-serif';
        ctx.fillText(def.name, sr.x + 32, sr.y + 26);
        ctx.fillStyle = PALETTE.dim;
        ctx.font = '400 11px ui-monospace, monospace';
        ctx.fillText(Object.entries(def.stats).map(([k, v]) => `+${v}${k.toUpperCase()}`).join(' '), sr.x + 32, sr.y + 44);

        // stat-diff if an item is pending for this slot
        if (isTarget && pendingItem) {
          const newDef = ITEM_DEFS[pendingItem.id];
          if (newDef) {
            const diffs = [];
            for (const [k, v] of Object.entries(newDef.stats)) {
              const curV = def.stats[k] || 0;
              const d = v - curV;
              if (d !== 0) diffs.push(`${d > 0 ? '+' : ''}${d}${k.toUpperCase()}`);
            }
            if (diffs.length) {
              ctx.fillStyle = PALETTE.warn;
              ctx.font = '400 11px ui-monospace, monospace';
              ctx.fillText(`→ ${diffs.join(' ')}`, sr.x + 32, sr.y + 58);
            }
          }
        }
      } else {
        ctx.fillStyle = PALETTE.dim + '66';
        ctx.font = '400 11px ui-monospace, monospace';
        ctx.fillText('(empty)', sr.x + 32, sr.y + 26);
        // stat-diff: show full new stats as gain
        if (isTarget && pendingItem) {
          const newDef = ITEM_DEFS[pendingItem.id];
          if (newDef) {
            ctx.fillStyle = PALETTE.good || '#4af2a1';
            ctx.font = '400 11px ui-monospace, monospace';
            ctx.fillText(`→ ${Object.entries(newDef.stats).map(([k, v]) => `+${v}${k.toUpperCase()}`).join(' ')}`, sr.x + 32, sr.y + 44);
          }
        }
      }
    }
  }

  // floating drag ghost
  if (isDragging && inv.dragItemIdx >= 0 && game.inventory[inv.dragItemIdx]) {
    const def = ITEM_DEFS[game.inventory[inv.dragItemIdx].id];
    if (def) {
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = PALETTE.panel;
      ctx.fillRect(inv.dragX - 60, inv.dragY - 20, 120, 36);
      ctx.strokeStyle = def.color; ctx.lineWidth = 2;
      ctx.strokeRect(inv.dragX - 59.5, inv.dragY - 19.5, 119, 35);
      ctx.fillStyle = def.color;
      ctx.fillRect(inv.dragX - 52, inv.dragY - 12, 8, 8);
      ctx.fillStyle = PALETTE.ink;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillText(def.name, inv.dragX - 40, inv.dragY - 14);
      ctx.globalAlpha = 1;
    }
  }
}

// ─── Skills tab ───────────────────────────────────────────────────────────────

function handleSkillsMouseDown(mx, my, game) {
  if (!game.heroes) return false;
  const sk = menuState.skills;
  const f = frameRect(game);

  // hero selector
  const heroTabW = 120, heroTabH = 32, heroTabY = f.y + 66;
  for (let i = 0; i < game.heroes.length; i++) {
    const r = { x: f.x + 20 + i * (heroTabW + 8), y: heroTabY, w: heroTabW, h: heroTabH };
    if (pointInRect(mx, my, r)) { sk.heroIdx = i; return true; }
  }

  // skill node click
  const hero = game.heroes[sk.heroIdx];
  if (!hero) return false;
  const tree = SKILL_TREES[hero.id] || [];
  const nodeY0 = f.y + 120;
  const nodeH = 72, nodeGap = 12;
  const nodeX = f.x + 40, nodeW = f.w - 80;
  for (let i = 0; i < tree.length; i++) {
    const skill = tree[i];
    if (skill.cost === 0) continue; // starter skill, not unlockable via points
    const r = { x: nodeX, y: nodeY0 + i * (nodeH + nodeGap), w: nodeW, h: nodeH };
    if (pointInRect(mx, my, r)) {
      spendSkillPoint(game, hero.id, skill.id);
      return true;
    }
  }
  return false;
}

function drawSkillsTab(ctx, game) {
  if (!game.heroes) return;
  const sk = menuState.skills;
  const f = frameRect(game);

  // hero selector tabs
  const heroTabW = 120, heroTabH = 32, heroTabY = f.y + 66;
  for (let i = 0; i < game.heroes.length; i++) {
    const hero = game.heroes[i];
    const active = sk.heroIdx === i;
    const r = { x: f.x + 20 + i * (heroTabW + 8), y: heroTabY, w: heroTabW, h: heroTabH };
    ctx.fillStyle = active ? hero.color + '33' : PALETTE.panel;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = active ? hero.color : PALETTE.grid;
    ctx.lineWidth = active ? 2 : 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    ctx.fillStyle = active ? hero.color : PALETTE.ink;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${active ? '700' : '400'} 15px system-ui, sans-serif`;
    ctx.fillText(hero.name, r.x + r.w / 2, r.y + r.h / 2);
  }

  // skill points available
  ctx.fillStyle = PALETTE.warn;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = '600 13px ui-monospace, monospace';
  ctx.fillText(`Skill Points: ${game.resources.skillPoints || 0}`, f.x + 20 + 3 * (heroTabW + 8) + 16, heroTabY + heroTabH / 2);

  const hero = game.heroes[sk.heroIdx];
  if (!hero) return;
  const tree = SKILL_TREES[hero.id] || [];

  const nodeY0 = f.y + 122;
  const nodeH = 70, nodeGap = 14;
  const nodeX = f.x + 40, nodeW = f.w - 80;

  // connector lines between nodes
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 2;
  for (let i = 1; i < tree.length; i++) {
    const y1 = nodeY0 + (i - 1) * (nodeH + nodeGap) + nodeH;
    const y2 = nodeY0 + i * (nodeH + nodeGap);
    const midX = nodeX + 28;
    ctx.beginPath();
    ctx.moveTo(midX, y1);
    ctx.lineTo(midX, y2);
    ctx.stroke();
  }

  for (let i = 0; i < tree.length; i++) {
    const skill = tree[i];
    const unlocked = !!hero.skills[skill.id];
    const prereqOk = !skill.requires || !!hero.skills[skill.requires];
    const canAfford = skill.cost === 0 || (prereqOk && (game.resources.skillPoints || 0) >= skill.cost);
    const isStarter = skill.cost === 0;

    const ry = nodeY0 + i * (nodeH + nodeGap);
    ctx.fillStyle = unlocked ? hero.color + '22' : PALETTE.panel + '88';
    ctx.fillRect(nodeX, ry, nodeW, nodeH);
    ctx.strokeStyle = unlocked ? hero.color : (canAfford && !isStarter ? PALETTE.accent2 + '88' : PALETTE.grid);
    ctx.lineWidth = unlocked ? 2 : 1;
    ctx.strokeRect(nodeX + 0.5, ry + 0.5, nodeW - 1, nodeH - 1);

    // skill icon circle
    const icx = nodeX + 24, icy = ry + nodeH / 2;
    ctx.fillStyle = unlocked ? hero.color : PALETTE.grid;
    ctx.beginPath(); ctx.arc(icx, icy, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = unlocked ? PALETTE.bg : PALETTE.dim;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.fillText(unlocked ? '✓' : isStarter ? '★' : `${skill.cost}`, icx, icy);

    // name + desc
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = unlocked ? PALETTE.ink : (canAfford && !isStarter ? PALETTE.ink + 'cc' : PALETTE.dim);
    ctx.font = `${unlocked ? '700' : '600'} 15px system-ui, sans-serif`;
    ctx.fillText(skill.name, nodeX + 48, ry + 10);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '400 13px system-ui, sans-serif';
    ctx.fillText(skill.desc, nodeX + 48, ry + 30);

    // status label
    ctx.textAlign = 'right';
    ctx.font = '600 12px ui-monospace, monospace';
    if (isStarter) {
      ctx.fillStyle = hero.color;
      ctx.fillText('STARTING', nodeX + nodeW - 10, ry + 10);
    } else if (unlocked) {
      ctx.fillStyle = hero.color;
      ctx.fillText('UNLOCKED', nodeX + nodeW - 10, ry + 10);
    } else if (!prereqOk) {
      ctx.fillStyle = PALETTE.dim;
      ctx.fillText('LOCKED', nodeX + nodeW - 10, ry + 10);
      const reqSkill = tree.find(s => s.id === skill.requires);
      ctx.fillText(`req: ${reqSkill?.name || skill.requires}`, nodeX + nodeW - 10, ry + 24);
    } else {
      ctx.fillStyle = canAfford ? PALETTE.accent2 : PALETTE.dim;
      ctx.fillText(canAfford ? `CLICK TO UNLOCK  (${skill.cost} SP)` : `NEED ${skill.cost} SP`, nodeX + nodeW - 10, ry + 10);
    }
  }
}

// ─── Quests tab ───────────────────────────────────────────────────────────────

function handleQuestsMouseDown(mx, my, game) {
  if (!game.quests) return false;
  const f = frameRect(game);
  const listW = Math.floor(f.w * 0.38);
  const itemH = 52, itemGap = 6;
  const startY = f.y + 72;
  for (let i = 0; i < game.quests.length; i++) {
    const r = { x: f.x + 20, y: startY + i * (itemH + itemGap), w: listW, h: itemH };
    if (pointInRect(mx, my, r)) { menuState.quests.selectedIdx = i; return true; }
  }
  return false;
}

function drawQuestsTab(ctx, game) {
  if (!game.quests) return;
  const f = frameRect(game);
  const sel = menuState.quests.selectedIdx;
  const listW = Math.floor(f.w * 0.38);
  const detailX = f.x + 20 + listW + 16;
  const detailW = f.w - listW - 56;
  const itemH = 52, itemGap = 6;
  const startY = f.y + 72;

  // label
  ctx.fillStyle = PALETTE.dim;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = '600 12px ui-monospace, monospace';
  ctx.fillText('QUESTS', f.x + 20, f.y + 60);

  // quest list
  for (let i = 0; i < game.quests.length; i++) {
    const q = game.quests[i];
    const def = QUEST_DEFS.find(d => d.id === q.id);
    if (!def) continue;
    const active = sel === i;
    const ry = startY + i * (itemH + itemGap);

    ctx.fillStyle = active ? PALETTE.panel + 'cc' : PALETTE.panel + '44';
    ctx.fillRect(f.x + 20, ry, listW, itemH);
    ctx.strokeStyle = q.complete ? PALETTE.accent2 : (active ? PALETTE.accent : PALETTE.grid);
    ctx.lineWidth = active ? 2 : 1;
    ctx.strokeRect(f.x + 20.5, ry + 0.5, listW - 1, itemH - 1);

    ctx.fillStyle = q.complete ? PALETTE.accent2 : PALETTE.ink;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = `${active ? '700' : '600'} 15px system-ui, sans-serif`;
    ctx.fillText(def.title, f.x + 28, ry + 6);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '400 13px ui-monospace, monospace';
    const doneCnt = q.objectives.filter(o => o.done).length;
    ctx.fillText(`${def.giver}  •  ${doneCnt}/${q.objectives.length} objectives`, f.x + 28, ry + 26);
    ctx.fillStyle = q.complete ? PALETTE.accent2 : PALETTE.warn;
    ctx.font = '600 12px ui-monospace, monospace';
    ctx.fillText(q.complete ? 'COMPLETE' : 'IN PROGRESS', f.x + 28, ry + 40);
  }

  // divider
  ctx.strokeStyle = PALETTE.grid; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(detailX - 8, f.y + 58);
  ctx.lineTo(detailX - 8, f.y + f.h - 30);
  ctx.stroke();

  // detail panel
  if (sel >= 0 && sel < game.quests.length) {
    const q = game.quests[sel];
    const def = QUEST_DEFS.find(d => d.id === q.id);
    if (def) {
      let dy = f.y + 72;
      ctx.fillStyle = q.complete ? PALETTE.accent2 : PALETTE.ink;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.font = '700 15px system-ui, sans-serif';
      ctx.fillText(def.title, detailX, dy); dy += 22;

      ctx.fillStyle = PALETTE.dim;
      ctx.font = '400 13px ui-monospace, monospace';
      ctx.fillText(`From: ${def.giver}`, detailX, dy); dy += 20;

      ctx.fillStyle = PALETTE.ink;
      ctx.font = '400 13px system-ui, sans-serif';
      dy = wrapTextRet(ctx, def.desc, detailX, dy, detailW, 18) + 16;

      ctx.fillStyle = PALETTE.dim;
      ctx.font = '600 12px ui-monospace, monospace';
      ctx.fillText('OBJECTIVES', detailX, dy); dy += 18;

      for (const obj of q.objectives) {
        ctx.fillStyle = obj.done ? PALETTE.accent2 : PALETTE.ink;
        ctx.font = '400 13px system-ui, sans-serif';
        ctx.fillText(`${obj.done ? '✓' : '○'}  ${obj.text}`, detailX, dy); dy += 20;
      }

      dy += 10;
      ctx.fillStyle = PALETTE.dim;
      ctx.font = '600 12px ui-monospace, monospace';
      ctx.fillText('REWARD', detailX, dy); dy += 18;
      ctx.fillStyle = PALETTE.warn;
      ctx.font = '400 13px system-ui, sans-serif';
      ctx.fillText(`${def.reward.xp} XP  +  ${def.reward.ore} Ore`, detailX, dy);
    }
  }
}

// helper: wrapText that returns final Y
function wrapTextRet(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lineH;
    } else {
      line = test;
    }
  }
  if (line) { ctx.fillText(line, x, yy); yy += lineH; }
  return yy;
}

// ─── Save tab ─────────────────────────────────────────────────────────────────

function saveBtnRects(game) {
  const f = frameRect(game);
  const cx = game.width / 2;
  const bw = 220, bh = 44;
  return {
    save:   { x: cx - bw / 2, y: f.y + 200, w: bw, h: bh },
    load:   { x: cx - bw / 2, y: f.y + 256, w: bw, h: bh },
    delete: { x: cx - bw / 2, y: f.y + 320, w: bw, h: bh },
  };
}

function handleSaveMouseDown(mx, my, game) {
  const btns = saveBtnRects(game);
  const sv = menuState.save;
  if (pointInRect(mx, my, btns.save)) {
    const ok = saveGame(game);
    sv.msg = ok ? 'Game saved.' : 'Save failed (storage error).';
    sv.msgExpire = game.time + 2500;
    return true;
  }
  if (pointInRect(mx, my, btns.load) && hasSave()) {
    const ok = loadGame(game);
    sv.msg = ok ? 'Game loaded.' : 'Load failed (data corrupt?).';
    sv.msgExpire = game.time + 2500;
    return true;
  }
  if (pointInRect(mx, my, btns.delete) && hasSave()) {
    if (sv.confirmRestart) {
      deleteSave();
      sv.msg = 'Save deleted. Refresh to start over.';
      sv.msgExpire = game.time + 4000;
      sv.confirmRestart = false;
    } else {
      sv.confirmRestart = true;
      sv.confirmExpire = game.time + 3000;
      sv.msg = 'Click again to confirm restart.';
      sv.msgExpire = game.time + 3000;
    }
    return true;
  }
  // Cancel confirm if clicking elsewhere
  if (sv.confirmRestart && game.time > sv.confirmExpire) sv.confirmRestart = false;
  return false;
}

function drawSaveTab(ctx, game) {
  const f = frameRect(game);
  const sv = menuState.save;
  const cx = game.width / 2;

  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillStyle = PALETTE.ink;
  ctx.font = '700 24px system-ui, sans-serif';
  ctx.fillText('SAVE / LOAD', cx, f.y + 90);

  // save metadata
  const meta = getSaveMeta();
  if (meta) {
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '400 12px ui-monospace, monospace';
    const d = new Date(meta.ts);
    ctx.fillText(`Last save: ${d.toLocaleDateString()} ${d.toLocaleTimeString()}`, cx, f.y + 132);
    ctx.fillText(`Tier: ${meta.tier}  •  Lv ${meta.heroLevels?.join('/')}`, cx, f.y + 150);
    ctx.fillText(`Food: ${meta.resources?.food}  Ore: ${meta.resources?.ore}  Energy: ${meta.resources?.energy}`, cx, f.y + 168);
  } else {
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '400 12px ui-monospace, monospace';
    ctx.fillText('No save found.', cx, f.y + 140);
  }

  const btns = saveBtnRects(game);
  const defs = [
    { key: 'save', label: 'Save Game', color: PALETTE.accent, enabled: true },
    { key: 'load', label: 'Load Game', color: PALETTE.accent2, enabled: !!meta },
    { key: 'delete', label: sv.confirmRestart ? '⚠ Confirm Restart' : 'Start Over', color: '#ff4a5a', enabled: !!meta },
  ];
  for (const { key, label, color, enabled } of defs) {
    const r = btns[key];
    ctx.fillStyle = enabled ? color + '22' : PALETTE.panel + '44';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = enabled ? color : PALETTE.grid;
    ctx.lineWidth = enabled ? 2 : 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    ctx.fillStyle = enabled ? color : PALETTE.dim;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${enabled ? '700' : '400'} 15px system-ui, sans-serif`;
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
  }

  // feedback message
  if (sv.msg && game.time < sv.msgExpire) {
    ctx.fillStyle = PALETTE.accent2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(sv.msg, cx, btns.delete.y + btns.delete.h + 16);
  }
}

function drawSettingsTab(ctx, game) {
  const f = frameRect(game);
  ctx.fillStyle = PALETTE.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = '700 24px system-ui, sans-serif';
  ctx.fillText('SETTINGS', game.width / 2, f.y + 110);

  ctx.fillStyle = PALETTE.dim;
  ctx.font = '400 13px system-ui, sans-serif';
  ctx.fillText('Volume sliders + key rebind wire up in later phases.', game.width / 2, f.y + 160);

  // Placeholder toggle
  const toggle = settingsToggleRect(game);
  ctx.fillStyle = spriteSettings.forcePlaceholders ? PALETTE.accent : PALETTE.panel;
  ctx.fillRect(toggle.x, toggle.y, toggle.w, toggle.h);
  ctx.strokeStyle = PALETTE.accent;
  ctx.strokeRect(toggle.x + 0.5, toggle.y + 0.5, toggle.w - 1, toggle.h - 1);
  ctx.fillStyle = spriteSettings.forcePlaceholders ? PALETTE.bg : PALETTE.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 15px system-ui, sans-serif';
  ctx.fillText(
    spriteSettings.forcePlaceholders ? '✔  Showing placeholders (A/B mode)' : 'Click to force placeholder sprites',
    toggle.x + toggle.w / 2, toggle.y + toggle.h / 2
  );

}

// ── World topology layout ─────────────────────────────────────────────────────
// Virtual coordinate space (pixels). Each map node is a THUMB_VW × THUMB_VH
// rectangle centred on (vx, vy). Pan/zoom maps virtual → screen.

const WORLD_NODE_POS = {
  haventide_region:     { vx: 240,  vy: 480 },
  emberline_region:     { vx: 740,  vy: 480 },
  orbital_reach_region: { vx: 1280, vy: 480 },
  last_crown_region:    { vx: 1820, vy: 480 },
  crater_ember_region:  { vx: 740,  vy: 140 },
  frost_canyon_region:  { vx: 1280, vy: 140 },
  forest_veil_region:   { vx: 740,  vy: 820 },
  mire_bog_region:      { vx: 740,  vy: 1140 },
};

const WORLD_CONNECTIONS = [
  ['haventide_region',     'emberline_region'],
  ['emberline_region',     'orbital_reach_region'],
  ['orbital_reach_region', 'last_crown_region'],
  ['emberline_region',     'crater_ember_region'],
  ['orbital_reach_region', 'frost_canyon_region'],
  ['emberline_region',     'forest_veil_region'],
  ['forest_veil_region',   'mire_bog_region'],
];

const TIER_COLORS = ['', '#4af2a1', '#22e3ff', '#ffd23f', '#ff9a2e', '#ff2dd4'];
const THUMB_VW = 300;   // virtual pixels (matches 60:40 tile ratio at 5px/tile)
const THUMB_VH = 200;

// Returns the screen-space centre of a map node given current pan/zoom.
function worldNodePx(mapId, rect) {
  const n = WORLD_NODE_POS[mapId];
  if (!n) return null;
  const zoom = menuState.map.zoom;
  return {
    x: rect.x + rect.w / 2 + (n.vx - menuState.map.cx) * zoom,
    y: rect.y + rect.h / 2 + (n.vy - menuState.map.cy) * zoom,
  };
}

// ── Thumbnail caches ──────────────────────────────────────────────────────────
const _mapThumbCache  = {};   // mapId → { canvas, hasBackdrop }
const _fogThumbCache  = {};   // mapId → { canvas, size }

export function getMapThumb(mapId) {
  const mapData = MAPS[mapId];
  const backdrop = mapData && getMapBackdrop(mapData.backdrop);
  const entry = _mapThumbCache[mapId];
  if (entry && entry.hasBackdrop === !!backdrop) return entry.canvas;

  const canvas = document.createElement('canvas');
  canvas.width = THUMB_VW; canvas.height = THUMB_VH;
  const c = canvas.getContext('2d');
  if (backdrop) {
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(backdrop, 0, 0, THUMB_VW, THUMB_VH);
  } else {
    const tiles = tilesOf(mapId);
    if (tiles) {
      const sx = THUMB_VW / MAP_W, sy = THUMB_VH / MAP_H;
      for (let ty = 0; ty < MAP_H; ty++)
        for (let tx = 0; tx < MAP_W; tx++) {
          const t = tiles[ty][tx];
          c.fillStyle = tileMapColor(t.biome, t.t);
          c.fillRect(Math.floor(tx * sx), Math.floor(ty * sy), Math.ceil(sx) + 1, Math.ceil(sy) + 1);
        }
    }
  }
  _mapThumbCache[mapId] = { canvas, hasBackdrop: !!backdrop };
  return canvas;
}

function getFogThumb(mapId, game) {
  const exp = game.explored && game.explored[mapId];
  const size = exp ? exp.size : 0;
  let entry = _fogThumbCache[mapId];
  if (entry && entry.size === size) return entry.canvas;

  if (!entry) {
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_VW; canvas.height = THUMB_VH;
    entry = { canvas, size: -1 };
    _fogThumbCache[mapId] = entry;
  }
  const c = entry.canvas.getContext('2d');
  c.clearRect(0, 0, THUMB_VW, THUMB_VH);
  c.fillStyle = 'rgba(7,6,13,0.85)';
  if (!exp || size === 0) {
    c.fillRect(0, 0, THUMB_VW, THUMB_VH);
  } else {
    const tw = THUMB_VW / MAP_W, th = THUMB_VH / MAP_H;
    // 2×2 tile block sampling for perf
    for (let ty = 0; ty < MAP_H; ty += 2)
      for (let tx = 0; tx < MAP_W; tx += 2)
        if (!exp.has(`${tx},${ty}`))
          c.fillRect(Math.floor(tx * tw), Math.floor(ty * th), Math.ceil(tw * 2) + 1, Math.ceil(th * 2) + 1);
  }
  entry.size = size;
  return entry.canvas;
}

function drawMapTab(ctx, game) {
  const rect = mapRect(game);
  const zoom = menuState.map.zoom;

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  // faint dot grid
  ctx.fillStyle = 'rgba(29,22,56,0.7)';
  for (let x = rect.x + 20; x < rect.x + rect.w; x += 36)
    for (let y = rect.y + 20; y < rect.y + rect.h; y += 36)
      ctx.fillRect(x, y, 2, 2);

  function isDiscovered(mapId) {
    if (game.devFogReveal) return true;
    return !!(game.explored && game.explored[mapId] && game.explored[mapId].size > 0);
  }

  const tw = THUMB_VW * zoom;  // screen thumbnail width
  const th = THUMB_VH * zoom;  // screen thumbnail height

  // Helper: clamp line endpoint to thumbnail edge
  function edgePt(fromId, toId) {
    const f = worldNodePx(fromId, rect), t = worldNodePx(toId, rect);
    if (!f || !t) return f;
    const dx = t.x - f.x, dy = t.y - f.y;
    if (!dx && !dy) return f;
    const hw = tw / 2, hh = th / 2;
    const s = Math.min(Math.abs(dx) > 0 ? hw / Math.abs(dx) : Infinity,
                       Math.abs(dy) > 0 ? hh / Math.abs(dy) : Infinity);
    return { x: f.x + dx * s, y: f.y + dy * s };
  }

  // ── Connections ──────────────────────────────────────────────────────────────
  for (const [a, b] of WORLD_CONNECTIONS) {
    const da = isDiscovered(a), db = isDiscovered(b);
    if (!da && !db) continue;
    const ea = edgePt(a, b), eb = edgePt(b, a);
    if (!ea || !eb) continue;
    ctx.save();
    ctx.strokeStyle = (da && db) ? 'rgba(34,227,255,0.55)' : 'rgba(138,131,184,0.25)';
    ctx.lineWidth = (da && db) ? 2 : 1.5;
    if (!da || !db) ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(ea.x, ea.y); ctx.lineTo(eb.x, eb.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ── Map nodes ─────────────────────────────────────────────────────────────────
  for (const [mapId, mapData] of Object.entries(MAPS)) {
    const pos = worldNodePx(mapId, rect);
    if (!pos) continue;
    const disc = isDiscovered(mapId);
    const nx = pos.x - tw / 2, ny = pos.y - th / 2;

    if (!disc) {
      const hasNeighbour = WORLD_CONNECTIONS.some(([a, b]) =>
        (a === mapId && isDiscovered(b)) || (b === mapId && isDiscovered(a))
      );
      if (!hasNeighbour) continue;
      ctx.save();
      ctx.fillStyle = 'rgba(18,10,34,0.85)';
      ctx.strokeStyle = 'rgba(138,131,184,0.3)';
      ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
      ctx.fillRect(nx, ny, tw, th);
      ctx.strokeRect(nx + 0.5, ny + 0.5, tw - 1, th - 1);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(138,131,184,0.5)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.max(14, Math.round(18 * zoom))}px system-ui, sans-serif`;
      ctx.fillText('?', pos.x, pos.y);
      ctx.restore();
      continue;
    }

    const tc = TIER_COLORS[mapData.tier] || PALETTE.dim;

    // thumbnail image
    ctx.save();
    ctx.beginPath(); ctx.rect(nx, ny, tw, th); ctx.clip();
    const thumb = getMapThumb(mapId);
    if (thumb) {
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(thumb, nx, ny, tw, th);
    }
    // fog overlay
    if (!game.devFogReveal) {
      const fog = getFogThumb(mapId, game);
      if (fog) ctx.drawImage(fog, nx, ny, tw, th);
    }
    ctx.restore();

    // border (pulses for current map)
    const isCurrent = game.party && game.party.mapId === mapId;
    const pulse = isCurrent ? 0.5 + Math.sin((game.time || 0) * 0.005) * 0.5 : 1;
    ctx.save();
    ctx.strokeStyle = isCurrent ? `rgba(34,227,255,${pulse})` : tc;
    ctx.lineWidth = isCurrent ? 3 : 1.5;
    ctx.strokeRect(nx + 0.5, ny + 0.5, tw - 1, th - 1);
    ctx.restore();

    // tier badge (top-left)
    const badgeSz = Math.max(18, Math.round(22 * zoom));
    ctx.save();
    ctx.fillStyle = 'rgba(7,6,13,0.88)'; ctx.fillRect(nx, ny, badgeSz, badgeSz);
    ctx.fillStyle = tc;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.max(8, Math.round(9 * zoom))}px ui-monospace, monospace`;
    ctx.fillText(`T${mapData.tier}`, nx + badgeSz / 2, ny + badgeSz / 2);
    ctx.restore();

    // map name (below thumbnail)
    ctx.save();
    ctx.fillStyle = PALETTE.ink;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = `600 ${Math.max(10, Math.round(12 * zoom))}px system-ui, sans-serif`;
    ctx.fillText(mapData.name, pos.x, ny + th + 4);
    ctx.restore();

    // helpers: tile coord → thumbnail pixel
    const tx = (t) => nx + (t / MAP_W) * tw;
    const ty = (t) => ny + (t / MAP_H) * th;

    // ── City dot at real map position ─────────────────────────────────────────
    if (mapData.city) {
      const r = Math.max(4, Math.round(5 * zoom));
      const cdx = tx(mapData.city.x), cdy = ty(mapData.city.y);
      ctx.save();
      ctx.beginPath(); ctx.rect(nx, ny, tw, th); ctx.clip();
      ctx.fillStyle   = mapData.city.unlocked ? PALETTE.accent : 'rgba(255,45,212,0.3)';
      ctx.strokeStyle = mapData.city.unlocked ? 'rgba(255,255,255,0.8)' : 'rgba(138,131,184,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cdx, cdy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (mapData.city.unlocked && zoom >= 0.5) {
        ctx.fillStyle = PALETTE.ink;
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.font = `500 ${Math.max(8, Math.round(9 * zoom))}px system-ui, sans-serif`;
        ctx.fillText(mapData.city.name, cdx, cdy - r - 2);
      }
      ctx.restore();
    }

    // ── Enemy dots at real map positions ──────────────────────────────────────
    const encounters = mapData.encounters || [];
    const er = Math.max(3, Math.round(4 * zoom));
    ctx.save();
    ctx.beginPath(); ctx.rect(nx, ny, tw, th); ctx.clip();
    for (const e of encounters) {
      const ex = tx(e.x), ey = ty(e.y);
      ctx.fillStyle   = e.cleared ? 'rgba(74,242,161,0.55)' : '#ff4a5a';
      ctx.strokeStyle = e.cleared ? 'rgba(74,242,161,0.9)'  : 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();

    // ── World drop diamond at real map position ────────────────────────────────
    if (mapData.worldDrop) {
      const taken = game.party && game.party.worldDropsTaken[mapId];
      const ds = Math.max(4, Math.round(6 * zoom));
      const ddx = tx(mapData.worldDrop.x), ddy = ty(mapData.worldDrop.y);
      ctx.save();
      ctx.beginPath(); ctx.rect(nx, ny, tw, th); ctx.clip();
      ctx.fillStyle   = taken ? 'rgba(34,227,255,0.2)' : '#22e3ff';
      ctx.strokeStyle = taken ? 'rgba(34,227,255,0.35)' : 'rgba(34,227,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ddx, ddy - ds); ctx.lineTo(ddx + ds, ddy);
      ctx.lineTo(ddx, ddy + ds); ctx.lineTo(ddx - ds, ddy);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  // ── Legend ───────────────────────────────────────────────────────────────────
  const lx = rect.x + 10, ly = rect.y + rect.h - 56;
  ctx.save();
  ctx.fillStyle = 'rgba(7,6,13,0.82)';
  ctx.fillRect(lx, ly, 220, 50);
  ctx.fillStyle = '#ff4a5a';
  ctx.beginPath(); ctx.arc(lx + 12, ly + 13, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PALETTE.dim; ctx.font = '400 10px ui-monospace, monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('active enemies', lx + 22, ly + 13);
  ctx.fillStyle = 'rgba(74,242,161,0.5)';
  ctx.beginPath(); ctx.arc(lx + 12, ly + 35, 6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(74,242,161,0.7)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = PALETTE.dim; ctx.fillText('cleared', lx + 22, ly + 35);
  ctx.fillStyle = '#22e3ff';
  ctx.beginPath();
  ctx.moveTo(lx + 122, ly + 6); ctx.lineTo(lx + 128, ly + 13);
  ctx.lineTo(lx + 122, ly + 20); ctx.lineTo(lx + 116, ly + 13);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = PALETTE.dim; ctx.fillText('world drop', lx + 132, ly + 13);
  ctx.fillStyle = PALETTE.accent;
  ctx.beginPath(); ctx.arc(lx + 122, ly + 35, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PALETTE.dim; ctx.fillText('city', lx + 132, ly + 35);
  ctx.restore();

  ctx.restore(); // end clip

  // border
  ctx.strokeStyle = PALETTE.accent2;
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

  // hover tooltip
  if (menuState.hoverCity) {
    const c = menuState.hoverCity;
    const tipX = rect.x + rect.w - 280;
    const tipY = rect.y + 12;
    ctx.fillStyle = 'rgba(7,6,13,0.9)';
    ctx.fillRect(tipX, tipY, 260, 90);
    ctx.strokeStyle = PALETTE.accent;
    ctx.strokeRect(tipX + 0.5, tipY + 0.5, 259, 89);
    ctx.fillStyle = PALETTE.ink;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.fillText(c.name, tipX + 10, tipY + 8);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '400 11px system-ui, sans-serif';
    wrapText(ctx, c.blurb, tipX + 10, tipY + 30, 240, 14);
    ctx.fillStyle = c.unlocked ? PALETTE.accent2 : PALETTE.warn;
    ctx.font = '600 11px ui-monospace, monospace';
    ctx.fillText(c.unlocked ? '[click] fast-travel' : '[locked] visit in person first', tipX + 10, tipY + 72);
  }
}

function resetBtnRect(game) {
  // kept for backward-compat with mouse handler; topology view has no reset btn
  const rect = mapRect(game);
  return { x: -999, y: -999, w: 0, h: 0 };
}

function tileMapColor(biome, type) {
  if (type === 'tile_cracked_road') return '#4a4550';
  if (type === 'tile_stream')       return '#1f5a90';
  if (type === 'tile_bio_pool')     return '#2fa868';
  if (type === 'tile_ruin_rubble')  return '#3a3540';
  switch (biome) {
    case 'grassland_ruins': return '#2f5a3a';
    case 'neon_wastes':     return '#6a4e35';
    case 'alien_terraform': return '#2e5e46';
    case 'frozen_ruins':    return '#3a4a5a';
    case 'forest_veil':     return '#284a30';
    case 'mire_bog':        return '#2a3a28';
    case 'crater_ember':    return '#5a3020';
    case 'frost_canyon':    return '#303848';
    default: return '#1e1e28';
  }
}

// --- shared drawing helpers ---

function drawBar(ctx, x, y, w, h, cur, max, fill, bg) {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  const pct = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, Math.floor(w * pct), h);
}

// --- geometry helpers ---
function frameRect(game) {
  const padX = 60, padY = 50;
  return { x: padX, y: padY, w: game.width - padX * 2, h: game.height - padY * 2 };
}

function tabBarRects(game) {
  const f = frameRect(game);
  const tabY = f.y + 14;
  const barW = f.w - 40;
  const tabW = barW / TABS.length;
  return TABS.map((_, i) => ({
    x: f.x + 20 + i * tabW,
    y: tabY,
    w: tabW - 4,
    h: 44,
  }));
}

function mapRect(game) {
  const f = frameRect(game);
  const top = f.y + 60;
  return { x: f.x + 20, y: top, w: f.w - 40, h: f.h - top + f.y - 30 };
}

function mapScale(_game) {
  // topology view: zoom is a direct scale factor, not tile-relative
  return menuState.map.zoom;
}

function settingsToggleRect(game) {
  const f = frameRect(game);
  return { x: game.width / 2 - 180, y: f.y + 220, w: 360, h: 40 };
}

function pointInRect(x, y, r) {
  return x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h;
}

function pickCity(mx, my, rect, game) {
  const zoom = menuState.map.zoom;
  const tw = THUMB_VW * zoom, th = THUMB_VH * zoom;
  for (const [mapId, mapData] of Object.entries(MAPS)) {
    if (!mapData.city) continue;
    const disc = game.devFogReveal ||
      !!(game.explored && game.explored[mapId] && game.explored[mapId].size > 0);
    if (!disc) continue;
    const pos = worldNodePx(mapId, rect);
    if (!pos) continue;
    // clicking anywhere in the thumbnail rect selects this map's city
    const nx = pos.x - tw / 2, ny = pos.y - th / 2;
    if (mx >= nx && mx <= nx + tw && my >= ny && my <= ny + th) return mapData.city;
  }
  return null;
}

function fastTravel(city, game) {
  if (city.mapId && city.mapId !== game.party.mapId) {
    game.party.mapId = city.mapId;
    game.cameraX = undefined;
    game.cameraY = undefined;
  }
  game.party.x = city.x;
  game.party.y = city.y;
  game.party.fromX = city.x;
  game.party.fromY = city.y;
  menuState.open = false;
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}
