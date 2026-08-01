import { CONTROLS } from '../core/input.js';

// ─────────────────────────────────────────────────────────────────────────────
// Control legend. Reads straight from `CONTROLS` in the input module, so the
// keys on screen can never drift from the keys that are actually bound.
//
// Shows on launch, fades out once the player has clearly taken over, and comes
// back on H. Drawn in the Star Fox HUD idiom: cut corners, thin cyan rules,
// nothing that looks like an operating-system dialog.
// ─────────────────────────────────────────────────────────────────────────────

const CYAN = '#7fe4ff';
const AMBER = '#ffcf6a';
const HOLD_SECONDS = 11;    // visible from launch
const FADE_SECONDS = 1.1;

export class Legend {
  constructor() {
    this.t = 0;
    this.forced = null;      // null = auto, true/false = user override
    this.alpha = 1;
    this._playerActed = 0;
  }

  toggle() {
    const showing = this.alpha > 0.5;
    this.forced = !showing;
    if (this.forced) this.t = 0;
  }

  update(dt, input) {
    this.t += dt;
    if (input?.helpPressed) this.toggle();
    // Count real flying input — the legend has done its job once they're flying.
    if (input && (Math.abs(input.yaw) > 0.2 || Math.abs(input.pitch) > 0.2 || input.fire)) {
      this._playerActed += dt;
    }

    let target;
    if (this.forced === true) target = 1;
    else if (this.forced === false) target = 0;
    else target = (this.t < HOLD_SECONDS && this._playerActed < 2.5) ? 1 : 0;

    const k = 1 - Math.exp(-(dt / FADE_SECONDS) * 4);
    this.alpha += (target - this.alpha) * k;
  }

  /** @param {CanvasRenderingContext2D} g */
  draw(g, w, h) {
    const a = this.alpha;
    if (a < 0.004) return;

    const scale = Math.max(0.72, Math.min(1.15, w / 1600));
    const rowH = 25 * scale;
    const padX = 20 * scale;
    const padY = 17 * scale;
    const titleH = 25 * scale;
    const keyFont = `600 ${Math.round(12.5 * scale)}px ui-monospace, Menlo, monospace`;
    const labelFont = `500 ${Math.round(13.5 * scale)}px ui-monospace, Menlo, monospace`;
    const titleFont = `700 ${Math.round(12 * scale)}px ui-monospace, Menlo, monospace`;
    // "HOLD" rides in front of the cap rather than inside it — a keycap reads as
    // a thing you tap, and tapping fire never reaches the lock-on charge.
    const holdFont = `700 ${Math.round(9.5 * scale)}px ui-monospace, Menlo, monospace`;

    // measure the key column so the labels line up on one axis
    let keyColW = 0;
    const rows = CONTROLS.map(c => {
      const caps = c.keys;
      let wSum = 0;
      if (c.hold) {
        g.font = holdFont;
        wSum += g.measureText('HOLD').width + 6 * scale;
      }
      g.font = keyFont;
      for (const k of caps) wSum += this._capWidth(g, k, scale) + 5 * scale;
      if (c.alt) wSum += g.measureText(c.alt).width + 12 * scale;
      keyColW = Math.max(keyColW, wSum);
      return { caps, alt: c.alt, hold: c.hold, label: c.label, wSum };
    });

    g.font = labelFont;
    let labelW = 0;
    for (const r of rows) labelW = Math.max(labelW, g.measureText(r.label).width);

    const boxW = padX * 2 + keyColW + 18 * scale + labelW;
    const boxH = padY * 2 + titleH + rows.length * rowH;
    const x = Math.round(28 * scale);
    const y = Math.round(h - boxH - 28 * scale);
    const cut = 13 * scale;

    g.save();
    g.globalAlpha = a;

    // ── panel: cut top-right and bottom-left corners
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + boxW - cut, y);
    g.lineTo(x + boxW, y + cut);
    g.lineTo(x + boxW, y + boxH);
    g.lineTo(x + cut, y + boxH);
    g.lineTo(x, y + boxH - cut);
    g.closePath();

    const grad = g.createLinearGradient(x, y, x, y + boxH);
    grad.addColorStop(0, 'rgba(6,14,22,0.80)');
    grad.addColorStop(1, 'rgba(4,9,16,0.66)');
    g.fillStyle = grad;
    g.fill();
    g.lineWidth = 1.15 * scale;
    g.strokeStyle = 'rgba(127,228,255,0.42)';
    g.stroke();

    // accent bar down the left edge
    g.fillStyle = CYAN;
    g.globalAlpha = a * 0.85;
    g.fillRect(x, y + cut * 0.4, 2.2 * scale, boxH - cut * 1.4);
    g.globalAlpha = a;

    // ── title
    g.font = titleFont;
    g.fillStyle = AMBER;
    g.textBaseline = 'middle';
    g.letterSpacing = `${1.6 * scale}px`;
    g.fillText('FLIGHT CONTROLS', x + padX, y + padY + titleH * 0.4);
    g.letterSpacing = '0px';

    g.globalAlpha = a * 0.32;
    g.strokeStyle = CYAN;
    g.lineWidth = 1 * scale;
    g.beginPath();
    g.moveTo(x + padX, y + padY + titleH - 5 * scale);
    g.lineTo(x + boxW - padX, y + padY + titleH - 5 * scale);
    g.stroke();
    g.globalAlpha = a;

    // ── rows
    let ry = y + padY + titleH + rowH * 0.5;
    for (const r of rows) {
      let kx = x + padX;
      if (r.hold) {
        g.font = holdFont;
        g.fillStyle = 'rgba(255,207,106,0.78)';
        g.fillText('HOLD', kx, ry + 0.5 * scale);
        kx += g.measureText('HOLD').width + 6 * scale;
      }
      g.font = keyFont;
      for (const cap of r.caps) {
        kx = this._drawCap(g, cap, kx, ry, scale, a);
      }
      if (r.alt) {
        g.fillStyle = 'rgba(160,196,214,0.65)';
        g.font = keyFont;
        g.fillText(r.alt, kx + 3 * scale, ry);
        kx += g.measureText(r.alt).width + 12 * scale;
      }
      g.font = labelFont;
      g.fillStyle = 'rgba(226,240,248,0.94)';
      g.fillText(r.label, x + padX + keyColW + 18 * scale, ry);
      ry += rowH;
    }

    g.restore();
  }

  _capWidth(g, cap, scale) {
    return Math.max(22 * scale, g.measureText(cap).width + 13 * scale);
  }

  _drawCap(g, cap, x, cy, scale, a) {
    const w = this._capWidth(g, cap, scale);
    const h = 19 * scale;
    const y = cy - h / 2;
    const r = 3.5 * scale;

    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
    g.fillStyle = 'rgba(127,228,255,0.13)';
    g.fill();
    g.globalAlpha = a * 0.55;
    g.strokeStyle = CYAN;
    g.lineWidth = 1 * scale;
    g.stroke();
    g.globalAlpha = a;

    g.fillStyle = '#dff4ff';
    g.textAlign = 'center';
    g.fillText(cap, x + w / 2, cy + 0.5 * scale);
    g.textAlign = 'left';

    return x + w + 5 * scale;
  }
}
