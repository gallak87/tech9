import { createPickupAudio } from '../pickups/audio.js';

// Separate ownership, identical sound set and mix to gameplay.
export function createPickupPreviewAudio({
  createAudio = createPickupAudio,
} = {}) {
  const audio = createAudio();
  return {
    async prepare() {
      if (!(await audio.unlock())) throw new Error('Audio unavailable');
      const missing = audio.getStatus().missingSamples;
      if (missing.length)
        throw new Error(`Samples unavailable: ${missing.join(', ')}`);
      return 0;
    },
    update: (...args) => audio.update(...args),
    setEffects: (effects) => audio.setEffects(effects),
    event: (event) => audio.event(event),
    duration: (event) => audio.duration(event),
    stop: () => audio.silence(),
    dispose: () => {
      void audio.dispose();
    },
  };
}
