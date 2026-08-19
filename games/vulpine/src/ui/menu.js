// ─────────────────────────────────────────────────────────────────────────────
// Title card and pause menu.
//
// Both draw over a live frame rather than over black: the level keeps rendering
// underneath, so the title screen is a shot of the game and the pause menu
// shows you exactly what you are about to go back to. That means everything
// here has to survive being laid over a bright sky *and* dark water, which is
// what the scrim and the shadowed type are for.
//
// Animation runs on real time (`m.t`), not sim time — sim time is frozen for
// precisely as long as this is on screen.
// ─────────────────────────────────────────────────────────────────────────────

import { text, measure } from './glyphs.js';
import { C, alpha, plate, chamfer, sat, ease } from './theme.js';
import { arwing } from './icons.js';
import { MODE } from '../game/mode.js';

/** Full-frame darkening + a soft vignette, so type reads over any background. */
function scrim(g, L, a) {
  if (a <= 0.001) return;
  g.save();
  g.globalAlpha = a;
  g.fillStyle = 'rgba(3,8,15,0.66)';
  g.fillRect(0, 0, L.w, L.h);
  const v = g.createRadialGradient(L.w * 0.5, L.h * 0.46, L.h * 0.16, L.w * 0.5, L.h * 0.5, L.h * 0.92);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = v;
  g.fillRect(0, 0, L.w, L.h);
  g.restore();
}

export class Menu {
  constructor() {
    this.blink = 0;
  }

  update(dt) { this.blink += dt; }

  draw(g, L, m) {
    if (m.fade <= 0.002) return;
    scrim(g, L, m.fade);
    if (m.mode === MODE.TITLE) this._title(g, L, m);
    else if (m.mode === MODE.PAUSED) this._pause(g, L, m);
  }

  /* ── title ──────────────────────────────────────────────────────────────── */
  _title(g, L, m) {
    const k = L.s;
    const cx = L.w * 0.5;
    const rise = ease(Math.min(1, m.t / 0.9));
    const cy = L.h * 0.40 + (1 - rise) * 26 * k;

    g.save();
    g.globalAlpha = m.fade * rise;

    // eyebrow
    text(g, 'A CORNERIA MISSION', cx, cy - 74 * k, {
      size: 12 * k, track: 8.5, weight: 0.15, align: 'center',
      color: alpha(C.ice, 0.72), shadow: 6 * k,
    });

    // wordmark
    const big = 82 * k;
    text(g, 'VULPINE', cx, cy + big * 0.34, {
      size: big, track: 9, weight: 0.2, align: 'center',
      color: '#eaf6ff', shadow: 14 * k, glow: 20 * k,
    });

    // rule with the ship riding it
    const rw = Math.min(L.w * 0.52, measure('VULPINE', big, 9) + 90 * k);
    const ry = cy + big * 0.62;
    g.beginPath();
    g.moveTo(cx - rw / 2, ry);
    g.lineTo(cx + rw / 2, ry);
    g.lineWidth = 1.2 * k;
    g.strokeStyle = alpha(C.ice, 0.34);
    g.stroke();
    arwing(g, cx - 13 * k, ry - 13 * k, 26 * k, {
      color: '#eaf8ff', wing: 'rgba(150,205,232,0.9)', trim: C.ice,
    });

    text(g, 'STAR FOX', cx, ry + 30 * k, {
      size: 15 * k, track: 11, weight: 0.15, align: 'center',
      color: alpha(C.gold, 0.9), shadow: 6 * k,
    });
    g.restore();

    // prompt — pulses so it reads as the interactive element
    const pulse = 0.55 + 0.45 * Math.sin(this.blink * 3.1);
    g.save();
    g.globalAlpha = m.fade * rise * pulse;
    const py = L.h * 0.775;
    text(g, 'PRESS  ENTER  TO  LAUNCH', cx, py, {
      size: 16 * k, track: 6, weight: 0.16, align: 'center',
      color: '#ffffff', shadow: 8 * k, glow: 12 * k * pulse,
    });
    g.restore();

    g.save();
    g.globalAlpha = m.fade * rise * 0.62;
    text(g, 'WASD / ARROWS  STEER      [HOLD] SPACE  FIRE      SHIFT  BOOST      ESC  PAUSE',
      cx, py + 30 * k, {
        size: 10.5 * k, track: 3.4, weight: 0.14, align: 'center',
        color: alpha(C.ice, 0.85), shadow: 5 * k,
      });
    g.restore();
  }

  /* ── pause ──────────────────────────────────────────────────────────────── */
  _pause(g, L, m) {
    const k = L.s;
    const cx = L.w * 0.5;
    const rise = ease(Math.min(1, m.t / 0.35));

    const rowH = 44 * k;
    const boxW = Math.min(420 * k, L.w * 0.62);
    // 82k of header above the first row, then enough below the last row that
    // the hint line clears its descenders — at 3 items and k=0.8 a 92k pad put
    // CONTROLS straight through the hint text.
    const boxH = rowH * m.items.length + 118 * k;
    const x = cx - boxW / 2;
    const y = L.h * 0.5 - boxH / 2 + (1 - rise) * 18 * k;

    g.save();
    g.globalAlpha = m.fade * rise;

    plate(g, x, y, boxW, boxH, {
      top: 'rgba(9,21,34,0.93)',
      bottom: 'rgba(4,11,19,0.86)',
      strokeColor: alpha(C.ice, 0.34),
      cut: 16 * k,
      lw: 1.2 * k,
      lift: 18 * k,
    });

    text(g, 'PAUSED', cx, y + 40 * k, {
      size: 24 * k, track: 8, weight: 0.18, align: 'center',
      color: '#eaf6ff', shadow: 8 * k,
    });

    g.beginPath();
    g.moveTo(x + 26 * k, y + 58 * k);
    g.lineTo(x + boxW - 26 * k, y + 58 * k);
    g.lineWidth = 1 * k;
    g.strokeStyle = alpha(C.ice, 0.22);
    g.stroke();

    for (let i = 0; i < m.items.length; i++) {
      const it = m.items[i];
      const iy = y + 82 * k + i * rowH;
      const on = i === m.index;
      // The row's plate and its centre line, derived once. Label, chevron and
      // highlight all hang off these two numbers so they cannot drift apart:
      // the label used to be drawn at `cx + 8k` and 6k below the highlight's
      // own centre, which put every item — selected or not — off both the
      // vertical axis PAUSED, the divider and the hint line share, and off the
      // box drawn around it.
      const rowY = iy - 2 * k;
      const rowBoxH = rowH - 10 * k;
      const mid = rowY + rowBoxH * 0.5;

      if (on) {
        g.save();
        chamfer(g, x + 18 * k, rowY, boxW - 36 * k, rowBoxH, 9 * k);
        g.fillStyle = alpha(C.ice, 0.14);
        g.fill();
        g.lineWidth = 1.1 * k;
        g.strokeStyle = alpha(C.iceHot, 0.75);
        g.stroke();
        g.restore();

        // selection chevron
        const bob = Math.sin(this.blink * 6) * 1.6 * k;
        g.beginPath();
        g.moveTo(x + 32 * k + bob, mid - 6 * k);
        g.lineTo(x + 41 * k + bob, mid);
        g.lineTo(x + 32 * k + bob, mid + 6 * k);
        g.closePath();
        g.fillStyle = C.iceHot;
        g.fill();
      }

      text(g, it.label, cx, mid, {
        size: 15 * k, track: 4.4, weight: 0.15, align: 'center', baseline: 'middle',
        color: on ? '#ffffff' : alpha(C.text, 0.72),
        shadow: 5 * k,
        glow: on ? 8 * k : 0,
      });
    }

    // ASCII only — the HUD face is a hand-built vector glyph table, so an
    // arrow character would silently render as nothing.
    text(g, 'W S  SELECT      ENTER  CONFIRM      ESC  RESUME', cx, y + boxH - 22 * k, {
      size: 9.5 * k, track: 3.2, weight: 0.14, align: 'center',
      color: alpha(C.ice, 0.55), shadow: 4 * k,
    });

    g.restore();
  }
}
