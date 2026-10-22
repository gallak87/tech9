import { createDeviceLayout } from '../../pickups/layout.js';
export function createDevices(track) {
  const devices = track.jumps.map((jump) => ({
    id: jump.id + '-vector',
    type: 'vector',
    distance: jump.takeoff - 110,
    lateral: 0,
    width: 26,
    length: 45,
    label: jump.label + ' induction',
  }));
  const placements = [
    ['intake', 'aegis', 120, 14],
    ['intake', 'arc', 280, -14],
    ['screw', 'ion', 60, 12],
    ['press', 'aegis', 30, -18],
    ['dive', 'repulsor', 160, 13],
    ['crossfeed', 'aegis', 30, -17],
    ['auger', 'arc', 40, 12],
    ['gantry', 'aegis', -10, 0],
    ['return', 'repulsor', 170, -14],
    ['dispatch', 'aegis', -45, 14],
    ['rise', 'vector', 180, 0],
    ['counterweight', 'aegis', 60, 18],
    ['counterweight', 'arc', 430, -14],
    ['cooling', 'ion', 60, -18],
    ['crown', 'vector', 180, 0],
    ['crown', 'aegis', 340, 14],
    ['headstock', 'arc', 80, -14],
  ];
  for (const [section, type, offset, lateral] of placements)
    devices.push({
      id: section + '-' + type,
      type,
      distance: track.sections.find((s) => s.id === section).start + offset,
      lateral,
      width: type === 'vector' ? 26 : 7,
      length: type === 'vector' ? 45 : 10,
      label: section + ' ' + type,
    });
  return createDeviceLayout(track, devices).sort(
    (a, b) => a.distance - b.distance,
  );
}
