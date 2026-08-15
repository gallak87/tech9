import { clamp } from './theme.js';

// ─────────────────────────────────────────────────────────────────────────────
// Transit banner — the only HUD element that exists between levels.
//
// It answers one question: how long does this last. The hop is 14.5 s of
// scripted flight with nothing to shoot, which is long enough that a player with
// no progress read starts wondering whether the game has hung.
//
// Two bars, deliberately: `progress` is the sequence and always advances,
// `loading` is the terrain mesh and normally finishes under the first third. The
// second only draws while it is genuinely behind, so a healthy hop shows one bar.
// ─────────────────────────────────────────────────────────────────────────────

export class TransitBanner {
  constructor() { this.shown = 0; }

  update(dt, hud) {
    const target = hud ? 1 : 0;
    this.shown += (target - this.shown) * Math.min(1, dt * 6);
  }

  draw(g, L, hud) {
    if (this.shown < 0.01 || !hud) return;
    const a = clamp(this.shown, 0, 1);
    const w = Math.min(420, L.w * 0.46);
    const x = (L.w - w) / 2;
    const y = L.h * 0.135;

    g.save();
    g.globalAlpha = a;

    g.font = '600 11px ui-monospace, Menlo, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillStyle = 'rgba(120,200,255,0.62)';
    g.fillText(hud.label, L.w / 2, y - 22);

    g.font = '600 15px ui-monospace, Menlo, monospace';
    g.fillStyle = '#ffd489';
    g.fillText(hud.to, L.w / 2, y - 4);

    const bar = (yy, v, col, h) => {
      g.fillStyle = 'rgba(6,12,20,0.55)';
      g.fillRect(x, yy, w, h);
      g.fillStyle = col;
      g.fillRect(x, yy, w * clamp(v, 0, 1), h);
      g.strokeStyle = 'rgba(120,200,255,0.30)';
      g.lineWidth = 1;
      g.strokeRect(x + 0.5, yy + 0.5, w - 1, h - 1);
    };

    bar(y + 6, hud.progress, 'rgba(150,215,255,0.85)', 3);
    // Only while the mesh is actually the laggard — a bar that is always full is
    // noise, and this one exists to explain a wait, not to decorate the frame.
    if (hud.loading < 0.999) {
      bar(y + 14, hud.loading, 'rgba(255,196,97,0.8)', 2);
      g.font = '9px ui-monospace, Menlo, monospace';
      g.fillStyle = 'rgba(255,196,97,0.7)';
      g.fillText(`TERRAIN ${Math.round(hud.loading * 100)}%`, L.w / 2, y + 30);
    }

    g.restore();
  }
}
