import { createDeviceLayout } from '../../pickups/layout.js';

// Catapults occupy recovery/ordinary shelves, clear of the deliberately slower
// curved launch envelopes. Aegis precedes the tide instruments and hard turns.
export function createDevices(track) {
  const vectors = [
    ['meridian', 70],
    ['lens-recovery', 1715],
    ['quiet', 4745],
  ];
  const shields = [
    ['lensward', 875, 3],
    ['knot', 3035, -3],
    ['fold', 4290, -3],
    ['return', 4860, 3],
  ];
  // The Stacks pulse starts before the tide warning. Arc uses the settled
  // Lensward recovery and lower Fold shelf, never a curved launch or inversion.
  // Ion waits until the return tide has ended, leaving a full grounded chase
  // through the start before the next offensive gate.
  const combat = [
    ['stacks-repulsor', 'repulsor', 850, -6],
    ['lens-recovery-arc', 'arc', 1800, 6],
    ['fold-arc', 'arc', 4500, -6],
    ['meridian-ion', 'ion', 5200, 6],
  ].map(([id, type, distance, lateral]) => ({
    id,
    type,
    distance,
    lateral,
    width: 5,
    length: 10,
    label: id.replaceAll('-', ' '),
  }));
  const plan = [
    ...vectors.map(([id, distance]) => ({
      id: `${id}-vector`,
      type: 'vector',
      distance,
      lateral: 0,
      width: 14,
      length: 54,
      label: `${id} Vector`,
    })),
    ...shields.map(([id, distance, lateral]) => ({
      id: `${id}-aegis`,
      type: 'aegis',
      distance,
      lateral,
      width: 8,
      length: 8,
      label: `${id} Aegis`,
    })),
    ...combat,
  ];
  return createDeviceLayout(
    track,
    plan.sort((a, b) => a.distance - b.distance),
  );
}
