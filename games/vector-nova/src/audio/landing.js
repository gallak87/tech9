export const LANDING_AUDIO_RULES = Object.freeze({
  duration: 0.27,
  peak: 0.8,
  gain: 0.42,
  maxVoices: 2,
  rememberedContacts: 128,
});

// The approved rounded magnetic latch and falling body, without grade or score.
// Both endpoints are silent; the tail only decays, with no delayed click.
export function createLandingAudioBuffer(context) {
  const rate = context.sampleRate;
  const length = Math.ceil(rate * LANDING_AUDIO_RULES.duration);
  const buffer = context.createBuffer(1, length, rate);
  const channel = buffer.getChannelData(0);
  const tau = Math.PI * 2;
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    const phase =
      tau * (43 * t + (88 - 43) * 0.043 * (1 - Math.exp(-t / 0.043)));
    const body = Math.sin(phase) * Math.exp(-t / 0.07) * 0.82;
    const latch =
      (Math.sin(tau * 310 * t) * 0.25 +
        Math.sin(tau * 310 * 1.61 * t) * 0.085) *
      Math.exp(-t / 0.013);
    const fade = Math.min(1, t / 0.002, (length - 1 - i) / (rate * 0.025));
    channel[i] = Math.tanh((body + latch) * 1.1) * Math.max(0, fade);
    peak = Math.max(peak, Math.abs(channel[i]));
  }
  const scale = LANDING_AUDIO_RULES.peak / Math.max(peak, 1e-6);
  for (let i = 0; i < length; i++) channel[i] *= scale;
  return buffer;
}

// Only the common owner's confirmed contact event can play this cue. Its bus
// supplies effects volume, immersion and limiting; this owner never resumes it.
export function createLandingAudio(context, destination) {
  const buffer = createLandingAudioBuffer(context);
  const voices = new Set();
  const seen = new Set();
  let disposed = false,
    triggerCount = 0;
  function stop() {
    for (const voice of [...voices]) voice.stop();
  }
  return {
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
    getPresentation: () => ({ activeVoices: voices.size, triggerCount }),
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      seen.clear();
    },
  };
}
