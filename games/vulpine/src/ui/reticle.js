// ─────────────────────────────────────────────────────────────────────────────
// Centre-screen aiming reticle + world-projected lock-on marker.
//
// The reticle is the single most-seen pixel in the game — it sits over the
// crosshair of every frame — so it carries three states in one shape instead
// of three separate widgets: idle (breathing, cold ice), charging (brackets
// pull in, warms to amber), locked (a target is under the cone, shifts to hot
// red and rings out once on acquisition). Nothing here is a static crosshair;
// when the game is not asking anything of the player it stays quiet, and it
// gets louder in exact proportion to how urgent the shot is.
//
// The lock marker is a second, independent thing: it rides the target's
// projected *world* position (via the read-only camera projection index.js
// hands it), so it visibly separates from the centre reticle whenever the
// target drifts inside the lock cone but off boresight — that separation is
// what sells "the computer is tracking something out there", not just "the
// crosshair changed colour".
// ─────────────────────────────────────────────────────────────────────────────

import { C, alpha, sat, clamp, approach } from './theme.js';
import { corners, diamond, chevron } from './icons.js';
import { text } from './glyphs.js';

/* ── shared colour ramp: ice → amber (charging) → hostile red (locked) ──────
   theme.mix()/alpha() only accept '#rrggbb' hex and cannot be chained, so a
   three-stop blend is done here as raw rgb triples instead of nesting them. */
function hex3(h) {
  const p = parseInt(h.slice(1), 16);
  return [(p >> 16) & 255, (p >> 8) & 255, p & 255];
}
function lerp3(a, b, t) {
  t = sat(t);
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}
const rgb3 = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
const rgba3 = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

const ICE = hex3(C.ice), AMBER = hex3(C.amber), HOSTILE = hex3(C.hostile);
function lockRgb(charge, locked) {
  const warm = lerp3(ICE, AMBER, charge * 1.4);
  return lerp3(warm, HOSTILE, locked * (0.25 + charge * 0.75));
}

export class Reticle {
  constructor() {
    this.charge = 0;
    this.locked = 0;
    this.snap = 0;
    this._hadTarget = false;
  }

  update(dt, s) {
    this.charge = approach(this.charge, sat(s.lockOn), 16, dt);
    const hasTarget = !!s.lockTarget;
    this.locked = approach(this.locked, hasTarget ? 1 : 0, 14, dt);
    if (hasTarget && !this._hadTarget) this.snap = 1;
    this._hadTarget = hasTarget;
    this.snap = Math.max(0, this.snap - dt * 3.0);
  }

  draw(g, L, s) {
    const k = L.s;
    const cx = L.w * 0.5, cy = L.h * 0.5;
    const charge = this.charge, locked = this.locked;
    const idle = Math.sin(s.time * 1.5) * 0.5 + 0.5;

    const c3 = lockRgb(charge, locked);
    const col = rgb3(c3);

    const baseR = 32 * k;
    const breathe = (1 - charge) * 2.2 * k * idle;
    const spread = baseR * (1 - charge * 0.58) + breathe;
    const len = (8.5 + charge * 5) * k;
    const lw = (1.5 + charge * 1.1) * k;
    const glow = 3 * k + charge * 9 * k + locked * 6 * k * (0.6 + 0.4 * Math.sin(s.time * 12));

    g.save();

    // charge progress ring — sweeps clockwise from 12 o'clock
    if (charge > 0.015) {
      g.beginPath();
      g.arc(cx, cy, spread + 11 * k, -Math.PI / 2, -Math.PI / 2 + charge * Math.PI * 2);
      g.lineWidth = 3.2 * k;
      g.strokeStyle = 'rgba(2,8,14,0.5)';
      g.stroke();
      g.beginPath();
      g.arc(cx, cy, spread + 11 * k, -Math.PI / 2, -Math.PI / 2 + charge * Math.PI * 2);
      g.lineWidth = 1.6 * k;
      g.strokeStyle = rgba3(c3, 0.85);
      g.shadowColor = col; g.shadowBlur = 5 * k;
      g.stroke();
      g.shadowBlur = 0;
    }

    // acquisition ring — pops out and fades on a fresh lock
    if (this.snap > 0.01) {
      const t = 1 - this.snap;
      g.beginPath();
      g.arc(cx, cy, spread + 4 * k + t * 26 * k, 0, Math.PI * 2);
      g.lineWidth = 1.6 * k;
      g.globalAlpha = this.snap;
      g.strokeStyle = C.hostile;
      g.stroke();
      g.globalAlpha = 1;
    }

    // converging corner brackets — a dark contact pass first, so the shape
    // reads over a blown-out sky *and* the busy, bright ship model it sits on
    // in chase view, then the coloured stroke on top
    corners(g, cx - spread, cy - spread, spread * 2, spread * 2, len, lw + 1.6 * k, 'rgba(2,8,14,0.55)', {});
    corners(g, cx - spread, cy - spread, spread * 2, spread * 2, len, lw, col, { glow });

    // centre cross — always-on precision mark
    g.beginPath();
    const t0 = 3.4 * k, t1 = 7 * k;
    g.moveTo(cx - t1, cy); g.lineTo(cx - t0, cy);
    g.moveTo(cx + t0, cy); g.lineTo(cx + t1, cy);
    g.moveTo(cx, cy - t1); g.lineTo(cx, cy - t0);
    g.moveTo(cx, cy + t0); g.lineTo(cx, cy + t1);
    g.lineWidth = 2.8 * k;
    g.strokeStyle = 'rgba(2,8,14,0.55)';
    g.stroke();
    g.lineWidth = 1.2 * k;
    g.strokeStyle = rgba3(c3, 0.9);
    g.stroke();
    g.beginPath();
    g.arc(cx, cy, 1.6 * k, 0, Math.PI * 2);
    g.fillStyle = 'rgba(2,8,14,0.55)';
    g.fill();
    g.beginPath();
    g.arc(cx, cy, 1.1 * k, 0, Math.PI * 2);
    g.fillStyle = rgba3(c3, 0.95);
    g.fill();

    // full-charge readiness flash
    if (charge > 0.93) {
      const p = 0.5 + 0.5 * Math.sin(s.time * 16);
      g.beginPath();
      g.arc(cx, cy, spread * 1.22, 0, Math.PI * 2);
      g.lineWidth = 1.1 * k;
      g.globalAlpha = 0.35 + 0.5 * p;
      g.strokeStyle = C.hostile;
      g.stroke();
      g.globalAlpha = 1;
    }

    g.restore();
  }
}

/**
 * `proj` is computed by index.js from a read-only `ctx.camera` projection —
 * this file never touches THREE or the camera directly, so the ui/render
 * boundary in CONTRACT §1 stays honest.
 *
 * proj: null (no target) | { x, y, dist, onscreen, ndx, ndy, kind }
 */
export class LockMarker {
  constructor() {
    this.snap = 0;
    this._hadTarget = false;
  }

  update(dt, s) {
    const has = !!s.lockTarget;
    if (has && !this._hadTarget) this.snap = 1;
    this._hadTarget = has;
    this.snap = Math.max(0, this.snap - dt * 3.2);
  }

  draw(g, L, s, proj) {
    if (!proj) return;
    const k = L.s;
    const charge = sat(s.lockOn);
    const c3 = lockRgb(charge, 1);
    const col = rgb3(c3);
    const kindLabel = (proj.kind || 'CONTACT').toUpperCase();

    g.save();

    if (proj.onscreen) {
      const size = clamp(3200 / Math.max(60, proj.dist), 16, 54) * k;
      const pop = 1 + this.snap * 0.55;
      const boxSize = size * pop;
      const half = boxSize * 0.5;

      // A target that is inside the lock cone is, by construction, close to
      // boresight — this marker frequently sits right on top of the centre
      // reticle. Rotating it 45° reads as a distinct HUD element even when
      // the two coincide, instead of a doubled-up duplicate bracket.
      g.save();
      g.translate(proj.x, proj.y);
      g.rotate(Math.PI / 4);
      corners(g, -half, -half, boxSize, boxSize, boxSize * 0.32, 3.2 * k, 'rgba(2,8,14,0.5)', {});
      corners(g, -half, -half, boxSize, boxSize, boxSize * 0.32, 1.6 * k, col, {
        glow: 6 * k + this.snap * 10 * k,
      });
      g.restore();
      diamond(g, proj.x, proj.y, 2.4 * k, col, { glow: 8 * k });

      const lbl = `${kindLabel}  ${Math.round(proj.dist)}M`;
      text(g, lbl, proj.x, proj.y + half + 13 * k, {
        size: 9.5 * k, track: 2.6, weight: 0.15, align: 'center', baseline: 'middle',
        color: rgba3(c3, 0.95), shadow: 4 * k,
      });
    } else {
      // off-screen: clamp an arrow to the title-safe border, pointing at it
      const cx = L.w * 0.5, cy = L.h * 0.5;
      const dx = proj.ndx, dy = -proj.ndy;
      const ang = Math.atan2(dy, dx);
      const rx = L.w * 0.46, ry = L.h * 0.42;
      const ex = cx + Math.cos(ang) * rx;
      const ey = cy + Math.sin(ang) * ry;
      chevron(g, ex, ey, 8 * k, ang + Math.PI / 2, rgba3(c3, 0.9), {
        glow: 6 * k, stroke: 'rgba(2,8,14,0.6)', lw: 1.4 * k,
      });
    }

    g.restore();
  }
}
