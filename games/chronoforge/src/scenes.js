// Chronoforge — Scene renderers + party controller for overworld.
// Battle and Base remain stubs (Phase 3, Phase 4).

import { TILE, MAP_W, MAP_H, tileAt, CITIES, ENCOUNTERS, PLAYER_START } from './world.js';
import { drawSprite, getSpriteVersion } from './sprites.js';
import { aggregateYields, TICK_MS } from './base.js';
import { checkQuestProgress } from './progression.js';
import { getActiveBackdrop } from './devWorld.js';

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

  const blink = Math.floor(game.time / 600) % 2 === 0;
  if (blink) {
    ctx.fillStyle = PALETTE.ink;
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillText('PRESS ENTER', cx, cy + 90);
  }

  ctx.fillStyle = PALETTE.dim;
  ctx.font = '400 12px ui-monospace, monospace';
  ctx.fillText('phase 2 — overworld alpha', cx, h - 30);
}

// --- OVERWORLD ---
export function initParty() {
  return {
    x: PLAYER_START.x,
    y: PLAYER_START.y,
    fromX: PLAYER_START.x,
    fromY: PLAYER_START.y,
    moveStart: -9999,
    moveCooldown: 0,
    facing: 'down',
  };
}

const MOVE_DURATION_MS = 140;
const MOVE_COOLDOWN_MS = 140;
const CAMERA_LERP = 0.18;

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

// --- offscreen tile atlas (whole world pre-rendered once; re-rendered on sprite load) ---
let tileCanvas = null;
let tileCanvasVersion = -1;

function getTileCanvas() {
  const version = getSpriteVersion();
  if (!tileCanvas) {
    tileCanvas = document.createElement('canvas');
    tileCanvas.width = MAP_W * TILE;
    tileCanvas.height = MAP_H * TILE;
  }
  if (tileCanvasVersion !== version) {
    const ctx = tileCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, tileCanvas.width, tileCanvas.height);
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const t = tileAt(tx, ty);
        if (!t) continue;
        drawSprite(ctx, t.t, tx * TILE, ty * TILE, TILE, TILE);
      }
    }
    tileCanvasVersion = version;
  }
  return tileCanvas;
}

// --- fog canvas (whole map pre-rendered; re-rendered only when explored grows) ---
let fogCanvas = null;
let fogExploredSize = -1;

function getFogCanvas(game) {
  if (!fogCanvas) {
    fogCanvas = document.createElement('canvas');
    fogCanvas.width = MAP_W * TILE;
    fogCanvas.height = MAP_H * TILE;
  }
  if (fogExploredSize === game.explored.size) return fogCanvas;
  const fctx = fogCanvas.getContext('2d');
  fctx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
  const exp = game.explored;
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
  fogExploredSize = exp.size;
  return fogCanvas;
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
  const devBackdrop = getActiveBackdrop();
  if (!devBackdrop) {
    const t = tileAt(nx, ny);
    if (!t || !t.passable) return;
  } else {
    if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) return;
  }

  p.fromX = p.x; p.fromY = p.y;
  p.x = nx; p.y = ny;
  p.moveStart = game.time;
  p.facing = dy < 0 ? 'up' : dy > 0 ? 'down' : dx < 0 ? 'left' : 'right';
  p.moveCooldown = MOVE_COOLDOWN_MS;

  if (!devBackdrop) {
    revealAround(game, nx, ny, 4);

    const city = CITIES.find(c => c.x === nx && c.y === ny);
    if (city && !city.unlocked) {
      city.unlocked = true;
      game.toast(`Reached ${city.name} — fast-travel unlocked`);
      if (game.quests) checkQuestProgress(game, { type: 'city_reached', cityId: city.id });
    }
  }

  // encounter stepped on → battle
  const enc = ENCOUNTERS.find(e => e.x === nx && e.y === ny && !e.cleared);
  if (enc) {
    game.pendingEncounter = enc;
    game.setState('battle');
  }
}

function revealAround(game, cx, cy, r) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
        if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) {
          game.explored.add(`${x},${y}`);
        }
      }
    }
  }
}

export function drawOverworld(ctx, game) {
  const { width: w, height: h } = game;
  const render = partyRenderPos(game);

  // smooth camera: lerp toward party render position
  const targetCamX = render.x * TILE + TILE / 2 - w / 2;
  const targetCamY = render.y * TILE + TILE / 2 - h / 2;
  if (game.cameraX === undefined) { game.cameraX = targetCamX; game.cameraY = targetCamY; }
  game.cameraX += (targetCamX - game.cameraX) * CAMERA_LERP;
  game.cameraY += (targetCamY - game.cameraY) * CAMERA_LERP;
  const camX = game.cameraX;
  const camY = game.cameraY;

  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, w, h);

  const firstTx = Math.max(0, Math.floor(camX / TILE));
  const firstTy = Math.max(0, Math.floor(camY / TILE));
  const lastTx = Math.min(MAP_W, Math.ceil((camX + w) / TILE) + 1);
  const lastTy = Math.min(MAP_H, Math.ceil((camY + h) / TILE) + 1);

  // blit visible slice of the pre-rendered tile atlas (or dev world backdrop)
  const devBackdrop = getActiveBackdrop();
  const atlas = devBackdrop || getTileCanvas();
  const srcX = Math.max(0, camX);
  const srcY = Math.max(0, camY);
  const srcW = Math.min(atlas.width - srcX, w);
  const srcH = Math.min(atlas.height - srcY, h);
  if (srcW > 0 && srcH > 0) {
    const dstX = Math.round(srcX - camX);
    const dstY = Math.round(srcY - camY);
    ctx.drawImage(atlas, srcX, srcY, srcW, srcH, dstX, dstY, srcW, srcH);
  }

  if (devBackdrop) {
    // dev world mode: encounters + party + HUD, no cities/fog/walkability
    for (const e of ENCOUNTERS) {
      if (e.cleared) continue;
      const ew = TILE, eh = TILE;
      const sx = Math.round(e.x * TILE - camX);
      const sy = Math.round(e.y * TILE - camY);
      const bob = Math.sin(game.time * 0.006 + e.x) * 2;
      const ecx = sx + ew / 2, ecy = sy + eh / 2 + bob;
      const eg = ctx.createRadialGradient(ecx, ecy, 0, ecx, ecy, ew * 0.7);
      eg.addColorStop(0, 'rgba(7,6,13,0.45)');
      eg.addColorStop(1, 'rgba(7,6,13,0)');
      ctx.fillStyle = eg;
      ctx.fillRect(ecx - ew * 0.7, ecy - ew * 0.7, ew * 1.4, ew * 1.4);
      drawSprite(ctx, `${e.enemy}_ow`, sx, sy + bob, ew, eh);
    }

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
    drawSprite(ctx, 'kaida_overworld', pcx, pcy, TILE, TILE);
    drawOverworldHud(ctx, game);
    return;
  }

  // cities — sit on a clean 2x2 tile footprint, frame snaps to grid
  const CITY_TILES = 2;
  const cellPx = CITY_TILES * TILE;
  for (const c of CITIES) {
    if (!game.explored.has(`${c.x},${c.y}`)) continue;
    // footprint anchored at the city tile, extending right and down (2x2)
    const fx = Math.round(c.x * TILE - camX);
    const fy = Math.round(c.y * TILE - camY);

    const pulse = 0.5 + Math.sin(game.time * 0.0025 + c.x * 0.5) * 0.5;
    const stroke = c.unlocked ? '255,45,212' : '34,227,255';

    // dark backdrop so terrain stops bleeding through the cell
    ctx.fillStyle = `rgba(7,6,13,0.78)`;
    ctx.fillRect(fx, fy, cellPx, cellPx);
    // subtle pulsing inner tint
    ctx.fillStyle = `rgba(${stroke},${0.08 + pulse * 0.06})`;
    ctx.fillRect(fx, fy, cellPx, cellPx);

    // sprite fills the footprint
    drawSprite(ctx, c.landmark, fx, fy, cellPx, cellPx);

    // pulsing outer frame on tile boundary
    ctx.strokeStyle = `rgba(${stroke},${0.55 + pulse * 0.35})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(fx + 0.5, fy + 0.5, cellPx - 1, cellPx - 1);
    // thin inner rim
    ctx.strokeStyle = `rgba(${stroke},${0.2 + pulse * 0.15})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(fx + 3.5, fy + 3.5, cellPx - 7, cellPx - 7);

    // label above the cell
    ctx.fillStyle = PALETTE.ink;
    ctx.textAlign = 'center';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText(c.name.toUpperCase(), fx + cellPx / 2, fy - 6);
  }

  // encounter markers
  for (const e of ENCOUNTERS) {
    if (e.cleared) continue;
    const ew = 32, eh = 32;
    const sx = Math.round(e.x * TILE - camX);
    const sy = Math.round(e.y * TILE - camY);
    const bob = Math.sin(game.time * 0.006 + e.x) * 2;
    drawSprite(ctx, `${e.enemy}_ow`, sx, sy + bob, ew, eh);
  }

  // party — smooth render pos + idle bob when stationary
  const idleBob = render.moving ? 0 : Math.sin(game.time * 0.005) * 1.5;
  const pcx = Math.round(render.x * TILE - camX);
  const pcy = Math.round(render.y * TILE - camY + idleBob);
  // soft glow ring underfoot (draw first)
  ctx.fillStyle = 'rgba(34,227,255,0.22)';
  ctx.beginPath();
  ctx.ellipse(pcx + TILE / 2, pcy + TILE - 2, 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  drawSprite(ctx, 'kaida_overworld', pcx, pcy, TILE, TILE);

  // soft fog-of-war — single blit from pre-rendered offscreen canvas
  drawSoftFog(ctx, game, camX, camY, w, h);

  drawOverworldHud(ctx, game);
}

function drawSoftFog(ctx, game, camX, camY, w, h) {
  const fog = getFogCanvas(game);
  const srcX = Math.max(0, camX);
  const srcY = Math.max(0, camY);
  const srcW = Math.min(fog.width - srcX, w);
  const srcH = Math.min(fog.height - srcY, h);
  if (srcW <= 0 || srcH <= 0) return;
  const dstX = Math.round(srcX - camX);
  const dstY = Math.round(srcY - camY);
  ctx.drawImage(fog, srcX, srcY, srcW, srcH, dstX, dstY, srcW, srcH);
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
}

function drawGrid(ctx, w, h) {
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < w; x += 32) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let y = 0; y < h; y += 32) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();
}
