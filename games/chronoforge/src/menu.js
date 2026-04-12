// Chronoforge — Unified pause/menu overlay.
// Tabs: Map, Party, Inventory, Skills, Quests, Save, Settings.
// Map tab is fully live: pan (drag / WASD / arrows), zoom (wheel / +/-),
// fog-of-war, fast-travel on click to unlocked cities.

import { TILE, MAP_W, MAP_H, TILES, CITIES } from './world.js';
import { spriteSettings, drawSprite } from './sprites.js';

export const TABS = ['Map', 'Party', 'Inventory', 'Skills', 'Quests', 'Save', 'Settings'];

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
  // map tab view state
  map: {
    zoom: 1,
    cx: MAP_W * TILE / 2, // world-space center
    cy: MAP_H * TILE / 2,
    dragging: false,
    dragLastX: 0,
    dragLastY: 0,
  },
  hoverCity: null,
};

const TAB_SLIDE_MS = 180;

function setTab(next, game) {
  if (next === menuState.tab) return;
  menuState.prevTab = menuState.tab;
  menuState.tabDir = next > menuState.tab ? 1 : -1;
  menuState.tab = next;
  menuState.tabChangeTime = game ? game.time : performance.now();
}

export function openMenu() { menuState.open = true; }
export function closeMenu() { menuState.open = false; menuState.map.dragging = false; }
export function toggleMenu() { menuState.open ? closeMenu() : openMenu(); }

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
  }
  return true;
}

// --- mouse input ---
export function handleMenuMouseDown(mx, my, game) {
  if (TABS[menuState.tab] === 'Map') {
    const rect = mapRect(game);
    if (pointInRect(mx, my, rect)) {
      // click on a city?
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
  if (TABS[menuState.tab] === 'Settings') {
    const toggle = settingsToggleRect(game);
    if (pointInRect(mx, my, toggle)) {
      spriteSettings.forcePlaceholders = !spriteSettings.forcePlaceholders;
      return true;
    }
  }
  // tab clicks
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
    const worldPerPx = (TILE) / mapScale(game);
    menuState.map.cx -= dx * worldPerPx;
    menuState.map.cy -= dy * worldPerPx;
    menuState.map.dragLastX = mx;
    menuState.map.dragLastY = my;
  } else if (TABS[menuState.tab] === 'Map') {
    const rect = mapRect(game);
    menuState.hoverCity = pickCity(mx, my, rect, game);
  }
}

export function handleMenuMouseUp() {
  menuState.map.dragging = false;
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
    ctx.fillStyle = active ? PALETTE.bg : PALETTE.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(`${i + 1}. ${name}`, r.x + r.w / 2, r.y + r.h / 2);
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
  ctx.fillText('[Q/E] tabs   [1-7] jump   [Esc/Tab] close   (Map: drag / WASD / wheel)', w / 2, frame.y + frame.h - 14);
}

function drawTabBody(ctx, game, name) {
  switch (name) {
    case 'Map': drawMapTab(ctx, game); break;
    case 'Party': drawStubTab(ctx, game, 'PARTY', 'Hero portraits, HP/MP/XP bars, stats — wires up in Phase 5.'); break;
    case 'Inventory': drawStubTab(ctx, game, 'INVENTORY', 'Owned items + equip slots with stat-diff preview — wires up in Phase 5.'); break;
    case 'Skills': drawStubTab(ctx, game, 'SKILLS', 'Per-hero skill trees — wires up in Phase 5.'); break;
    case 'Quests': drawStubTab(ctx, game, 'QUESTS', 'Active and completed quest log — wires up in Phase 5.'); break;
    case 'Save': drawStubTab(ctx, game, 'SAVE', 'localStorage save/load/delete — wires up in Phase 5.'); break;
    case 'Settings': drawSettingsTab(ctx, game); break;
  }
}

function drawStubTab(ctx, game, title, body) {
  const f = frameRect(game);
  ctx.fillStyle = PALETTE.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = '700 40px system-ui, sans-serif';
  ctx.fillText(title, game.width / 2, f.y + 110);
  ctx.fillStyle = PALETTE.dim;
  ctx.font = '400 14px system-ui, sans-serif';
  ctx.fillText(body, game.width / 2, f.y + 170);
}

function drawSettingsTab(ctx, game) {
  const f = frameRect(game);
  ctx.fillStyle = PALETTE.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = '700 34px system-ui, sans-serif';
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
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillText(
    spriteSettings.forcePlaceholders ? '✔  Showing placeholders (A/B mode)' : 'Click to force placeholder sprites',
    toggle.x + toggle.w / 2, toggle.y + toggle.h / 2
  );
}

function drawMapTab(ctx, game) {
  const rect = mapRect(game);

  // frame
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  const scale = mapScale(game);
  const viewW = rect.w / scale;
  const viewH = rect.h / scale;
  const viewX = menuState.map.cx - viewW / 2;
  const viewY = menuState.map.cy - viewH / 2;

  // tile pass — draw a downscaled colored block per tile for perf
  const tileSize = TILE * scale;
  const firstTx = Math.max(0, Math.floor(viewX / TILE));
  const firstTy = Math.max(0, Math.floor(viewY / TILE));
  const lastTx = Math.min(MAP_W, Math.ceil((viewX + viewW) / TILE));
  const lastTy = Math.min(MAP_H, Math.ceil((viewY + viewH) / TILE));

  for (let ty = firstTy; ty < lastTy; ty++) {
    for (let tx = firstTx; tx < lastTx; tx++) {
      const t = TILES[ty][tx];
      const sx = rect.x + (tx * TILE - viewX) * scale;
      const sy = rect.y + (ty * TILE - viewY) * scale;
      ctx.fillStyle = tileMapColor(t.biome, t.t);
      ctx.fillRect(sx, sy, tileSize + 1, tileSize + 1);
    }
  }

  // road overlay: already part of tile type; brightened
  // fog-of-war — block tiles outside explored set
  if (game.explored) {
    ctx.fillStyle = PALETTE.fog;
    for (let ty = firstTy; ty < lastTy; ty++) {
      for (let tx = firstTx; tx < lastTx; tx++) {
        const key = `${tx},${ty}`;
        if (!game.explored.has(key)) {
          const sx = rect.x + (tx * TILE - viewX) * scale;
          const sy = rect.y + (ty * TILE - viewY) * scale;
          ctx.fillRect(sx, sy, tileSize + 1, tileSize + 1);
        }
      }
    }
  }

  // cities
  for (const city of CITIES) {
    const sx = rect.x + (city.x * TILE + TILE / 2 - viewX) * scale;
    const sy = rect.y + (city.y * TILE + TILE / 2 - viewY) * scale;
    const explored = !game.explored || game.explored.has(`${city.x},${city.y}`);
    if (!explored) continue;
    const r = Math.max(6, 10 * scale);
    ctx.fillStyle = city.unlocked ? PALETTE.accent : PALETTE.dim;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
    // label
    ctx.fillStyle = PALETTE.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(city.name, sx, sy - r - 4);
  }

  // party marker
  if (game.party) {
    const px = rect.x + (game.party.x * TILE + TILE / 2 - viewX) * scale;
    const py = rect.y + (game.party.y * TILE + TILE / 2 - viewY) * scale;
    const pulse = 1 + Math.sin(game.time * 0.006) * 0.15;
    ctx.fillStyle = PALETTE.accent2;
    ctx.beginPath();
    ctx.arc(px, py, 8 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.restore();

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
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.fillText(c.name, tipX + 10, tipY + 8);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '400 11px system-ui, sans-serif';
    wrapText(ctx, c.blurb, tipX + 10, tipY + 30, 240, 14);
    ctx.fillStyle = c.unlocked ? PALETTE.accent2 : PALETTE.warn;
    ctx.font = '600 11px ui-monospace, monospace';
    ctx.fillText(c.unlocked ? '[click] fast-travel' : '[locked] visit in person first', tipX + 10, tipY + 72);
  }

  // zoom indicator
  ctx.fillStyle = PALETTE.dim;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = '400 11px ui-monospace, monospace';
  ctx.fillText(`zoom ${menuState.map.zoom.toFixed(2)}x   center (${(menuState.map.cx / TILE).toFixed(0)}, ${(menuState.map.cy / TILE).toFixed(0)})`, rect.x + 8, rect.y + 8);
}

function tileMapColor(biome, type) {
  if (type === 'tile_cracked_road') return '#4a4550';
  if (type === 'tile_stream') return '#1f5a90';
  if (type === 'tile_bio_pool') return '#2fa868';
  switch (biome) {
    case 'grassland_ruins': return '#2f5a3a';
    case 'neon_wastes': return '#6a4e35';
    case 'alien_terraform': return '#3e7a58';
    default: return '#222';
  }
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
    h: 30,
  }));
}

function mapRect(game) {
  const f = frameRect(game);
  const top = f.y + 60;
  return { x: f.x + 20, y: top, w: f.w - 40, h: f.h - top + f.y - 30 };
}

function mapScale(game) {
  const rect = mapRect(game);
  // base: fit whole map into rect at zoom 1
  const fitX = rect.w / (MAP_W * TILE);
  const fitY = rect.h / (MAP_H * TILE);
  return Math.min(fitX, fitY) * menuState.map.zoom;
}

function settingsToggleRect(game) {
  const f = frameRect(game);
  return { x: game.width / 2 - 180, y: f.y + 220, w: 360, h: 40 };
}

function pointInRect(x, y, r) {
  return x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h;
}

function pickCity(mx, my, rect, game) {
  const scale = mapScale(game);
  const viewW = rect.w / scale, viewH = rect.h / scale;
  const viewX = menuState.map.cx - viewW / 2;
  const viewY = menuState.map.cy - viewH / 2;
  for (const city of CITIES) {
    const sx = rect.x + (city.x * TILE + TILE / 2 - viewX) * scale;
    const sy = rect.y + (city.y * TILE + TILE / 2 - viewY) * scale;
    const r = Math.max(8, 12 * scale);
    if ((mx - sx) ** 2 + (my - sy) ** 2 <= r * r) return city;
  }
  return null;
}

function fastTravel(city, game) {
  game.party.x = city.x;
  game.party.y = city.y;
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
