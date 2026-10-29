import { createHelionTrack } from '../../helion/track/model.js';

// The mission owns its identity; every surface, thermal zone and optional
// vault remains the original Helion geometry and deterministic sampler.
export function createHelionBreachTrack() {
  const track = createHelionTrack();
  return {
    ...track,
    // Course-owned driver intent only: all support, separators and optional
    // flight surfaces remain the original Helion geometry. Enter before the
    // large target's nose reaches either divider, then rejoin after recovery.
    pursuitPath: {
      id: 'helion-supported-vault-detours',
      version: 1,
      intervals: track.jumps.map((jump) => ({
        id: jump.id,
        start: jump.takeoff - 240,
        settled: jump.takeoff - 80,
        release: jump.recovery,
        end: jump.recovery + 180,
        lane: -8,
        min: -track.width / 2,
        max: 0,
      })),
    },
    id: 'helion-breach-pursuit-v1',
    name: 'Helion Breach',
  };
}
