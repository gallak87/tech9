import { createCrucibleDevices } from '../crucible/devices.js';

// Propulsion and shielding remain useful, while the mission's issued Lance,
// allied fire and the courier's Ion wake define the combat language.
export const createInterceptorDevices = (track) =>
  createCrucibleDevices(track).filter((device) =>
    ['vector', 'aegis'].includes(device.type),
  );
