import { createDeviceLayout } from '../../pickups/layout.js';

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
    length: 54,
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
    length: 54,
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
    length: 54,
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
    length: 54,
    label: 'Canal vector',
    rationale: 'Recovery alignment beyond the plunge and canal entry bend.',
  },
];

export function createHalcyonDevices(track) {
  if (track?.id !== HALCYON_TRACK_ID) return [];
  return createDeviceLayout(
    track,
    [...PLAN, ...COMBAT_PLAN].sort((a, b) => a.distance - b.distance),
  );
}

// A short-range opening, a pursuit wake, then separated forward bursts.
// Optional side lanes and fresh protection keep the warm-up circuit forgiving.
const COMBAT_PLAN = [
  {
    id: 'aegis-launch',
    type: 'aegis',
    distance: 125,
    lateral: 6,
    width: 5,
    length: 8,
    label: 'Opening protection',
    rationale: 'Driver-left defensive line before the first repulsor.',
  },
  {
    id: 'repulsor-crown',
    type: 'repulsor',
    distance: 195,
    lateral: -6,
    width: 5,
    length: 10,
    label: 'Crown repulsor',
    rationale:
      'Opening pack after launch, with room to recover before the crown.',
  },
  {
    id: 'ion-cascade',
    type: 'ion',
    distance: 640,
    lateral: -6,
    width: 5,
    length: 10,
    label: 'Cascade ion wake',
    rationale:
      'A lasting trail into the descent catches followers several seconds back.',
  },
  {
    id: 'arc-transit',
    type: 'arc',
    distance: 1450,
    lateral: 6,
    width: 5,
    length: 10,
    label: 'Gallery arc burst',
    rationale:
      'Beyond the transit strip, leaving enough distance for the earlier Ion to finish.',
  },
  {
    id: 'aegis-sky-exit',
    type: 'aegis',
    distance: 2820,
    lateral: 6,
    width: 5,
    length: 8,
    label: 'Sky exit protection',
    rationale:
      'Fresh protection after the roll, before the sky-exit boost and second Arc.',
  },
  {
    id: 'arc-sky-sweep',
    type: 'arc',
    distance: 3010,
    lateral: -6,
    width: 5,
    length: 10,
    label: 'Sky sweep arc burst',
    rationale:
      'A second chance to reach a separated rival after the sky-exit catapult.',
  },
];
