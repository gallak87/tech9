// ─────────────────────────────────────────────────────────────────────────────
// Music bed — a single continuous drone, gated by gain, entered on
// music('boss') and released on music('victory'). Deliberately small: this is
// a mood-setter, not a soundtrack, and it has to duck out of the way of SFX
// without a second compressor (see graph.js `musicDuck`, driven by hand from
// core/audio.js on big hits and comms).
//
// Nothing is ever created after construction — same reasoning as engine.js and
// world.js: a score that starts and stops oscillators mid-game is a score that
// eventually clicks.
// ─────────────────────────────────────────────────────────────────────────────

import { osc, gain, filter, to } from './dsp.js';

export class MusicBed {
  constructor(ac, dest) {
    this.ac = ac;
    this.started = false;
    this.active = false;

    const out = gain(ac, 0);
    out.connect(dest);
    this.out = out;

    const lp = filter(ac, 'lowpass', 900, 1.1);
    const padGain = gain(ac, 0);
    lp.connect(padGain); padGain.connect(out);

    // A dark detuned pair plus a quiet upper fifth — minor and ominous without
    // committing to a melody the SFX would fight for attention with.
    const o1 = osc(ac, 'sawtooth', 55);
    const o2 = osc(ac, 'sawtooth', 55.4, -6);
    const o3 = osc(ac, 'square', 82.5, 5);
    const o3g = gain(ac, 0.14);
    o1.connect(lp); o2.connect(lp);
    o3.connect(o3g); o3g.connect(lp);

    // slow swell so the drone breathes instead of sitting static
    const trem = osc(ac, 'sine', 0.17);
    const tremG = gain(ac, 0.3);
    trem.connect(tremG); tremG.connect(padGain.gain);

    this.padGain = padGain;
    this.sources = [o1, o2, o3, trem];
  }

  start(t) {
    if (this.started) return;
    this.started = true;
    for (const s of this.sources) { try { s.start(t); } catch { /* fine */ } }
  }

  /** Fade the drone up — called on music('boss'). */
  enter(t) {
    this.start(t);
    this.active = true;
    to(this.out.gain, 1, t, 1.0);
    to(this.padGain.gain, 0.5, t, 1.6);
  }

  /** Fade the drone out — called on music('victory'); the win sting is a
   *  one-shot fanfare played separately through the SFX voices. */
  stop(t) {
    this.active = false;
    to(this.out.gain, 0, t, 1.2);
    to(this.padGain.gain, 0, t, 1.2);
  }

  dispose() {
    for (const s of this.sources) { try { s.stop(); } catch { /* fine */ } try { s.disconnect(); } catch { /* fine */ } }
    try { this.out.disconnect(); } catch { /* fine */ }
  }
}
