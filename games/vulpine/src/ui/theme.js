// ─────────────────────────────────────────────────────────────────────────────
// HUD design system: palette, chamfered panel shapes, and the segmented gauge
// every meter in the game is built from.
//
// Two rules hold the look together:
//   1. Nothing is an axis-aligned rectangle. Every plate is chamfered or
//      skewed, so the HUD reads as machined hardware rather than markup.
//   2. Bright ink always sits on a dark shadow. The frame behind the HUD swings
//      from blown-out sky to black rock in one pan; only a dark scrim under the
//      strokes survives both.
// ─────────────────────────────────────────────────────────────────────────────

export const C = {
  ice: '#a8ecff',
  iceHot: '#e6fbff',
  iceDim: 'rgba(150,214,238,0.55)',
  text: '#e9f8ff',
  dim: 'rgba(163,199,219,0.78)',
  faint: 'rgba(150,190,212,0.42)',

  shield: '#57d2ff',
  shieldHot: '#d6f6ff',
  shieldLow: '#ffb03a',
  boost: '#ffc161',
  boostHot: '#fff0c8',

  gold: '#ffd489',
  amber: '#ffb43c',
  red: '#ff4d5c',
  redDeep: '#8e1420',
  green: '#5cf0a0',
  hostile: '#ff5a52',
  ally: '#5cf0a0',

  ink: 'rgba(2,8,14,0.86)',
  shadow: 'rgba(0,8,16,0.85)',
};

/** Drop colours, keyed by kind. Matched to the bodies in `game/pickups.js` —
 *  the radar blip and the thing in the world have to be the same colour or the
 *  blip is a second symbol to learn rather than the same one. */
export const PICKUP_C = {
  weapon: '#ffc23a',
  bomb: '#ff8a45',
  health: '#3dffbe',
};

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (t) => { t = sat(t); return t * t * (3 - 2 * t); };
export const ease = (t) => 1 - Math.pow(1 - sat(t), 3);
/** Frame-rate independent exponential approach. */
export const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

/** Blend two '#rrggbb' colours. */
export function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
  const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
  const bl = Math.round(lerp(pa & 255, pb & 255, t));
  return `rgb(${r},${g},${bl})`;
}

/** '#rrggbb' → 'rgba(r,g,b,a)'. */
export function alpha(hex, a) {
  const p = parseInt(hex.slice(1), 16);
  return `rgba(${(p >> 16) & 255},${(p >> 8) & 255},${p & 255},${a})`;
}

/**
 * Chamfered rectangle. `cut` is one number or [tl, tr, br, bl]; a zero corner
 * stays square. Builds into the current path — caller fills/strokes.
 */
export function chamfer(g, x, y, w, h, cut) {
  const c = Array.isArray(cut) ? cut : [cut, cut, cut, cut];
  const [tl, tr, br, bl] = c;
  g.beginPath();
  g.moveTo(x + tl, y);
  g.lineTo(x + w - tr, y);
  if (tr) g.lineTo(x + w, y + tr);
  g.lineTo(x + w, y + h - br);
  if (br) g.lineTo(x + w - br, y + h);
  g.lineTo(x + bl, y + h);
  if (bl) g.lineTo(x, y + h - bl);
  g.lineTo(x, y + tl);
  g.closePath();
}

/** Skewed (parallelogram) plate — the Star Fox instrument idiom. */
export function skewRect(g, x, y, w, h, skew) {
  g.beginPath();
  g.moveTo(x + skew, y);
  g.lineTo(x + w + skew, y);
  g.lineTo(x + w, y + h);
  g.lineTo(x, y + h);
  g.closePath();
}

/**
 * Backing plate: dark glass with a vertical gradient, a hairline frame and an
 * optional accent rail down one edge.
 */
export function plate(g, x, y, w, h, o = {}) {
  const cut = o.cut != null ? o.cut : Math.min(w, h) * 0.18;
  const a = o.alpha != null ? o.alpha : 1;
  g.save();
  g.globalAlpha *= a;

  chamfer(g, x, y, w, h, cut);
  const grad = g.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, o.top || 'rgba(7,18,29,0.80)');
  grad.addColorStop(1, o.bottom || 'rgba(3,9,16,0.62)');
  g.fillStyle = grad;
  g.shadowColor = 'rgba(0,6,12,0.55)';
  g.shadowBlur = o.lift != null ? o.lift : 10;
  g.shadowOffsetY = 2;
  g.fill();
  g.shadowBlur = 0; g.shadowOffsetY = 0;

  if (o.stroke !== false) {
    g.lineWidth = o.lw || 1.15;
    g.strokeStyle = o.strokeColor || alpha(C.ice, 0.30);
    g.stroke();
  }
  // top inner highlight — sells thickness without a bevel
  g.save();
  chamfer(g, x, y, w, h, cut);
  g.clip();
  g.beginPath();
  g.moveTo(x, y + 0.6); g.lineTo(x + w, y + 0.6);
  g.lineWidth = 1.1;
  g.strokeStyle = alpha(C.ice, 0.16);
  g.stroke();
  g.restore();

  if (o.accent) {
    g.fillStyle = o.accent;
    g.globalAlpha *= 0.9;
    g.fillRect(x, y + cut * 0.5, o.accentW || 2.2, h - cut * 1.0);
  }
  g.restore();
}

/** Small registration tick — a corner bracket. Pure craft, costs nothing. */
export function bracket(g, x, y, len, dx, dy, color, lw) {
  g.beginPath();
  g.moveTo(x + dx * len, y);
  g.lineTo(x, y);
  g.lineTo(x, y + dy * len);
  g.lineWidth = lw;
  g.lineCap = 'butt';
  g.strokeStyle = color;
  g.stroke();
}

/**
 * The gauge. One implementation drives shield, boost, boss and squad bars so
 * they cannot drift apart visually.
 *
 * @param o.segments  cell count (0 = continuous)
 * @param o.value     0..1 filled
 * @param o.ghost     0..1 lagging value drawn as damage residue behind the fill
 * @param o.colors    [low, high] gradient across the track
 * @param o.skew      parallelogram lean in px
 * @param o.glow      leading-edge bloom in px
 */
export function gauge(g, x, y, w, h, o = {}) {
  const v = sat(o.value);
  const skew = o.skew != null ? o.skew : h * 0.45;
  const segs = o.segments != null ? o.segments : 0;
  const gap = o.gap != null ? o.gap : Math.max(1.2, h * 0.16);
  const cLo = o.colors ? o.colors[0] : C.shield;
  const cHi = o.colors ? o.colors[1] : C.shieldHot;

  g.save();

  // ── track
  skewRect(g, x, y, w, h, skew);
  const bg = g.createLinearGradient(x, y, x, y + h);
  bg.addColorStop(0, 'rgba(4,12,20,0.86)');
  bg.addColorStop(1, 'rgba(2,7,13,0.70)');
  g.fillStyle = bg;
  g.shadowColor = 'rgba(0,6,12,0.6)';
  g.shadowBlur = 8; g.shadowOffsetY = 1.5;
  g.fill();
  g.shadowBlur = 0; g.shadowOffsetY = 0;

  // ── cells, clipped to the track so the ends stay mitred
  g.save();
  skewRect(g, x, y, w, h, skew);
  g.clip();

  const cell = (x0, x1, fill, a) => {
    g.beginPath();
    g.moveTo(x0 + skew, y);
    g.lineTo(x1 + skew, y);
    g.lineTo(x1, y + h);
    g.lineTo(x0, y + h);
    g.closePath();
    g.globalAlpha = a;
    g.fillStyle = fill;
    g.fill();
  };

  // empty cells: faint, so the meter still reads its capacity when drained
  const n = segs || 1;
  const cw = w / n;
  for (let i = 0; i < n; i++) {
    const x0 = x + i * cw, x1 = x0 + cw - (segs ? gap : 0);
    cell(x0, x1, 'rgba(126,180,208,0.13)', 1);
  }

  // ghost (recent damage)
  if (o.ghost != null && o.ghost > v + 0.001) {
    const gx0 = x + v * w, gx1 = x + sat(o.ghost) * w;
    for (let i = 0; i < n; i++) {
      const c0 = x + i * cw, c1 = c0 + cw - (segs ? gap : 0);
      const a0 = Math.max(c0, gx0), a1 = Math.min(c1, gx1);
      if (a1 > a0) cell(a0, a1, o.ghostColor || '#ff5a52', 0.42);
    }
  }

  // fill
  const fillGrad = g.createLinearGradient(x, y, x + w, y);
  fillGrad.addColorStop(0, cLo);
  fillGrad.addColorStop(1, cHi);
  const fx = x + v * w;
  for (let i = 0; i < n; i++) {
    const c0 = x + i * cw, c1 = c0 + cw - (segs ? gap : 0);
    if (c0 >= fx) break;
    const a1 = Math.min(c1, fx);
    // Partial cells fade rather than clip — a half-lit segment reads as
    // "draining", a hard-cut one reads as a rendering bug.
    const frac = (a1 - c0) / (c1 - c0);
    cell(c0, a1, fillGrad, o.fillAlpha != null ? o.fillAlpha : (0.55 + 0.45 * Math.min(1, frac * 2.2)));
  }

  // sheen across the top third
  const sh = g.createLinearGradient(x, y, x, y + h);
  sh.addColorStop(0, 'rgba(255,255,255,0.20)');
  sh.addColorStop(0.42, 'rgba(255,255,255,0.03)');
  sh.addColorStop(1, 'rgba(0,0,0,0.16)');
  g.globalAlpha = 1;
  g.fillStyle = sh;
  g.fillRect(x - skew, y, w + skew * 2, h);

  g.restore();

  // ── leading edge
  if (v > 0.001 && v < 0.999 && o.edge !== false) {
    g.globalAlpha = 1;
    g.beginPath();
    g.moveTo(fx + skew, y);
    g.lineTo(fx, y + h);
    g.lineWidth = Math.max(1.4, h * 0.14);
    g.strokeStyle = cHi;
    if (o.glow) { g.shadowColor = cHi; g.shadowBlur = o.glow; }
    g.stroke();
    g.shadowBlur = 0;
  }

  // ── frame
  g.globalAlpha = 1;
  skewRect(g, x, y, w, h, skew);
  g.lineWidth = o.lw || 1.15;
  g.strokeStyle = o.frame || alpha(C.ice, 0.34);
  g.stroke();

  g.restore();
}
