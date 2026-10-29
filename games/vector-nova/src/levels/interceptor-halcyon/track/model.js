import { createTrack } from '../../halcyon/track/model.js';

export function createHalcyonLockdownTrack() {
  return {
    ...createTrack(),
    id: 'halcyon-lockdown-pursuit-v1',
    name: 'Halcyon Lockdown',
  };
}
