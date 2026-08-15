import * as THREE from 'three';
import { registerShot } from '../game/shots.js';
import { Planet } from './planet.js';
import { HeatWash } from './screen.js';

// ─────────────────────────────────────────────────────────────────────────────
// Orbital hop — the look of the between-level transition.  OWNER: fx agent.
//
// This module owns no timing. `setPhase(phase, t)` is the entire input: the
// caller says where in the sequence it is and everything here is a pure
// function of that, so the same (phase, t) always produces the same frame and
// the caller is free to scrub, stall or replay a phase without the look
// drifting. Nothing here touches gameplay state, the camera or the clock, and
// nothing here stops the sim.
//
// Phases and what each one is responsible for:
//
//   ascent    corneria → vacuum: fog and sky gradient die, stars come up, the
//             world you are leaving swings in under the frame
//   space     the far end of that blend, held
//   approach  the destination grows from a 3 px dot to a body filling the
//             lower frame — geometric, because apparent size under constant
//             closing speed is
//   reentry   plasma, buffet, the wash, and the hand-off to the destination
//             preset underneath it
//
// The one discontinuity in the sequence is deliberate and is hidden: the
// destination preset is *applied* — full atmosphere rebuild and IBL bake — at
// the peak of the re-entry wash, because that is the only frame in fifteen
// seconds where a rebuild spike and a hard parameter cut are both invisible.
// Everything either side of that instant is a continuous `env.blend`.
// ─────────────────────────────────────────────────────────────────────────────

const PHASES = ['ascent', 'space', 'approach', 'reentry'];

/** Planet palette per environment preset; anything unlisted falls back. */
const PLANET_FOR = { corneria: 'corneria', fichina: 'fichina', venom: 'venom', sunset: 'sunset' };

const _dirA = new THREE.Vector3();
const _dirB = new THREE.Vector3();
const _v = new THREE.Vector3();
const lerp = THREE.MathUtils.lerp;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (t) => t * t * (3 - 2 * t);
/** Geometric interpolation — the right curve for an apparent radius. */
const glerp = (a, b, t) => a * Math.pow(b / a, t);

/* Where each body sits, as a world direction from the camera. The rail runs
   along -Z, so -Z is ahead and the destination has to be ahead and below for
   the dive to read as a dive. */
const ORIGIN_DIR = [
  [0.10, -0.95, 0.28],   // ascent: straight down, the world you are lifting off
  [0.18, -0.84, 0.51],   // space: swung behind
  [0.30, -0.62, 0.72],   // approach: over your shoulder
];
const DEST_DIR = [0.07, -0.26, -0.96];

export function installTransit(ctx, hooks = {}) {
  const env = ctx.env;
  const group = new THREE.Group();
  group.name = 'fx.transit';
  ctx.scene.add(group);

  const origin = new Planet('corneria');
  const dest = new Planet('fichina');
  const wash = new HeatWash();
  group.add(origin.group, dest.group, wash.mesh);

  const st = {
    active: false,
    from: 'corneria',
    to: 'fichina',
    phase: null,
    t: 0,
    committed: false,
    heat: 0,
    buffet: 0,
  };

  /* ── phase → look ──────────────────────────────────────────────────────── */

  function driveAscent(t) {
    // The gradient dies faster than the fog does: air thins with altitude but
    // the ground you are still looking down through does not.
    env.blend(st.from, 'space', ease(clamp01(t * 1.06)));
    env.setStars(ease(clamp01((t - 0.30) / 0.55)));

    origin.setDirection(...ORIGIN_DIR[0]);
    origin.setAngularRadius(lerp(1.25, 1.16, t));
    origin.setOpacity(clamp01((t - 0.50) / 0.34));
    dest.setOpacity(0);
    st.heat = 0;
    st.buffet = 0.10 * (1 - t);
  }

  function driveSpace(t) {
    env.blend(st.from, 'space', 1);
    env.setStars(1);

    _dirA.fromArray(ORIGIN_DIR[0]);
    _dirB.fromArray(ORIGIN_DIR[1]);
    _v.copy(_dirA).lerp(_dirB, ease(t)).normalize();
    origin.setDirection(_v.x, _v.y, _v.z);
    origin.setAngularRadius(lerp(1.16, 0.92, ease(t)));
    origin.setOpacity(1);

    dest.setDirection(...DEST_DIR);
    dest.setAngularRadius(glerp(0.0032, 0.0075, clamp01((t - 0.30) / 0.70)));
    dest.setOpacity(clamp01((t - 0.30) / 0.30));
    st.heat = 0;
    st.buffet = 0;
  }

  function driveApproach(t) {
    env.blend(st.from, 'space', 1);
    env.setStars(1);

    _dirA.fromArray(ORIGIN_DIR[1]);
    _dirB.fromArray(ORIGIN_DIR[2]);
    _v.copy(_dirA).lerp(_dirB, ease(t)).normalize();
    origin.setDirection(_v.x, _v.y, _v.z);
    origin.setAngularRadius(lerp(0.92, 0.30, ease(t)));
    origin.setOpacity(1);

    dest.setDirection(...DEST_DIR);
    dest.setAngularRadius(glerp(0.0075, 0.30, t));
    dest.setOpacity(1);
    st.heat = 0;
    st.buffet = 0.12 * clamp01((t - 0.85) / 0.15);
  }

  function driveReentry(t) {
    // Hand-over runs under the wash and finishes with it. Past the commit the
    // destination preset owns the look outright, so blending stops rather than
    // fighting it.
    if (!st.committed) {
      if (t >= 0.62) {
        env.apply(st.to);
        st.committed = true;
      } else {
        env.blend('space', st.to, ease(clamp01(t / 0.62)));
      }
    }
    env.setStars(1 - ease(clamp01((t - 0.10) / 0.45)));

    origin.setOpacity(clamp01(1 - t * 3.2));
    dest.setDirection(...DEST_DIR);
    dest.setAngularRadius(glerp(0.30, 1.25, clamp01(t / 0.55)));
    // The body stops being scenery and becomes the world once the deck is in
    // front of it.
    dest.setOpacity(1 - ease(clamp01((t - 0.44) / 0.24)));

    // wash: builds through the shock, peaks at the hand-over, gone by arrival
    st.heat = t < 0.62
      ? ease(clamp01(t / 0.62)) * 0.94
      : 0.94 * (1 - ease(clamp01((t - 0.62) / 0.33)));
    st.buffet = 0.55 * Math.sin(Math.PI * clamp01(t / 0.90));

    // The cloud deck is driven down past the camera rather than flown down to:
    // this module does not own the altitude, so the break has to be produced
    // from the deck's side of the ray-plane test.
    if (t > 0.40 && st.committed) {
      const u = clamp01((t - 0.40) / 0.55);
      env.sky.set({
        cloudHeight: ctx.camera.position.y + lerp(2600, -900, ease(u)),
        cloudAmount: 1,
        coverage: lerp(0.86, 0.58, u),
      });
    }
  }

  const DRIVE = { ascent: driveAscent, space: driveSpace, approach: driveApproach, reentry: driveReentry };

  /* ── API ───────────────────────────────────────────────────────────────── */

  /**
   * Begin the sequence. Captures the look in effect as the start of the blend;
   * does no allocation, no bake and no rebuild, so it is safe to call on the
   * frame the boss dies.
   */
  function enter(fromPreset = null, toPreset = 'fichina') {
    st.from = fromPreset || env.presetName;
    st.to = toPreset;
    st.active = true;
    st.committed = false;
    st.phase = 'ascent';
    st.t = 0;
    origin.setPalette(PLANET_FOR[st.from] || 'corneria');
    dest.setPalette(PLANET_FOR[st.to] || 'fichina');
    // Space exposure is set for the Arwing, not for a body covering a third of
    // the frame; the gain is what keeps the planet a subject under it.
    origin.setGain(1.15);
    dest.setGain(1.5);
    origin.setOpacity(0);
    dest.setOpacity(0);
    return api;
  }

  /**
   * @param {'ascent'|'space'|'approach'|'reentry'} phase
   * @param {number} t 0..1 within that phase
   */
  function setPhase(phase, t = 0) {
    if (!PHASES.includes(phase)) { console.warn('[transit] unknown phase', phase); return api; }
    if (!st.active) enter(null, st.to);
    st.phase = phase;
    st.t = clamp01(t);
    return api;
  }

  /** Hand the look to the destination preset and put the sequence away. */
  function exit() {
    if (!st.committed) { env.apply(st.to); st.committed = true; }
    env.setStars(null);
    origin.setOpacity(0);
    dest.setOpacity(0);
    wash.update(0, 0, 1);
    st.active = false;
    st.phase = null;
    st.heat = 0;
    st.buffet = 0;
    return api;
  }

  function update(dt) {
    if (!st.active) return;
    const drive = DRIVE[st.phase];
    if (drive) drive(st.t);

    const h = ctx.engine.size ? ctx.engine.size.y : 1080;
    const aspect = ctx.camera.aspect || 16 / 9;
    origin.update(dt, ctx.camera, env.sunDir, h);
    dest.update(dt, ctx.camera, env.sunDir, h);
    wash.update(dt, st.heat, aspect);

    if (st.buffet > 0.001 && ctx.flight?.addShake) ctx.flight.addShake(st.buffet * dt * 7);
    if (st.heat > 0.02 && hooks.ablation) hooks.ablation(st.heat, dt);
  }

  /* ── review shots ──────────────────────────────────────────────────────── */

  function skyCam(cam, alt, pitchDeg, fov = 58) {
    const p = ctx.flight?.pos || ctx.ship.position;
    cam.position.set(p.x, p.y + alt, p.z + 40);
    cam.fov = fov;
    cam.updateProjectionMatrix();
    const pr = THREE.MathUtils.degToRad(pitchDeg);
    cam.lookAt(p.x, cam.position.y + Math.sin(pr) * 900, p.z - Math.cos(pr) * 900);
  }

  const SHOT = (name, phase, t, build) => registerShot(name, (c) => {
    if (!st.active || st.to !== 'fichina') enter('corneria', 'fichina');
    setPhase(phase, t);
    update(1 / 60);
    build(c);
  });

  SHOT('transit-ascent', 'ascent', 0.55, (c) => skyCam(c.engine.camera, 900, 26));
  SHOT('transit-ascent-end', 'ascent', 1.0, (c) => skyCam(c.engine.camera, 3400, 14));
  SHOT('transit-space', 'space', 0.6, (c) => skyCam(c.engine.camera, 6000, -6));
  SHOT('transit-approach', 'approach', 0.62, (c) => skyCam(c.engine.camera, 6000, -10));
  SHOT('transit-approach-late', 'approach', 1.0, (c) => skyCam(c.engine.camera, 6000, -14));
  SHOT('transit-reentry', 'reentry', 0.35, (c) => c.flight.updateCamera(1 / 60, c.engine.camera));
  SHOT('transit-reentry-peak', 'reentry', 0.62, (c) => c.flight.updateCamera(1 / 60, c.engine.camera));
  SHOT('transit-arrive', 'reentry', 0.95, (c) => c.flight.updateCamera(1 / 60, c.engine.camera));

  const api = {
    enter, setPhase, exit, update,
    group,
    get phase() { return st.phase; },
    get t() { return st.t; },
    get active() { return st.active; },
    get heat() { return st.heat; },
    dispose() {
      ctx.scene.remove(group);
      origin.dispose(); dest.dispose(); wash.dispose();
    },
  };
  return api;
}
