import { createDeviceRuntime } from '../../pickups/runtime.js';
import { createHalcyonDevices, HALCYON_TRACK_ID } from './devices.js';

export const HALCYON_RULES_ID =
  'halcyon-strips-v3-entry65-600kph-1800-aegis6-combat-layout1';
export const HALCYON_DEVICE_IDENTITY = Object.freeze({
  id: 'halcyon-pickups',
  version: 5,
  rulesId: HALCYON_RULES_ID,
});
export const HALCYON_DEVICE_SCENARIOS = {
  'aegis-impact': {
    label: 'AEGIS · collect, then steer left into rail',
    state: { distance: 340, lateral: 3, speed: 0, heading: 0 },
  },
};
export function createHalcyonSimulationRuntime({ track, presentation = null }) {
  if (track.id !== HALCYON_TRACK_ID)
    throw new Error('Halcyon devices require the exact Halcyon track');
  return createDeviceRuntime({
    track,
    devices: createHalcyonDevices(track),
    identity: HALCYON_DEVICE_IDENTITY,
    presentation,
    scenarios: HALCYON_DEVICE_SCENARIOS,
  });
}
