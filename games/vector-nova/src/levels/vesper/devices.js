import { createDeviceLayout } from '../../pickups/layout.js';

// Circuit-owned metres; shared simulation, visuals and rules live in pickups.
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
    id: 'bloomspan-vector',
    type: 'vector',
    distance: 2520,
    lateral: 0,
    width: 14,
    length: 54,
    label: 'Bloomspan vector',
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
  {
    id: 'crown-aegis',
    type: 'aegis',
    distance: 1470,
    lateral: 3,
    width: 8,
    length: 8,
    label: 'Crown aegis',
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
];

export const createDevices = (track) => createDeviceLayout(track, PLAN);
