import { text, measure } from './glyphs.js';
import { C, alpha, plate, sat, ease } from './theme.js';

// ─────────────────────────────────────────────────────────────────────────────
// Level card — the name of the place you have just flown into.
//
// Arcade idiom, and the constraint that comes with it: it is not a screen and
// it stops nothing. The sim runs, the stick is live and the first wave is
// already closing; the card sits under the score for three seconds and leaves.
// That is the whole difference between this and menu.js's title card, which
// draws over a deliberately frozen sim and owns the frame.
//
// Its clock is SIM time, published by campaign.js as `{ from, until }`, for the
// same reason `message` and `pickup` carry `until`: a harness seek to t=14 must
// arrive with the card already spent rather than parked over every capture.
//
// Top-right, under the score, because those are the two blocks that answer
// "where am I in this run" — and because the left column is instruments the
// player reads while being shot at.
// ─────────────────────────────────────────────────────────────────────────────

/** Seconds spent arriving and leaving. The hold is whatever the published
 *  window has left over, so campaign.js sets the length and this sets the feel. */
const FADE_IN = 0.55, FADE_OUT = 0.9;

export class LevelCard {
  draw(g, L, s) {
    const c = s.levelCard;
    if (!c) return;
    const life = c.until - c.from;
    const t = s.time - c.from;
    if (t < 0 || t > life) return;

    const k = L.s;
    // In: eased slide from off the right edge. Out: fade with a small rise, the
    // same exit menu.js gives its wordmark, so the two read as one family.
    const inU = ease(sat(t / FADE_IN));
    const outU = ease(sat((t - (life - FADE_OUT)) / FADE_OUT));
    const a = inU * (1 - outU);
    if (a < 0.004) return;
    const slide = (1 - inU) * 54 * k;
    const rise = outU * 10 * k;

    const eyeSize = 11 * k;
    const nameSize = 27 * k;
    const padIn = 23 * k;

    const w = Math.max(
      measure(c.eyebrow, eyeSize, 7),
      measure(c.name, nameSize, 5.2),
    ) + padIn * 2;
    const h = 74 * k;
    // Right edge tucked inside the title-safe margin, top clear of the score
    // block and of the +N feed rising out of it.
    const x = L.w - L.padX - w + slide;
    const y = L.padY + 112 * k - rise;

    g.save();
    g.globalAlpha = a;

    plate(g, x, y, w, h, {
      top: 'rgba(9,21,34,0.90)',
      bottom: 'rgba(4,11,19,0.80)',
      strokeColor: alpha(C.ice, 0.30),
      cut: 13 * k,
      lw: 1.15 * k,
      lift: 16 * k,
    });

    // Accent rail straddling the outer edge, at the same x as the score block's
    // — the two line up down the right margin. It wipes down as the card
    // arrives, so the plate reads as being drawn rather than as a panel that
    // was always there and only just became visible.
    const railX = x + w;
    g.beginPath();
    g.moveTo(railX, y + 9 * k);
    g.lineTo(railX, y + 9 * k + (h - 18 * k) * inU);
    g.lineWidth = 2.6 * k;
    g.strokeStyle = alpha(C.gold, 0.85);
    g.stroke();

    const right = x + w - padIn;

    text(g, c.eyebrow, right, y + 24 * k, {
      size: eyeSize, track: 7, weight: 0.15, align: 'right',
      color: alpha(C.gold, 0.86), shadow: 5 * k,
    });

    text(g, c.name, right, y + 58 * k, {
      size: nameSize, track: 5.2, weight: 0.17, align: 'right',
      color: '#eaf6ff', shadow: 9 * k,
      // Glow only while it lands, so the card announces itself once instead of
      // sitting lit for three seconds next to a gauge that means something.
      glow: 14 * k * (1 - sat(t / (FADE_IN + 0.5))),
    });

    g.restore();
  }
}
