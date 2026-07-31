// ─────────────────────────────────────────────────────────────────────────────
// Score block (top-right) plus the hit feed.
//
// Arcade scoring only works if the player sees the *event*, not the total — so
// every increment throws a rising "+N" that fades, and the total counts up to
// meet it instead of snapping. The digits are tabular: a six-figure score that
// reflows on every kill is noise in peripheral vision.
// ─────────────────────────────────────────────────────────────────────────────

import { text, measure } from './glyphs.js';
import { C, alpha, sat, approach, ease } from './theme.js';

const POP_LIFE = 1.5;

export class Score {
  constructor() {
    this.shown = 0;
    this.target = 0;
    this.pops = [];
    this.hits = 0;
    this.flash = 0;
    this._prev = null;
  }

  update(dt, s) {
    const v = Math.max(0, s.score | 0);
    if (this._prev == null) { this._prev = v; this.shown = v; }
    if (v > this._prev) {
      this.pops.push({ n: v - this._prev, t: 0 });
      if (this.pops.length > 6) this.pops.shift();
      this.hits++;
      this.flash = 1;
    }
    this._prev = v;
    this.target = v;
    this.shown = approach(this.shown, v, 9, dt);
    if (Math.abs(this.shown - v) < 0.6) this.shown = v;
    this.flash = Math.max(0, this.flash - dt * 2.6);

    for (const p of this.pops) p.t += dt;
    while (this.pops.length && this.pops[0].t > POP_LIFE) this.pops.shift();
  }

  draw(g, L, s) {
    const k = L.s;
    const right = L.w - L.padX;
    let y = L.padY;

    const labelSize = 11 * k;
    const numSize = 32 * k;

    text(g, 'SCORE', right - 8 * k, y + labelSize, {
      size: labelSize, track: 4.4, weight: 0.14, align: 'right',
      color: alpha(C.gold, 0.86), shadow: 5 * k,
    });

    const digits = String(Math.round(this.shown)).padStart(6, '0');
    const lead = digits.length - String(Math.max(1, Math.round(this.shown))).length;
    // Leading zeros are drawn, but dimmed — the arcade frame without the noise.
    const numW = measure(digits, numSize, 1.4);
    const baseY = y + labelSize + 8 * k + numSize;
    let cx = right - 8 * k - numW;
    for (let i = 0; i < digits.length; i++) {
      const dim = i < lead && this.shown > 0;
      text(g, digits[i], cx, baseY, {
        size: numSize, track: 1.4, weight: 0.15,
        color: dim ? alpha(C.gold, 0.20) : (this.flash > 0.4 ? '#fff6e2' : C.gold),
        shadow: 8 * k,
        glow: this.flash > 0.4 && !dim ? 10 * k * this.flash : 0,
      });
      cx += measure(digits[i], numSize, 1.4) + (numSize * 1.4) / 10;
    }

    // accent rail on the outer edge, mirroring the systems cluster
    g.save();
    g.beginPath();
    g.moveTo(right, y + 1 * k);
    g.lineTo(right, baseY + 4 * k);
    g.lineWidth = 2.2 * k;
    g.strokeStyle = alpha(C.gold, 0.75);
    g.stroke();
    g.restore();

    y = baseY + 6 * k;

    // hit tally
    const hitTxt = 'HITS ' + String(s.hits != null ? s.hits : this.hits).padStart(3, '0');
    text(g, hitTxt, right - 8 * k, y + 10 * k, {
      size: 10.5 * k, track: 3.6, weight: 0.15, align: 'right',
      color: alpha(C.text, 0.62), shadow: 4 * k,
    });
    y += 16 * k;

    /* ── rising +N feed ─────────────────────────────────────────────────── */
    for (let i = 0; i < this.pops.length; i++) {
      const p = this.pops[i];
      const t = p.t / POP_LIFE;
      const a = t < 0.12 ? t / 0.12 : 1 - ease((t - 0.12) / 0.88) * 0.92;
      const rise = ease(t) * 34 * k;
      const size = 17 * k * (1 + (1 - sat(p.t * 6)) * 0.25);
      text(g, '+' + p.n, right - 8 * k, y + 14 * k - rise + i * 2 * k, {
        size, track: 1.6, weight: 0.16, align: 'right',
        color: '#fff1cf', alpha: sat(a), shadow: 6 * k, glow: 7 * k * sat(a),
      });
    }

    return y;
  }
}
