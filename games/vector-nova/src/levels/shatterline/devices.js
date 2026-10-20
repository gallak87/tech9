import { createDeviceLayout } from '../../pickups/layout.js';
export function createDevices(track) {
  const section = (id) => track.sections.find((item) => item.id === id);
  const jump = (id) => track.jumps.find((item) => item.id === id);
  const vectors = track.jumps.map((j) => ({
    id: `${j.id}-vector`,
    type: 'vector',
    distance: j.takeoff - 105,
    lateral: 0,
    width: 24,
    length: 48,
    label: `${j.label} launch induction`,
  }));
  const shields = track.jumps
    .filter((j) => j.hero)
    .map((j) => ({
      id: `${j.id}-aegis`,
      type: 'aegis',
      distance: j.takeoff - 185,
      lateral: 0,
      width: 12,
      length: 8,
      label: `${j.label} Aegis`,
    }));
  // Spread combat over the actual 21 km descent. The twelve launch strips,
  // receivers and both curved Overturn tubes stay clear of new hardware.
  // Service and Scissor are continuous magnetic road, long enough for an Ion
  // wake to finish well before the next flight.
  const combat = [
    ['summit', 'arc', section('summit-chute').start + 520, -10],
    ['service-entry', 'arc', section('service-corkscrew').start + 275, 10],
    ['service-descent', 'ion', section('service-corkscrew').start + 1050, -10],
    ['avalanche-entry', 'repulsor', section('avalanche-sweep').start + 180, 10],
    ['avalanche-exit', 'arc', jump('offset-one').recovery + 280, -10],
    ['scissor-entry', 'repulsor', section('scissor-dive').start + 350, 10],
    ['scissor-descent', 'ion', jump('fracture-leap').recovery + 340, -10],
    ['horizon-approach', 'repulsor', jump('last-relay').recovery + 240, 10],
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
    ['summit', section('summit-chute').start + 250, 10],
    ['service', section('service-corkscrew').start + 170, -10],
    ['avalanche', jump('offset-one').recovery + 165, 10],
    ['scissor', jump('fracture-leap').recovery + 165, 10],
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
    ...shields,
    ...combat,
    ...counterplay,
  ]).sort((a, b) => a.distance - b.distance);
}
