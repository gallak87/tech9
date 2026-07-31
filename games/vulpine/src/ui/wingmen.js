// ─────────────────────────────────────────────────────────────────────────────
// Squadron strip — Falco / Peppy / Slippy, stacked beneath the player's own
// systems cluster (top-left). The rescue objective ("don't let them die")
// only works if a downed wingman is legible mid-dogfight: a KIA row goes to a
// dimmed silhouette and a red tag rather than just disappearing, so the
// player reads "he's down" instead of wondering where the row went.
// ─────────────────────────────────────────────────────────────────────────────

import { text } from './glyphs.js';
import { C, alpha, gauge, approach, sat } from './theme.js';
import { arwing } from './icons.js';

const VOICE = { FALCO: C.amber, PEPPY: C.ice, SLIPPY: C.green };

export class WingmenStrip {
  constructor() {
    this.hp = [1, 1, 1];
    this.flash = [0, 0, 0];
    this.kiaPop = [0, 0, 0];
    this._prevHp = null;
    this._prevAlive = null;
  }

  update(dt, s) {
    const w = s.wingmen;
    if (!this._prevHp) {
      this._prevHp = w.map((x) => sat(x.health / 100));
      this._prevAlive = w.map((x) => x.alive);
    }
    w.forEach((x, i) => {
      const v = sat(x.health / 100);
      if (v < this._prevHp[i] - 0.001) this.flash[i] = 1;
      this.hp[i] = approach(this.hp[i], v, 9, dt);
      this.flash[i] = Math.max(0, this.flash[i] - dt * 2.2);
      if (!x.alive && this._prevAlive[i]) this.kiaPop[i] = 1;
      this.kiaPop[i] = Math.max(0, this.kiaPop[i] - dt * 1.1);
      this._prevHp[i] = v;
      this._prevAlive[i] = x.alive;
    });
  }

  /** @returns {number} y of the bottom of the block. */
  draw(g, L, s, y) {
    const k = L.s;
    const x = L.padX;
    const w = s.wingmen;
    const barW = Math.round(196 * k);
    const rowH = 19 * k;

    text(g, 'SQUADRON', x, y, {
      size: 9.5 * k, track: 3.6, weight: 0.15, baseline: 'top',
      color: alpha(C.ice, 0.55), shadow: 4 * k,
    });
    y += 14 * k;

    w.forEach((info, i) => {
      const ic = 13 * k;
      const rowY = y + i * rowH;
      const col = VOICE[info.name] || C.ice;
      const isAlive = info.alive;

      g.save();
      g.globalAlpha = isAlive ? 1 : 0.5;
      arwing(g, x, rowY, ic, {
        color: isAlive ? '#e7f6ff' : '#5c6b74',
        wing: isAlive ? alpha(col, 0.85) : 'rgba(120,130,138,0.6)',
        trim: isAlive ? C.ice : '#5c6b74',
      });
      g.restore();

      text(g, info.name, x + ic * 1.35, rowY + ic * 0.62, {
        size: 10 * k, track: 2.2, weight: 0.15,
        color: isAlive ? alpha(C.text, 0.9) : alpha(C.red, 0.7),
        shadow: 3.5 * k,
      });

      const gx = x + ic * 1.35 + 46 * k;
      if (isAlive) {
        const gw = Math.max(30 * k, barW - (gx - x));
        const gh = 6 * k;
        g.save();
        if (this.flash[i] > 0.02) { g.shadowColor = C.red; g.shadowBlur = 10 * k * this.flash[i]; }
        gauge(g, gx, rowY + ic * 0.5 - gh * 0.5, gw, gh, {
          value: this.hp[i], segments: 10, gap: 1 * k,
          colors: this.hp[i] < 0.3 ? [C.red, '#ffb0b0'] : [C.ally, '#d4ffe8'],
          skew: gh * 0.7, lw: 1 * k, frame: alpha(C.ice, 0.28),
        });
        g.restore();
      } else {
        const p = 0.4 + 0.35 * this.kiaPop[i];
        text(g, 'KIA', gx, rowY + ic * 0.62, {
          size: 9.5 * k, track: 3, weight: 0.16, color: alpha(C.red, Math.min(1, 0.6 + p)), shadow: 4 * k,
        });
      }
    });

    return y + w.length * rowH + 2 * k;
  }
}
