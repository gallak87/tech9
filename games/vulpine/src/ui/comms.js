// ─────────────────────────────────────────────────────────────────────────────
// Comms panel (bottom-left): callsign + line, portrait-less by design — the
// squad talks over the radio, not over a cutscene face. Slides in from the
// safe-area edge on a new message and holds until combat.js clears it; a
// small talking-bar animation (driven by sim time, never audio or random) is
// the only tell that someone is transmitting rather than a caption sitting
// on screen.
//
// It shares the bottom-left corner with the Legend, which only occupies that
// space for the first ~11 s or while toggled on. Rather than picking a fixed
// spot and hoping they never coincide, index.js hands this a `lift` in px —
// the Legend's current footprint scaled by its own fade — so Comms slides
// down to hug the corner exactly as the Legend clears out of the way.
// ─────────────────────────────────────────────────────────────────────────────

import { text, measure } from './glyphs.js';
import { C, alpha, plate, ease } from './theme.js';
import { chevron } from './icons.js';

const VOICE = { FALCO: C.amber, PEPPY: C.ice, SLIPPY: C.green };

function wrap(str, size, track, maxW) {
  const words = str.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (cur && measure(test, size, track) > maxW) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

export class Comms {
  constructor() {
    this.alpha = 0;
    this.who = '';
    this.raw = '';
    this._key = null;
  }

  update(dt, s) {
    const msg = s.message;
    if (msg !== this._key) {
      this._key = msg;
      if (msg) {
        this.who = msg.who;
        // the vector font has no em-dash glyph — substitute rather than let
        // it fall back to '?'
        this.raw = String(msg.text).replace(/—/g, ' - ');
      }
    }
    const target = msg ? 1 : 0;
    this.alpha += (target - this.alpha) * (1 - Math.exp(-dt * 9));
  }

  draw(g, L, s, lift = 0) {
    if (this.alpha < 0.01 || !this.who) return;
    const k = L.s;
    const col = VOICE[this.who] || C.ice;

    const maxW = Math.min(430 * k, L.w * 0.34);
    const headSize = 12 * k, lineSize = 13.5 * k;
    const lines = wrap(this.raw, lineSize, 1.1, maxW);

    const padIn = 14 * k;
    const rowH = lineSize * 1.42;
    const boxW = maxW + padIn * 2;
    const boxH = padIn * 1.5 + headSize + 7 * k + lines.length * rowH;

    const slide = ease(this.alpha);
    const x = L.padX - (1 - slide) * 46 * k;
    const bottom = L.h - L.padY - lift;
    const y = bottom - boxH;

    g.save();
    g.globalAlpha = this.alpha;

    plate(g, x, y, boxW, boxH, { accent: col, accentW: 2.6 * k });

    const tagX = x + padIn * 0.55;
    const headY = y + padIn + headSize * 0.5;
    chevron(g, tagX, headY, 4.2 * k, Math.PI / 2, col, {});
    text(g, this.who, tagX + 9 * k, headY, {
      size: headSize, track: 3.4, weight: 0.16, baseline: 'middle',
      color: col, shadow: 4 * k,
    });

    // talking bars — a small equalizer, driven by sim time only
    const bars = 5;
    for (let i = 0; i < bars; i++) {
      const ph = s.time * 9 + i * 1.7;
      const hgt = (2.5 + 3.5 * (0.5 + 0.5 * Math.sin(ph))) * k;
      g.fillStyle = alpha(col, 0.75);
      g.fillRect(x + boxW - padIn - (bars - i) * 5 * k, headY - hgt / 2, 2.4 * k, hgt);
    }

    let ly = y + padIn + headSize + 8 * k + lineSize * 0.78;
    for (const ln of lines) {
      text(g, ln, x + padIn, ly, {
        size: lineSize, track: 1.1, weight: 0.13,
        color: alpha(C.text, 0.94), shadow: 4 * k,
      });
      ly += rowH;
    }

    g.restore();
  }
}
