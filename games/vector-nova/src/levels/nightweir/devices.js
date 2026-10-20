import { createDeviceLayout } from '../../pickups/layout.js';
export function createDevices(track) {
  const section = (id) => track.sections.find((item) => item.id === id);
  const jump = (id) => track.jumps.find((item) => item.id === id);
  const vectors = track.jumps.map((j) => ({
    id: j.id + '-vector',
    type: 'vector',
    signalScale: 0.45,
    distance: j.takeoff - 105,
    lateral: 0,
    width: 26,
    length: 48,
    label: j.label + ' launch induction',
  }));
  const hero = track.jumps.find((j) => j.hero);
  // City connectors carry the combat choices. Keep the long spillway/turbine
  // receivers and the complete final harbor flight focused on clean driving.
  // The two Ion entries have over a kilometre of grounded route ahead.
  const combat = [
    ['reservoir', 'arc', section('reservoir').start + 300, -9],
    ['aqueduct-entry', 'ion', jump('upper-lock').recovery + 230, 9],
    ['terraces-entry', 'repulsor', jump('terrace-cut').recovery + 200, -9],
    ['terraces-exit', 'arc', section('terraces').end - 130, 9],
    ['turbine-entry', 'ion', section('turbine').start + 120, -9],
    // Let the turbine wake finish; offer Repulsor after the later canal
    // receiver, just beyond its Aegis counterplay lane.
    ['canals', 'repulsor', jump('canal-shear').recovery + 310, 9],
    ['lower-weirs', 'arc', section('low-weir').start + 130, -9],
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
    ['reservoir', section('reservoir').start + 180, 9],
    ['aqueduct', jump('upper-lock').recovery + 165, -9],
    ['terraces', jump('terrace-cut').recovery + 165, 9],
    ['turbine', jump('market-cut').recovery + 165, 9],
    ['canals', jump('canal-shear').recovery + 200, 9],
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
      id: 'spillway-aegis',
      type: 'aegis',
      distance: hero.takeoff - 200,
      lateral: 0,
      width: 12,
      length: 8,
      label: 'Spillway crossing shield',
    },
    ...combat,
    ...counterplay,
  ]).sort((a, b) => a.distance - b.distance);
}
