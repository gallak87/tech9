import { freestyleLandingGrade } from './arcade.js';
import { createLandingAudioBuffer } from '../audio/landing.js';

export const FREESTYLE_AUDIO_RULES = Object.freeze({
  maxVoices: 2,
  peak: 0.8,
  gains: Object.freeze({ good: 0.42, great: 0.49, perfect: 0.56, trick: 0.18 }),
  durations: Object.freeze({
    good: 0.27,
    great: 0.34,
    perfect: 0.46,
    trick: 0.085,
  }),
});
const TAU = Math.PI * 2;
const profiles = {
  great: { start: 112, end: 49, fall: 0.036, decay: 0.084, latch: 350 },
  perfect: { start: 124, end: 52, fall: 0.036, decay: 0.088, latch: 380 },
};
const trickNotes = { roll: 294, flip: 349, spin: 330, corkscrew: 392 };

// Original, deterministic magnetic-seat synthesis. The immediate rounded latch
// and falling low body share one attack; the tail only decays, with no late
// click, noisy crackle or delayed laser chirp. All buffers are prepared at unlock.
export function createFreestyleAudioBuffer(context, kind, trick = 'roll') {
  if (kind === 'good') return createLandingAudioBuffer(context);
  const duration = FREESTYLE_AUDIO_RULES.durations[kind];
  if (!duration) throw new Error(`Unknown Freestyle sound: ${kind}`);
  const rate = context.sampleRate;
  const length = Math.ceil(rate * duration);
  const buffer = context.createBuffer(1, length, rate);
  const channel = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    let value;
    if (kind === 'trick') {
      const note = trickNotes[trick] ?? trickNotes.roll;
      value =
        (Math.sin(TAU * note * t) + Math.sin(TAU * note * 0.5 * t) * 0.42) *
        Math.exp(-t / 0.018);
    } else {
      const p = profiles[kind];
      const phase =
        TAU *
        (p.end * t + (p.start - p.end) * p.fall * (1 - Math.exp(-t / p.fall)));
      const body = Math.sin(phase) * Math.exp(-t / p.decay) * 0.82;
      const latch =
        (Math.sin(TAU * p.latch * t) * 0.25 +
          Math.sin(TAU * p.latch * 1.61 * t) * 0.085) *
        Math.exp(-t / 0.013);
      const locked =
        kind === 'great'
          ? Math.sin(TAU * 174.61 * t) * Math.exp(-t / 0.064) * 0.1
          : kind === 'perfect'
            ? (Math.sin(TAU * 196 * t) * 0.13 +
                Math.sin(TAU * 246.94 * t) * 0.1 +
                Math.sin(TAU * 293.66 * t) * 0.055) *
              Math.exp(-t / 0.105)
            : 0;
      value = body + latch + locked;
    }
    // Explicit silent endpoints prevent a discontinuity at start or release.
    const fade = Math.min(1, t / 0.002, (length - 1 - i) / (rate * 0.025));
    channel[i] = Math.tanh(value * 1.1) * Math.max(0, fade);
    peak = Math.max(peak, Math.abs(channel[i]));
  }
  const scale = FREESTYLE_AUDIO_RULES.peak / Math.max(peak, 1e-6);
  for (let i = 0; i < length; i++) channel[i] *= scale;
  return buffer;
}

// Uses the race audio owner's environment hook: its common bus supplies volume,
// limiter and mute, and calls stop on pause, results, retry and teardown.
export function createFreestyleAudio(context, destination) {
  const buffers = new Map(
    ['good', 'great', 'perfect'].map((kind) => [
      kind,
      createFreestyleAudioBuffer(context, kind),
    ]),
  );
  for (const kind of Object.keys(trickNotes))
    buffers.set(
      `trick:${kind}`,
      createFreestyleAudioBuffer(context, 'trick', kind),
    );
  const voices = new Set();
  const seen = new Set();
  let disposed = false,
    triggerCount = 0,
    lastGrade = null,
    lastCue = null;
  function stop() {
    for (const voice of [...voices]) voice.stop();
    seen.clear();
  }
  return {
    trigger(event) {
      if (disposed || context.state !== 'running') return false;
      let cue, gain, key, grade;
      const payload = event?.payload ?? {};
      if (event?.type === 'freestyle-bank') {
        grade = freestyleLandingGrade(payload);
        if (grade === 'miss') return false;
        cue = grade;
        gain = FREESTYLE_AUDIO_RULES.gains[grade];
        key = `bank:${payload.id}:${payload.at}`;
      } else if (
        event?.type === 'freestyle-trick' &&
        Object.hasOwn(trickNotes, payload.kind)
      ) {
        cue = `trick:${payload.kind}`;
        gain = FREESTYLE_AUDIO_RULES.gains.trick;
        key = `trick:${payload.id}:${payload.ordinal}`;
      } else return false;
      if (seen.has(key)) return false;
      if (grade) {
        // A landing's one clean attack always wins over any last trick tick.
        for (const voice of [...voices]) if (voice.trick) voice.stop();
      } else if ([...voices].some((voice) => !voice.trick)) return false;
      if (voices.size >= FREESTYLE_AUDIO_RULES.maxVoices) return false;
      const source = context.createBufferSource();
      const envelope = context.createGain();
      source.buffer = buffers.get(cue);
      const time = context.currentTime;
      envelope.gain.setValueAtTime(gain, time);
      source.connect(envelope).connect(destination);
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        source.onended = null;
        source.disconnect();
        envelope.disconnect();
        voices.delete(voice);
      };
      const voice = {
        trick: !grade,
        stop() {
          if (released) return;
          source.stop();
          release();
        },
      };
      source.onended = release;
      voices.add(voice);
      source.start(time);
      source.stop(time + source.buffer.duration);
      seen.add(key);
      if (seen.size > 24) seen.delete(seen.values().next().value);
      triggerCount++;
      lastGrade = grade ?? lastGrade;
      lastCue = cue;
      return true;
    },
    stop,
    getPresentation: () => ({
      type: 'freestyle',
      activeVoices: voices.size,
      triggerCount,
      lastGrade,
      lastCue,
      maxVoices: FREESTYLE_AUDIO_RULES.maxVoices,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      buffers.clear();
    },
  };
}
