import { createDeviceLayout } from '../../pickups/layout.js';

// Long visible setup shelves give the two mandatory leaps earned launch speed.
// The nave receives protection rather than an acceleration impulse on its wall.
export function createDevices(track) {
  const section = (id) => track.sections.find((item) => item.id === id);
  return createDeviceLayout(track, [
    ...[
      ['mooring', 65, 42],
      ['falls-approach', track.jumps[0].takeoff - 70, 36],
      ['chapel-approach', track.jumps[1].takeoff - 78, 32],
      ['spire-exit', 2720, 42],
      ['return', 4680, 42],
    ].map(([id, distance, length]) => ({
      id: `${id}-vector`,
      type: 'vector',
      distance,
      length,
      lateral: 0,
      width: 14,
      label: `${id} Vector`,
      signalScale: id === 'chapel-approach' ? 0.23 : 0.6,
    })),
    ...[
      ['sailcourt', 320, -3],
      ['nave', track.landmarks.roseWindow.s - 42, 0],
      ['halo', 2870, 3],
      ['descent', 3750, -3],
    ].map(([id, distance, lateral]) => ({
      id: `${id}-aegis`,
      type: 'aegis',
      distance,
      lateral,
      length: 8,
      width: 8,
      label: `${id} Aegis`,
    })),
    // The sailcourt's broad bank and the later terraces give combat a visible
    // racing line. Leave the falls, nave wall and chapel recovery to driving.
    ...[
      ['sailcourt', 'arc', section('sailcourt').start + 175, -7],
      ['halo', 'repulsor', section('halo').start + 235, 7],
      ['halo-exit', 'ion', section('halo').end - 150, -7],
      ['bronzewake', 'arc', track.landmarks.return.s + 140, 7],
    ].map(([id, type, distance, lateral]) => ({
      id: `${id}-${type}`,
      type,
      distance,
      lateral,
      length: 10,
      width: 5,
      label: `${id} ${type}`,
    })),
  ]).sort((a, b) => a.distance - b.distance);
}
