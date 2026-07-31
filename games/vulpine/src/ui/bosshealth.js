// ─────────────────────────────────────────────────────────────────────────────
// Boss health bar — top-centre, present only while combat.js publishes
// `state.bossHealth`. A capital ship dies in named pieces (engines, turrets,
// core, hull), so the bar is a pip strip under the main gauge rather than one
// number: the player should be able to tell "both engines are down, three
// turrets left" without opening a menu. Slides in when the fight starts and
// holds its last reading through the death sequence — combat.js clears
// bossHealth the instant the core pops, and the wreck keeps burning for
// several more seconds, so an instant cut here would read as a bug.
// ─────────────────────────────────────────────────────────────────────────────

import { text } from './glyphs.js';
import { C, alpha, gauge, chamfer, approach, sat, mix, clamp } from './theme.js';

export class BossHealthBar {
  constructor() {
    this.shown = 0;
    this.value = 1;
    this.ghost = 1;
    this.ghostHold = 0;
    this.flash = 0;
    this.label = '';
    this.parts = [];
    this._prevV = null;
  }

  update(dt, s) {
    const bh = s.bossHealth;
    if (bh) {
      const v = sat(bh.value);
      if (this._prevV != null && v < this._prevV - 0.001) { this.flash = 1; this.ghostHold = 0.5; }
      this._prevV = v;
      this.value = approach(this.value, v, 9, dt);
      this.ghostHold = Math.max(0, this.ghostHold - dt);
      this.ghost = this.ghostHold > 0 ? Math.max(this.ghost, this.value) : approach(this.ghost, this.value, 2.6, dt);
      this.label = bh.label;
      this.parts = bh.parts;
    } else {
      this._prevV = null;
    }
    this.flash = Math.max(0, this.flash - dt * 2.4);
    const target = bh ? 1 : 0;
    this.shown = approach(this.shown, target, bh ? 5 : 2.2, dt);
  }

  draw(g, L, s) {
    if (this.shown < 0.01) return;
    const k = L.s;
    const barW = Math.round(clamp(L.w * 0.4, 360 * k, 640 * k));
    const barH = Math.round(13 * k);
    const cx = L.w * 0.5;
    const x = cx - barW / 2;
    const slide = -18 * k * (1 - this.shown);
    const y = L.padY + slide;

    g.save();
    g.globalAlpha = this.shown;

    text(g, this.label || 'HOSTILE CAPITAL SHIP', cx, y + 10.5 * k, {
      size: 11 * k, track: 4.4, weight: 0.15, align: 'center', baseline: 'middle',
      color: alpha(C.amber, 0.92), shadow: 5 * k,
    });

    const gy = y + 18 * k;
    gauge(g, x, gy, barW, barH, {
      value: this.value, ghost: this.ghost, segments: 30, gap: 1.4 * k,
      colors: this.value < 0.25 ? [C.red, '#ffb0b0'] : [C.amber, '#ffe0a0'],
      skew: barH * 0.42, glow: this.flash > 0.05 ? 12 * k * this.flash : 6 * k,
      lw: 1.2 * k, frame: alpha(C.amber, 0.4), ghostColor: '#ff5a52',
    });

    const parts = this.parts;
    if (parts && parts.length) {
      const py = gy + barH + 6 * k;
      const ph = 7 * k;
      const gap = 2 * k;
      const pw = (barW - gap * (parts.length - 1)) / parts.length;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const px = x + i * (pw + gap);
        const v = sat(p.v);
        const dead = p.alive === false;
        const col = dead ? 'rgba(120,60,60,0.5)' : mix(C.red, C.amber, v);

        chamfer(g, px, py, pw, ph, Math.min(pw, ph) * 0.35);
        g.fillStyle = 'rgba(4,10,17,0.72)';
        g.fill();

        if (!dead && v > 0.01) {
          g.save();
          chamfer(g, px, py, pw, ph, Math.min(pw, ph) * 0.35);
          g.clip();
          g.fillStyle = col;
          g.fillRect(px, py + ph * (1 - v), pw, ph * v);
          g.restore();
        }

        chamfer(g, px, py, pw, ph, Math.min(pw, ph) * 0.35);
        g.lineWidth = 1 * k;
        g.strokeStyle = alpha(C.ice, dead ? 0.15 : 0.32);
        g.stroke();
      }
    }

    g.restore();
  }
}
