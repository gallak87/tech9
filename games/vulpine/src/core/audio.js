// ─────────────────────────────────────────────────────────────────────────────
// Audio seam.  OWNER: audio agent.  Yours: src/core/audio.js, src/audio/*
//
// Everything is synthesised through WebAudio — no binary assets. Autoplay
// policy means the context stays suspended until the first real input, so all
// entry points must be safe to call before that happens: this file builds
// *nothing* — no AudioContext, no node — until unlock() actually runs on a
// real gesture. Every other method is a no-op (aside from caching the last
// value it was given) until that happens.
//
// This file is the orchestrator only. It owns:
//   - lazy construction of the graph (audio/graph.js) and the voice banks
//     (audio/voices.js, audio/engine.js, audio/world.js, audio/music.js)
//   - turning a combat.js event name + world-space position into gain / pan /
//     lowpass for a Voices call (distance attenuation + stereo placement)
//   - a load-aware cutoff so a crowded fight thins out distant one-shots
//     before it thins out the ones next to the player
//   - driving the continuous voices (engine, charge whine, world beds, music)
//     from ctx every frame
// ─────────────────────────────────────────────────────────────────────────────

import { buildGraph, Budget } from '../audio/graph.js';
import { Voices } from '../audio/voices.js';
import { EngineVoice, ChargeVoice } from '../audio/engine.js';
import { WorldBeds } from '../audio/world.js';
import { MusicBed } from '../audio/music.js';
import { clamp, EPS } from '../audio/dsp.js';

/* ── positional helpers ──────────────────────────────────────────────────── */

/** Distance + stereo lateral offset of `pos` relative to the camera. Plain
 *  arithmetic on .x/.y/.z rather than a THREE.Vector3, so this file needs no
 *  dependency on THREE at all. */
function locate(camera, pos) {
  const cp = camera.position;
  const dx = pos.x - cp.x, dy = pos.y - cp.y, dz = pos.z - cp.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
  const q = camera.quaternion;
  // Rotate the local +X (right) axis by the camera quaternion and project the
  // offset onto it — the standard closed form for "image of the X axis".
  const rx = 1 - 2 * (q.y * q.y + q.z * q.z);
  const ry = 2 * (q.x * q.y + q.z * q.w);
  const rz = 2 * (q.x * q.z - q.y * q.w);
  const lateral = dx * rx + dy * ry + dz * rz;
  return { dist, pan: clamp(lateral / 55, -1, 1) };
}

/** A laser on your wing should not cost the same as one 800 m downrange. */
function distGain(dist) {
  const ref = 18;
  if (dist <= ref) return 1;
  const g = Math.pow(ref / dist, 1.15);
  return g < 0.004 ? 0 : g;
}

/** Air absorption — only pay for the filter node once it is doing something. */
function distLP(dist) {
  if (dist < 70) return 20000;
  return clamp(19000 - dist * 13, 900, 19000);
}

/* ═══════════════════════════════════════════════════════════════════════════ */

export function installAudio(ctx) {
  let actx = null;
  let graph = null;
  let budget = null;
  let voices = null;
  let engineVoice = null;
  let chargeVoice = null;
  let worldBeds = null;
  let musicBed = null;

  let unlocked = false;
  let pendingMusic = null;
  let lastThrottle = 0.5, lastBoost = 0;
  let lastLock = 0;

  /** Thin distant one-shots first when the mix is already crowded — cheap
   *  stand-in for "player-relevant > distant" priority without touching the
   *  fixed per-call priorities baked into voices.js. */
  function allowByLoad(dist) {
    if (!budget) return true;
    budget.prune(actx.currentTime);
    const load = budget.live / Math.max(1, budget.max);
    if (dist > 650) return load < 0.5;
    if (dist > 320) return load < 0.85;
    return true;
  }

  /** Pull the score down under a big hit or an open comm channel — the
   *  hand-automated sidechain graph.js's `musicDuck` exists for. */
  function duckMusic(t, floor = 0.55, hold = 0.4) {
    if (!graph) return;
    const g = graph.musicDuck.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(g.value, EPS), t);
    g.linearRampToValueAtTime(floor, t + 0.06);
    g.setValueAtTime(floor, t + 0.06 + hold);
    g.linearRampToValueAtTime(1, t + 0.06 + hold + 0.5);
  }

  const api = {
    get context() { return actx; },
    get enabled() { return !!(actx && actx.state === 'running'); },

    /** Called on first user gesture (and every gesture after — cheap no-op
     *  once already unlocked). Builds the entire graph exactly once. */
    unlock() {
      if (unlocked) {
        if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
        return;
      }
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return; // no WebAudio in this environment — stay silent, never throw
      try {
        actx = new AC();
        graph = buildGraph(actx);
        budget = new Budget(28);
        voices = new Voices(actx, graph, budget);
        engineVoice = new EngineVoice(actx, graph.engine);
        chargeVoice = new ChargeVoice(actx, graph.sfx);
        worldBeds = new WorldBeds(actx, graph.world);
        musicBed = new MusicBed(actx, graph.music);
      } catch {
        actx = null; graph = null; budget = null; voices = null;
        engineVoice = null; chargeVoice = null; worldBeds = null; musicBed = null;
        return;
      }
      unlocked = true;
      if (actx.state === 'suspended') actx.resume().catch(() => {});
      const t = actx.currentTime;
      graph.fade(0.9, t, 0.6);
      engineVoice.start(t);
      engineVoice.set(lastThrottle, lastBoost, t);
      worldBeds.start(t);
      if (pendingMusic) { const m = pendingMusic; pendingMusic = null; api.music(m); }
    },

    /**
     * `opts` may carry `{ pos: THREE.Vector3, size: number, amount: number }`.
     * Everything positional is computed here; voices.js never sees a world
     * position, only gain/pan/lp.
     */
    play(name, opts = {}) {
      if (!unlocked || !actx || actx.state !== 'running') return;
      const t = actx.currentTime;
      const pos = opts.pos;
      let g = 1, pan = 0, lp = 20000, dist = 0;
      if (pos) {
        const loc = locate(ctx.camera, pos);
        dist = loc.dist; pan = loc.pan;
        g = distGain(dist);
        lp = distLP(dist);
        if (g < 0.01) return;             // inaudible — do not build nodes for it
        if (!allowByLoad(dist)) return;    // mix is full; distant sounds yield first
      }

      switch (name) {
        case 'laser':
          voices.laser(t, { pan, lp, gain: g, enemy: false });
          break;
        case 'enemyLaser':
          voices.laser(t, { pan, lp, gain: g, enemy: true });
          break;
        case 'chargedShot':
          voices.chargedShot(t, { pan, lp, gain: g, level: clamp(opts.amount ?? 1, 0.2, 1) });
          break;
        case 'impact':
          voices.impact(t, { pan, lp, gain: g, scale: opts.size ? clamp(opts.size / 4, 0.2, 2.5) : 1 });
          break;
        case 'explosion': {
          const scale = clamp((opts.size ?? 5) / 6, 0.25, 3.2);
          voices.explosion(t, { pan, lp, gain: g, scale });
          if (scale > 1.4) duckMusic(t, 0.6, 0.5);
          break;
        }
        case 'playerHit':
          voices.playerHit(t, { gain: clamp(0.55 + 0.5 * (opts.amount ?? 0.5), 0.3, 1.3) });
          break;
        case 'comm':
          voices.comm(t, {});
          duckMusic(t, 0.6, 0.35);
          break;
        case 'lockOn':
          voices.lockOn(t, {});
          break;
        case 'lockTick':
          voices.lockTick(t, {});
          break;
        case 'chargeStart':
          chargeVoice.ensureStarted(t);
          break;
        case 'bombLaunch':
          voices.bombLaunch(t, { pan, gain: g });
          break;
        case 'respawn':
          voices.powerUp(t, {});
          break;
        case 'bossCharge':
          voices.bossCharge(t, {});
          break;
        case 'bossBeam':
          voices.bossBeam(t, {});
          duckMusic(t, 0.5, 0.6);
          break;
        default:
          break;
      }
    },

    /** Called every rendered frame regardless of lock state; caches the value
     *  so the engine picks up exactly where the flight model is once unlocked. */
    setEngine(throttle, boost) {
      lastThrottle = throttle; lastBoost = boost;
      if (!unlocked || !engineVoice || actx.state !== 'running') return;
      engineVoice.set(throttle, boost, actx.currentTime);
    },

    music(track) {
      if (!unlocked || !musicBed) { pendingMusic = track; return; }
      const t = actx.currentTime;
      if (track === 'boss') {
        musicBed.enter(t);
      } else if (track === 'victory') {
        musicBed.stop(t);
        voices.fanfare(t, { notes: [67, 72, 76, 79, 84], gain: 1.5 });
      }
    },

    /** Called every rendered frame. Drives the continuous voices from ctx. */
    update(dt) {
      void dt;
      if (!unlocked || !actx || actx.state !== 'running') return;
      const t = actx.currentTime;

      const flight = ctx.flight, world = ctx.world;
      if (flight && world && worldBeds) {
        const p = flight.pos;
        const gy = world.groundAt(p.x, p.z);
        const land = world.landAt ? world.landAt(p.x, p.z) : gy;
        worldBeds.set({
          speed: flight.throttleN ?? 0.5,
          boost: flight.boostActive ?? 0,
          clear: p.y - gy,
          water: land < gy - 0.05,
        }, t);
      }

      const state = ctx.state;
      if (state && chargeVoice) {
        const lock = state.lockOn || 0;
        if (lock > 0.003) chargeVoice.set(lock, t);
        else if (lastLock > 0.003) chargeVoice.release(t);
        lastLock = lock;
      }

      if (budget) budget.prune(t);
    },

    dispose() {
      try { engineVoice && engineVoice.dispose(); } catch { /* fine */ }
      try { chargeVoice && chargeVoice.dispose(); } catch { /* fine */ }
      try { worldBeds && worldBeds.dispose(); } catch { /* fine */ }
      try { musicBed && musicBed.dispose(); } catch { /* fine */ }
      try { graph && graph.dispose(); } catch { /* fine */ }
      try { actx && actx.close(); } catch { /* fine */ }
      actx = null; graph = null; budget = null; voices = null;
      engineVoice = null; chargeVoice = null; worldBeds = null; musicBed = null;
      unlocked = false;
    },
  };

  return api;
}
