import { TILE, getMap, tileAt, doorwayAt } from './world.js';
import { drawSprite, getSpriteVersion } from './sprites.js';
import { BUILDINGS, drawBaseModals, handleBaseMouseDown, handleBaseKey } from './base.js';
import { getCityBackdrop } from './devWorld.js';
import { playSfx } from './audio.js';

const MOVE_COOLDOWN_MS = 140;
const MOVE_DURATION_MS = 120;
const CAMERA_LERP = 0.18;

const tileCanvasCache = Object.create(null);

function easeOutCubic(t) { return 1 - (1 - t) ** 3; }

function getCityTileCanvas(mapId) {
  const version = getSpriteVersion();
  const map = getMap(mapId);
  const mw = map.w, mh = map.h;
  let entry = tileCanvasCache[mapId];
  if (!entry) {
    const canvas = document.createElement('canvas');
    canvas.width = mw * TILE;
    canvas.height = mh * TILE;
    entry = { canvas, version: -1 };
    tileCanvasCache[mapId] = entry;
  }
  if (entry.version !== version) {
    const ctx = entry.canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
    for (let ty = 0; ty < mh; ty++) {
      for (let tx = 0; tx < mw; tx++) {
        const t = tileAt(mapId, tx, ty);
        if (!t) continue;
        drawSprite(ctx, t.t, tx * TILE, ty * TILE, TILE, TILE);
      }
    }
    entry.version = version;
  }
  return entry.canvas;
}

function cityRenderPos(game) {
  const p = game.party;
  const t = Math.min(1, Math.max(0, (game.time - (p.moveStart || 0)) / MOVE_DURATION_MS));
  const e = easeOutCubic(t);
  return {
    x: (p.fromX ?? p.x) + (p.x - (p.fromX ?? p.x)) * e,
    y: (p.fromY ?? p.y) + (p.y - (p.fromY ?? p.y)) * e,
    moving: t < 1,
  };
}

export function enterCity(game, city) {
  const interiorId = `${city.id}_interior`;
  const map = getMap(interiorId);
  if (!map) return;
  game.party.mapId = interiorId;
  game.party.x = Math.floor(map.w / 2);
  game.party.y = Math.floor((map.h ?? 24) * 0.75);
  game.party.fromX = game.party.x;
  game.party.fromY = game.party.y;
  game.party.facing = 'up';
  game.party.moveCooldown = MOVE_COOLDOWN_MS;
  game.cameraX = undefined;
  game.cameraY = undefined;
  playSfx('ui_click', { gain: 0.5 });
  game.setState('city');
}

export function updateCity(game, dt) {
  const p = game.party;
  p.moveCooldown = (p.moveCooldown || 0) - dt;
  if (p.moveCooldown > 0) return;

  if (game.base.pickerOpen || game.base.upgradeOpen) return;

  let dx = 0, dy = 0;
  if (game.keys.has('w') || game.keys.has('W') || game.keys.has('ArrowUp')) dy = -1;
  else if (game.keys.has('s') || game.keys.has('S') || game.keys.has('ArrowDown')) dy = 1;
  else if (game.keys.has('a') || game.keys.has('A') || game.keys.has('ArrowLeft')) dx = -1;
  else if (game.keys.has('d') || game.keys.has('D') || game.keys.has('ArrowRight')) dx = 1;

  if (dx === 0 && dy === 0) return;

  const mapId = p.mapId;
  const map = getMap(mapId);
  const nx = p.x + dx, ny = p.y + dy;
  const tile = tileAt(mapId, nx, ny);
  if (!tile) return;

  p.fromX = p.x; p.fromY = p.y;
  p.x = nx; p.y = ny;
  p.moveStart = game.time;
  p.facing = dy < 0 ? 'up' : dy > 0 ? 'down' : dx < 0 ? 'left' : 'right';
  p.moveCooldown = MOVE_COOLDOWN_MS;

  // doorway exit
  const door = doorwayAt(mapId, nx, ny);
  if (door) {
    game.party.mapId = door.to.mapId;
    game.party.x = door.to.x;
    game.party.y = door.to.y;
    game.party.fromX = door.to.x;
    game.party.fromY = door.to.y;
    game.party.moveCooldown = MOVE_COOLDOWN_MS;
    game.cameraX = undefined;
    game.cameraY = undefined;
    playSfx('ui_click', { gain: 0.4 });
    game.setState('overworld');
    return;
  }

  // plot interaction (Haventide only)
  if (map.plots) {
    const plot = map.plots.find(pl => pl.x === nx && pl.y === ny);
    if (plot) {
      const slot = game.base.slots[plot.slotIdx];
      if (slot.building) {
        game.base.upgradeOpen = true;
        game.base.activeSlot = plot.slotIdx;
      } else {
        game.base.pickerOpen = true;
        game.base.activeSlot = plot.slotIdx;
      }
      playSfx('ui_click', { gain: 0.5 });
    }
  }
}

export function handleCityMouseDown(game, mx, my) {
  if (game.base.pickerOpen || game.base.upgradeOpen) {
    handleBaseMouseDown(game, mx, my);
  }
}

export function handleCityKey(game, k) {
  if (game.base.pickerOpen || game.base.upgradeOpen) {
    return handleBaseKey(game, k);
  }
  return false;
}

export function drawCityScene(ctx, game) {
  const { width: w, height: h } = game;
  const mapId = game.party.mapId;
  const map = getMap(mapId);
  if (!map) return;

  const mw = map.w, mh = map.h;
  const canvasW = mw * TILE, canvasH = mh * TILE;
  const atlas = getCityBackdrop(mapId, canvasW, canvasH) || getCityTileCanvas(mapId);
  const render = cityRenderPos(game);

  const targetCamXRaw = render.x * TILE + TILE / 2 - w / 2;
  const targetCamYRaw = render.y * TILE + TILE / 2 - h / 2;
  const targetCamX = Math.max(0, Math.min(atlas.width - w, targetCamXRaw));
  const targetCamY = Math.max(0, Math.min(atlas.height - h, targetCamYRaw));
  if (game.cameraX === undefined) { game.cameraX = targetCamX; game.cameraY = targetCamY; }
  game.cameraX += (targetCamX - game.cameraX) * CAMERA_LERP;
  game.cameraY += (targetCamY - game.cameraY) * CAMERA_LERP;
  const camX = Math.max(0, Math.min(atlas.width - w, game.cameraX));
  const camY = Math.max(0, Math.min(atlas.height - h, game.cameraY));

  ctx.fillStyle = '#07060d';
  ctx.fillRect(0, 0, w, h);

  const srcW = Math.min(atlas.width - camX, w);
  const srcH = Math.min(atlas.height - camY, h);
  if (srcW > 0 && srcH > 0) {
    ctx.drawImage(atlas, camX, camY, srcW, srcH, 0, 0, srcW, srcH);
  }

  // building plots (Haventide only)
  if (map.plots) {
    for (const plot of map.plots) {
      const px = Math.round(plot.x * TILE - camX);
      const py = Math.round(plot.y * TILE - camY);
      const slot = game.base.slots[plot.slotIdx];
      if (slot?.building) {
        const def = BUILDINGS[slot.building.type];
        if (def) {
          const isTownCenter = slot.building.type === 'town_center';
          const sprSize = isTownCenter ? TILE * 3 : TILE * 2;
          drawSprite(ctx, def.sprite(slot.building.tier), px + TILE / 2 - sprSize / 2, py + TILE / 2 - sprSize / 2, sprSize, sprSize);
        }
      } else {
        ctx.strokeStyle = 'rgba(34,227,255,0.35)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(px + 4, py + 4, TILE - 8, TILE - 8);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(34,227,255,0.22)';
        ctx.font = '700 22px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+', px + TILE / 2, py + TILE / 2);
      }
    }
  }

  // exit doorway
  for (const door of map.doorways) {
    const dx = Math.round(door.x * TILE - camX);
    const dy = Math.round(door.y * TILE - camY);
    const pulse = 0.5 + 0.5 * Math.sin(game.time * 0.004);
    ctx.fillStyle = `rgba(34,227,255,${0.18 + pulse * 0.12})`;
    ctx.fillRect(dx, dy, TILE, TILE);
    ctx.strokeStyle = `rgba(34,227,255,${0.5 + pulse * 0.3})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(dx + 2, dy + 2, TILE - 4, TILE - 4);
  }

  // player
  const idleBob = render.moving ? 0 : Math.sin(game.time * 0.005) * 1.5;
  const pcx = Math.round(render.x * TILE - camX);
  const pcy = Math.round(render.y * TILE - camY + idleBob);
  ctx.fillStyle = 'rgba(34,227,255,0.18)';
  ctx.beginPath();
  ctx.ellipse(pcx + TILE / 2, pcy + TILE - 2, 24.5, 8.75, 0, 0, Math.PI * 2);
  ctx.fill();
  drawSprite(ctx, 'kaida_overworld', pcx + (TILE - TILE * 1.5) / 2, pcy + TILE - TILE * 1.5, TILE * 1.5, TILE * 1.5);

  // HUD
  ctx.fillStyle = 'rgba(7,6,13,0.7)';
  ctx.fillRect(0, 0, w, 28);
  ctx.fillStyle = '#22e3ff';
  ctx.font = '600 13px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(map.name.toUpperCase(), w / 2, 8);
  ctx.fillStyle = '#8a83b8';
  ctx.font = '400 11px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`[WASD] move   ${map.exitHint ?? 'walk to exit doorway to leave'}`, 12, h - 14);

  // modals on top
  drawBaseModals(ctx, game);
}
