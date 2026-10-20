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
    ['coronal', zone('prominence-sweep').start - 40, 4],
    ['afterglow', zone('afterglow-sweep').end + 45, -4],
  ];
  // Keep both vaults and the changing wall-ride bank free of attack gates.
  // Ion starts after the Prominence sweep on the long Coronal chase, with
  // shields before it and at Afterglow. The following Arc waits out that wake.
  const combat = [
    ['dock-arc', 'arc', 180, -6],
    ['exchange-repulsor', 'repulsor', 2280, 6],
    ['coronal-ion', 'ion', 3550, -6],
    ['afterglow-arc', 'arc', 4400, 6],
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
    ...combat,
  ];
  return createDeviceLayout(
    track,
    plan.sort((a, b) => a.distance - b.distance),
  );
}
