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
      const ph = 10 * k;
      const gap = 2 * k;
      const pw = (barW - gap * (parts.length - 1)) / parts.length;
      const cut = Math.min(pw, ph) * 0.3;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const px = x + i * (pw + gap);
        const v = sat(p.v);
        const dead = p.alive === false;
        const col = dead ? 'rgba(160,70,70,0.55)' : mix(C.red, C.amber, v);
        const initial = (p.label || '?').trim().charAt(0) || '?';
        // `hit` is combat.js's decaying per-part strike timer, `aim` marks the
        // part the lock is holding. Between them the strip answers the two
        // questions a capital-ship fight has to answer every second — did that
        // round land, and on what — from the HUD alone, at any range.
        const hit = dead ? 0 : sat(p.hit || 0);
        const aim = !dead && !!p.aim;

        chamfer(g, px, py, pw, ph, cut);
        g.fillStyle = 'rgba(4,10,17,0.76)';
        g.fill();

        // fill left-to-right — the pip is short and wide, so a bottom-up
        // thermometer fill (the first pass) was a couple of px of nothing
        if (!dead && v > 0.01) {
          g.save();
          chamfer(g, px, py, pw, ph, cut);
          g.clip();
          g.fillStyle = col;
          g.fillRect(px, py, pw * v, ph);
          g.restore();
        }

        // strike flash — a white wash over the whole pip, gone in 0.3 s
        if (hit > 0.01) {
          g.save();
          chamfer(g, px, py, pw, ph, cut);
          g.clip();
          g.fillStyle = alpha('#ffffff', 0.20 + 0.55 * hit);
          g.fillRect(px, py, pw, ph);
          g.restore();
        }

        chamfer(g, px, py, pw, ph, cut);
        g.lineWidth = (aim ? 1.9 : 1) * k;
        g.strokeStyle = aim ? alpha(C.amber, 0.95) : alpha(C.ice, dead ? 0.15 : 0.32);
        if (hit > 0.01 || aim) {
          g.shadowColor = hit > 0.01 ? '#ffffff' : C.amber;
          g.shadowBlur = (hit > 0.01 ? 12 * hit : 7) * k;
        }
        g.stroke();
        g.shadowBlur = 0;

        text(g, initial, px + pw / 2, py + ph / 2 + 0.3 * k, {
          size: ph * 0.72, track: 0, weight: 0.22, align: 'center', baseline: 'middle',
          color: dead ? alpha(C.text, 0.3) : 'rgba(4,10,17,0.75)', shadow: dead ? 0 : 0,
        });
      }
    }

    g.restore();
  }
}
