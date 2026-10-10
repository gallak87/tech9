import { createDeviceLayout } from '../../pickups/layout.js';
export function createDevices(track) {
  const vectors = track.jumps.map((j) => ({
    id: `${j.id}-vector`,
    type: 'vector',
    distance: j.takeoff - 105,
    lateral: 0,
    width: 24,
    length: 48,
    label: `${j.label} launch induction`,
  }));
  const shields = track.jumps
    .filter((j) => j.hero)
    .map((j) => ({
      id: `${j.id}-aegis`,
      type: 'aegis',
      distance: j.takeoff - 185,
      lateral: 0,
      width: 12,
      length: 8,
      label: `${j.label} Aegis`,
    }));
  return createDeviceLayout(track, [...vectors, ...shields]);
}
