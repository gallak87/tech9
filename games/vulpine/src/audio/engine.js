// ─────────────────────────────────────────────────────────────────────────────
// Ship-attached continuous voices: the Arwing engine, and the charge whine.
//
// The engine is the sound the player hears for the entire game, so it cannot be
// a volume-modulated drone. It is a five-layer model, and throttle moves all of
// them at once — which is what "the engine spooled up" actually sounds like:
//
//   body    two detuned saws + a sub, through a resonant lowpass. Carries pitch.
//   whine   a high partial locked to the 7.5th harmonic, band-passed narrow.
//           This is the turbine, and it is the layer the ear tracks for RPM.
//   air     pink noise through a bandpass that opens with throttle — intake.
//   burner  a separate, *distorted* noise stack that only exists under boost.
//           Not a level bump: different source, different filter, different
//           spectrum, so afterburner is a timbre change you cannot fake with a
//           fader.
//   rumble  brown noise under 110 Hz. Felt, not heard. Glues the rest down.
//
// Nothing is ever created or destroyed while flying — the whole model is ~28
// nodes built once, and per-frame updates are `setTargetAtTime` on a handful of
// params, gated so an unchanged throttle costs literally zero automation events.
// ─────────────────────────────────────────────────────────────────────────────

import {
  osc, gain, filter, shaper, panner, noiseSource, driveCurve, to, clamp, EPS,
} from './dsp.js';

export class EngineVoice {
  constructor(ac, dest) {
    this.ac = ac;
    this.started = false;
    this.throttle = 0.5;
    this.boost = 0;
    this._last = { f0: -1, cut: -1, whine: -1, air: -1, burn: -1, burnCut: -1, rumble: -1, level: -1 };

    const out = gain(ac, 0);
    out.connect(dest);
    this.out = out;

    /* ── body ──────────────────────────────────────────────────────────────*/
    this.f0 = 60;
    const bodyLP = filter(ac, 'lowpass', 400, 3.2);
    const bodyDrive = shaper(ac, driveCurve(ac, 2.5));
    const bodyGain = gain(ac, 0.55);
    bodyLP.connect(bodyDrive); bodyDrive.connect(bodyGain); bodyGain.connect(out);

    const s1 = osc(ac, 'sawtooth', this.f0);
    const s2 = osc(ac, 'sawtooth', this.f0 * 1.0072, 7);
    const sub = osc(ac, 'sine', this.f0 * 0.5);
    const subG = gain(ac, 0.7);
    s1.connect(bodyLP); s2.connect(bodyLP);
    sub.connect(subG); subG.connect(bodyLP);

    /* ── whine ─────────────────────────────────────────────────────────────*/
    const whineOsc = osc(ac, 'sawtooth', this.f0 * 7.5);
    const whineBP = filter(ac, 'bandpass', this.f0 * 7.5, 9);
    const whineGain = gain(ac, 0.02);
    const whinePan = panner(ac, -0.22);
    whineOsc.connect(whineBP); whineBP.connect(whineGain);
    whineGain.connect(whinePan); whinePan.connect(out);

    /* ── air ───────────────────────────────────────────────────────────────*/
    const airNoise = noiseSource(ac, 'pink');
    const airBP = filter(ac, 'bandpass', 900, 1.0);
    const airGain = gain(ac, 0.05);
    const airPan = panner(ac, 0.20);
    airNoise.connect(airBP); airBP.connect(airGain);
    airGain.connect(airPan); airPan.connect(out);

    /* ── afterburner ───────────────────────────────────────────────────────*/
    const burnNoise = noiseSource(ac, 'white', 0.85);
    const burnLP = filter(ac, 'lowpass', 300, 5.5);
    const burnDrive = shaper(ac, driveCurve(ac, 11));
    const burnGain = gain(ac, 0);
    burnNoise.connect(burnLP); burnLP.connect(burnDrive);
    burnDrive.connect(burnGain); burnGain.connect(out);

    const burnSub = osc(ac, 'sine', 40);
    const burnSubSh = shaper(ac, driveCurve(ac, 6));
    const burnSubG = gain(ac, 0);
    burnSub.connect(burnSubSh); burnSubSh.connect(burnSubG); burnSubG.connect(out);

    /* ── rumble ────────────────────────────────────────────────────────────*/
    const rumbleNoise = noiseSource(ac, 'brown');
    const rumbleLP = filter(ac, 'lowpass', 110, 0.9);
    const rumbleGain = gain(ac, 0.10);
    rumbleNoise.connect(rumbleLP); rumbleLP.connect(rumbleGain); rumbleGain.connect(out);

    /* ── life ──────────────────────────────────────────────────────────────
       Two LFOs added into the body gain. A perfectly steady tone reads as a
       test signal within about four seconds; 5 % of wobble at 6.7 Hz plus a
       slow 0.29 Hz drift is the difference between "engine" and "sine wave". */
    const lfoFast = osc(ac, 'sine', 6.7);
    const lfoFastG = gain(ac, 0.045);
    lfoFast.connect(lfoFastG); lfoFastG.connect(bodyGain.gain);
    const lfoSlow = osc(ac, 'sine', 0.29);
    const lfoSlowG = gain(ac, 0.035);
    lfoSlow.connect(lfoSlowG); lfoSlowG.connect(bodyGain.gain);
    // and a touch of pitch drift, so the fundamental is never dead still
    const lfoPitch = osc(ac, 'sine', 0.17);
    const lfoPitchG = gain(ac, 2.5);
    lfoPitch.connect(lfoPitchG); lfoPitchG.connect(s2.detune);

    this.nodes = {
      bodyLP, bodyGain, whineBP, whineGain, airBP, airGain,
      burnLP, burnGain, burnSubG, burnSub, rumbleGain,
    };
    this.sources = [s1, s2, sub, whineOsc, airNoise, burnNoise, burnSub,
      rumbleNoise, lfoFast, lfoSlow, lfoPitch];
    this.oscs = { s1, s2, sub, whineOsc };
  }

  start(t) {
    if (this.started) return;
    this.started = true;
    for (const s of this.sources) { try { s.start(t); } catch { /* already started */ } }
    this.out.gain.setValueAtTime(EPS, t);
    this.out.gain.linearRampToValueAtTime(1, t + 0.9);   // spool up, never snap on
  }

  /**
   * @param {number} throttle 0..1
   * @param {number} boost    0..1
   */
  set(throttle, boost, t) {
    this.throttle = clamp(throttle, 0, 1);
    this.boost = clamp(boost, 0, 1);
    if (!this.started) return;
    const th = this.throttle, bo = this.boost;
    const L = this._last;
    const n = this.nodes;

    // A frame that did not move the sticks must not emit automation events.
    const near = (a, b, e) => Math.abs(a - b) < e;

    const f0 = 44 + 54 * th + 30 * bo;
    if (!near(f0, L.f0, 0.15)) {
      L.f0 = f0;
      const tc = 0.055;
      to(this.oscs.s1.frequency, f0, t, tc);
      to(this.oscs.s2.frequency, f0 * 1.0072, t, tc);
      to(this.oscs.sub.frequency, f0 * 0.5, t, tc);
      to(this.oscs.whineOsc.frequency, f0 * 7.5, t, tc);
      to(n.whineBP.frequency, f0 * 7.5, t, tc);
    }

    const cut = 210 + 1450 * th * th + 1100 * bo;
    if (!near(cut, L.cut, 3)) { L.cut = cut; to(n.bodyLP.frequency, cut, t, 0.07); }

    const whine = 0.012 + 0.115 * th * th + 0.085 * bo;
    if (!near(whine, L.whine, 0.002)) { L.whine = whine; to(n.whineGain.gain, whine, t, 0.09); }

    const airF = 640 + 2500 * th;
    const airG = 0.05 + 0.17 * th + 0.10 * bo;
    if (!near(airG, L.air, 0.002)) {
      L.air = airG;
      to(n.airGain.gain, airG, t, 0.08);
      to(n.airBP.frequency, airF, t, 0.08);
    }

    const burn = bo * bo * 0.55;
    if (!near(burn, L.burn, 0.002)) {
      L.burn = burn;
      to(n.burnGain.gain, burn, t, 0.05);
      to(n.burnSubG.gain, bo * 0.30, t, 0.06);
      to(n.burnSub.frequency, 38 + 14 * bo, t, 0.08);
    }
    const burnCut = 260 + 3200 * bo;
    if (!near(burnCut, L.burnCut, 6)) { L.burnCut = burnCut; to(n.burnLP.frequency, burnCut, t, 0.06); }

    const rum = 0.09 + 0.13 * th + 0.10 * bo;
    if (!near(rum, L.rumble, 0.003)) { L.rumble = rum; to(n.rumbleGain.gain, rum, t, 0.10); }
  }

  /** Master level for the voice (used to duck the engine under comms/death). */
  level(v, t, dur = 0.3) {
    const g = this.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(g.value, EPS), t);
    g.linearRampToValueAtTime(Math.max(v, 0), t + dur);
  }

  stop(t) {
    if (!this.started) return;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(Math.max(this.out.gain.value, EPS), t);
    this.out.gain.linearRampToValueAtTime(0, t + 0.25);
    for (const s of this.sources) { try { s.stop(t + 0.3); } catch { /* not started */ } }
    this.started = false;
  }

  dispose() {
    for (const s of this.sources) { try { s.stop(); } catch { /* fine */ } try { s.disconnect(); } catch { /* fine */ } }
    try { this.out.disconnect(); } catch { /* fine */ }
  }
}

/**
 * The charge whine. One held voice whose pitch, brightness and tremolo rate all
 * climb with the charge level — the rising tremolo is the "about to be ready"
 * cue, and it is why the player can charge without looking at the ship.
 */
export class ChargeVoice {
  constructor(ac, dest) {
    this.ac = ac;
    this.active = false;
    this.level = 0;
    this._lastLevel = -1;

    const out = gain(ac, 0);
    out.connect(dest);
    this.out = out;

    const bp = filter(ac, 'bandpass', 400, 4);
    const g = gain(ac, 0.5);
    bp.connect(g); g.connect(out);

    const o1 = osc(ac, 'sawtooth', 180);
    const o2 = osc(ac, 'square', 270, 6);
    const o2g = gain(ac, 0.35);
    o1.connect(bp); o2.connect(o2g); o2g.connect(bp);

    // shimmer: narrow-band noise riding the tone, so it reads as energy rather
    // than as a synth lead
    const n = noiseSource(ac, 'white');
    const nbp = filter(ac, 'bandpass', 3200, 6);
    const ng = gain(ac, 0.05);
    n.connect(nbp); nbp.connect(ng); ng.connect(out);

    const trem = osc(ac, 'sine', 5);
    const tremG = gain(ac, 0.18);
    trem.connect(tremG); tremG.connect(g.gain);

    this.nodes = { bp, g, o1, o2, nbp, ng, trem };
    this.sources = [o1, o2, n, trem];
    this.started = false;
  }

  ensureStarted(t) {
    if (this.started) return;
    this.started = true;
    for (const s of this.sources) { try { s.start(t); } catch { /* fine */ } }
  }

  set(level, t) {
    this.level = clamp(level, 0, 1);
    const l = this.level;
    if (l > 0.005) this.ensureStarted(t);
    if (!this.started) return;
    if (Math.abs(l - this._lastLevel) < 0.004) return;
    this._lastLevel = l;
    const n = this.nodes;
    const f = 165 * Math.pow(2, l * 2.1);
    to(n.o1.frequency, f, t, 0.05);
    to(n.o2.frequency, f * 1.5, t, 0.05);
    to(n.bp.frequency, f * 2.2 + 260, t, 0.05);
    to(n.nbp.frequency, 1800 + 3400 * l, t, 0.06);
    to(n.ng.gain, 0.02 + 0.09 * l, t, 0.06);
    to(n.trem.frequency, 4 + 22 * l * l, t, 0.08);
    to(this.out.gain, l < 0.01 ? 0 : 0.12 + 0.30 * l, t, l > 0.01 ? 0.05 : 0.03);
  }

  release(t) {
    this._lastLevel = -1;
    this.level = 0;
    const g = this.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(g.value, EPS), t);
    g.linearRampToValueAtTime(0, t + 0.05);
  }

  dispose() {
    for (const s of this.sources) { try { s.stop(); } catch { /* fine */ } try { s.disconnect(); } catch { /* fine */ } }
    try { this.out.disconnect(); } catch { /* fine */ }
  }
}
