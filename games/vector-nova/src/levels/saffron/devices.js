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
    ['vista', track.landmarks.vistaStart - 45, -3],
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
  // Wide, shallow approach/Vista sightlines suit Arc. Ion starts well before
  // the skull descent; the Marrow shield offers counterplay before the spine.
  // Both vertebral catches stay clear: the pack pulse waits for Amber's shelf.
  const combat = [
    ['anchorage-arc', 'arc', 200, -6],
    ['vista-arc', 'arc', 1600, 6],
    ['vista-ion', 'ion', 2000, -6],
    ['amber-repulsor', 'repulsor', 4400, 6],
  ].map(([id, type, distance, lateral]) => ({
    id,
    type,
    distance,
    lateral,
    width: 5,
    length: 10,
    label: id.replaceAll('-', ' '),
  }));
  return createDeviceLayout(
    track,
    [...vectors, ...shields, ...combat].sort((a, b) => a.distance - b.distance),
  );
}
