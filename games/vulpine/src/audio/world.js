// ─────────────────────────────────────────────────────────────────────────────
// World beds — the layer that tells the player how fast they are going and how
// close they are to the ground, without a single HUD element.
//
//   rush      wide pink noise, split into two decorrelated bands hard-panned
//             L/R. Mono noise sits *inside* the head and reads as hiss; two
//             different bandpasses of the same table read as air moving past.
//   lowRush   brown noise under 200 Hz. The weight of the airframe.
//   whistle   a narrow high band that only appears above ~80 % speed. This is
//             the layer that makes boost feel dangerous.
//   water     a broader, brighter bed that fades in when the terrain below is
//             below sea level and the ship is low.
//   deck      sub-100 Hz rumble that swells as ground clearance closes. Players
//             hear this and pull up before they have consciously registered why.
//
// All five are built once and driven with `setTargetAtTime`; nothing spawns.
// ─────────────────────────────────────────────────────────────────────────────

import { gain, filter, panner, noiseSource, to, clamp, EPS } from './dsp.js';

export class WorldBeds {
  constructor(ac, dest) {
    this.ac = ac;
    this.started = false;
    this._last = { rush: -1, rushF: -1, low: -1, whis: -1, water: -1, deck: -1 };

    const out = gain(ac, 0);
    out.connect(dest);
    this.out = out;

    /* ── rush (stereo) ─────────────────────────────────────────────────────*/
    const rushGain = gain(ac, 0);
    rushGain.connect(out);
    const nA = noiseSource(ac, 'pink', 1.0);
    const nB = noiseSource(ac, 'pink', 1.13);   // detuned playback = decorrelated
    const fA = filter(ac, 'bandpass', 1200, 0.55);
    const fB = filter(ac, 'bandpass', 1750, 0.55);
    const pA = panner(ac, -0.75);
    const pB = panner(ac, 0.75);
    nA.connect(fA); fA.connect(pA); pA.connect(rushGain);
    nB.connect(fB); fB.connect(pB); pB.connect(rushGain);

    /* ── low rush ──────────────────────────────────────────────────────────*/
    const lowNoise = noiseSource(ac, 'brown');
    const lowLP = filter(ac, 'lowpass', 190, 0.8);
    const lowGain = gain(ac, 0);
    lowNoise.connect(lowLP); lowLP.connect(lowGain); lowGain.connect(out);

    /* ── whistle ───────────────────────────────────────────────────────────*/
    const whNoise = noiseSource(ac, 'white', 0.93);
    const whBP = filter(ac, 'bandpass', 3400, 5.5);
    const whGain = gain(ac, 0);
    whNoise.connect(whBP); whBP.connect(whGain); whGain.connect(out);

    /* ── water ─────────────────────────────────────────────────────────────*/
    const wNoise = noiseSource(ac, 'pink', 1.07);
    const wBP = filter(ac, 'bandpass', 950, 0.7);
    const wHP = filter(ac, 'highpass', 400, 0.6);
    const wGain = gain(ac, 0);
    wNoise.connect(wHP); wHP.connect(wBP); wBP.connect(wGain); wGain.connect(out);

    /* ── deck proximity ────────────────────────────────────────────────────*/
    const dNoise = noiseSource(ac, 'brown', 0.8);
    const dLP = filter(ac, 'lowpass', 95, 1.1);
    const dGain = gain(ac, 0);
    dNoise.connect(dLP); dLP.connect(dGain); dGain.connect(out);

    this.nodes = { rushGain, fA, fB, lowGain, whGain, whBP, wGain, wBP, dGain };
    this.sources = [nA, nB, lowNoise, whNoise, wNoise, dNoise];
  }

  start(t) {
    if (this.started) return;
    this.started = true;
    for (const s of this.sources) { try { s.start(t); } catch { /* fine */ } }
    this.out.gain.setValueAtTime(EPS, t);
    this.out.gain.linearRampToValueAtTime(1, t + 1.2);
  }

  /**
   * @param {object} s
   *   speed    0..1 normalised airspeed
   *   boost    0..1
   *   clear    ground clearance in metres (Infinity when nothing below)
   *   water    true when the surface below is water
   */
  set(s, t) {
    if (!this.started) return;
    const sp = clamp(s.speed ?? 0.5, 0, 1);
    const bo = clamp(s.boost ?? 0, 0, 1);
    const clear = s.clear ?? 999;
    const near = clamp(1 - clear / 60, 0, 1);
    const L = this._last;
    const n = this.nodes;
    const eq = (a, b, e) => Math.abs(a - b) < e;

    // Speed is felt in the *upper* mids: the rush level curve is deliberately
    // steeper than linear so the last 20 % of the throttle is audible.
    const rush = (0.10 + 0.42 * sp * sp + 0.22 * bo) * (1 + near * 0.35);
    if (!eq(rush, L.rush, 0.004)) { L.rush = rush; to(n.rushGain.gain, rush, t, 0.10); }

    const rushF = 900 + 1400 * sp + 500 * bo;
    if (!eq(rushF, L.rushF, 5)) {
      L.rushF = rushF;
      to(n.fA.frequency, rushF, t, 0.12);
      to(n.fB.frequency, rushF * 1.45, t, 0.12);
    }

    const low = 0.10 + 0.26 * sp + 0.16 * bo;
    if (!eq(low, L.low, 0.004)) { L.low = low; to(n.lowGain.gain, low, t, 0.14); }

    const wh = Math.max(0, sp - 0.55) * (0.30 + 0.55 * bo);
    if (!eq(wh, L.whis, 0.003)) {
      L.whis = wh;
      to(n.whGain.gain, wh, t, 0.12);
      to(n.whBP.frequency, 2800 + 1800 * sp, t, 0.15);
    }

    const water = (s.water ? 1 : 0) * near * (0.20 + 0.34 * sp);
    if (!eq(water, L.water, 0.004)) {
      L.water = water;
      to(n.wGain.gain, water, t, 0.20);
      to(n.wBP.frequency, 700 + 900 * sp, t, 0.2);
    }

    const deck = near * near * (0.16 + 0.24 * sp);
    if (!eq(deck, L.deck, 0.004)) { L.deck = deck; to(n.dGain.gain, deck, t, 0.15); }
  }

  level(v, t, dur = 0.3) {
    const g = this.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(g.value, EPS), t);
    g.linearRampToValueAtTime(Math.max(0, v), t + dur);
  }

  dispose() {
    for (const s of this.sources) { try { s.stop(); } catch { /* fine */ } try { s.disconnect(); } catch { /* fine */ } }
    try { this.out.disconnect(); } catch { /* fine */ }
  }
}
