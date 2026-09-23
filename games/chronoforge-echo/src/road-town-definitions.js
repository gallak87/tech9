// Optional road stops. Coordinates are native world-authoring units; the shared
// scale pass converts each copied town once. Stock ceilings live in content.js.
export const ROAD_TOWNS = {
  forest_veil: {
    id: 'forest_veil',
    name: 'Rootrest Hall',
    x: 1800,
    y: 1130,
    interiorKit: 'last_crown',
    discoveryTravel: true,
  },
  mire_bog: {
    id: 'mire_bog',
    name: 'Reedhaven Exchange',
    x: 2650,
    y: 1160,
    interiorKit: 'haventide',
    discoveryTravel: true,
  },
  crater_ember: {
    id: 'crater_ember',
    name: 'Cinderwatch Lodge',
    x: 1290,
    y: 1110,
    interiorKit: 'emberline',
    discoveryTravel: true,
  },
  frost_canyon: {
    id: 'frost_canyon',
    name: 'Whitepass Refuge',
    x: 2440,
    y: 720,
    interiorKit: 'orbital_reach',
    discoveryTravel: true,
  },
};

export function roadTown(region) {
  const id = region?.replace(/_town$/, '');
  return Object.hasOwn(ROAD_TOWNS, id) ? ROAD_TOWNS[id] : null;
}
