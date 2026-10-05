import { createDeviceLayout } from '../../pickups/layout.js';

// Launch strips finish before the physical crest; receiving spans stay clear.
export function createDevices(track) {
  const vectors = [
    ['anchorage', 70],
    ['vista', track.landmarks.vistaStart + 70],
    ['spine-one', track.jumps[1].takeoff - 105],
    ['spine-two', track.jumps[2].takeoff - 60],
    ['amber', track.sections.find((s) => s.id === 'amber').start + 70],
  ].map(([id, distance]) => ({
    id: `${id}-vector`,
    type: 'vector',
    distance,
    lateral: 0,
    width: 14,
    length: 54,
    label: `${id.replaceAll('-', ' ')} Vector`,
  }));
  const shields = [
    ['ribshadow', 540, 3],
    ['marrow', track.landmarks.skullStart - 80, -3],
    ['return', track.sections.find((s) => s.id === 'return').start + 80, 3],
  ].map(([id, distance, lateral]) => ({
    id: `${id}-aegis`,
    type: 'aegis',
    distance,
    lateral,
    width: 8,
    length: 8,
    label: `${id} Aegis`,
  }));
  return createDeviceLayout(track, [...vectors, ...shields]);
}
