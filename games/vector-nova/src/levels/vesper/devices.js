import { createDeviceLayout } from '../../pickups/layout.js';

// Circuit-owned metres; attack gates are optional lanes on settled road.
// Preserve launch help and leave flight/recovery and major roll transitions clear.
const PLAN = [
  {
    id: 'saplight-vector',
    type: 'vector',
    distance: 70,
    lateral: 0,
    width: 14,
    length: 54,
    label: 'Saplight vector',
  },
  // Protection before the hollow chase, on the approach after the sap choice.
  {
    id: 'grove-aegis',
    type: 'aegis',
    distance: 530,
    lateral: -3,
    width: 8,
    length: 8,
    label: 'Grove aegis',
  },
  // Enter the hollow on its brief straight: a wake suits the winding chase better than aimed fire.
  {
    id: 'pillar-ion',
    type: 'ion',
    distance: 630,
    lateral: -6,
    width: 5,
    length: 10,
    label: 'Pillar ion',
  },
  {
    id: 'grove-vector',
    type: 'vector',
    distance: 1100,
    lateral: 0,
    width: 14,
    length: 54,
    label: 'Grove vector',
  },
  {
    id: 'crown-aegis',
    type: 'aegis',
    distance: 1470,
    lateral: 3,
    width: 8,
    length: 8,
    label: 'Crown aegis',
  },
  // The receiving corridor is over 180 m behind; finish the burst before Canopy Plunge.
  {
    id: 'crown-arc',
    type: 'arc',
    distance: 2250,
    lateral: 6,
    width: 5,
    length: 10,
    label: 'Crown exit arc',
  },
  {
    id: 'bloomspan-vector',
    type: 'vector',
    distance: 2520,
    lateral: 0,
    width: 14,
    length: 54,
    label: 'Bloomspan vector',
  },
  {
    id: 'rootfall-aegis',
    type: 'aegis',
    distance: 3500,
    lateral: -3,
    width: 8,
    length: 8,
    label: 'Rootfall aegis',
  },
  // Refresh protection after Rootfall, before the final close-pack exchange.
  {
    id: 'vault-aegis',
    type: 'aegis',
    distance: 4050,
    lateral: -3,
    width: 8,
    length: 8,
    label: 'Vault aegis',
  },
  {
    id: 'vault-vector',
    type: 'vector',
    distance: 4100,
    lateral: 0,
    width: 14,
    length: 54,
    label: 'Vault vector',
  },
  // A nearly level vault release gives a brief close-range pulse before Dawnscar turns.
  {
    id: 'vault-repulsor',
    type: 'repulsor',
    distance: 4420,
    lateral: -6,
    width: 5,
    length: 10,
    label: 'Vault repulsor',
  },
  // The last bend has released: the burst follows the open run across the start line.
  {
    id: 'dawnscar-arc',
    type: 'arc',
    distance: 4680,
    lateral: 6,
    width: 5,
    length: 10,
    label: 'Dawnscar arc',
  },
];

export const createDevices = (track) => createDeviceLayout(track, PLAN);
