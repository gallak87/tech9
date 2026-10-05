import { createDeviceLayout } from '../../pickups/layout.js';

// Circuit-owned metres; shared simulation, visuals and rules live in pickups.
const PLAN = [
  {
    id: 'departure-vector',
    type: 'vector',
    distance: 70,
    lateral: 0,
    width: 14,
    length: 54,
    label: 'Departure vector',
  },
  {
    id: 'transfer-vector',
    type: 'vector',
    distance: 1910,
    lateral: 0,
    width: 14,
    length: 54,
    label: 'Transfer vector',
  },
  {
    id: 'overlook-vector',
    type: 'vector',
    distance: 3090,
    lateral: 0,
    width: 14,
    length: 54,
    label: 'Overlook vector',
  },
  {
    id: 'catch-vector',
    type: 'vector',
    distance: 3840,
    lateral: 0,
    width: 14,
    length: 54,
    label: 'Catch vector',
  },
  {
    id: 'wall-ride-aegis',
    type: 'aegis',
    distance: 470,
    lateral: 3,
    width: 8,
    length: 8,
    label: 'Wall ride aegis',
  },
  {
    id: 'apogee-aegis',
    type: 'aegis',
    distance: 2300,
    lateral: -3,
    width: 8,
    length: 8,
    label: 'Apogee aegis',
  },
];

export const createDevices = (track) => createDeviceLayout(track, PLAN);
