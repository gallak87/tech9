// ─────────────────────────────────────────────────────────────────────────────
// One-shot voice library — weapons, impacts, explosions, UI.
//
// Every voice here is layered the way a film mixer layers a gunshot: a
// *transient* that gives the ear an attack to lock onto, a *body* that carries
// the character, and a *sub* that gives it physical weight. Drop any one layer
// and the sound stops reading:
//
//   · transient only  → thin, "clicky", no size
//   · body only       → mushy, arrives late, no punch
//   · sub only        → felt but not heard; disappears on laptop speakers
//
// Size variation is never a volume change. A big explosion is *slower* (longer
// decay), *darker* (lower filter sweep) and *lower* (deeper sub) than a small
// one — that is what the ear reads as mass. Scaling gain alone just sounds like
// the same firecracker held closer.
// ─────────────────────────────────────────────────────────────────────────────

import { rng } from '../core/rng.js';
import {
  osc, gain, filter, shaper, panner, noiseSource, driveCurve, crushCurve,
  hit, sweep, mtof, clamp, EPS,
} from './dsp.js';

const R = {
  laser: rng('audio.laser'),
  boom: rng('audio.boom'),
  impact: rng('audio.impact'),
  misc: rng('audio.misc'),
};

export class Voices {
  /**
   * @param {BaseAudioContext} ac
   * @param {object} g   graph from buildGraph()
   * @param {Budget} budget
   */
  constructor(ac, g, budget) {
    this.ac = ac;
    this.g = g;
    this.budget = budget;
    this.drive = driveCurve(ac, 5);
    this.hardDrive = driveCurve(ac, 14);
    this.count = 0;
  }

  /**
   * Terminal node for a voice: volume · distance damping · stereo placement.
   * The lowpass only exists when it is doing something — air absorption at 20 m
   * is inaudible and a biquad per voice for nothing is a real cost at 30 voices.
   */
  tail(opts = {}, bus = null) {
    const ac = this.ac;
    const out = gain(ac, opts.gain ?? 1);
    let head = out;
    const lp = opts.lp ?? 20000;
    if (lp < 15000) {
      const f = filter(ac, 'lowpass', lp, 0.7);
      f.connect(out);
      head = f;
    }
    const p = opts.pan ?? 0;
    let node = out;
    if (Math.abs(p) > 0.02) {
      const pn = panner(ac, p);
      out.connect(pn);
      node = pn;
    }
    node.connect(bus || this.g.sfx);
    return head;
  }

  /** Budget gate. Returns false when the mix is already full. */
  claim(t, dur, priority = 0.5) {
    if (!this.budget.take(this.ac.currentTime, t + dur, priority)) return false;
    this.count++;
    return true;
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /*  WEAPONS                                                                */
  /* ═══════════════════════════════════════════════════════════════════════ */

  /**
   * The Arwing single laser. A hard downward pitch sweep is the whole trick —
   * the ear reads a falling formant as "projectile leaving", which is why every
   * space shooter since 1977 has used one.
   */
  laser(t, opts = {}) {
    const ac = this.ac;
    const enemy = !!opts.enemy;
    // 0.28 s no longer covers the player's tail (0.20 dec + 0.06)
    if (!this.claim(t, enemy ? 0.28 : 0.32, enemy ? 0.4 : 0.6)) return;

    // "Pew" is the GLIDE, not the register. This voice swept the oscillator 12:1
    // downward (2450 -> 205), and a long descending portamento is the toy-raygun
    // gesture no matter what pitch it starts at — dropping f0 an octave just buys a
    // lower-pitched pew, which is exactly what happened on the first attempt.
    // A weapon is a bright transient plus a short, dark body that barely bends. So
    // the player's glide is now ~2.4:1 and most of the decay is steady body.
    // Enemy fire keeps its wide sweep: it has to stay distinguishable from your own
    // guns by ear as well as by colour, and "incoming" is allowed to sound thinner.
    const v = R.laser.range(0.94, 1.07);
    const f0 = (enemy ? 1500 : 880) * v;
    const f1 = (enemy ? 135 : 370) * v;
    const dec = enemy ? 0.19 : 0.17;
    const out = this.tail({ gain: (opts.gain ?? 1) * (enemy ? 0.5 : 0.62), pan: opts.pan, lp: opts.lp });

    // body — two waves an octave apart give it a "zap" edge the pure square lacks
    const g1 = gain(ac, 0);
    // Lowpass for the player, not bandpass: a bandpass scoops out the fundamental
    // and leaves the buzz, which is half the toy quality.
    const bp = enemy
      ? filter(ac, 'bandpass', 2200, 3.5)
      : filter(ac, 'lowpass', 2000, 1.1);
    sweep(bp.frequency, t, enemy ? f0 * 1.3 : 2600, enemy ? f1 * 2.2 : 1000, dec * 0.8);
    bp.connect(g1); g1.connect(out);

    // square at this register is pure buzz; triangle carries the fundamental and
    // the saw partner below supplies the edge.
    const o1 = osc(ac, enemy ? 'sawtooth' : 'triangle', f0);
    const o2 = osc(ac, 'sawtooth', f0 * 0.503, 9);
    sweep(o1.frequency, t, f0, f1, dec);
    sweep(o2.frequency, t, f0 * 0.503, f1 * 0.503, dec);
    const g2 = gain(ac, 0.45);
    o1.connect(bp); o2.connect(g2); g2.connect(bp);

    hit(g1.gain, t, 0.9, 0.0015, dec);

    // sub — the part you feel rather than hear. Nothing below ~200 Hz existed in
    // this voice at all, which is most of why it read as a toy.
    if (!enemy) {
      const sub = osc(ac, 'sine', 150 * v);
      sweep(sub.frequency, t, 150 * v, 78 * v, dec * 0.7);
      const sg = gain(ac, 0);
      sub.connect(sg); sg.connect(out);
      hit(sg.gain, t, 0.85, 0.003, dec * 0.9);
      sub.start(t); sub.stop(t + dec + 0.06);
    }

    // transient — 6 ms of bright noise. Without it the shot has no "snap".
    const n = noiseSource(ac, 'white');
    const nf = filter(ac, 'highpass', enemy ? 1400 : 1500, 0.9);
    const ng = gain(ac, 0);
    n.connect(nf); nf.connect(ng); ng.connect(out);
    hit(ng.gain, t, enemy ? 0.32 : 0.55, 0.001, enemy ? 0.028 : 0.022);

    // ring — a short inharmonic partial that survives the distance filter and
    // keeps a far-off shot recognisable
    const rz = osc(ac, 'triangle', f0 * 1.87);
    sweep(rz.frequency, t, f0 * 1.87, f1 * 3.1, dec * 0.8);
    const rg = gain(ac, 0);
    rz.connect(rg); rg.connect(out);
    // Much quieter on the player's gun: an inharmonic partial that sings is the
    // difference between a weapon and a ray gun.
    hit(rg.gain, t, enemy ? 0.12 : 0.03, 0.002, dec * 0.7);

    const end = t + dec + 0.06;
    for (const s of [o1, o2, rz, n]) { s.start(t); s.stop(end); }
  }

  /** Charged round: same gesture an octave and a half down, three times as slow. */
  chargedShot(t, opts = {}) {
    const ac = this.ac;
    if (!this.claim(t, 0.9, 0.95)) return;
    const lvl = clamp(opts.level ?? 1, 0.2, 1);
    const out = this.tail({ gain: (opts.gain ?? 1) * 0.75, pan: opts.pan, lp: opts.lp });
    const dec = 0.30 + 0.22 * lvl;

    // Same glide problem as the tap shot: 780 -> 74 Hz is 10:1 of portamento, which
    // is a cartoon descending zap. Tightened to ~2.4:1 with a much less extreme
    // filter sweep, so the weight comes from the sub and the drive instead.
    const lpf = filter(ac, 'lowpass', 2200, 3.5);
    sweep(lpf.frequency, t, 2600, 620, dec * 1.0);
    const bg = gain(ac, 0);
    lpf.connect(bg); bg.connect(out);
    hit(bg.gain, t, 0.85, 0.004, dec);

    const f0 = 520 * (0.85 + 0.3 * lvl);
    const o1 = osc(ac, 'sawtooth', f0);
    const o2 = osc(ac, 'triangle', f0 * 0.5, -7);
    sweep(o1.frequency, t, f0, 215, dec * 0.9);
    sweep(o2.frequency, t, f0 * 0.5, 108, dec * 0.9);
    o1.connect(lpf);
    const g2 = gain(ac, 0.5); o2.connect(g2); g2.connect(lpf);

    // sub — the thing that makes it feel like it cost something to fire
    const sub = osc(ac, 'sine', 120);
    sweep(sub.frequency, t, 120, 52, dec * 1.4);
    const sd = shaper(ac, this.drive);
    const sg = gain(ac, 0);
    sub.connect(sd); sd.connect(sg); sg.connect(out);
    hit(sg.gain, t, 0.55 * lvl, 0.008, dec * 1.6);

    // air being shoved out of the way
    const n = noiseSource(ac, 'pink');
    const nf = filter(ac, 'bandpass', 1800, 1.2);
    sweep(nf.frequency, t, 2600, 420, dec * 1.3);
    const ng = gain(ac, 0);
    n.connect(nf); nf.connect(ng); ng.connect(out);
    hit(ng.gain, t, 0.30, 0.010, dec * 1.5);

    const end = t + dec * 1.8 + 0.1;
    for (const s of [o1, o2, sub, n]) { s.start(t); s.stop(end); }
  }

  /** Bomb away — mechanical launch thunk, no explosion (that comes on contact). */
  bombLaunch(t, opts = {}) {
    const ac = this.ac;
    if (!this.claim(t, 0.5, 0.8)) return;
    const out = this.tail({ gain: (opts.gain ?? 1) * 0.6, pan: opts.pan });

    const n = noiseSource(ac, 'brown');
    const nf = filter(ac, 'lowpass', 900, 3);
    sweep(nf.frequency, t, 1500, 260, 0.25);
    const ng = gain(ac, 0);
    n.connect(nf); nf.connect(ng); ng.connect(out);
    hit(ng.gain, t, 0.7, 0.003, 0.24);

    const o = osc(ac, 'triangle', 320);
    sweep(o.frequency, t, 320, 90, 0.3);
    const og = gain(ac, 0);
    o.connect(og); og.connect(out);
    hit(og.gain, t, 0.35, 0.004, 0.28);

    // pneumatic hiss as it clears the rail
    const h = noiseSource(ac, 'white');
    const hf = filter(ac, 'bandpass', 4200, 1.4);
    const hg = gain(ac, 0);
    h.connect(hf); hf.connect(hg); hg.connect(out);
    hit(hg.gain, t, 0.16, 0.02, 0.30);

    const end = t + 0.42;
    for (const s of [n, o, h]) { s.start(t); s.stop(end); }
  }

  /**
   * Spinal-cannon wind-up. Fired once at the start of the boss's telegraphed
   * charge, so the envelope has to cover the whole ~1.9 s window by itself —
   * a rising siren the player has real time to dodge out from under.
   */
  bossCharge(t, opts = {}) {
    const ac = this.ac;
    if (!this.claim(t, 2.0, 0.75)) return;
    const out = this.tail({ gain: (opts.gain ?? 1) * 0.5 });
    const dur = 1.85;

    const o1 = osc(ac, 'sawtooth', 90);
    const o2 = osc(ac, 'square', 90.6, -8);
    sweep(o1.frequency, t, 90, 640, dur);
    sweep(o2.frequency, t, 90.6, 645, dur);
    const bp = filter(ac, 'bandpass', 400, 6);
    sweep(bp.frequency, t, 300, 2600, dur);
    const g = gain(ac, 0);
    o1.connect(bp); o2.connect(bp); bp.connect(g); g.connect(out);
    g.gain.setValueAtTime(EPS, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + dur * 0.82);
    g.gain.exponentialRampToValueAtTime(0.9, t + dur);
    g.gain.setValueAtTime(0, t + dur + 0.05);

    const end = t + dur + 0.1;
    for (const s of [o1, o2]) { s.start(t); s.stop(end); }
  }

  /** Spinal cannon discharge — the payoff after the charge. Big and gone fast;
   *  the boss reloads for several seconds after this. */
  bossBeam(t, opts = {}) {
    const ac = this.ac;
    if (!this.claim(t, 0.9, 0.95)) return;
    const out = this.tail({ gain: (opts.gain ?? 1) * 0.85 });
    const v = R.boom.range(0.94, 1.06);
    const dec = 0.5;

    const n = noiseSource(ac, 'white');
    const hp = filter(ac, 'highpass', 900, 0.8);
    const ng = gain(ac, 0);
    n.connect(hp); hp.connect(ng); ng.connect(out);
    hit(ng.gain, t, 0.7, 0.002, 0.1);

    const o1 = osc(ac, 'sawtooth', 620 * v);
    const o2 = osc(ac, 'square', 618 * v, -5);
    sweep(o1.frequency, t, 620 * v, 90, dec);
    sweep(o2.frequency, t, 618 * v, 88, dec);
    const bp = filter(ac, 'bandpass', 900, 4);
    sweep(bp.frequency, t, 2000, 300, dec);
    const bg = gain(ac, 0);
    o1.connect(bp); o2.connect(bp); bp.connect(bg); bg.connect(out);
    hit(bg.gain, t, 0.8, 0.006, dec);

    const sub = osc(ac, 'sine', 70);
    sweep(sub.frequency, t, 70, 24, dec * 1.3);
    const sd = shaper(ac, this.hardDrive);
    const sg = gain(ac, 0);
    sub.connect(sd); sd.connect(sg); sg.connect(out);
    hit(sg.gain, t, 0.75, 0.006, dec * 1.3);

    const end = t + dec * 1.5 + 0.1;
    for (const s of [n, o1, o2, sub]) { s.start(t); s.stop(end); }
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /*  DESTRUCTION                                                            */
  /* ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Layered explosion. `scale` 0.4 = a drone popping, 1 = a fighter, 2.5 = a
   * capital-ship section. Scale drives *time and frequency*, not just level.
   */
  explosion(t, opts = {}) {
    const ac = this.ac;
    const s = clamp(opts.scale ?? 1, 0.25, 3.2);
    const rs = Math.sqrt(s);
    if (!this.claim(t, 1.2 + s, 0.85)) return;
    const out = this.tail({
      gain: (opts.gain ?? 1) * (0.42 + 0.20 * rs),
      pan: opts.pan, lp: opts.lp,
    });
    const v = R.boom.range(0.9, 1.12);

    /* 1 — crack. Two frames of bright noise; this is the layer that tells the
       ear something *broke* rather than something faded up. */
    const cn = noiseSource(ac, 'white');
    const chp = filter(ac, 'highpass', 1100 / rs, 0.8);
    const cbp = filter(ac, 'bandpass', 3000 * v / rs, 0.9);
    const cg = gain(ac, 0);
    cn.connect(chp); chp.connect(cbp); cbp.connect(cg); cg.connect(out);
    hit(cg.gain, t, 0.55 / rs, 0.0015, 0.075 + 0.05 * s);

    /* 2 — body. Filtered noise falling from bright to dull: the fireball
       expanding and cooling. The sweep is the sound of the size. */
    const bn = noiseSource(ac, 'white', 0.9);
    const blp = filter(ac, 'lowpass', 2600, 1.6);
    sweep(blp.frequency, t, (2800 * v) / s, 140 / rs, 0.28 + 0.42 * s);
    const bd = shaper(ac, this.drive);
    const bg = gain(ac, 0);
    bn.connect(blp); blp.connect(bd); bd.connect(bg); bg.connect(out);
    hit(bg.gain, t, 0.85, 0.006 + 0.012 * s, 0.42 + 0.85 * s);

    /* 3 — sub. A falling sine through a soft clipper: the clipper generates
       harmonics so the weight survives on speakers that cannot reproduce 35 Hz. */
    const sub = osc(ac, 'sine', 90);
    sweep(sub.frequency, t, (95 * v) / rs, 26 / rs, 0.22 + 0.30 * s);
    const sd = shaper(ac, this.drive);
    const sg = gain(ac, 0);
    sub.connect(sd); sd.connect(sg); sg.connect(out);
    hit(sg.gain, t, 0.60 * Math.min(1.4, rs), 0.004, 0.38 + 0.75 * s);

    /* 4 — tail. Slow-attack low rumble that outlives the fireball. It arrives
       *after* the crack, which is what gives the event a size in the room. */
    const tn = noiseSource(ac, 'brown');
    const tlp = filter(ac, 'lowpass', 320, 0.9);
    sweep(tlp.frequency, t, 420, 110, 0.9 + 1.1 * s);
    const tg = gain(ac, 0);
    tn.connect(tlp); tlp.connect(tg); tg.connect(out);
    tg.gain.setValueAtTime(EPS, t);
    tg.gain.exponentialRampToValueAtTime(0.42 * rs, t + 0.05 + 0.06 * s);
    tg.gain.exponentialRampToValueAtTime(EPS, t + 0.9 + 1.4 * s);
    tg.gain.setValueAtTime(0, t + 0.92 + 1.42 * s);

    const sources = [cn, bn, sub, tn];

    /* 5 — debris crackle. Only on the big ones: a mid-band noise chopped by a
       fast tremolo reads as material raining down without spawning 40 grains. */
    if (s > 0.9) {
      const dn = noiseSource(ac, 'white', 1.3);
      const dbp = filter(ac, 'bandpass', 1900, 2.2);
      const dg = gain(ac, 0);
      const lfo = osc(ac, 'square', 17 + 9 * R.boom.next());
      const lfoG = gain(ac, 0.5);
      lfo.connect(lfoG); lfoG.connect(dg.gain);
      dn.connect(dbp); dbp.connect(dg); dg.connect(out);
      dg.gain.setValueAtTime(EPS, t);
      dg.gain.exponentialRampToValueAtTime(0.16 * rs, t + 0.12);
      dg.gain.exponentialRampToValueAtTime(EPS, t + 0.6 + 0.9 * s);
      sources.push(dn, lfo);
    }

    const end = t + 1.1 + 1.6 * s;
    for (const src of sources) { src.start(t); src.stop(end); }
  }

  /**
   * Bolt striking a hull. Short, metallic, inharmonic — two partials at a
   * non-integer ratio is the entire difference between "metal" and "beep".
   */
  impact(t, opts = {}) {
    const ac = this.ac;
    const s = clamp(opts.scale ?? 1, 0.2, 2.5);
    if (!this.claim(t, 0.35, 0.35)) return;
    const out = this.tail({ gain: (opts.gain ?? 1) * 0.34, pan: opts.pan, lp: opts.lp });
    const v = R.impact.range(0.88, 1.16);

    const n = noiseSource(ac, 'white');
    const bp = filter(ac, 'bandpass', 3200 * v / s, 2.4);
    sweep(bp.frequency, t, 3600 * v / s, 900 / s, 0.09);
    const ng = gain(ac, 0);
    n.connect(bp); bp.connect(ng); ng.connect(out);
    hit(ng.gain, t, 0.75, 0.0012, 0.055 + 0.05 * s);

    const base = 1150 * v / s;
    const p1 = osc(ac, 'triangle', base);
    const p2 = osc(ac, 'sine', base * 1.593);   // inharmonic — struck plate
    const pg = gain(ac, 0);
    p1.connect(pg);
    const p2g = gain(ac, 0.55); p2.connect(p2g); p2g.connect(pg);
    pg.connect(out);
    hit(pg.gain, t, 0.30, 0.002, 0.10 + 0.10 * s);

    const sources = [n, p1, p2];
    if (s > 0.75) {
      const sub = osc(ac, 'sine', 150 / s);
      sweep(sub.frequency, t, 150 / s, 62 / s, 0.10);
      const sg = gain(ac, 0);
      sub.connect(sg); sg.connect(out);
      hit(sg.gain, t, 0.26 * s, 0.003, 0.14);
      sources.push(sub);
    }
    const end = t + 0.3 + 0.15 * s;
    for (const src of sources) { src.start(t); src.stop(end); }
  }

  /** Energy shield taking a round: bright, ringing, pitched *up* — the opposite
   *  gesture to a physical impact, so the player can hear "that did nothing". */
  shieldHit(t, opts = {}) {
    const ac = this.ac;
    if (!this.claim(t, 0.6, 0.6)) return;
    const out = this.tail({ gain: (opts.gain ?? 1) * 0.34, pan: opts.pan, lp: opts.lp });

    const bp = filter(ac, 'bandpass', 900, 9);
    sweep(bp.frequency, t, 760, 3400, 0.22);
    const bg = gain(ac, 0);
    bp.connect(bg); bg.connect(out);
    hit(bg.gain, t, 0.8, 0.003, 0.30);

    const n = noiseSource(ac, 'white');
    n.connect(bp);

    // shimmer: amplitude-modulated tone, the "energy" cue
    const car = osc(ac, 'triangle', 1480);
    sweep(car.frequency, t, 1180, 2360, 0.25);
    const am = gain(ac, 0.5);
    const mod = osc(ac, 'sine', 63);
    const modG = gain(ac, 0.5);
    mod.connect(modG); modG.connect(am.gain);
    car.connect(am);
    const ag = gain(ac, 0);
    am.connect(ag); ag.connect(out);
    hit(ag.gain, t, 0.30, 0.004, 0.34);

    const end = t + 0.5;
    for (const s of [n, car, mod]) { s.start(t); s.stop(end); }
  }

  /** The player took a hit. Deliberately unpleasant: distorted, mid-heavy, and
   *  it steals the top of the mix for 150 ms. */
  playerHit(t, opts = {}) {
    const ac = this.ac;
    if (!this.claim(t, 0.8, 1)) return;
    const out = this.tail({ gain: (opts.gain ?? 1) * 0.8 });

    const n = noiseSource(ac, 'white');
    const bp = filter(ac, 'bandpass', 520, 1.5);
    sweep(bp.frequency, t, 1500, 240, 0.34);
    const d = shaper(ac, this.hardDrive);
    const ng = gain(ac, 0);
    n.connect(bp); bp.connect(d); d.connect(ng); ng.connect(out);
    hit(ng.gain, t, 0.7, 0.002, 0.36);

    const sub = osc(ac, 'sine', 150);
    sweep(sub.frequency, t, 165, 42, 0.3);
    const sg = gain(ac, 0);
    sub.connect(sg); sg.connect(out);
    hit(sg.gain, t, 0.7, 0.004, 0.42);

    // circuit-fault warble, so a hit is distinguishable from an explosion
    const w = osc(ac, 'square', 240);
    const lfo = osc(ac, 'square', 22);
    const lg = gain(ac, 90);
    lfo.connect(lg); lg.connect(w.frequency);
    const wf = filter(ac, 'bandpass', 900, 3);
    const wg = gain(ac, 0);
    w.connect(wf); wf.connect(wg); wg.connect(out);
    hit(wg.gain, t, 0.16, 0.01, 0.30);

    const end = t + 0.6;
    for (const s of [n, sub, w, lfo]) { s.start(t); s.stop(end); }
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /*  ALERTS / UI                                                            */
  /* ═══════════════════════════════════════════════════════════════════════ */

  /** Two-tone cockpit alarm. Square through a narrow band = cheap 90s avionics. */
  alarm(t, opts = {}) {
    const ac = this.ac;
    const urgent = !!opts.urgent;
    if (!this.claim(t, 0.4, 0.9)) return;
    const out = this.tail({ gain: (opts.gain ?? 1) * 0.24 });
    const bp = filter(ac, 'bandpass', 1600, 2.5);
    const g = gain(ac, 0);
    bp.connect(g); g.connect(out);
    const o = osc(ac, 'square', urgent ? 1046 : 880);
    o.connect(bp);
    const seg = urgent ? 0.075 : 0.10;
    o.frequency.setValueAtTime(urgent ? 1046 : 880, t);
    o.frequency.setValueAtTime(urgent ? 784 : 660, t + seg);
    hit(g.gain, t, 0.55, 0.004, seg - 0.012);
    hit(g.gain, t + seg, 0.55, 0.004, seg - 0.012);
    o.start(t); o.stop(t + seg * 2 + 0.05);
  }

  /** Lock-on progress tick. Pitch rises with `p` so the player hears the timer. */
  lockTick(t, opts = {}) {
    const ac = this.ac;
    if (!this.claim(t, 0.1, 0.3)) return;
    const p = clamp(opts.p ?? 0, 0, 1);
    const out = this.tail({ gain: (opts.gain ?? 1) * 0.14 });
    const o = osc(ac, 'square', mtof(76 + Math.round(p * 12)));
    const bp = filter(ac, 'bandpass', 2200, 3);
    const g = gain(ac, 0);
    o.connect(bp); bp.connect(g); g.connect(out);
    hit(g.gain, t, 0.5, 0.002, 0.035);
    o.start(t); o.stop(t + 0.08);
  }

  /** Lock acquired — a confident rising third. */
  lockOn(t, opts = {}) {
    const ac = this.ac;
    if (!this.claim(t, 0.3, 0.8)) return;
    const out = this.tail({ gain: (opts.gain ?? 1) * 0.22 });
    const bp = filter(ac, 'bandpass', 2400, 2);
    const g = gain(ac, 0);
    bp.connect(g); g.connect(out);
    const o = osc(ac, 'square', mtof(84));
    o.connect(bp);
    o.frequency.setValueAtTime(mtof(84), t);
    o.frequency.setValueAtTime(mtof(88), t + 0.055);
    o.frequency.setValueAtTime(mtof(91), t + 0.11);
    hit(g.gain, t, 0.5, 0.003, 0.05);
    hit(g.gain, t + 0.055, 0.5, 0.003, 0.05);
    hit(g.gain, t + 0.11, 0.55, 0.003, 0.14);
    o.start(t); o.stop(t + 0.3);
  }

  /** Generic interface blip. `note` in MIDI. */
  blip(t, opts = {}) {
    const ac = this.ac;
    if (!this.claim(t, 0.12, 0.25)) return;
    const out = this.tail({ gain: (opts.gain ?? 1) * 0.16, pan: opts.pan });
    const o = osc(ac, opts.wave || 'square', mtof(opts.note ?? 80));
    const bp = filter(ac, 'bandpass', 2000, 2);
    const g = gain(ac, 0);
    o.connect(bp); bp.connect(g); g.connect(out);
    hit(g.gain, t, 0.5, 0.002, opts.decay ?? 0.06);
    o.start(t); o.stop(t + (opts.decay ?? 0.06) + 0.04);
  }

  /** Comm channel opening — the bit-crushed staircase curve exists for exactly
   *  this: a two-tone chirp through it reads as a squelchy radio open. */
  comm(t, opts = {}) {
    const ac = this.ac;
    if (!this.claim(t, 0.22, 0.5)) return;
    const out = this.tail({ gain: (opts.gain ?? 1) * 0.20 });
    const v = R.misc.range(0.97, 1.04);
    const crush = shaper(ac, this._crush || (this._crush = crushCurve(ac, 7)));
    const bp = filter(ac, 'bandpass', 1400, 2.2);
    const g = gain(ac, 0);
    const o = osc(ac, 'square', mtof(74) * v);
    o.connect(crush); crush.connect(bp); bp.connect(g); g.connect(out);
    o.frequency.setValueAtTime(mtof(74) * v, t);
    o.frequency.setValueAtTime(mtof(79) * v, t + 0.05);
    hit(g.gain, t, 0.55, 0.004, 0.045);
    hit(g.gain, t + 0.05, 0.5, 0.004, 0.10);
    o.start(t); o.stop(t + 0.22);
  }

  /** Ascending fanfare: checkpoint, pickup, mission tick. */
  fanfare(t, opts = {}) {
    const notes = opts.notes || [72, 76, 79, 84];
    let dt = 0;
    for (const n of notes) {
      this.blip(t + dt, { note: n, decay: 0.10, gain: (opts.gain ?? 1) * 1.5, wave: 'triangle' });
      dt += 0.075;
    }
    this.blip(t + dt, { note: (notes[notes.length - 1] ?? 84) + 0, decay: 0.32, gain: (opts.gain ?? 1) * 1.2, wave: 'square' });
  }

  /** Power-down: everything the ship does, in reverse. Used on death. */
  powerDown(t, opts = {}) {
    const ac = this.ac;
    if (!this.claim(t, 1.6, 1)) return;
    const out = this.tail({ gain: (opts.gain ?? 1) * 0.5 });
    const o1 = osc(ac, 'sawtooth', 320);
    const o2 = osc(ac, 'sawtooth', 161);
    sweep(o1.frequency, t, 320, 28, 1.25);
    sweep(o2.frequency, t, 161, 14, 1.25);
    const lp = filter(ac, 'lowpass', 2000, 4);
    sweep(lp.frequency, t, 2400, 130, 1.3);
    const g = gain(ac, 0);
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(out);
    g.gain.setValueAtTime(EPS, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    g.gain.exponentialRampToValueAtTime(EPS, t + 1.35);
    g.gain.setValueAtTime(0, t + 1.37);
    const n = noiseSource(ac, 'pink');
    const nf = filter(ac, 'lowpass', 1400, 1);
    sweep(nf.frequency, t, 1800, 90, 1.3);
    const ng = gain(ac, 0);
    n.connect(nf); nf.connect(ng); ng.connect(out);
    hit(ng.gain, t, 0.28, 0.03, 1.25);
    for (const s of [o1, o2, n]) { s.start(t); s.stop(t + 1.45); }
  }

  /** Power-up: the mirror of powerDown, used on respawn — systems coming back
   *  online, ending on a confirming chime instead of trailing into noise. */
  powerUp(t, opts = {}) {
    const ac = this.ac;
    if (!this.claim(t, 1.0, 0.9)) return;
    const out = this.tail({ gain: (opts.gain ?? 1) * 0.5 });
    const v = R.misc.range(0.97, 1.03);

    const o1 = osc(ac, 'sawtooth', 28 * v);
    const o2 = osc(ac, 'sawtooth', 14 * v);
    sweep(o1.frequency, t, 28 * v, 300, 0.6);
    sweep(o2.frequency, t, 14 * v, 150, 0.6);
    const lp = filter(ac, 'lowpass', 200, 4);
    sweep(lp.frequency, t, 200, 2600, 0.65);
    const g = gain(ac, 0);
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(out);
    g.gain.setValueAtTime(EPS, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.55);
    g.gain.exponentialRampToValueAtTime(EPS, t + 0.85);
    g.gain.setValueAtTime(0, t + 0.87);

    const chime = osc(ac, 'triangle', mtof(86));
    const cg = gain(ac, 0);
    chime.connect(cg); cg.connect(out);
    hit(cg.gain, t + 0.5, 0.35, 0.004, 0.3);

    for (const s of [o1, o2, chime]) { s.start(t); s.stop(t + 0.95); }
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /*  MOVEMENT                                                               */
  /* ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Air moving past — boost kick, barrel roll, something large going by.
   * `panFrom → panTo` sweeps it across the head, which is what sells a *pass*
   * as opposed to a noise that simply got louder.
   */
  whoosh(t, opts = {}) {
    const ac = this.ac;
    const dur = opts.dur ?? 0.55;
    if (!this.claim(t, dur + 0.2, opts.priority ?? 0.5)) return;
    const strength = clamp(opts.strength ?? 1, 0.1, 2);
    const out = this.tail({ gain: (opts.gain ?? 1) * 0.42 * strength, lp: opts.lp });

    const n = noiseSource(ac, 'pink');
    const bp = filter(ac, 'bandpass', 700, opts.q ?? 1.1);
    const f0 = opts.f0 ?? 380;
    const f1 = opts.f1 ?? 2100;
    const f2 = opts.f2 ?? 260;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.42);
    bp.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = gain(ac, 0);
    n.connect(bp); bp.connect(g);

    const pFrom = opts.panFrom ?? 0;
    const pTo = opts.panTo ?? 0;
    if (Math.abs(pFrom) > 0.02 || Math.abs(pTo) > 0.02) {
      const pn = panner(ac, pFrom);
      if (pn.pan) {
        pn.pan.setValueAtTime(pFrom, t);
        pn.pan.linearRampToValueAtTime(pTo, t + dur);
      }
      g.connect(pn); pn.connect(out);
    } else {
      g.connect(out);
    }

    g.gain.setValueAtTime(EPS, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + dur * 0.38);
    g.gain.exponentialRampToValueAtTime(EPS, t + dur);
    g.gain.setValueAtTime(0, t + dur + 0.01);

    const sources = [n];
    if (opts.thump !== false) {
      const sub = osc(ac, 'sine', 70);
      sweep(sub.frequency, t, 82, 36, dur * 0.7);
      const sg = gain(ac, 0);
      sub.connect(sg); sg.connect(out);
      hit(sg.gain, t, 0.3 * strength, 0.02, dur * 0.8);
      sources.push(sub);
    }
    for (const s of sources) { s.start(t); s.stop(t + dur + 0.08); }
  }

  /** Water contact — bright, short, with a low plop under it. */
  splash(t, opts = {}) {
    const ac = this.ac;
    const s = clamp(opts.scale ?? 1, 0.2, 2);
    if (!this.claim(t, 0.6, 0.3)) return;
    const out = this.tail({ gain: (opts.gain ?? 1) * 0.3 * s, pan: opts.pan });

    const n = noiseSource(ac, 'white');
    const bp = filter(ac, 'bandpass', 2400, 0.8);
    sweep(bp.frequency, t, 3600, 900, 0.35);
    const ng = gain(ac, 0);
    n.connect(bp); bp.connect(ng); ng.connect(out);
    hit(ng.gain, t, 0.6, 0.004, 0.32);

    const o = osc(ac, 'sine', 420);
    sweep(o.frequency, t, 420, 130, 0.14);
    const og = gain(ac, 0);
    o.connect(og); og.connect(out);
    hit(og.gain, t, 0.22, 0.004, 0.16);

    for (const src of [n, o]) { src.start(t); src.stop(t + 0.45); }
  }
}
