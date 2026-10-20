import { createDeviceLayout } from '../../pickups/layout.js';

// Circuit-owned metres; attack gates are optional lanes on settled road.
// Preserve launch help and leave flight/recovery and major roll transitions clear.
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
    id: 'mouth-aegis',
    type: 'aegis',
    distance: 630,
    lateral: 3,
    width: 8,
    length: 8,
    label: 'Mouth aegis',
  },
  // Protect the gallery attack lane and the approaching fracture jumps.
  {
    id: 'gallery-aegis',
    type: 'aegis',
    distance: 920,
    lateral: 3,
    width: 8,
    length: 8,
    label: 'Gallery aegis',
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
  // Use the clear starboard lane beside port frost, over 430 m before the first gap.
  {
    id: 'gallery-arc',
    type: 'arc',
    distance: 1140,
    lateral: 6,
    width: 5,
    length: 10,
    label: 'Gallery arc',
  },
  // The second catch is over 220 m behind; the wake ends before the chasm dive.
  {
    id: 'rim-ion',
    type: 'ion',
    distance: 2340,
    lateral: 6,
    width: 5,
    length: 10,
    label: 'Auroral rim ion',
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
    id: 'chasm-aegis',
    type: 'aegis',
    distance: 3460,
    lateral: -3,
    width: 8,
    length: 8,
    label: 'Chasm aegis',
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
  // Wait until the rising exit levels out for a compact pack pulse.
  {
    id: 'return-repulsor',
    type: 'repulsor',
    distance: 4500,
    lateral: -6,
    width: 5,
    length: 10,
    label: 'Thawlight repulsor',
  },
  // The docking bend releases into a clear run across the lap line.
  {
    id: 'berth-arc',
    type: 'arc',
    distance: 4800,
    lateral: 6,
    width: 5,
    length: 10,
    label: 'Berth return arc',
  },
];

export const createDevices = (track) => createDeviceLayout(track, PLAN);
