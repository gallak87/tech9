import { createDeviceLayout } from '../../pickups/layout.js';
export function createDevices(track) {
  const section = (id) => track.sections.find((item) => item.id === id);
  const jump = (id) => track.jumps.find((item) => item.id === id);
  const vectors = track.jumps.map((j) => ({
    id: j.id + '-vector',
    type: 'vector',
    distance: j.takeoff - 105,
    lateral: 0,
    width: 26,
    length: 48,
    label: j.label + ' launch induction',
  }));
  const hero = track.jumps.find((j) => j.hero);
  // Use the open shelves and settled corkscrew entries, not the seven launch
  // approaches or receivers. Ion gets a full grounded run before each flight.
  const combat = [
    ['crown', 'arc', section('crown').start + 220, -10],
    ['sunward-entry', 'ion', section('coil').start + 55, 10],
    ['buttress-approach', 'repulsor', section('buttress').start - 25, -10],
    ['heart-approach', 'arc', jump('buttress-cut').recovery + 190, 10],
    ['mantle-entry', 'ion', section('mantle').start + 65, -10],
    ['copper', 'repulsor', section('copper').start + 60, 10],
    ['shard-stair', 'arc', jump('mantle-shear').recovery + 300, -10],
    ['root-entry', 'ion', section('root-coil').start - 45, 10],
  ].map(([id, type, distance, lateral]) => ({
    id: `${id}-${type}`,
    type,
    distance,
    lateral,
    width: 6,
    length: 10,
    label: `${id} ${type}`,
  }));
  const counterplay = [
    ['crown', section('crown').start + 150, 10],
    ['sunward', jump('crown-break').recovery + 165, -10],
    ['mantle', jump('heart-chasm').recovery + 165, 10],
    ['shards', jump('mantle-shear').recovery + 165, 10],
    ['root', jump('echo-chasm').recovery + 165, -10],
  ].map(([id, distance, lateral]) => ({
    id: `${id}-aegis`,
    type: 'aegis',
    distance,
    lateral,
    width: 6,
    length: 8,
    label: `${id} Aegis`,
  }));
  return createDeviceLayout(track, [
    ...vectors,
    {
      id: 'heart-aegis',
      type: 'aegis',
      distance: hero.takeoff - 200,
      lateral: 0,
      width: 12,
      length: 8,
      label: 'Heart crossing shield',
    },
    ...combat,
    ...counterplay,
  ]).sort((a, b) => a.distance - b.distance);
}
