import { createDeviceLayout } from '../../pickups/layout.js';

// Dry causeways and submerged trench straights use the same race devices.
// Keep the full takeoff, receiving-road and recovery corridors unobstructed.
const PLAN = [
  {
    id: 'tide-vector',
    type: 'vector',
    distance: 70,
    lateral: 0,
    width: 14,
    length: 54,
    label: 'Tide vector',
  },
  {
    id: 'breaker-vector',
    type: 'vector',
    distance: 780,
    lateral: 0,
    width: 14,
    length: 54,
    label: 'Breaker vector',
  },
  {
    id: 'trench-vector',
    type: 'vector',
    distance: 2070,
    lateral: 0,
    width: 14,
    length: 54,
    label: 'Trench vector',
  },
  {
    id: 'abyss-vector',
    type: 'vector',
    distance: 3020,
    lateral: 0,
    width: 14,
    length: 54,
    label: 'Abyss vector',
  },
  {
    id: 'causeway-aegis',
    type: 'aegis',
    distance: 430,
    lateral: 3,
    width: 8,
    length: 8,
    label: 'Causeway aegis',
  },
  {
    id: 'trench-aegis',
    type: 'aegis',
    distance: 2530,
    lateral: -3,
    width: 8,
    length: 8,
    label: 'Trench aegis',
  },
];

export const createDevices = (track) => createDeviceLayout(track, PLAN);
