/** Original procedural ambience. Allocation/resume must be called from a user gesture. */
export function createWeatherAudio() {
  let context, source, rain, wind, filter, windFilter;
  let disposed = false;
  return {
    async unlock() {
      if (disposed) return;
      const Audio = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!Audio) return;
      if (!context) {
        context = new Audio();
        const buffer = context.createBuffer(
          1,
          context.sampleRate * 4,
          context.sampleRate,
        );
        const data = buffer.getChannelData(0);
        let last = 0;
        for (let i = 0; i < data.length; i++) {
          last = (last + Math.random() * 0.04 - 0.02) / 1.02;
          data[i] = last * 3.5;
        }
        source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        filter = context.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 700;
        windFilter = context.createBiquadFilter();
        windFilter.type = 'lowpass';
        windFilter.frequency.value = 420;
        rain = context.createGain();
        wind = context.createGain();
        rain.gain.value = wind.gain.value = 0;
        source.connect(filter).connect(rain).connect(context.destination);
        source.connect(windFilter).connect(wind).connect(context.destination);
        source.start();
      }
      await context.resume();
    },
    update(state, exposure = 1, inactive = false) {
      if (!context || disposed) return;
      const silent = state.muted || state.paused || inactive;
      rain.gain.setTargetAtTime(
        silent ? 0 : state.rain * (0.035 + exposure * 0.09),
        context.currentTime,
        0.15,
      );
      wind.gain.setTargetAtTime(
        silent ? 0 : state.wind * state.gust * (0.02 + exposure * 0.045),
        context.currentTime,
        0.3,
      );
      filter.frequency.setTargetAtTime(
        300 + exposure * 1200,
        context.currentTime,
        0.25,
      );
    },
    snapshot: () => ({
      available: !!(globalThis.AudioContext ?? globalThis.webkitAudioContext),
      state: context?.state ?? 'locked',
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      source?.stop();
      source?.disconnect();
      filter?.disconnect();
      windFilter?.disconnect();
      rain?.disconnect();
      wind?.disconnect();
      void context?.close();
    },
  };
}
