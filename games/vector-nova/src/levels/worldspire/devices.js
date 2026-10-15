import { createDeviceLayout } from '../../pickups/layout.js';
export function createDevices(track) {
  const vectors = track.jumps.map((j) => ({
    id: j.id + '-vector',
    type: 'vector',
    distance: j.takeoff - 105,
    lateral: 0,
    width: 26,
    length: 48,
    label: j.label + ' launch induction',
  }));
  const hero = track.jumps.find((j) => j.hero);
  return createDeviceLayout(track, [
    ...vectors,
    {
      id: 'heart-aegis',
      type: 'aegis',
      distance: hero.takeoff - 200,
      lateral: 0,
      width: 12,
      length: 8,
      label: 'Heart crossing shield',
    },
  ]);
}
