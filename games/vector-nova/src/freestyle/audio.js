import { freestyleLandingGrade } from './arcade.js';
import { createSampleBank } from '../audio/sample-bank.js';

export const FREESTYLE_SAMPLES = Object.freeze({
  good: new URL(
    '../../assets/audio/sfx/freestyle-bank-good.wav',
    import.meta.url,
  ).href,
  great: new URL(
    '../../assets/audio/sfx/freestyle-bank-great.wav',
    import.meta.url,
  ).href,
  perfect: new URL(
    '../../assets/audio/sfx/freestyle-bank-perfect.wav',
    import.meta.url,
  ).href,
  miss: new URL(
    '../../assets/audio/sfx/freestyle-bank-miss.wav',
    import.meta.url,
  ).href,
  trick: new URL('../../assets/audio/sfx/freestyle-trick.wav', import.meta.url)
    .href,
});

export const FREESTYLE_AUDIO_RULES = Object.freeze({
  maxVoices: 2,
  pointsPerTick: 25,
  maxTicksPerSecond: 32,
  gains: Object.freeze({
    good: 0.28,
    great: 0.3,
    perfect: 0.32,
    miss: 0.26,
    trick: 0.28,
  }),
});

function cueFor(event) {
  const payload = event?.payload ?? {};
  if (typeof payload.id !== 'string' || !payload.id) return null;
  if (event?.type === 'freestyle-bank') {
    if (
      typeof payload.landed !== 'boolean' ||
      !Number.isFinite(payload.at) ||
      payload.at < 0
    )
      return null;
    const grade = freestyleLandingGrade(payload);
    return {
      sample: grade,
      cue: grade,
      grade,
      key: JSON.stringify(['bank', payload.id, payload.at]),
      gain: FREESTYLE_AUDIO_RULES.gains[grade],
      playbackRate: 1,
    };
  }
  if (
    event?.type !== 'freestyle-score-tick' ||
    !Number.isInteger(payload.ordinal) ||
    payload.ordinal < 1
  )
    return null;
  return {
    sample: 'trick',
    cue: 'score-tick',
    grade: null,
    key: JSON.stringify(['score-tick', payload.id, payload.ordinal]),
    gain: FREESTYLE_AUDIO_RULES.gains.trick,
    playbackRate: 1,
  };
}

// The physical landing is a separate, immediate cue. This owner confirms banks,
// misses and the rising rotation-point tally. Completed tricks add no sound.
// Recorded sources are prepared at unlock, with no synthetic fallback.
export function createFreestyleAudio(
  context,
  destination,
  { fetchAudio } = {},
) {
  const bank = createSampleBank(context, FREESTYLE_SAMPLES, { fetchAudio });
  const voices = new Set(),
    seen = new Set();
  let disposed = false,
    triggerCount = 0,
    lastGrade = null,
    lastCue = null,
    lastPlaybackRate = null,
    lastTickAt = -Infinity,
    tally = null;
  function stopTicks() {
    for (const voice of [...voices]) if (voice.tick) voice.stop();
  }
  function stop() {
    for (const voice of [...voices]) voice.stop();
    seen.clear();
    lastTickAt = -Infinity;
    tally = null;
  }
  function remainingSeconds() {
    return Math.max(
      0,
      ...[...voices].map((voice) => voice.endsAt - context.currentTime),
    );
  }
  return {
    prepare: () => bank.prepare(),
    duration(event) {
      const cue = cueFor(event);
      return cue ? (bank.get(cue.sample)?.duration ?? 0) / cue.playbackRate : 0;
    },
    remainingSeconds,
    update(frame) {
      const freestyle =
          frame.motion?.freestyle ?? frame.motion?.motion?.freestyle,
        flight = freestyle?.flight,
        points = flight?.rotationPoints,
        clock = freestyle?.clock;
      if (
        disposed ||
        context.state !== 'running' ||
        frame.mode !== 'racing' ||
        typeof flight?.id !== 'string' ||
        !flight.id ||
        flight.failed ||
        freestyle.pendingLanding ||
        !Number.isFinite(points) ||
        points < 0 ||
        !Number.isFinite(clock)
      ) {
        stopTicks();
        tally = null;
        return false;
      }
      const ordinal = Math.floor(points / FREESTYLE_AUDIO_RULES.pointsPerTick);
      if (
        !tally ||
        tally.id !== flight.id ||
        points < tally.points ||
        clock < tally.clock
      ) {
        stopTicks();
        tally = { id: flight.id, points, clock, ordinal };
        return false;
      }
      if (clock === tally.clock) return false;
      const growing = points > tally.points;
      tally.points = points;
      tally.clock = clock;
      if (!growing) {
        tally.ordinal = ordinal;
        stopTicks();
        return false;
      }
      if (
        ordinal <= tally.ordinal ||
        context.currentTime - lastTickAt <
          1 / FREESTYLE_AUDIO_RULES.maxTicksPerSecond - 1e-9
      )
        return false;
      // One live tick at most, even after a slow frame. Consume skipped points;
      // release, pause, mute and loading must never leave a catch-up sequence.
      tally.ordinal = ordinal;
      return this.trigger({
        type: 'freestyle-score-tick',
        payload: { id: flight.id, ordinal },
      });
    },
    trigger(event) {
      if (disposed || context.state !== 'running') return false;
      const cue = cueFor(event);
      if (!cue || seen.has(cue.key)) return false;
      seen.add(cue.key);
      if (seen.size > 24) seen.delete(seen.values().next().value);
      if (
        !cue.grade &&
        context.currentTime - lastTickAt <
          1 / FREESTYLE_AUDIO_RULES.maxTicksPerSecond - 1e-9
      )
        return false;
      const buffer = bank.get(cue.sample);
      if (!buffer) return false;
      if (cue.grade) {
        // Confirmed banks and misses win over the last airborne score tick.
        // Common touchdown has its own voice and is not restarted here.
        stopTicks();
      } else if ([...voices].some((voice) => !voice.tick)) return false;
      if (voices.size >= FREESTYLE_AUDIO_RULES.maxVoices) return false;
      const source = context.createBufferSource(),
        envelope = context.createGain(),
        time = context.currentTime,
        endsAt = time + buffer.duration / cue.playbackRate;
      source.buffer = buffer;
      source.playbackRate.value = cue.playbackRate;
      envelope.gain.setValueAtTime(cue.gain, time);
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
        tick: !cue.grade,
        endsAt,
        stop() {
          if (released) return;
          source.stop();
          release();
        },
      };
      source.onended = release;
      voices.add(voice);
      source.start(time);
      source.stop(endsAt);
      if (!cue.grade) lastTickAt = time;
      triggerCount++;
      lastGrade = cue.grade ?? lastGrade;
      lastCue = cue.cue;
      lastPlaybackRate = cue.playbackRate;
      return true;
    },
    stop,
    reset: stop,
    getPresentation: () => ({
      type: 'freestyle',
      loaded: bank.missing().length === 0,
      loadedSamples: bank.loaded(),
      missingSamples: bank.missing(),
      durations: Object.fromEntries(
        Object.keys(FREESTYLE_SAMPLES).map((cue) => [
          cue,
          bank.get(cue)?.duration ?? 0,
        ]),
      ),
      activeVoices: voices.size,
      triggerCount,
      lastGrade,
      lastCue,
      lastPlaybackRate,
      remainingSeconds: remainingSeconds(),
      maxVoices: FREESTYLE_AUDIO_RULES.maxVoices,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      bank.dispose();
    },
  };
}
