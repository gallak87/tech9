import { Legend } from './legend.js';

// ─────────────────────────────────────────────────────────────────────────────
// HUD / UI seam.  OWNER: ui agent.  Everything under src/ui/ is yours.
//
// The UI draws to its own 2D canvas layered over the WebGL stage (#ui in
// index.html) — it must never touch the Three scene or the post chain, so HUD
// work can never regress the render.
//
// Currently a first pass: the control legend only. Shield/boost gauges, radar,
// reticles, lock-on and comms panels are still to build; `ctx.state` (see
// game/combat.js) is where their data will come from.
// ─────────────────────────────────────────────────────────────────────────────

export function installUI(ctx) {
  const host = document.getElementById('ui');
  const canvas = document.createElement('canvas');
  host.appendChild(canvas);
  const g = canvas.getContext('2d');

  let w = 0, h = 0, dpr = 1;
  function resize(width, height) {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = width; h = height;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }
  resize(ctx.engine.width, ctx.engine.height);

  const legend = new Legend();

  return {
    canvas, ctx2d: g, legend,
    resize,
    visible: true,
    update(dt) {
      legend.update(dt, ctx.input?.state);
    },
    draw() {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      if (!this.visible) return;
      legend.draw(g, w, h);
    },
    dispose() { host.removeChild(canvas); },
  };
}
