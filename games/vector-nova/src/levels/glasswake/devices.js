import { createDeviceLayout } from '../../pickups/layout.js';

// Circuit-owned metres; shared simulation, visuals and rules live in pickups.
const PLAN = [
  {
    id: 'berth-vector',
    type: 'vector',
    distance: 70,
    lateral: 0,
    width: 14,
    length: 54,
    label: 'Berth vector',
  },
  {
    id: 'gallery-vector',
    type: 'vector',
    distance: 1090,
    lateral: 0,
    width: 14,
    length: 54,
    label: 'Gallery vector',
  },
  {
    id: 'rim-vector',
    type: 'vector',
    distance: 2710,
    lateral: 0,
    width: 14,
    length: 54,
    label: 'Rim vector',
  },
  {
    id: 'return-vector',
    type: 'vector',
    distance: 4430,
    lateral: 0,
    width: 14,
    length: 54,
    label: 'Return vector',
  },
  {
    id: 'mouth-aegis',
    type: 'aegis',
    distance: 630,
    lateral: 3,
    width: 8,
    length: 8,
    label: 'Mouth aegis',
  },
  {
    id: 'chasm-aegis',
    type: 'aegis',
    distance: 3460,
    lateral: -3,
    width: 8,
    length: 8,
    label: 'Chasm aegis',
  },
];

export const createDevices = (track) => createDeviceLayout(track, PLAN);
