import { CONTROLS } from '../core/input.js';
import { Legend } from './legend.js';
import { Status } from './status.js';
import { Radar } from './radar.js';
import { Score } from './score.js';
import { Reticle, LockMarker } from './reticle.js';
import { Comms } from './comms.js';
import { WingmenStrip } from './wingmen.js';
import { BossHealthBar } from './bosshealth.js';
import { OutcomeCard } from './outcome.js';
import { clamp } from './theme.js';

// ─────────────────────────────────────────────────────────────────────────────
// HUD / UI seam.  OWNER: ui agent.  Everything under src/ui/ is yours.
//
// The UI draws to its own 2D canvas layered over the WebGL stage (#ui in
// index.html) — it must never touch the Three scene or the post chain, so HUD
// work can never regress the render. The one exception is a read-only
// projection of `ctx.camera` for the lock-on marker (see `projectLock` below):
// the camera is read, never written.
//
// Composition, top to bottom of the z-order:
//   status (top-left) -> wingmen strip (under it) -> score (top-right) ->
//   boss health (top-centre, conditional) -> radar (bottom-centre) ->
//   reticle + lock marker (centre / world-projected) -> legend -> comms
//   (bottom-left, both share that corner, see comms.js) -> outcome card (top).
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
  const status = new Status();
  const radar = new Radar();
  const score = new Score();
  const reticle = new Reticle();
  const lockMarker = new LockMarker();
  const comms = new Comms();
  const wingmen = new WingmenStrip();
  const bossHealth = new BossHealthBar();
  const outcome = new OutcomeCard();

  /** dpr-independent UI scale + a 16:9 title-safe margin. */
  function layout() {
    const s = clamp(h / 900, 0.75, 1.6);
    return { s, w, h, padX: Math.round(28 * s), padY: Math.round(22 * s) };
  }

  // How much vertical room the Legend currently occupies, scaled by its own
  // fade — mirrors legend.js's own box math so Comms can slide underneath it
  // without either file reaching into the other's internals.
  function legendFootprint() {
    const scale = Math.max(0.72, Math.min(1.15, w / 1600));
    const rowH = 25 * scale, padY = 17 * scale, titleH = 25 * scale;
    return padY * 2 + titleH + CONTROLS.length * rowH + 34 * scale;
  }

  // Read-only camera projection for the lock-on marker. `target.agent.pos` is
  // the same THREE.Vector3 combat.js drives every tick; nothing here mutates
  // the camera or the scene.
  const _lp = new ctx.THREE.Vector3();
  const _fwd = new ctx.THREE.Vector3();
  function projectLock(s, L) {
    const target = s.lockTarget;
    if (!target) return null;
    const p = (target.agent && target.agent.pos) || (target.root && target.root.position);
    const cam = ctx.camera;
    if (!p || !cam) return null;

    _fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    _lp.copy(p).sub(cam.position);
    const along = _lp.dot(_fwd);
    if (along < 4) return null; // behind the camera or degenerate

    const dist = _lp.length();
    _lp.copy(p).project(cam);
    if (!Number.isFinite(_lp.x) || !Number.isFinite(_lp.y)) return null;

    const sx = (_lp.x * 0.5 + 0.5) * L.w;
    const sy = (1 - (_lp.y * 0.5 + 0.5)) * L.h;
    const onscreen = _lp.x > -1.02 && _lp.x < 1.02 && _lp.y > -1.02 && _lp.y < 1.02 && _lp.z < 1;
    return { x: sx, y: sy, dist, onscreen, ndx: _lp.x, ndy: _lp.y, kind: (target.spec && target.spec.kind) || '' };
  }

  return {
    canvas, ctx2d: g, legend,
    resize,
    visible: true,
    update(dt) {
      legend.update(dt, ctx.input?.state);
      const s = ctx.state;
      if (!s) return;
      status.update(dt, s);
      wingmen.update(dt, s);
      score.update(dt, s);
      radar.update(dt, s);
      reticle.update(dt, s);
      lockMarker.update(dt, s);
      comms.update(dt, s);
      bossHealth.update(dt, s);
      outcome.update(dt, s);
    },
    draw() {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      if (!this.visible) return;
      const s = ctx.state;
      if (!s) return;
      const L = layout();

      let y = status.draw(g, L, s);
      wingmen.draw(g, L, s, y + 8 * L.s);

      score.draw(g, L, s);
      bossHealth.draw(g, L, s);
      radar.draw(g, L, s);

      reticle.draw(g, L, s);
      lockMarker.draw(g, L, s, projectLock(s, L));

      legend.draw(g, w, h);
      comms.draw(g, L, s, legendFootprint() * legend.alpha);

      outcome.draw(g, L, s);
    },
    dispose() { host.removeChild(canvas); },
  };
}
