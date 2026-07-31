// ─────────────────────────────────────────────────────────────────────────────
// HUD iconography — all vector, all drawn from a normalised 0..1 box so one
// definition serves a 14 px life pip and a 40 px radar marker.
//
// Silhouette first (contract §5): the Arwing pip has to be recognisable as the
// player's ship at 14 px, which means the swept wing planform and the twin
// engine block must survive, and nothing else matters.
// ─────────────────────────────────────────────────────────────────────────────

import { alpha } from './theme.js';

/** Run `fn` in a unit box mapped to (x,y,size). */
function unit(g, x, y, s, fn) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  fn(g);
  g.restore();
}

/** Top-down Arwing. Used for lives, the radar player marker, comms tags. */
export function arwing(g, x, y, s, o = {}) {
  unit(g, x, y, s, () => {
    const body = o.color || '#dceefb';
    const wing = o.wing || o.color || '#9fc4dc';
    const trim = o.trim || '#3fc8ff';

    // wings
    g.beginPath();
    g.moveTo(0.545, 0.24); g.lineTo(1.0, 0.60); g.lineTo(1.0, 0.755);
    g.lineTo(0.575, 0.635); g.closePath();
    g.moveTo(0.455, 0.24); g.lineTo(0.0, 0.60); g.lineTo(0.0, 0.755);
    g.lineTo(0.425, 0.635); g.closePath();
    g.fillStyle = wing;
    g.fill();

    // engines
    g.beginPath();
    g.rect(0.235, 0.66, 0.135, 0.30);
    g.rect(0.63, 0.66, 0.135, 0.30);
    g.fillStyle = wing;
    g.fill();
    g.beginPath();
    g.rect(0.245, 0.90, 0.115, 0.10);
    g.rect(0.64, 0.90, 0.115, 0.10);
    g.fillStyle = trim;
    g.fill();

    // fuselage
    g.beginPath();
    g.moveTo(0.5, 0.0);
    g.lineTo(0.575, 0.30); g.lineTo(0.60, 0.90); g.lineTo(0.40, 0.90);
    g.lineTo(0.425, 0.30);
    g.closePath();
    g.fillStyle = body;
    g.fill();

    // canopy
    g.beginPath();
    g.moveTo(0.5, 0.16); g.lineTo(0.552, 0.36); g.lineTo(0.448, 0.36);
    g.closePath();
    g.fillStyle = trim;
    g.globalAlpha *= 0.9;
    g.fill();
  });
}

/** Bomb / smart-bomb pip. */
export function bomb(g, x, y, s, o = {}) {
  unit(g, x, y, s, () => {
    const c = o.color || '#ffd489';
    g.beginPath();
    g.moveTo(0.5, 0.16);
    g.bezierCurveTo(0.92, 0.30, 0.98, 0.78, 0.5, 1.0);
    g.bezierCurveTo(0.02, 0.78, 0.08, 0.30, 0.5, 0.16);
    g.closePath();
    g.fillStyle = o.empty ? 'rgba(255,255,255,0.10)' : c;
    g.fill();
    if (o.empty) { g.lineWidth = 0.075; g.strokeStyle = alpha('#a8ecff', 0.4); g.stroke(); }
    // fin
    g.beginPath();
    g.moveTo(0.5, 0.20); g.lineTo(0.5, 0.0);
    g.moveTo(0.32, 0.06); g.lineTo(0.68, 0.06);
    g.lineWidth = 0.085;
    g.lineCap = 'round';
    g.strokeStyle = o.empty ? alpha('#a8ecff', 0.4) : c;
    g.stroke();
    if (!o.empty) {
      g.beginPath();
      g.moveTo(0.34, 0.42); g.bezierCurveTo(0.30, 0.56, 0.34, 0.70, 0.42, 0.80);
      g.lineWidth = 0.07;
      g.strokeStyle = 'rgba(255,255,255,0.45)';
      g.stroke();
    }
  });
}

/** Solid triangle pointing up, rotated by `rot`. Radar blips, edge markers. */
export function chevron(g, x, y, s, rot, fill, o = {}) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.beginPath();
  g.moveTo(0, -s);
  g.lineTo(s * 0.78, s * 0.68);
  g.lineTo(0, s * 0.34);
  g.lineTo(-s * 0.78, s * 0.68);
  g.closePath();
  g.fillStyle = fill;
  if (o.glow) { g.shadowColor = fill; g.shadowBlur = o.glow; }
  g.fill();
  if (o.stroke) { g.lineWidth = o.lw || 1; g.strokeStyle = o.stroke; g.shadowBlur = 0; g.stroke(); }
  g.restore();
}

/** Diamond marker — hostile contacts. */
export function diamond(g, x, y, s, fill, o = {}) {
  g.save();
  g.beginPath();
  g.moveTo(x, y - s);
  g.lineTo(x + s * 0.82, y);
  g.lineTo(x, y + s);
  g.lineTo(x - s * 0.82, y);
  g.closePath();
  g.fillStyle = fill;
  if (o.glow) { g.shadowColor = fill; g.shadowBlur = o.glow; }
  g.fill();
  g.restore();
}

/** Four corner brackets around a box — reticles, portrait frames, warnings. */
export function corners(g, x, y, w, h, len, lw, color, o = {}) {
  g.save();
  g.lineWidth = lw;
  g.lineCap = 'butt';
  g.strokeStyle = color;
  if (o.glow) { g.shadowColor = color; g.shadowBlur = o.glow; }
  g.beginPath();
  // tl
  g.moveTo(x, y + len); g.lineTo(x, y); g.lineTo(x + len, y);
  // tr
  g.moveTo(x + w - len, y); g.lineTo(x + w, y); g.lineTo(x + w, y + len);
  // br
  g.moveTo(x + w, y + h - len); g.lineTo(x + w, y + h); g.lineTo(x + w - len, y + h);
  // bl
  g.moveTo(x + len, y + h); g.lineTo(x, y + h); g.lineTo(x, y + h - len);
  g.stroke();
  g.restore();
}
