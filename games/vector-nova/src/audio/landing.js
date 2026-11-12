import { createSampleBank } from './sample-bank.js';

export const LANDING_SAMPLE_URL = new URL(
  '../../assets/audio/sfx/landing-catch.wav',
  import.meta.url,
).href;

export const LANDING_AUDIO_RULES = Object.freeze({
  gain: 0.5,
  maxVoices: 2,
  rememberedContacts: 128,
});

// Only the common owner's confirmed contact event can play this cue. Its bus
// supplies effects volume, immersion and limiting; a missing sample stays quiet.
export function createLandingAudio(context, destination, { fetchAudio } = {}) {
  const bank = createSampleBank(
    context,
    { 'landing-catch': LANDING_SAMPLE_URL },
    { fetchAudio },
  );
  const voices = new Set();
  const seen = new Set();
  let disposed = false,
    triggerCount = 0;
  function stop() {
    for (const voice of [...voices]) voice.stop();
  }
  return {
    prepare: () => bank.prepare(),
    duration: () => bank.get('landing-catch')?.duration ?? 0,
    remainingSeconds: () =>
      Math.max(
        0,
        ...[...voices].map((voice) => voice.endsAt - context.currentTime),
      ),
    trigger(event) {
      if (
        disposed ||
        context.state !== 'running' ||
        event?.type !== 'landing-catch'
      )
        return false;
      const { id, at, strength = 1 } = event.payload ?? {};
      if (
        typeof id !== 'string' ||
        !id ||
        !Number.isFinite(at) ||
        at < 0 ||
        !Number.isFinite(strength) ||
        strength <= 0
      )
        return false;
      const key = JSON.stringify([id, at]);
      if (seen.has(key)) return false;
      seen.add(key);
      if (seen.size > LANDING_AUDIO_RULES.rememberedContacts)
        seen.delete(seen.values().next().value);
      // Never queue an old landing for later playback when voices clear.
      if (voices.size >= LANDING_AUDIO_RULES.maxVoices) return false;
      const buffer = bank.get('landing-catch');
      if (!buffer) return false;
      const source = context.createBufferSource();
      const envelope = context.createGain();
      source.buffer = buffer;
      source.connect(envelope).connect(destination);
      envelope.gain.setValueAtTime(
        LANDING_AUDIO_RULES.gain * Math.min(1, strength),
        context.currentTime,
      );
      let ended = false;
      const voice = {
        endsAt: context.currentTime + buffer.duration,
        stop() {
          if (ended) return;
          ended = true;
          source.onended = null;
          source.stop();
          source.disconnect();
          envelope.disconnect();
          voices.delete(voice);
        },
      };
      voices.add(voice);
      source.onended = () => {
        if (ended) return;
        ended = true;
        source.onended = null;
        source.disconnect();
        envelope.disconnect();
        voices.delete(voice);
      };
      source.start(context.currentTime);
      source.stop(context.currentTime + buffer.duration);
      triggerCount++;
      return true;
    },
    stop,
    reset() {
      stop();
      seen.clear();
    },
    getPresentation: () => ({
      activeVoices: voices.size,
      triggerCount,
      loaded: Boolean(bank.get('landing-catch')),
      missing: bank.missing(),
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      seen.clear();
      bank.dispose();
    },
  };
}
