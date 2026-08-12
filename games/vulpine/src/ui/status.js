// ─────────────────────────────────────────────────────────────────────────────
// Ship systems cluster (top-left): shield, boost, lives, bombs.
//
// This is the block a player checks mid-turn without taking their eyes off the
// centre, so it is built for peripheral reading: the shield bar's *length* and
// *hue* both carry the value, the numeral is large enough to catch in a glance,
// and damage leaves a red residue that drains a beat later so you can see how
// much you just lost, not only what you have left.
// ─────────────────────────────────────────────────────────────────────────────

import { text, measure } from './glyphs.js';
import { C, alpha, gauge, approach, sat, mix, clamp } from './theme.js';
import { arwing, bomb } from './icons.js';

// Weapon-tier hues, cool to hot. One per tier; the last is reused if the
// tuning table ever grows past it.
const WPN_TIER = ['#57d2ff', '#7fe3b0', '#ffc161', '#ffe9a8'];

export class Status {
  constructor() {
    this.shield = 1;
    this.ghost = 1;
    this.ghostHold = 0;
    this.shown = 100;      // numeral, eased
    this.boost = 1;
    this.flash = 0;        // white pop on the bar when hit
    this.gain = 0;         // green pop when repaired
    this.livesPop = 0;
    this.bombPop = 0;
    this.wpnPop = 0;       // gold flare when a tier is granted
    this._prev = null;
  }

  update(dt, s) {
    const v = sat(s.shield);
    if (this._prev == null) { this.shield = this.ghost = v; this.shown = s.shieldRaw; this._prev = v; }

    if (v < this._prev - 0.0005) { this.flash = 1; this.ghostHold = 0.45; }
    if (v > this._prev + 0.0005) this.gain = 1;
    this._prev = v;

    this.shield = approach(this.shield, v, 14, dt);
    this.ghostHold = Math.max(0, this.ghostHold - dt);
    if (this.ghostHold <= 0) this.ghost = approach(this.ghost, this.shield, 3.4, dt);
    else this.ghost = Math.max(this.ghost, this.shield);
    this.shown = approach(this.shown, s.shieldRaw, 12, dt);
    this.boost = approach(this.boost, sat(s.boost), 16, dt);
    this.flash = Math.max(0, this.flash - dt * 3.2);
    this.gain = Math.max(0, this.gain - dt * 2.4);

    if (s.lives !== this._lives) { if (this._lives != null) this.livesPop = 1; this._lives = s.lives; }
    if (s.bombs !== this._bombs) { if (this._bombs != null) this.bombPop = 1; this._bombs = s.bombs; }
    const tier = s.weapon ? s.weapon.tier : 0;
    if (tier !== this._tier) { if (this._tier != null) this.wpnPop = 1; this._tier = tier; }
    this.livesPop = Math.max(0, this.livesPop - dt * 1.8);
    this.bombPop = Math.max(0, this.bombPop - dt * 1.8);
    // Slower than the others: a weapon tier is granted three times a mission,
    // so the flare is allowed to be the loudest thing in the block.
    this.wpnPop = Math.max(0, this.wpnPop - dt * 0.7);
  }

  /** @returns {number} y of the bottom of the block, so callers can stack under it. */
  draw(g, L, s) {
    const k = L.s;
    const x = L.padX;
    let y = L.padY;
    const barW = Math.round(292 * k);
    const barH = Math.round(15 * k);

    const low = this.shield < 0.28;
    const crit = this.shield < 0.14;
    // Warning pulse rides sim time, so a paused review frame is deterministic.
    const pulse = 0.5 + 0.5 * Math.sin(s.time * (crit ? 11 : 7));
    const warnMix = low ? (crit ? 0.55 + 0.45 * pulse : 0.35 + 0.2 * pulse) : 0;

    const hue = low
      ? mix(C.shieldLow, C.red, crit ? 0.35 + 0.4 * pulse : 0.12)
      : C.shield;
    const hueHot = low ? mix('#ffe0a0', '#ffd0cc', crit ? pulse : 0.2) : C.shieldHot;

    /* ── header line: label, rule, numeral ──────────────────────────────── */
    const labelSize = 11.5 * k;
    const numSize = 25 * k;
    const headBase = y + numSize * 0.82;

    text(g, 'SHIELD', x, headBase, {
      size: labelSize, track: 4.2, weight: 0.14,
      color: alpha(C.ice, 0.92), shadow: 5 * k, baseline: 'base',
    });

    const numStr = String(Math.round(clamp(this.shown, 0, 999))).padStart(3, '0');
    const numW = measure(numStr, numSize, 1.2);
    text(g, numStr, x + barW, headBase, {
      size: numSize, track: 1.2, weight: 0.155, align: 'right',
      color: this.flash > 0.05 ? '#ffffff' : hue,
      shadow: 7 * k, glow: low ? 8 * k * pulse : 0,
    });

    // hairline rule joining label to numeral — a designed line, not a gap
    const lx0 = x + measure('SHIELD', labelSize, 4.2) + 10 * k;
    const lx1 = x + barW - numW - 10 * k;
    if (lx1 > lx0 + 12 * k) {
      g.save();
      g.beginPath();
      g.moveTo(lx0, headBase - numSize * 0.30);
      g.lineTo(lx1, headBase - numSize * 0.30);
      g.lineWidth = 1 * k;
      g.strokeStyle = alpha(C.ice, 0.20);
      g.stroke();
      // three ticks on the rule
      for (let i = 1; i <= 3; i++) {
        const tx = lx0 + (lx1 - lx0) * (i / 4);
        g.beginPath();
        g.moveTo(tx, headBase - numSize * 0.30 - 2.4 * k);
        g.lineTo(tx, headBase - numSize * 0.30 + 2.4 * k);
        g.strokeStyle = alpha(C.ice, 0.26);
        g.stroke();
      }
      g.restore();
    }

    y = headBase + 6.5 * k;

    /* ── shield gauge ───────────────────────────────────────────────────── */
    g.save();
    if (this.flash > 0.02) {
      g.shadowColor = `rgba(255,90,80,${0.6 * this.flash})`;
      g.shadowBlur = 16 * k * this.flash;
    }
    gauge(g, x, y, barW, barH, {
      value: this.shield,
      ghost: this.ghost,
      segments: 24,
      gap: 1.6 * k,
      colors: [hue, hueHot],
      skew: barH * 0.5,
      glow: 7 * k,
      lw: 1.2 * k,
      frame: alpha(C.ice, 0.30 + 0.35 * warnMix),
    });
    g.restore();

    if (this.flash > 0.02) {
      g.save();
      g.globalAlpha = this.flash * 0.5;
      g.fillStyle = '#fff';
      g.fillRect(x + this.shield * barW - 2 * k, y, 3 * k, barH);
      g.restore();
    }
    y += barH + 5 * k;

    /* ── boost gauge ────────────────────────────────────────────────────── */
    const bW = Math.round(barW * 0.66);
    const bH = Math.round(7 * k);
    const boostHot = s.boostActive > 0.2;
    gauge(g, x, y, bW, bH, {
      value: this.boost,
      segments: 16,
      gap: 1.4 * k,
      colors: [boostHot ? C.boostHot : C.boost, C.boostHot],
      skew: bH * 0.85,
      glow: boostHot ? 9 * k : 4 * k,
      lw: 1 * k,
      frame: alpha(C.boost, 0.30),
    });
    text(g, 'BOOST', x + bW + 10 * k, y + bH * 0.5, {
      size: 9.5 * k, track: 3.4, weight: 0.15, baseline: 'middle',
      color: alpha(boostHot ? C.boostHot : C.boost, boostHot ? 1 : 0.72),
      shadow: 4 * k,
    });
    y += bH + 13 * k;

    /* ── lives + bombs ──────────────────────────────────────────────────── */
    const ic = 17 * k;
    let ix = x;
    const lives = Math.max(0, s.lives | 0);
    const shownLives = Math.min(lives, 4);
    for (let i = 0; i < shownLives; i++) {
      const pop = this.livesPop > 0 && i === shownLives - 1 ? 1 + this.livesPop * 0.25 : 1;
      g.save();
      g.globalAlpha = 0.96;
      arwing(g, ix - (ic * (pop - 1)) / 2, y - (ic * (pop - 1)) / 2, ic * pop, {
        color: '#e7f6ff', wing: 'rgba(168,214,238,0.86)', trim: C.ice,
      });
      g.restore();
      ix += ic * 0.86;
    }
    if (lives > 4) {
      text(g, '+' + (lives - 4), ix + 2 * k, y + ic * 0.62, {
        size: 12 * k, weight: 0.15, color: alpha(C.text, 0.85), shadow: 4 * k,
      });
      ix += measure('+' + (lives - 4), 12 * k) + 6 * k;
    }
    if (lives === 0) {
      text(g, 'LAST', x, y + ic * 0.62, {
        size: 12 * k, track: 3, weight: 0.16, color: C.red, shadow: 5 * k,
      });
      ix = x + measure('LAST', 12 * k, 3) + 8 * k;
    }

    // divider
    const dx = x + barW * 0.52;
    g.save();
    g.beginPath();
    g.moveTo(dx, y + 1 * k); g.lineTo(dx, y + ic - 1 * k);
    g.lineWidth = 1 * k;
    g.strokeStyle = alpha(C.ice, 0.22);
    g.stroke();
    g.restore();

    let bx = dx + 12 * k;
    const bombs = Math.max(0, s.bombs | 0);
    const slots = Math.max(3, Math.min(5, bombs));
    for (let i = 0; i < slots; i++) {
      const has = i < bombs;
      const pop = this.bombPop > 0 && i === bombs ? 1 + this.bombPop * 0.3 : 1;
      bomb(g, bx, y + 1 * k, (ic - 2 * k) * pop, {
        color: C.gold, empty: !has,
      });
      bx += ic * 0.80;
    }
    text(g, 'BOMB', bx + 4 * k, y + ic * 0.55, {
      size: 9 * k, track: 3.2, weight: 0.15, baseline: 'middle',
      color: alpha(C.gold, 0.62), shadow: 4 * k,
    });

    y += ic + 4 * k;

    /* ── weapon tier ────────────────────────────────────────────────────── */
    // A segmented pip row rather than a numeral: the whole point of a grant is
    // that you can see how many are left to come. The row warms from shield
    // blue to gold across the tiers, so the top tier is legible from the
    // colour alone without reading the label.
    if (s.weapon) {
      const tiers = Math.max(1, s.weapon.tiers | 0);
      const tier = Math.min(tiers - 1, Math.max(0, s.weapon.tier | 0));
      // Explicit hex ramp rather than a blend: `mix()` returns 'rgb(r,g,b)',
      // which `alpha()` and `mix()` themselves cannot parse, so a computed
      // colour cannot be composed further. Four hues climbing in temperature
      // also read as distinct steps in a way a linear blend does not.
      const hot = WPN_TIER[Math.min(tier, WPN_TIER.length - 1)];
      const pop = this.wpnPop;
      const wy = y + 6 * k;
      const wH = Math.round(6 * k);
      const wW = Math.round(barW * 0.42);

      g.save();
      if (pop > 0.02) {
        g.shadowColor = `rgba(255,212,137,${0.75 * pop})`;
        g.shadowBlur = 20 * k * pop;
      }
      gauge(g, x, wy, wW, wH, {
        value: (tier + 1) / tiers,
        segments: tiers,
        gap: 2.2 * k,
        colors: [hot, pop > 0.02 ? '#ffffff' : mix(hot, '#ffffff', 0.45)],
        skew: wH * 0.8,
        glow: (5 + 8 * pop) * k,
        lw: 1 * k,
        frame: alpha(hot, 0.32 + 0.4 * pop),
      });
      g.restore();

      text(g, s.weapon.label || 'LASER', x + wW + 10 * k, wy + wH * 0.5, {
        size: 9.5 * k, track: 3.4, weight: 0.15, baseline: 'middle',
        color: pop > 0.02 ? '#ffffff' : alpha(hot, 0.86),
        shadow: 4 * k, glow: pop > 0.02 ? 9 * k * pop : 0,
      });

      y = wy + wH + 4 * k;
    }

    /* ── low-shield warning ─────────────────────────────────────────────── */
    if (low) {
      const a = 0.45 + 0.55 * pulse;
      g.save();
      g.globalAlpha = a;
      const wtxt = crit ? 'SHIELD CRITICAL' : 'SHIELD LOW';
      const ws = 11 * k;
      const ww = measure(wtxt, ws, 4.6);
      g.beginPath();
      g.moveTo(x, y + 12 * k);
      g.lineTo(x + ww + 26 * k, y + 12 * k);
      g.lineTo(x + ww + 20 * k, y + 26 * k);
      g.lineTo(x, y + 26 * k);
      g.closePath();
      g.fillStyle = crit ? 'rgba(120,14,22,0.55)' : 'rgba(90,50,8,0.5)';
      g.fill();
      g.lineWidth = 1 * k;
      g.strokeStyle = alpha(crit ? C.red : C.shieldLow, 0.7);
      g.stroke();
      text(g, wtxt, x + 9 * k, y + 19 * k, {
        size: ws, track: 4.6, weight: 0.16, baseline: 'middle',
        color: crit ? '#ffd9dc' : '#ffe6bd', shadow: 5 * k,
      });
      g.restore();
      y += 28 * k;
    }

    return y;
  }
}
