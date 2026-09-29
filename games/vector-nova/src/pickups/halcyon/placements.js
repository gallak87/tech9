export const HALCYON_TRACK_ID = 'halcyon-viaduct-4-compact';

// Authored metres on the existing 5 km route. Lateral follows track.sample's
// geometric right axis, which appears on the driver's left. No route mutation.
const PLAN = [
  {
    id: 'vector-launch',
    type: 'vector',
    distance: 70,
    lateral: 0,
    width: 14,
    length: 18,
    label: 'Launch vector',
    rationale: 'Wide early introduction while launch speed is still building.',
  },
  {
    id: 'aegis-crown',
    type: 'aegis',
    distance: 360,
    lateral: 3,
    width: 8,
    length: 8,
    label: 'Crown aegis',
    rationale: 'A selectable line before the banked crown and early descent.',
  },
  {
    id: 'vector-transit',
    type: 'vector',
    distance: 1240,
    lateral: -2,
    width: 10,
    length: 18,
    label: 'Transit vector',
    rationale: 'Gentle ascending transit alignment after the early descent.',
  },
  {
    id: 'aegis-corkscrew',
    type: 'aegis',
    distance: 1710,
    lateral: -3,
    width: 8,
    length: 8,
    label: 'Corkscrew aegis',
    rationale: 'Approach choice before the roll and its inverted bend.',
  },
  {
    id: 'vector-sky-exit',
    type: 'vector',
    distance: 2960,
    lateral: 2,
    width: 10,
    length: 18,
    label: 'Sky exit vector',
    rationale:
      'Readable low-curvature exit after the roll has returned upright.',
  },
  {
    id: 'vector-canal',
    type: 'vector',
    distance: 4500,
    lateral: -2,
    width: 10,
    length: 18,
    label: 'Canal vector',
    rationale: 'Recovery alignment beyond the plunge and canal entry bend.',
  },
];

export function createHalcyonDevices(track) {
  if (track?.id !== HALCYON_TRACK_ID) return [];
  return PLAN.map((device) => ({ ...device }));
}
