// ─────────────────────────────────────────────────────────────────────────────
// Mission outcome card — MISSION COMPLETE / GAME OVER. One-shot: it appears
// once `state.outcome` flips from null and holds, because the run is over
// and there is nothing left for the HUD underneath to say.
// ─────────────────────────────────────────────────────────────────────────────

import { text, measure } from './glyphs.js';
import { C, alpha, ease, sat } from './theme.js';
import { corners } from './icons.js';

export class OutcomeCard {
  constructor() {
    this.shown = 0;
    this.outcome = null;
    this.t = 0;
  }

  update(dt, s) {
    if (s.outcome && s.outcome !== this.outcome) { this.outcome = s.outcome; this.t = 0; }
    if (this.outcome) this.t += dt;
    const target = s.outcome ? 1 : 0;
    this.shown += (target - this.shown) * (1 - Math.exp(-dt * 3.2));
  }

  draw(g, L, s) {
    if (this.shown < 0.01 || !this.outcome) return;
    const k = L.s;
    const cx = L.w * 0.5, cy = L.h * 0.5;
    const win = this.outcome === 'win';
    const col = win ? C.green : C.red;
    const title = win ? 'MISSION COMPLETE' : 'GAME OVER';
    const sub = win ? 'CORNERIA IS SAFE' : 'FOX MCCLOUD WAS LOST';

    const reveal = ease(sat(this.t / 1.1));
    const a = this.shown;

    g.save();
    g.globalAlpha = a;

    // vignette scrim — darkens the frame without hiding it entirely
    const grad = g.createRadialGradient(cx, cy, L.h * 0.15, cx, cy, L.h * 0.75);
    grad.addColorStop(0, 'rgba(2,6,10,0)');
    grad.addColorStop(1, `rgba(2,6,10,${0.6 * a})`);
    g.fillStyle = grad;
    g.fillRect(0, 0, L.w, L.h);

    const titleSize = 42 * k;
    const titleY = cy - 8 * k;

    // uniform pop-in scale around the title's own centre — never a
    // non-uniform squash, so the stroked vector glyphs never distort
    const pop = 0.82 + 0.18 * reveal;
    g.save();
    g.translate(cx, titleY);
    g.scale(pop, pop);
    text(g, title, 0, 0, {
      size: titleSize, track: 3, weight: 0.16, align: 'center', baseline: 'middle',
      color: col, shadow: 14 * k, glow: 16 * k * reveal,
    });
    g.restore();

    g.globalAlpha = a * reveal;
    text(g, sub, cx, titleY + 34 * k, {
      size: 13 * k, track: 5, weight: 0.14, align: 'center', baseline: 'middle',
      color: alpha(C.text, 0.88), shadow: 6 * k,
    });

    const scoreTxt = `FINAL SCORE  ${String(Math.max(0, s.score | 0)).padStart(6, '0')}`;
    text(g, scoreTxt, cx, titleY + 60 * k, {
      size: 11 * k, track: 3.4, weight: 0.14, align: 'center', baseline: 'middle',
      color: alpha(C.gold, 0.85), shadow: 5 * k,
    });
    g.globalAlpha = a;

    const bw = measure(title, titleSize, 3) + 76 * k;
    const bh = titleSize + 96 * k;
    corners(g, cx - bw / 2, titleY - bh / 2, bw, bh, 16 * k, 1.4 * k, alpha(col, 0.5 * reveal), {});

    g.restore();
  }
}
