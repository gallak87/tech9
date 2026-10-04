import { createDeviceLayout } from '../../pickups/layout.js';

// Circuit-owned metres; shared simulation, visuals and rules live in pickups.
const PLAN = [
  {
    id: 'ashgate-vector',
    type: 'vector',
    distance: 70,
    lateral: 0,
    width: 14,
    length: 54,
    label: 'Ashgate vector',
  },
  {
    id: 'teeth-vector',
    type: 'vector',
    distance: 1010,
    lateral: 0,
    width: 14,
    length: 54,
    label: 'Teeth vector',
  },
  {
    id: 'curtain-vector',
    type: 'vector',
    distance: 1870,
    lateral: 0,
    width: 14,
    length: 54,
    label: 'Curtain vector',
  },
  {
    id: 'crown-vector',
    type: 'vector',
    distance: 3610,
    lateral: 0,
    width: 14,
    length: 54,
    label: 'Crown vector',
  },
  {
    id: 'ember-aegis',
    type: 'aegis',
    distance: 250,
    lateral: 3,
    width: 8,
    length: 8,
    label: 'Ember aegis',
  },
  {
    id: 'coil-aegis',
    type: 'aegis',
    distance: 2150,
    lateral: -3,
    width: 8,
    length: 8,
    label: 'Coil aegis',
  },
];

export const createDevices = (track) => createDeviceLayout(track, PLAN);
