// ─────────────────────────────────────────────────────────────────────────────
// The mix.
//
//   voices ─┬─ sfx ────┬─ sfxComp ──┐
//           ├─ engine ─┤            │
//           ├─ world ──┤            ├─ master ── limiter ── out
//           ├─ music ──┴─ musicDuck ┤
//           └─ comms ── commsComp ──┘
//                │
//                └─(send)─ reverb ── verbReturn ── master
//
// Why the compressors are where they are:
//
//  · `sfxComp` catches the transient stack. A large explosion is eight layers
//    firing inside 20 ms; without a bus compressor the sum clips the master and
//    everything else in the mix disappears behind it for half a second.
//  · `musicDuck` is not a compressor, it is an automation target. The score is
//    pulled down by explicit ramps when comms open or a big detonation lands —
//    sidechain-by-hand, because it has to be frame-accurate against gameplay
//    events, not level-dependent.
//  · `limiter` is the last line: fast attack, high ratio, and a −1 dBFS ceiling
//    trim after it so nothing ever reaches the DAC hot.
//
// Everything is built against a plain BaseAudioContext, so the identical graph
// can be constructed inside an OfflineAudioContext and measured — which is how
// this system is verified without ears (see `installAudio().selftest`).
// ─────────────────────────────────────────────────────────────────────────────

import { gain, filter, impulse, EPS } from './dsp.js';

export const BUS_TRIM = {
  sfx: 0.85,
  engine: 0.50,
  world: 0.42,
  music: 0.40,
  comms: 0.80,
  verb: 0.30,
};

export function buildGraph(ac, destination = null) {
  const out = destination || ac.destination;

  /* ── master chain ──────────────────────────────────────────────────────── */
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 3;
  limiter.ratio.value = 14;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.14;

  // Post-limiter trim. The limiter's makeup is implicit, so leave headroom.
  const ceiling = gain(ac, 0.9);
  const master = gain(ac, 0.0);          // faded up on unlock — never a hard 1
  master.connect(limiter);
  limiter.connect(ceiling);
  ceiling.connect(out);

  /* ── reverb send ───────────────────────────────────────────────────────── */
  let verbReturn = null;
  let verb = null;
  try {
    verb = ac.createConvolver();
    verb.buffer = impulse(ac, { seconds: 1.9, decay: 3.4, predelay: 0.014, tone: 0.5 });
    verbReturn = gain(ac, BUS_TRIM.verb);
    // Roll the tail off: a bright reverb on a game mix eats the dialogue band.
    const verbTilt = filter(ac, 'lowpass', 4200, 0.7);
    const verbCut = filter(ac, 'highpass', 220, 0.7);
    verb.connect(verbCut);
    verbCut.connect(verbTilt);
    verbTilt.connect(verbReturn);
    verbReturn.connect(master);
  } catch { verb = null; verbReturn = null; }

  /* ── buses ─────────────────────────────────────────────────────────────── */
  const sfxComp = ac.createDynamicsCompressor();
  sfxComp.threshold.value = -18;
  sfxComp.knee.value = 8;
  sfxComp.ratio.value = 5;
  sfxComp.attack.value = 0.004;
  sfxComp.release.value = 0.22;
  sfxComp.connect(master);

  const sfx = gain(ac, BUS_TRIM.sfx);
  sfx.connect(sfxComp);

  const engine = gain(ac, BUS_TRIM.engine);
  engine.connect(master);

  const world = gain(ac, BUS_TRIM.world);
  world.connect(master);

  // Two stages so gameplay ducking (musicDuck) and the player's music level
  // (music) are independent — ducking must never fight a volume setting.
  const musicDuck = gain(ac, 1);
  musicDuck.connect(master);
  const music = gain(ac, BUS_TRIM.music);
  music.connect(musicDuck);

  const commsComp = ac.createDynamicsCompressor();
  commsComp.threshold.value = -22;
  commsComp.knee.value = 4;
  commsComp.ratio.value = 8;
  commsComp.attack.value = 0.003;
  commsComp.release.value = 0.10;
  commsComp.connect(master);
  const comms = gain(ac, BUS_TRIM.comms);
  comms.connect(commsComp);

  /* ── sends ─────────────────────────────────────────────────────────────── */
  const sfxSend = gain(ac, 0.22);
  const worldSend = gain(ac, 0.10);
  if (verb) {
    sfx.connect(sfxSend); sfxSend.connect(verb);
    world.connect(worldSend); worldSend.connect(verb);
  }

  return {
    ac, out,
    master, limiter, ceiling,
    sfx, engine, world, music, musicDuck, comms,
    sfxComp, commsComp,
    verb, verbReturn, sfxSend, worldSend,
    /** Fade the whole mix in/out without a click. */
    fade(v, t, dur = 0.25) {
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(master.gain.value, EPS), t);
      master.gain.linearRampToValueAtTime(v, t + dur);
    },
    dispose() {
      for (const n of [master, limiter, ceiling, sfx, engine, world, music,
        musicDuck, comms, sfxComp, commsComp, verbReturn, sfxSend, worldSend, verb]) {
        try { n && n.disconnect(); } catch { /* already gone */ }
      }
    },
  };
}

/**
 * Voice budget. A one-shot voice is fire-and-forget — we never hold a reference
 * to it, so we cannot steal one back. Instead we track *when each voice ends*
 * and refuse new ones once the ceiling is hit, cheapest-priority first.
 * That bounds both node count and audio-thread cost with no per-voice callback.
 */
export class Budget {
  constructor(max = 28) { this.max = max; this.ends = []; this.rejected = 0; }
  prune(now) {
    const e = this.ends;
    let w = 0;
    for (let i = 0; i < e.length; i++) if (e[i] > now) e[w++] = e[i];
    e.length = w;
  }
  /** @returns true if a voice may start. `priority` 0..1, high survives crowding. */
  take(now, endsAt, priority = 0.5) {
    this.prune(now);
    const room = this.max - this.ends.length;
    if (room <= 0) { this.rejected++; return false; }
    // Reserve the top of the budget for important sounds so a wall of debris
    // impacts can never starve the explosion that caused them.
    if (room < this.max * 0.25 && priority < 0.55) { this.rejected++; return false; }
    this.ends.push(endsAt);
    return true;
  }
  get live() { return this.ends.length; }
}
