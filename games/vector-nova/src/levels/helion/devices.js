import { createDeviceLayout } from '../../pickups/layout.js';

// Cooling shelves feed fast furnace crossings; shields precede braking turns.
export function createDevices(track) {
  const zone = (id) => track.thermalZones.find((entry) => entry.id === id);
  const midpoint = (id) => (zone(id).start + zone(id).end) / 2;
  const vectors = [
    ['dock', 100],
    ['wall-exit', midpoint('cooling-wall-exit')],
    ['return', midpoint('cooling-return')],
  ];
  const shields = [
    ['shield-wall', zone('wall-shade').start - 20, -4],
    ['exchange', midpoint('cooling-umbrae'), 4],
    ['afterglow', zone('afterglow-sweep').end + 45, -4],
  ];
  return createDeviceLayout(track, [
    ...vectors.map(([id, distance]) => ({
      id: `${id}-vector`,
      type: 'vector',
      distance,
      lateral: 0,
      width: 14,
      length: 48,
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
