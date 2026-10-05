import { smooth } from './propulsion.js';

// Apply the same listener-relative water response to every owned audio bus.
// Keeping this after the voices also filters sounds already playing at exit.
export function createImmersionMix(context, destination) {
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.5;
  const gain = context.createGain();
  const dryFrequency = Math.min(18000, context.sampleRate * 0.48);
  filter.frequency.value = dryFrequency;
  gain.gain.value = 1;
  filter.connect(gain).connect(destination);
  let state = { submerged: 0, cutoff: dryFrequency, gain: 1 };
  return {
    input: filter,
    update(value) {
      const submerged = Math.max(
        0,
        Math.min(1, Number.isFinite(value) ? value : 0),
      );
      const cutoff = dryFrequency * Math.pow(560 / dryFrequency, submerged);
      const level = 1 - submerged * 0.35;
      const response = submerged > state.submerged ? 0.12 : 0.22;
      smooth(filter.frequency, cutoff, context.currentTime, response);
      smooth(gain.gain, level, context.currentTime, response);
      state = { submerged, cutoff, gain: level };
    },
    getStatus: () => ({ ...state }),
    dispose() {
      filter.disconnect();
      gain.disconnect();
    },
  };
}
