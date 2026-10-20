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
  // The first burst resolves on the broad descent before the Ember surge.
  {
    id: 'ember-arc',
    type: 'arc',
    distance: 180,
    lateral: -6,
    width: 5,
    length: 10,
    label: 'Ember Arc',
  },
  // Shield the long Curtain chase; neither gate sits in the permanent spill.
  {
    id: 'curtain-aegis',
    type: 'aegis',
    distance: 1170,
    lateral: 3,
    width: 8,
    length: 8,
    label: 'Curtain Aegis',
  },
  {
    id: 'curtain-ion',
    type: 'ion',
    distance: 1280,
    lateral: 6,
    width: 5,
    length: 10,
    label: 'Curtain Ion',
  },
  // The roll, launch and entire catch remain clear. Resume combat on the
  // settled Crown climb, then a short pack pulse after the Return surge.
  {
    id: 'crown-arc',
    type: 'arc',
    distance: 3550,
    lateral: -6,
    width: 5,
    length: 10,
    label: 'Crown Arc',
  },
  {
    id: 'return-repulsor',
    type: 'repulsor',
    distance: 4050,
    lateral: 6,
    width: 5,
    length: 10,
    label: 'Return Repulsor',
  },
];

export const createDevices = (track) =>
  createDeviceLayout(
    track,
    [...PLAN].sort((a, b) => a.distance - b.distance),
  );
