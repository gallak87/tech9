// Chronoforge — Scene renderers + party controller for overworld.
// Battle and Base remain stubs (Phase 3, Phase 4).

import {
  TILE, MAP_W, MAP_H,
  tileAt, encounterAt, doorwayAt, worldDropAt,
  getMap, MAPS, PLAYER_START,
} from './world.js';
import { drawSprite, getSpriteVersion } from './sprites.js';
import { aggregateYields, TICK_MS } from './base.js';
import { checkQuestProgress, ITEM_DEFS, hasSave, getSaveMeta, saveGame } from './progression.js';
import { getMapBackdrop } from './devWorld.js';
import { beginTravel } from './travel.js';

const PALETTE = {
  bg: '#07060d', bgAlt: '#120a22',
  ink: '#e7e5ff', dim: '#8a83b8',
  accent: '#ff2dd4', accent2: '#22e3ff', warn: '#ffd23f',
  grid: '#1d1638',
};

export function drawScanlines(ctx, w, h) {
  ctx.fillStyle = 'rgba(255,255,255,0.015)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
}

// --- SPLASH ---
export function drawSplash(ctx, game) {
  const { width: w, height: h } = game;
  const cx = w / 2, cy = h / 2;

  const grd = ctx.createRadialGradient(cx, cy, 50, cx, cy, Math.max(w, h));
  grd.addColorStop(0, '#1a0f3d');
  grd.addColorStop(1, PALETTE.bg);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  drawScanlines(ctx, w, h);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const pulse = 1 + Math.sin(game.time * 0.003) * 0.03;
  ctx.save();
  ctx.translate(cx, cy - 40);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = PALETTE.accent;
  ctx.font = '700 84px system-ui, sans-serif';
  ctx.shadowColor = PALETTE.accent;
  ctx.shadowBlur = 30;
  ctx.fillText('CHRONOFORGE', 0, 0);
  ctx.shadowBlur = 0;
  ctx.restore();

  ctx.fillStyle = PALETTE.accent2;
  ctx.font = '400 18px system-ui, sans-serif';
  ctx.fillText('a post-collapse strategy-RPG', cx, cy + 20);

  if (hasSave()) {
    const meta = getSaveMeta();
    const sel = game.splashCursor ?? 0;
    const btnW = 200, btnH = 44, gap = 14;
    const btnY = cy + 64;

    // save summary
    if (meta) {
      ctx.fillStyle = PALETTE.dim;
      ctx.font = '400 12px ui-monospace, monospace';
      const d = new Date(meta.ts);
      ctx.fillText(`Tier ${meta.tier}  ·  Lv ${meta.heroLevels?.join('/')}  ·  ${d.toLocaleDateString()}`, cx, btnY - 18);
    }

    const btns = [
      { label: 'CONTINUE', color: PALETTE.accent },
      { label: 'NEW GAME', color: PALETTE.accent2 },
    ];
    btns.forEach(({ label, color }, i) => {
      const bx = cx - btnW / 2;
      const by = btnY + i * (btnH + gap);
      const active = sel === i;
      ctx.fillStyle = active ? color + '33' : 'transparent';
      ctx.fillRect(bx, by, btnW, btnH);
      ctx.strokeStyle = active ? color : PALETTE.dim;
      ctx.lineWidth = active ? 2 : 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, btnW - 1, btnH - 1);
      ctx.fillStyle = active ? color : PALETTE.dim;
      ctx.font = `${active ? '700' : '400'} 15px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, by + btnH / 2);
    });

    ctx.fillStyle = PALETTE.dim;
    ctx.font = '400 11px ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText('↑ ↓ to select  ·  ENTER to confirm', cx, btnY + 2 * (btnH + gap) + 14);
  } else {
    const blink = Math.floor(game.time / 600) % 2 === 0;
    if (blink) {
      ctx.fillStyle = PALETTE.ink;
      ctx.font = '600 16px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('PRESS ENTER', cx, cy + 90);
    }
  }

  ctx.fillStyle = PALETTE.dim;
  ctx.font = '400 12px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText('phase 5 — progression & save', cx, h - 30);
}

// --- OVERWORLD ---
export function initParty() {
  return {
    mapId: PLAYER_START.mapId,
    x: PLAYER_START.x,
    y: PLAYER_START.y,
    fromX: PLAYER_START.x,
    fromY: PLAYER_START.y,
    moveStart: -9999,
    moveCooldown: 0,
    facing: 'down',
    worldDropsTaken: {}, // { [mapId]: true }
  };
}

export function initExplored() {
  const explored = {};
  for (const id of Object.keys(MAPS)) explored[id] = new Set();
  return explored;
}

export function currentExplored(game) {
  const id = game.party.mapId;
  if (!game.explored[id]) game.explored[id] = new Set();
  return game.explored[id];
}

const MOVE_DURATION_MS = 140;
const MOVE_COOLDOWN_MS = 140;
const CAMERA_LERP = 0.18;

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

// --- offscreen tile atlas per mapId (fallback when a backdrop is missing) ---
const tileCanvasCache = Object.create(null); // mapId -> { canvas, version }

function getTileCanvas(mapId) {
  const version = getSpriteVersion();
  let entry = tileCanvasCache[mapId];
  if (!entry) {
    const canvas = document.createElement('canvas');
    canvas.width = MAP_W * TILE;
    canvas.height = MAP_H * TILE;
    entry = { canvas, version: -1 };
    tileCanvasCache[mapId] = entry;
  }
  if (entry.version !== version) {
    const ctx = entry.canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const t = tileAt(mapId, tx, ty);
        if (!t) continue;
        drawSprite(ctx, t.t, tx * TILE, ty * TILE, TILE, TILE);
      }
    }
    entry.version = version;
  }
  return entry.canvas;
}

// --- fog canvas per mapId ---
const fogCache = Object.create(null); // mapId -> { canvas, exploredSize }

function getFogCanvas(game) {
  const mapId = game.party.mapId;
  const exp = currentExplored(game);
  let entry = fogCache[mapId];
  if (!entry) {
    const canvas = document.createElement('canvas');
    canvas.width = MAP_W * TILE;
    canvas.height = MAP_H * TILE;
    entry = { canvas, exploredSize: -1 };
    fogCache[mapId] = entry;
  }
  if (entry.exploredSize === exp.size) return entry.canvas;
  const fctx = entry.canvas.getContext('2d');
  fctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
  let prevA = -1;
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const here = exp.has(`${tx},${ty}`);
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (exp.has(`${tx + dx},${ty + dy}`)) n++;
        }
      }
      let a;
      if (here && n === 8) a = 0;
      else if (here) a = 56;
      else if (n > 0) a = 140;
      else a = 219;
      if (a === 0) continue;
      if (a !== prevA) {
        fctx.fillStyle = `rgba(7,6,13,${(a / 255).toFixed(3)})`;
        prevA = a;
      }
      fctx.fillRect(tx * TILE, ty * TILE, TILE + 1, TILE + 1);
    }
  }
  entry.exploredSize = exp.size;
  return entry.canvas;
}

export function partyRenderPos(game) {
  const p = game.party;
  const t = Math.min(1, Math.max(0, (game.time - p.moveStart) / MOVE_DURATION_MS));
  const e = easeOutCubic(t);
  return {
    x: p.fromX + (p.x - p.fromX) * e,
    y: p.fromY + (p.y - p.fromY) * e,
    moving: t < 1,
  };
}

export function updateOverworld(game, dt) {
  const p = game.party;
  p.moveCooldown -= dt;
  if (p.moveCooldown > 0) return;

  let dx = 0, dy = 0;
  if (game.keys.has('w') || game.keys.has('W') || game.keys.has('ArrowUp')) dy = -1;
  else if (game.keys.has('s') || game.keys.has('S') || game.keys.has('ArrowDown')) dy = 1;
  else if (game.keys.has('a') || game.keys.has('A') || game.keys.has('ArrowLeft')) dx = -1;
  else if (game.keys.has('d') || game.keys.has('D') || game.keys.has('ArrowRight')) dx = 1;

  if (dx === 0 && dy === 0) return;

  const nx = p.x + dx, ny = p.y + dy;
  const map = getMap(p.mapId);
  const hasBackdrop = !!(map && getMapBackdrop(map.backdrop));
  if (!hasBackdrop) {
    const t = tileAt(p.mapId, nx, ny);
    if (!t || !t.passable) return;
  } else {
    if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) return;
  }

  p.fromX = p.x; p.fromY = p.y;
  p.x = nx; p.y = ny;
  p.moveStart = game.time;
  p.facing = dy < 0 ? 'up' : dy > 0 ? 'down' : dx < 0 ? 'left' : 'right';
  p.moveCooldown = MOVE_COOLDOWN_MS;

  revealAround(game, nx, ny, 4);

  const mapForCity = getMap(p.mapId);
  const city = mapForCity && mapForCity.city;
  // City landmark is 4×4 tiles centred on (city.x, city.y) with a 2-tile cell offset → footprint [x-1, x+2] × [y-1, y+2]
  if (city && !city.unlocked && nx >= city.x - 1 && nx <= city.x + 2 && ny >= city.y - 1 && ny <= city.y + 2) {
    city.unlocked = true;
    game.toast(`Reached ${city.name} — fast-travel unlocked`);
    if (game.quests) checkQuestProgress(game, { type: 'city_reached', cityId: city.id });
  }

  // doorway → chrono-rift travel
  const door = doorwayAt(p.mapId, nx, ny);
  if (door) {
    beginTravel(game, door);
    return;
  }

  // encounter → battle
  const enc = encounterAt(p.mapId, nx, ny);
  if (enc) {
    game.pendingEncounter = enc;
    game.setState('battle');
    return;
  }

  // world drop → pick up (handled in game.js via showRewards hook)
  const drop = worldDropAt(p.mapId, nx, ny);
  if (drop && !p.worldDropsTaken[p.mapId] && game.pickUpWorldDrop) {
    game.pickUpWorldDrop(drop);
    p.worldDropsTaken[p.mapId] = true;
  }
}

function revealAround(game, cx, cy, r) {
  const exp = currentExplored(game);
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
        if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) {
          exp.add(`${x},${y}`);
        }
      }
    }
  }
}

export function drawOverworld(ctx, game) {
  drawMapScene(ctx, game, game.party.mapId);
  drawOverworldHud(ctx, game);
}

// Renders a map scene at the current party position. Factored so travel.js
// can snapshot the from/to maps with the same pipeline.
export function drawMapScene(ctx, game, mapId) {
  const { width: w, height: h } = game;
  const map = getMap(mapId);
  const render = partyRenderPos(game);

  const backdrop = map ? getMapBackdrop(map.backdrop) : null;
  const atlas = backdrop || getTileCanvas(mapId);

  const targetCamXRaw = render.x * TILE + TILE / 2 - w / 2;
  const targetCamYRaw = render.y * TILE + TILE / 2 - h / 2;
  const targetCamX = Math.max(0, Math.min(atlas.width - w, targetCamXRaw));
  const targetCamY = Math.max(0, Math.min(atlas.height - h, targetCamYRaw));
  if (game.cameraX === undefined) { game.cameraX = targetCamX; game.cameraY = targetCamY; }
  game.cameraX += (targetCamX - game.cameraX) * CAMERA_LERP;
  game.cameraY += (targetCamY - game.cameraY) * CAMERA_LERP;
  const camX = Math.max(0, Math.min(atlas.width - w, game.cameraX));
  const camY = Math.max(0, Math.min(atlas.height - h, game.cameraY));

  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, w, h);

  const srcX = camX;
  const srcY = camY;
  const srcW = Math.min(atlas.width - srcX, w);
  const srcH = Math.min(atlas.height - srcY, h);
  if (srcW > 0 && srcH > 0) {
    const dstX = 0;
    const dstY = 0;
    ctx.drawImage(atlas, srcX, srcY, srcW, srcH, dstX, dstY, srcW, srcH);
  }

  const exp = currentExplored(game);

  // city landmark on its footprint
  if (map && map.city && exp.has(`${map.city.x},${map.city.y}`)) {
    drawCityLandmark(ctx, map.city, camX, camY, game.time);
  }

  // doorway markers — subtle cyan radial pulse + chevron glyph toward exit
  if (map) {
    for (const d of map.doorways) {
      if (!exp.has(`${d.x},${d.y}`)) continue;
      drawDoorway(ctx, d, camX, camY, game.time);
    }
  }

  // world drop — pulsing gold glow on its tile
  if (map && map.worldDrop && !game.party.worldDropsTaken[mapId]) {
    drawWorldDrop(ctx, map.worldDrop, camX, camY, game.time);
  }

  // encounter markers
  if (map) {
    for (const e of map.encounters) {
      if (e.cleared) continue;
      const ew = TILE * 1.5, eh = TILE * 1.5;
      const sx = Math.round(e.x * TILE - camX);
      const sy = Math.round(e.y * TILE - camY);
      const bob = Math.sin(game.time * 0.006 + e.x) * 2;
      const ecx = sx + TILE / 2, ecy = sy + TILE / 2 + bob;
      const eg = ctx.createRadialGradient(ecx, ecy, 0, ecx, ecy, ew * 0.7);
      eg.addColorStop(0, 'rgba(7,6,13,0.45)');
      eg.addColorStop(1, 'rgba(7,6,13,0)');
      ctx.fillStyle = eg;
      ctx.fillRect(ecx - ew * 0.7, ecy - ew * 0.7, ew * 1.4, ew * 1.4);
      drawSprite(ctx, `${e.enemy}_ow`, sx + (TILE - ew) / 2, sy + TILE - eh + bob, ew, eh);
    }
  }

  // party
  const idleBob = render.moving ? 0 : Math.sin(game.time * 0.005) * 1.5;
  const pcx = Math.round(render.x * TILE - camX);
  const pcy = Math.round(render.y * TILE - camY + idleBob);
  const hcx = pcx + TILE / 2, hcy = pcy + TILE / 2;
  const hr = TILE * 0.9;
  const hg = ctx.createRadialGradient(hcx, hcy, 0, hcx, hcy, hr);
  hg.addColorStop(0, 'rgba(7,6,13,0.55)');
  hg.addColorStop(0.55, 'rgba(7,6,13,0.25)');
  hg.addColorStop(1, 'rgba(7,6,13,0)');
  ctx.fillStyle = hg;
  ctx.fillRect(hcx - hr, hcy - hr, hr * 2, hr * 2);
  ctx.fillStyle = 'rgba(34,227,255,0.28)';
  ctx.beginPath();
  ctx.ellipse(pcx + TILE / 2, pcy + TILE - 2, 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  drawSprite(ctx, 'kaida_overworld', pcx + (TILE - TILE * 1.5) / 2, pcy + TILE - TILE * 1.5, TILE * 1.5, TILE * 1.5);

  if (!game.devFogReveal) drawSoftFog(ctx, game, camX, camY, w, h);
}

function drawCityLandmark(ctx, c, camX, camY, time) {
  const CITY_TILES = 2;
  const cellPx = CITY_TILES * TILE;
  const fx = Math.round(c.x * TILE - camX);
  const fy = Math.round(c.y * TILE - camY);
  const pulse = 0.5 + Math.sin(time * 0.0025 + c.x * 0.5) * 0.5;
  const stroke = c.unlocked ? '255,45,212' : '34,227,255';
  const boxSize = TILE * 4;
  const bx = fx + (cellPx - boxSize) / 2, by = fy + (cellPx - boxSize) / 2;
  ctx.fillStyle = 'rgba(7,6,13,0.78)';
  ctx.fillRect(bx, by, boxSize, boxSize);
  ctx.fillStyle = `rgba(${stroke},${0.08 + pulse * 0.06})`;
  ctx.fillRect(bx, by, boxSize, boxSize);
  const landmarkSize = TILE * 4;
  const lx = fx + (cellPx - landmarkSize) / 2;
  const ly = fy + (cellPx - landmarkSize) / 2;
  drawSprite(ctx, c.landmark, lx, ly, landmarkSize, landmarkSize);
  ctx.strokeStyle = `rgba(${stroke},${0.55 + pulse * 0.35})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(bx + 0.5, by + 0.5, boxSize - 1, boxSize - 1);
  ctx.strokeStyle = `rgba(${stroke},${0.2 + pulse * 0.15})`;
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 3.5, by + 3.5, boxSize - 7, boxSize - 7);
  ctx.fillStyle = PALETTE.ink;
  ctx.textAlign = 'center';
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.fillText(c.name.toUpperCase(), bx + boxSize / 2, by - 6);
}

function drawDoorway(ctx, d, camX, camY, time) {
  const fx = Math.round(d.x * TILE - camX);
  const fy = Math.round(d.y * TILE - camY);
  const cx = fx + TILE / 2, cy = fy + TILE / 2;
  const pulse = 0.5 + Math.sin(time * 0.004) * 0.5;
  const r = TILE * (0.55 + pulse * 0.1);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(34,227,255,${0.35 + pulse * 0.25})`);
  g.addColorStop(1, 'rgba(34,227,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.strokeStyle = `rgba(34,227,255,${0.6 + pulse * 0.3})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, TILE * 0.34, 0, Math.PI * 2);
  ctx.stroke();
  // chevron ">>" glyph
  ctx.strokeStyle = `rgba(255,255,255,${0.7 + pulse * 0.3})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const chev = 6;
  ctx.moveTo(cx - chev, cy - chev);
  ctx.lineTo(cx, cy);
  ctx.lineTo(cx - chev, cy + chev);
  ctx.moveTo(cx + 2, cy - chev);
  ctx.lineTo(cx + chev + 2, cy);
  ctx.lineTo(cx + 2, cy + chev);
  ctx.stroke();
}

function drawWorldDrop(ctx, drop, camX, camY, time) {
  const fx = Math.round(drop.x * TILE - camX);
  const fy = Math.round(drop.y * TILE - camY);
  const cx = fx + TILE / 2, cy = fy + TILE / 2;
  const pulse = 0.5 + Math.sin(time * 0.005) * 0.5;
  const r = TILE * (0.5 + pulse * 0.15);
  const def = ITEM_DEFS[drop.itemId];
  const color = def ? def.color : '#ffd23f';
  const rgb = hexToRgb(color);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(${rgb},${0.55 + pulse * 0.25})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  const iconSize = TILE * 1.0;
  drawSprite(ctx, `icon_${drop.itemId}`, cx - iconSize / 2, cy - iconSize / 2, iconSize, iconSize);
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function drawSoftFog(ctx, game, camX, camY, w, h) {
  const fog = getFogCanvas(game);
  const srcW = Math.min(fog.width - camX, w);
  const srcH = Math.min(fog.height - camY, h);
  if (srcW <= 0 || srcH <= 0) return;
  ctx.drawImage(fog, camX, camY, srcW, srcH, 0, 0, srcW, srcH);
}

function drawOverworldHud(ctx, game) {
  const { width: w, height: h } = game;

  // top bar: party pos, resources
  ctx.fillStyle = 'rgba(7,6,13,0.7)';
  ctx.fillRect(0, 0, w, 44);
  ctx.fillStyle = PALETTE.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '600 13px ui-monospace, monospace';
  ctx.fillText(`Kaida · Vex · Rune   pos (${game.party.x}, ${game.party.y})`, 16, 18);

  const rates = aggregateYields(game);
  const anyRate = rates.food + rates.ore + rates.energy + rates.renown > 0;
  const progress = anyRate ? Math.min(1, (game.time - (game.base.lastTickAt || 0)) / TICK_MS) : 0;
  const resItems = [
    { key: 'food',   label: 'Food',   color: '#7fe39a' },
    { key: 'ore',    label: 'Ore',    color: '#b9c1d9' },
    { key: 'energy', label: 'Energy', color: '#ffd23f' },
    { key: 'renown', label: 'Renown', color: PALETTE.accent },
  ];
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.font = '600 13px ui-monospace, monospace';
  let rx = w - 16;
  for (let i = resItems.length - 1; i >= 0; i--) {
    const it = resItems[i];
    const val = game.resources[it.key] | 0;
    const rate = rates[it.key] | 0;
    const main = `${it.label} ${val}`;
    ctx.fillStyle = it.color;
    ctx.fillText(main, rx, 16);
    const mainW = ctx.measureText(main).width;

    // small progress pill + rate under this resource (only if yielding)
    if (rate > 0) {
      const pillW = Math.max(32, mainW);
      const pillX = rx - pillW;
      const pillY = 30;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(pillX, pillY, pillW, 2);
      ctx.fillStyle = it.color;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(pillX, pillY, pillW * progress, 2);
      ctx.globalAlpha = 1;

      ctx.fillStyle = 'rgba(138,131,184,0.85)';
      ctx.font = '500 10px ui-monospace, monospace';
      ctx.fillText(`+${rate}`, rx, 38);
      ctx.font = '600 13px ui-monospace, monospace';
    }
    rx -= mainW + 24;
  }

  // bottom hint bar
  ctx.fillStyle = 'rgba(7,6,13,0.7)';
  ctx.fillRect(0, h - 28, w, 28);
  ctx.fillStyle = PALETTE.dim;
  ctx.textAlign = 'center';
  ctx.font = '400 12px ui-monospace, monospace';
  ctx.fillText('[WASD] move   [Esc/Tab] menu   [C] city base   step on an enemy to fight', w / 2, h - 14);

  // toast
  if (game.toastMsg && game.toastExpire > game.time) {
    const alpha = Math.min(1, (game.toastExpire - game.time) / 600);
    ctx.fillStyle = `rgba(255,45,212,${0.9 * alpha})`;
    ctx.font = '700 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(game.toastMsg, w / 2, 80);
  }

  // reward row
  if (game.rewards && game.rewardsExpire > game.time) {
    drawRewardRow(ctx, game, w);
  }
}

function drawRewardRow(ctx, game, w) {
  const items = game.rewards;
  const alpha = Math.min(1, (game.rewardsExpire - game.time) / 600);
  const cardW = 112, cardH = 64, gap = 12, iconSize = 40;
  const totalW = items.length * cardW + (items.length - 1) * gap;
  let x = (w - totalW) / 2;
  const y = 72;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const it of items) {
    ctx.fillStyle = 'rgba(7,6,13,0.9)';
    ctx.fillRect(x, y, cardW, cardH);
    ctx.strokeStyle = PALETTE.accent2;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, cardW - 1, cardH - 1);
    drawSprite(ctx, it.icon, x + 12, y + (cardH - iconSize) / 2, iconSize, iconSize);
    ctx.fillStyle = PALETTE.warn;
    ctx.font = '800 24px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`+${it.amount}`, x + cardW - 14, y + cardH / 2);
    x += cardW + gap;
  }
  ctx.restore();
}

function drawGrid(ctx, w, h) {
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < w; x += 32) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let y = 0; y < h; y += 32) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();
}
