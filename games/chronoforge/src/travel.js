// Chrono-rift travel transition. Two phases over 800ms:
//   0–400ms: current map, growing magenta rift band + chromatic split + white punch
//   400–800ms: destination map fading in, rift recedes, "→ <MAP>" tag lower-right
// Swaps party.mapId + coords at the 400ms midpoint.

import { playSfx } from './audio.js';
import { getMap } from './world.js';
import { revealAround } from './scenes.js';

const DURATION_MS = 800;
const MID_MS = 400;

export function beginTravel(game, door) {
  game.travel = {
    from: { mapId: game.party.mapId, x: game.party.x, y: game.party.y },
    to:   { mapId: door.to.mapId,   x: door.to.x,    y: door.to.y   },
    t: 0,
    duration: DURATION_MS,
    swapped: false,
  };
  game.setState('travel');
  playSfx('bt_tech_cast', { gain: 0.6 });
}

export function updateTravel(game, dt) {
  const tr = game.travel;
  if (!tr) return;
  tr.t += dt;
  if (!tr.swapped && tr.t >= MID_MS) {
    // swap the player onto the destination map at mid-point
    const p = game.party;
    p.mapId = tr.to.mapId;
    p.x = tr.to.x;
    p.y = tr.to.y;
    p.fromX = tr.to.x;
    p.fromY = tr.to.y;
    p.moveStart = -9999;
    p.moveCooldown = 0;
    // camera snaps to new map next frame
    game.cameraX = undefined;
    game.cameraY = undefined;
    revealAround(game, tr.to.x, tr.to.y, 4);
    tr.swapped = true;
  }
  if (tr.t >= tr.duration) {
    game.travel = null;
    game.setState('overworld');
  }
}

// Draws the rift transition on top of a pre-rendered scene. scenes.js
// renders the map first; we overlay our effects here.
export function drawTravel(ctx, game) {
  const tr = game.travel;
  if (!tr) return;
  const { width: w, height: h } = game;
  const t = Math.min(1, tr.t / tr.duration);

  // Phase 1 (0 → 0.5): rift opens. Phase 2 (0.5 → 1): rift closes.
  const phase = t < 0.5 ? t / 0.5 : 1 - (t - 0.5) / 0.5;

  // magenta rift band — horizontal slit growing vertically
  const bandH = Math.max(2, phase * h * 0.55);
  const bandY = h / 2 - bandH / 2;
  const g = ctx.createLinearGradient(0, bandY, 0, bandY + bandH);
  g.addColorStop(0,   'rgba(255,45,212,0)');
  g.addColorStop(0.5, `rgba(255,45,212,${0.65 * phase})`);
  g.addColorStop(1,   'rgba(255,45,212,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, bandY, w, bandH);

  // chromatic split — thin cyan + magenta lines offset around the rift center
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const split = 6 + phase * 18;
  ctx.fillStyle = `rgba(34,227,255,${0.35 * phase})`;
  ctx.fillRect(-split, bandY, w, bandH * 0.4);
  ctx.fillStyle = `rgba(255,45,212,${0.35 * phase})`;
  ctx.fillRect(split, bandY + bandH * 0.6, w, bandH * 0.4);
  ctx.restore();

  // white punch at ~380ms
  if (tr.t >= MID_MS - 40 && tr.t <= MID_MS + 30) {
    const flash = 1 - Math.abs(tr.t - MID_MS) / 40;
    ctx.fillStyle = `rgba(255,255,255,${0.95 * flash})`;
    ctx.fillRect(0, 0, w, h);
  }

  // destination tag (phase 2 only)
  if (tr.t >= MID_MS) {
    const dest = getMap(tr.to.mapId);
    if (dest) {
      const tagAlpha = Math.min(1, (tr.t - MID_MS) / 160);
      ctx.save();
      ctx.globalAlpha = tagAlpha;
      ctx.fillStyle = 'rgba(7,6,13,0.72)';
      const label = `→ ${dest.name.toUpperCase()}`;
      ctx.font = '700 20px system-ui, sans-serif';
      const pad = 14;
      const tw = ctx.measureText(label).width + pad * 2;
      const tx = w - tw - 24, ty = h - 52;
      ctx.fillRect(tx, ty, tw, 34);
      ctx.strokeStyle = 'rgba(34,227,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, 33);
      ctx.fillStyle = '#22e3ff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, tx + pad, ty + 17);
      ctx.restore();
    }
  }
}
