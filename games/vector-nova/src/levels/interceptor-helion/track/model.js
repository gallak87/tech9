import { createHelionTrack } from '../../helion/track/model.js';

// The mission owns its identity; every surface, thermal zone and optional
// vault remains the original Helion geometry and deterministic sampler.
export function createHelionBreachTrack() {
  return {
    ...createHelionTrack(),
    id: 'helion-breach-pursuit-v1',
    name: 'Helion Breach',
  };
}
