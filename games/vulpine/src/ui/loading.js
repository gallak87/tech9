// ─────────────────────────────────────────────────────────────────────────────
// Boot overlay.
//
// Drawn with the HUD's own glyph face and gauge, so the first thing on screen
// is already the game's instrument look — no fonts, no assets, no fetches.
//
// Boot is synchronous. Every stage() must yield to the event loop before the
// caller's blocking work runs, or the browser never composites and the bar
// snaps 0 → 100 at the end. Each stage spends a fixed number of rAF turns
// easing toward its target, so every stage is a painted frame.
// ─────────────────────────────────────────────────────────────────────────────

import { text } from './glyphs.js';
import { C, alpha, gauge, bracket, sat, clamp } from './theme.js';
import { arwing } from './icons.js';

const STAGE_FRAMES = 4;     // painted frames per stage
const APPROACH = 0.55;      // per-frame ease toward the stage target
const FADE_MS = 320;        // cross-fade onto the first live frame

const raf = () => new Promise(r => requestAnimationFrame(r));

export function createLoader() {
  const host = document.getElementById('boot');
  const canvas = document.createElement('canvas');
  host.appendChild(canvas);
  const g = canvas.getContext('2d');

  let value = 0, target = 0, label = '';

  function draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = host.clientWidth, h = host.clientHeight;
    const cw = Math.floor(w * dpr), ch = Math.floor(h * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw; canvas.height = ch;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    // Same scale law as the HUD (src/ui/index.js layout()), so the boot card
    // and the in-game instruments are the same size at any window size.
    const k = clamp(h / 900, 0.75, 1.6);
    const cx = Math.round(w * 0.5);

    // The wordmark lands where the title card settles its own, so the hand-off
    // is one logo holding still while the level fades up behind it. Nothing
    // else is drawn up here — a second copy of any title element would ghost.
    const big = 82 * k;
    text(g, 'VULPINE', cx, h * 0.40 + big * 0.34, {
      size: big, track: 9, weight: 0.2, align: 'center',
      color: '#eaf6ff', shadow: 14 * k, glow: 20 * k,
    });

    // Progress band, bottom-anchored: clear of the title card's prompt lines.
    const bw = Math.round(Math.min(w * 0.62, 720 * k));
    const bh = Math.round(13 * k);
    const bx = cx - Math.round(bw / 2);
    const by = Math.round(h - 88 * k);

    gauge(g, bx, by, bw, bh, {
      value, segments: 36, colors: [C.shield, C.shieldHot],
      skew: bh * 0.5, glow: 16 * k, lw: 1.2 * k,
    });

    // The ship rides the fill edge — the same idiom as the title card's rule.
    const si = 19 * k;
    arwing(g, bx + 6 * k + value * (bw - 12 * k) - si * 0.5, by - si - 6 * k, si, {
      color: '#eaf8ff', wing: 'rgba(150,205,232,0.9)', trim: C.ice,
    });

    const ly = by + bh + 26 * k;
    text(g, label, bx, ly, {
      size: 11.5 * k, track: 7, weight: 0.15,
      color: alpha(C.ice, 0.82), shadow: 6 * k,
    });
    // Tabular digits, space-padded: the readout must not shuffle as it counts.
    text(g, String(Math.round(value * 100)).padStart(3, ' ') + '%', bx + bw, ly, {
      size: 14 * k, track: 5, weight: 0.16, align: 'right',
      color: C.gold, shadow: 6 * k,
    });

    const mx = 26 * k, top = by - 34 * k, bot = ly + 12 * k;
    const bl = 16 * k, bc = alpha(C.ice, 0.42), blw = 1.5 * k;
    bracket(g, bx - mx, top, bl, 1, 1, bc, blw);
    bracket(g, bx + bw + mx, top, bl, -1, 1, bc, blw);
    bracket(g, bx + bw + mx, bot, bl, -1, -1, bc, blw);
    bracket(g, bx - mx, bot, bl, 1, -1, bc, blw);
  }

  /** Announce the work about to run, then hand the frame back to the browser. */
  async function stage(name, to) {
    label = name;
    target = sat(to);
    for (let i = 0; i < STAGE_FRAMES; i++) {
      value += (target - value) * APPROACH;
      if (target - value < 0.004) value = target;
      draw();
      await raf();
      if (value === target) break;
    }
    value = target;
  }

  /** Fade onto the first live frames, then leave no node behind. */
  async function finish() {
    await stage('READY', 1);
    const t0 = performance.now();
    for (;;) {
      await raf();
      const f = 1 - sat((performance.now() - t0) / FADE_MS);
      host.style.opacity = String(f);
      if (f <= 0) break;
    }
    host.remove();
  }

  return { stage, finish };
}
