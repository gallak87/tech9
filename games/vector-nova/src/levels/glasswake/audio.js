// Original seeded ice/powder synthesis. No network assets, extra audio context,
// render-loop work or unbounded voices; the shared bus owns volume and mute.
export const SHELF_AUDIO_RULES = Object.freeze({
  duration: 3.4,
  peak: 0.86,
  gain: 0.64,
});
export function createGlasswakeShelfBuffer(context) {
  const rate = context.sampleRate;
  const length = Math.ceil(rate * SHELF_AUDIO_RULES.duration);
  const buffer = context.createBuffer(2, length, rate);
  const left = buffer.getChannelData(0),
    right = buffer.getChannelData(1);
  let seed = 176403,
    low = 0,
    wide = 0,
    peak = 0;
  const response = 1 - Math.exp((-2 * Math.PI * 360) / rate);
  const wideResponse = 1 - Math.exp((-2 * Math.PI * 2600) / rate);
  for (let i = 0; i < length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    low += (noise - low) * response;
    wide += (noise - wide) * wideResponse;
    const t = i / rate;
    const crack =
      (noise - low) *
      (Math.exp(-t / 0.05) +
        (t > 0.085 ? 0.6 * Math.exp(-(t - 0.085) / 0.025) : 0) +
        (t > 0.21 ? 0.4 * Math.exp(-(t - 0.21) / 0.032) : 0));
    const body =
      Math.sin(2 * Math.PI * (110 * t - 12 * t * t)) *
      Math.exp(-t / 0.22) *
      0.38;
    const falling = Math.max(0, t - 0.4);
    const rushEnvelope =
      (1 - Math.exp(-falling / 0.14)) * Math.exp(-falling / 1.55);
    const rush =
      (wide * 0.9 + low * 2.5) *
      rushEnvelope *
      (0.8 + 0.2 * Math.sin(t * 11.3));
    const fade = Math.min(
      1,
      t / 0.002,
      (SHELF_AUDIO_RULES.duration - t) / 0.28,
    );
    const sample = (crack + body + rush) * fade;
    left[i] = sample;
    right[i] =
      sample * 0.86 +
      (i > Math.round(rate * 0.013)
        ? left[i - Math.round(rate * 0.013)]
        : sample) *
        0.14;
    peak = Math.max(peak, Math.abs(sample), Math.abs(right[i]));
  }
  for (const channel of [left, right])
    for (let i = 0; i < length; i++)
      channel[i] *= SHELF_AUDIO_RULES.peak / Math.max(peak, 1e-6);
  return buffer;
}
export function createGlasswakeShelfAudio(context, destination) {
  // Prepare on the start gesture, before the fall: no synthesis burst in the racing tick.
  let buffer = createGlasswakeShelfBuffer(context);
  let voice,
    lastId,
    disposed = false,
    triggerCount = 0;
  function stop() {
    voice?.stop();
    lastId = undefined;
  }
  return {
    trigger(event) {
      if (
        disposed ||
        context.state !== 'running' ||
        event?.type !== 'glasswake-shelf' ||
        event.id !== 'opening-sheet' ||
        lastId === event.id ||
        voice
      )
        return false;
      const source = context.createBufferSource(),
        gain = context.createGain(),
        pan = context.createStereoPanner();
      source.buffer = buffer;
      pan.pan.value = -0.12;
      const time = context.currentTime;
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(SHELF_AUDIO_RULES.gain, time + 0.003);
      gain.gain.setValueAtTime(
        SHELF_AUDIO_RULES.gain,
        time + buffer.duration - 0.04,
      );
      gain.gain.linearRampToValueAtTime(0, time + buffer.duration);
      source.connect(gain).connect(pan).connect(destination);
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        source.onended = null;
        source.disconnect();
        gain.disconnect();
        pan.disconnect();
        voice = undefined;
      };
      voice = {
        stop() {
          if (!released) {
            source.stop();
            release();
          }
        },
      };
      source.onended = release;
      source.start();
      source.stop(time + buffer.duration);
      lastId = event.id;
      triggerCount++;
      return true;
    },
    stop,
    getPresentation: () => ({
      type: 'glasswake-shelf',
      activeVoices: voice ? 1 : 0,
      triggerCount,
      lastId: lastId ?? null,
      maxGain: SHELF_AUDIO_RULES.gain,
      bufferSeconds: buffer?.duration ?? 0,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      buffer = undefined;
    },
  };
}
