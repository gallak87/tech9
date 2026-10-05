export const NACRE_THUNDER_RULES = Object.freeze({
  durationSeconds: 2.8,
  peakBufferAmplitude: 0.82,
  maxGain: 0.32,
  maxVoices: 2,
  dryLowpassHz: 2800,
  submergedLowpassHz: 460,
});
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Original seeded stereo synthesis: a brief broadband crack, followed by a
// low, uneven roll. One cached buffer; no network asset or per-frame source.
export function createNacreThunderBuffer(context) {
  const rate = context.sampleRate;
  const length = Math.ceil(rate * NACRE_THUNDER_RULES.durationSeconds);
  const buffer = context.createBuffer(2, length, rate);
  const channels = [buffer.getChannelData(0), buffer.getChannelData(1)];
  let seed = 930731;
  let low = 0;
  let lowWide = 0;
  const lowResponse = 1 - Math.exp((-2 * Math.PI * 180) / rate);
  const wideResponse = 1 - Math.exp((-2 * Math.PI * 520) / rate);
  let peak = 0;
  for (let index = 0; index < length; index += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    low += (noise - low) * lowResponse;
    lowWide += (noise - lowWide) * wideResponse;
    const time = index / rate;
    const attack = Math.min(1, time / 0.003);
    const crack = (noise - lowWide) * Math.exp(-time / 0.045) * 0.72;
    const rollEnvelope = (1 - Math.exp(-time / 0.045)) * Math.exp(-time / 0.68);
    const roll =
      (low * 2.8 + lowWide * 0.4) *
      rollEnvelope *
      (0.83 + 0.17 * Math.sin(time * 19.3 + 0.7));
    const tail = clamp(
      (NACRE_THUNDER_RULES.durationSeconds - time) / 0.23,
      0,
      1,
    );
    const sample = (crack + roll) * attack * tail;
    channels[0][index] = sample;
    // A quiet, decorrelated delayed component provides breadth without a
    // hard one-sided crack or an unstable stereo phase effect.
    const delayed =
      index > Math.round(rate * 0.009)
        ? channels[0][index - Math.round(rate * 0.009)]
        : sample;
    channels[1][index] = sample * 0.88 + delayed * 0.12;
    peak = Math.max(peak, Math.abs(sample), Math.abs(channels[1][index]));
  }
  const normalization =
    NACRE_THUNDER_RULES.peakBufferAmplitude / Math.max(peak, 1e-6);
  for (const channel of channels)
    for (let index = 0; index < length; index += 1)
      channel[index] *= normalization;
  return buffer;
}

export function createNacreThunder(
  context,
  destination,
  { immersionAtOutput = false } = {},
) {
  let buffer;
  let disposed = false;
  let lastId;
  let triggerCount = 0;
  let lastGain = 0;
  let lastLowpass = 0;
  const voices = new Set();
  const stop = () => {
    for (const voice of [...voices]) voice.stop();
    lastId = undefined;
  };
  return {
    trigger(event) {
      if (
        disposed ||
        context.state !== 'running' ||
        event?.type !== 'nacre-thunder' ||
        typeof event.id !== 'string' ||
        event.id === lastId ||
        voices.size >= NACRE_THUNDER_RULES.maxVoices
      )
        return false;
      if (!buffer) buffer = createNacreThunderBuffer(context);
      const submerged =
        !immersionAtOutput && Number.isFinite(event.submerged)
          ? clamp(event.submerged, 0, 1)
          : 0;
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      lastLowpass =
        NACRE_THUNDER_RULES.dryLowpassHz * (1 - submerged) +
        NACRE_THUNDER_RULES.submergedLowpassHz * submerged;
      filter.frequency.value = lastLowpass;
      filter.Q.value = 0.6;
      const gain = context.createGain();
      lastGain = NACRE_THUNDER_RULES.maxGain * (1 - submerged * 0.48);
      const pan = context.createStereoPanner();
      pan.pan.value = Number.isFinite(event.pan)
        ? clamp(event.pan, -0.25, 0.25)
        : 0;
      source.connect(filter).connect(gain).connect(pan).connect(destination);
      const time = context.currentTime;
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(lastGain, time + 0.004);
      gain.gain.setValueAtTime(lastGain, time + 0.18);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        time + buffer.duration - 0.02,
      );
      gain.gain.linearRampToValueAtTime(0, time + buffer.duration);
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        source.onended = null;
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
        pan.disconnect();
        voices.delete(voice);
      };
      const voice = {
        stop() {
          if (released) return;
          source.stop();
          release();
        },
      };
      source.onended = release;
      voices.add(voice);
      source.start();
      source.stop(time + buffer.duration);
      lastId = event.id;
      triggerCount += 1;
      return true;
    },
    stop,
    getPresentation() {
      return {
        activeVoices: voices.size,
        triggerCount,
        lastId: lastId ?? null,
        lastGain,
        lastLowpass,
        bufferSeconds: buffer?.duration ?? 0,
        maxGain: NACRE_THUNDER_RULES.maxGain,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      buffer = undefined;
    },
  };
}
