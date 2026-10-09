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
    ['return', 4860, 3],
  ];
  return createDeviceLayout(track, [
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
  ]);
}
