// ─────────────────────────────────────────────────────────────────────────────
// DSP kit — the shared primitives every voice in the game is built from.
//
// Two rules govern this whole subsystem:
//
//  1. Nothing here allocates a buffer twice. Noise tables and reverb impulses
//     are generated once per AudioContext and handed out by reference; a 2 s
//     stereo noise table costs ~350 kB and rebuilding it per gunshot would cost
//     more CPU than the rest of the mix combined.
//  2. Every gain that is already sounding is *ramped*, never assigned. A bare
//     `gain.value = x` on a live node is a step discontinuity — a click — and a
//     game that clicks on every laser sounds broken no matter how good the
//     synthesis underneath is. `to()` and the env helpers below are the only
//     sanctioned way to move a parameter.
//
// Every random number comes from a named RNG stream (core/rng.js), so the noise
// tables and the per-shot variation are byte-identical run to run.
// ─────────────────────────────────────────────────────────────────────────────

import { rng } from '../core/rng.js';

/** Smallest gain we ever ramp to. exponentialRamp cannot reach 0; -80 dB is
 *  inaudible and keeps the ramp curve well-conditioned. */
export const EPS = 1e-4;

const perCtx = new WeakMap();
function slot(ac) {
  let s = perCtx.get(ac);
  if (!s) { s = { noise: new Map(), ir: new Map(), curve: new Map() }; perCtx.set(ac, s); }
  return s;
}

/* ── noise tables ──────────────────────────────────────────────────────────
   White is the raw source. Pink (-3 dB/oct) is what wind and air actually
   sound like — white noise on a wind bed reads as tape hiss. Brown
   (-6 dB/oct) carries the low-frequency weight in explosions and rumble.   */

export function noiseBuffer(ac, kind = 'white', seconds = 2.0) {
  const s = slot(ac);
  const key = `${kind}:${seconds}`;
  const hit = s.noise.get(key);
  if (hit) return hit;

  const n = Math.max(1, Math.floor(ac.sampleRate * seconds));
  const buf = ac.createBuffer(2, n, ac.sampleRate);
  const r = rng('audio.noise.' + kind);

  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    if (kind === 'pink') {
      // Paul Kellet's economical pink filter — 6 one-poles, flat to ±0.05 dB.
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < n; i++) {
        const w = r.range(-1, 1);
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    } else if (kind === 'brown') {
      let last = 0;
      for (let i = 0; i < n; i++) {
        last = (last + 0.02 * r.range(-1, 1)) / 1.02;
        d[i] = last * 3.5;
      }
    } else {
      for (let i = 0; i < n; i++) d[i] = r.range(-1, 1);
    }
  }
  // A looping table must not thump at the seam: crossfade the last 30 ms over
  // the head. Without this every noise bed ticks once every `seconds`.
  const xf = Math.min(Math.floor(ac.sampleRate * 0.03), n >> 2);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < xf; i++) {
      const k = i / xf;
      d[i] = d[i] * k + d[n - xf + i] * (1 - k);
    }
  }
  s.noise.set(key, buf);
  return buf;
}

/** Looping noise source. Cheap: one node, reading a shared table. */
export function noiseSource(ac, kind = 'white', rate = 1) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, kind);
  src.loop = true;
  src.playbackRate.value = rate;
  return src;
}

/* ── reverb impulse ─────────────────────────────────────────────────────────
   A synthesised canyon: noise under an exponential decay, tilted dark, with a
   short pre-delay so the direct sound stays in front of the tail.            */

export function impulse(ac, { seconds = 1.9, decay = 3.4, predelay = 0.012, tone = 0.55 } = {}) {
  const s = slot(ac);
  const key = `${seconds}:${decay}:${predelay}:${tone}`;
  const hit = s.ir.get(key);
  if (hit) return hit;

  const n = Math.floor(ac.sampleRate * seconds);
  const pd = Math.floor(ac.sampleRate * predelay);
  const buf = ac.createBuffer(2, n, ac.sampleRate);
  const r = rng('audio.ir');
  // one-pole coefficient for the darkening tilt
  const a = Math.exp(-2 * Math.PI * (400 + 5200 * tone) / ac.sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      if (i < pd) { d[i] = 0; continue; }
      const t = (i - pd) / (n - pd);
      lp = a * lp + (1 - a) * r.range(-1, 1);
      // t^2 build under the exponential keeps the first 30 ms from sounding
      // like a slapback; real spaces take a moment to bloom.
      d[i] = lp * Math.pow(1 - t, decay) * Math.min(1, t * 22);
    }
  }
  s.ir.set(key, buf);
  return buf;
}

/* ── waveshaper curves ─────────────────────────────────────────────────────*/

/** tanh-ish soft clip. `k` 0 = linear, 20 = hard. Used for burner grit and to
 *  put weight on explosion subs (harmonics survive small speakers; 35 Hz does
 *  not). */
export function driveCurve(ac, k = 6, samples = 1024) {
  const s = slot(ac);
  const key = 'drive:' + k;
  const hit = s.curve.get(key);
  if (hit) return hit;
  const c = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    c[i] = Math.tanh(x * (1 + k)) / Math.tanh(1 + k);
  }
  s.curve.set(key, c);
  return c;
}

/** Bit-crushed staircase — the band-limited radio artefact for comms. */
export function crushCurve(ac, steps = 9) {
  const s = slot(ac);
  const key = 'crush:' + steps;
  const hit = s.curve.get(key);
  if (hit) return hit;
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.round(x * steps) / steps;
  }
  s.curve.set(key, c);
  return c;
}

/* ── parameter motion ──────────────────────────────────────────────────────*/

/** Smooth exponential approach. The only way a *continuously driven*
 *  parameter (engine pitch, wind gain, mix ducking) should ever move. */
export function to(param, value, t, tc = 0.05) {
  param.setTargetAtTime(value, t, Math.max(1e-4, tc));
}

/** Linear ramp from wherever we are now. Safe on a live node. */
export function ramp(param, value, t, dur = 0.03) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(param.value, t);
  param.linearRampToValueAtTime(value, t + dur);
}

/**
 * Percussive envelope: silence → peak → silence, exponential both ways.
 * Exponential decay is what every real impulsive sound does; a linear decay
 * reads as a synthetic fade.
 */
export function hit(param, t0, peak, attack = 0.003, decay = 0.25, floor = EPS) {
  const p = Math.max(peak, floor * 4);
  param.setValueAtTime(floor, t0);
  param.exponentialRampToValueAtTime(p, t0 + attack);
  param.exponentialRampToValueAtTime(floor, t0 + attack + decay);
  param.setValueAtTime(0, t0 + attack + decay + 0.002);
  return t0 + attack + decay + 0.01;
}

/** Exponential glide on a frequency param — never let it hit 0. */
export function sweep(param, t0, from, to_, dur, curve = 'exp') {
  const a = Math.max(1, from), b = Math.max(1, to_);
  param.setValueAtTime(a, t0);
  if (curve === 'lin') param.linearRampToValueAtTime(b, t0 + dur);
  else param.exponentialRampToValueAtTime(b, t0 + dur);
}

/* ── node sugar ────────────────────────────────────────────────────────────*/

export function osc(ac, type, hz, detune = 0) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.value = Math.max(0.0001, hz);
  if (detune) o.detune.value = detune;
  return o;
}

export function gain(ac, v = 0) {
  const g = ac.createGain();
  g.gain.value = v;
  return g;
}

export function filter(ac, type, hz, q = 1) {
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = Math.max(10, Math.min(hz, ac.sampleRate * 0.45));
  f.Q.value = q;
  return f;
}

export function shaper(ac, curve) {
  const w = ac.createWaveShaper();
  w.curve = curve;
  w.oversample = '2x';
  return w;
}

export function panner(ac, p = 0) {
  // StereoPanner is an equal-power pan law in one node. A PannerNode with HRTF
  // would cost ~30× more for a game that only needs left/right placement.
  if (ac.createStereoPanner) {
    const n = ac.createStereoPanner();
    n.pan.value = Math.max(-1, Math.min(1, p));
    return n;
  }
  return gain(ac, 1);
}

/** Chain a list of nodes head→tail and return [head, tail]. */
export function chain(...nodes) {
  const ns = nodes.filter(Boolean);
  for (let i = 0; i < ns.length - 1; i++) ns[i].connect(ns[i + 1]);
  return [ns[0], ns[ns.length - 1]];
}

/* ── musical helpers ───────────────────────────────────────────────────────*/

/** MIDI note → Hz. 69 = A4 = 440. */
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
/** Frame-rate independent exponential approach for JS-side smoothing. */
export const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
