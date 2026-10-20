import { createDeviceLayout } from '../../pickups/layout.js';

// Circuit-owned metres; attack gates are optional lanes on settled road.
// Preserve launch help and leave flight/recovery and major roll transitions clear.
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
    id: 'causeway-aegis',
    type: 'aegis',
    distance: 430,
    lateral: 3,
    width: 8,
    length: 8,
    label: 'Causeway aegis',
  },
  // A shallow dry bend leaves more than 430 m to finish firing before Storm Leap.
  {
    id: 'breaker-arc',
    type: 'arc',
    distance: 620,
    lateral: -6,
    width: 5,
    length: 10,
    label: 'Breaker arc',
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
  // Well beyond the breach, a broad submerged bank gives the pack a pulse choice.
  {
    id: 'trench-repulsor',
    type: 'repulsor',
    distance: 2330,
    lateral: 6,
    width: 5,
    length: 10,
    label: 'Trench repulsor',
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
  // The trench opens into a gentle bend, 445 m before the Abyss takeoff.
  {
    id: 'trench-arc',
    type: 'arc',
    distance: 2840,
    lateral: -6,
    width: 5,
    length: 10,
    label: 'Trench arc',
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
  // A defensive choice after the ascent, ahead of the return wake.
  {
    id: 'return-aegis',
    type: 'aegis',
    distance: 4480,
    lateral: 3,
    width: 8,
    length: 8,
    label: 'Crown return aegis',
  },
  // The level return carries a wake across the lap seam, clear of both flight corridors.
  {
    id: 'return-ion',
    type: 'ion',
    distance: 4580,
    lateral: -6,
    width: 5,
    length: 10,
    label: 'Crown return ion',
  },
];

export const createDevices = (track) => createDeviceLayout(track, PLAN);
