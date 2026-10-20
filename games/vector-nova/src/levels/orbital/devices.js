import { createDeviceLayout } from '../../pickups/layout.js';

// Circuit-owned metres; attack gates are optional lanes on settled road.
// Preserve launch help and leave flight/recovery and major roll transitions clear.
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
  // The settled rising bank lets the launch pack choose a close-range pulse.
  {
    id: 'rise-repulsor',
    type: 'repulsor',
    distance: 300,
    lateral: -6,
    width: 5,
    length: 10,
    label: 'Departure repulsor',
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
  // After the wall ride, the wake runs through the broad low arc into transfer.
  {
    id: 'periapsis-ion',
    type: 'ion',
    distance: 1240,
    lateral: 6,
    width: 5,
    length: 10,
    label: 'Periapsis ion',
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
  // The sustained climb has a shallow forward bend before the apogee reversal.
  {
    id: 'transfer-arc',
    type: 'arc',
    distance: 2110,
    lateral: -6,
    width: 5,
    length: 10,
    label: 'Transfer arc',
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
  // Refresh protection before the overlook and the unbanked dive.
  {
    id: 'overlook-aegis',
    type: 'aegis',
    distance: 2850,
    lateral: 3,
    width: 8,
    length: 8,
    label: 'Overlook aegis',
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
  // Wait until the dive settles; fire along the low catch before the docking turn.
  {
    id: 'catch-arc',
    type: 'arc',
    distance: 3910,
    lateral: 6,
    width: 5,
    length: 10,
    label: 'Low catch arc',
  },
];

export const createDevices = (track) => createDeviceLayout(track, PLAN);
