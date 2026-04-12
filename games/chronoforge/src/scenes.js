// Chronoforge — Scene renderers + party controller for overworld.
// Battle and Base remain stubs (Phase 3, Phase 4).

import { TILE, MAP_W, MAP_H, tileAt, CITIES, ENCOUNTERS, PLAYER_START } from './world.js';
import { drawSprite } from './sprites.js';

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
  const t = tileAt(nx, ny);
  if (!t || !t.passable) return;

  p.fromX = p.x; p.fromY = p.y;
  p.x = nx; p.y = ny;
  p.moveStart = game.time;
  p.facing = dy < 0 ? 'up' : dy > 0 ? 'down' : dx < 0 ? 'left' : 'right';
  p.moveCooldown = MOVE_COOLDOWN_MS;

  // reveal fog
  revealAround(game, nx, ny, 4);

  // city stepped on → unlock it
  const city = CITIES.find(c => c.x === nx && c.y === ny);
  if (city && !city.unlocked) {
    city.unlocked = true;
    game.toast(`Reached ${city.name} — fast-travel unlocked`);
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

  for (let ty = firstTy; ty < lastTy; ty++) {
    for (let tx = firstTx; tx < lastTx; tx++) {
      const t = tileAt(tx, ty);
      if (!t) continue;
      const sx = Math.round(tx * TILE - camX);
      const sy = Math.round(ty * TILE - camY);
      drawSprite(ctx, t.t, sx, sy, TILE, TILE);
    }
  }

  // cities (landmark sprites, larger than a tile) with pulsing ground glow
  for (const c of CITIES) {
    if (!game.explored.has(`${c.x},${c.y}`)) continue;
    const cw = 128, ch = 96;
    const sx = Math.round(c.x * TILE + TILE / 2 - cw / 2 - camX);
    const sy = Math.round(c.y * TILE + TILE / 2 - ch / 2 - camY);

    // pulsing ground halo
    const pulse = 0.5 + Math.sin(game.time * 0.0025 + c.x * 0.5) * 0.5;
    const haloColor = c.unlocked ? '255,45,212' : '34,227,255';
    const grd = ctx.createRadialGradient(
      sx + cw / 2, sy + ch - 8, 4,
      sx + cw / 2, sy + ch - 8, 60 + pulse * 12
    );
    grd.addColorStop(0, `rgba(${haloColor},${0.35 + pulse * 0.18})`);
    grd.addColorStop(1, `rgba(${haloColor},0)`);
    ctx.fillStyle = grd;
    ctx.fillRect(sx - 20, sy + ch - 60, cw + 40, 80);

    drawSprite(ctx, c.landmark, sx, sy, cw, ch);
    // label
    ctx.fillStyle = PALETTE.ink;
    ctx.textAlign = 'center';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText(c.name.toUpperCase(), sx + cw / 2, sy - 6);
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

  // soft fog-of-war (3-band gradient around reveal edge)
  drawSoftFog(ctx, game, camX, camY, firstTx, firstTy, lastTx, lastTy);

  drawOverworldHud(ctx, game);
}

function drawSoftFog(ctx, game, camX, camY, firstTx, firstTy, lastTx, lastTy) {
  for (let ty = firstTy; ty < lastTy; ty++) {
    for (let tx = firstTx; tx < lastTx; tx++) {
      const alpha = fogAlpha(game, tx, ty);
      if (alpha <= 0) continue;
      const sx = Math.round(tx * TILE - camX);
      const sy = Math.round(ty * TILE - camY);
      ctx.fillStyle = `rgba(7,6,13,${alpha})`;
      ctx.fillRect(sx, sy, TILE + 1, TILE + 1);
    }
  }
}

function fogAlpha(game, tx, ty) {
  const exp = game.explored;
  const here = exp.has(`${tx},${ty}`);
  let neighborsExplored = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (exp.has(`${tx + dx},${ty + dy}`)) neighborsExplored++;
    }
  }
  if (here && neighborsExplored === 8) return 0;          // fully interior — clear
  if (here) return 0.22;                                   // explored edge — faint haze
  if (neighborsExplored > 0) return 0.55;                  // one step out — dim
  return 0.86;                                             // deep unknown
}

function drawOverworldHud(ctx, game) {
  const { width: w, height: h } = game;

  // top bar: party pos, resources
  ctx.fillStyle = 'rgba(7,6,13,0.7)';
  ctx.fillRect(0, 0, w, 36);
  ctx.fillStyle = PALETTE.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '600 13px ui-monospace, monospace';
  ctx.fillText(`Kaida · Vex · Rune   pos (${game.party.x}, ${game.party.y})`, 16, 18);

  ctx.textAlign = 'right';
  ctx.fillStyle = PALETTE.accent2;
  ctx.fillText(`Food ${game.resources.food}   Ore ${game.resources.ore}   Energy ${game.resources.energy}   Renown ${game.resources.renown}`, w - 16, 18);

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

// --- BATTLE (stub) ---
export function drawBattle(ctx, game) {
  const { width: w, height: h } = game;
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, w, h);

  // battle backdrop gradient
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#2a0b3c');
  g.addColorStop(1, '#07060d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  drawScanlines(ctx, w, h);

  // enemy
  const enc = game.pendingEncounter;
  if (enc) {
    drawSprite(ctx, `${enc.enemy}_idle`, w / 2 + 120, h / 2 - 80, 96, 96);
    ctx.fillStyle = PALETTE.warn;
    ctx.textAlign = 'center';
    ctx.font = '600 14px ui-monospace, monospace';
    ctx.fillText(enc.enemy.replace(/_/g, ' '), w / 2 + 168, h / 2 + 30);
  }

  // heroes
  const heroes = ['kaida', 'vex', 'rune'];
  heroes.forEach((id, i) => {
    const x = w / 2 - 260;
    const y = h / 2 - 120 + i * 80;
    drawSprite(ctx, `${id}_battle_idle`, x, y, 96, 96);
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.accent;
  ctx.font = '700 40px system-ui, sans-serif';
  ctx.shadowColor = PALETTE.accent;
  ctx.shadowBlur = 14;
  ctx.fillText('BATTLE', w / 2, 100);
  ctx.shadowBlur = 0;

  ctx.fillStyle = PALETTE.ink;
  ctx.font = '400 14px system-ui, sans-serif';
  ctx.fillText('ATB gauges, techs, and combo finishers arrive Phase 3.', w / 2, h - 80);

  ctx.fillStyle = PALETTE.dim;
  ctx.font = '400 12px ui-monospace, monospace';
  ctx.fillText('[V] win   [L] lose   [F] flee   [Esc/Tab] menu', w / 2, h - 40);
}

export function handleBattleKey(key, game) {
  if (key === 'v' || key === 'V') {
    if (game.pendingEncounter) {
      game.pendingEncounter.cleared = true;
      game.resources.renown += 10;
      game.resources.ore += 5;
      game.toast(`Victory — enemy defeated, +10 Renown`);
    }
    game.pendingEncounter = null;
    game.setState('overworld');
  } else if (key === 'l' || key === 'L') {
    game.toast('Defeated — returning to last city');
    game.pendingEncounter = null;
    const home = CITIES[0];
    game.party.x = home.x; game.party.y = home.y;
    game.setState('overworld');
  } else if (key === 'f' || key === 'F') {
    game.pendingEncounter = null;
    game.setState('overworld');
  }
}

// --- BASE (stub) ---
export function drawBase(ctx, game) {
  const { width: w, height: h } = game;
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, w, h);
  drawGrid(ctx, w, h);
  drawScanlines(ctx, w, h);

  // show a few placeholder buildings
  const row = [
    { name: 'town_center_t1', label: 'Town Center' },
    { name: 'farm_t1', label: 'Farm' },
    { name: 'mine_t1', label: 'Mine' },
  ];
  row.forEach((b, i) => {
    const x = w / 2 - 200 + i * 150;
    const y = h / 2 - 48;
    drawSprite(ctx, b.name, x, y, 96, 96);
    ctx.fillStyle = PALETTE.dim;
    ctx.textAlign = 'center';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(b.label, x + 48, y + 112);
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.accent;
  ctx.font = '700 40px system-ui, sans-serif';
  ctx.shadowColor = PALETTE.accent;
  ctx.shadowBlur = 14;
  ctx.fillText('CITY BASE', w / 2, 100);
  ctx.shadowBlur = 0;

  ctx.fillStyle = PALETTE.ink;
  ctx.font = '400 14px system-ui, sans-serif';
  ctx.fillText('Resource loops + 4-tier upgrades arrive Phase 4.', w / 2, h - 60);
  ctx.fillStyle = PALETTE.dim;
  ctx.font = '400 12px ui-monospace, monospace';
  ctx.fillText('[O] overworld   [Esc/Tab] menu', w / 2, h - 30);
}

function drawGrid(ctx, w, h) {
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < w; x += 32) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let y = 0; y < h; y += 32) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();
}
