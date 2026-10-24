import { upgradedHandling } from '../progression/catalog.js';
// Asset-free fleet identity and deterministic handling. Reserve is displayed
// as a percentage; endurance is expressed through drain/recharge rates.
const baseline = {
  cruiseSpeed: 112,
  boostSpeed: 157,
  thrust: 42,
  boostThrust: 59,
  braking: 83,
  turn: 1,
  response: 1,
  grip: 1,
  boostDrain: 21,
  recharge: 5.5,
};
const ship = (id, name, role, description, design, tuning, plumeWidth = 1) =>
  Object.freeze({
    id,
    name,
    role,
    description,
    design,
    version: 1,
    plumeWidth,
    exhausts: id === 'needle' ? ['Exhaust_C'] : ['Exhaust_L', 'Exhaust_R'],
    asset: `assets/ships/${id}/${id}.glb`,
    handling: Object.freeze({ ...baseline, ...tuning }),
  });

export const SHIPS = Object.freeze([
  ship(
    'kestrel',
    'Kestrel',
    'Balanced',
    'The original all-rounder. Predictable turn-in, balanced speed and braking.',
    'Split prow / swept ceramic chassis',
    {},
  ),
  ...(import.meta.env?.VN_EDITION === 'demo'
    ? []
    : [
        ship(
          'shrike',
          'Shrike',
          'Agile',
          'Quick off the line and sharp through corners. Gives up outright speed.',
          'Crescent wings / compact central prow',
          {
            cruiseSpeed: 101,
            boostSpeed: 146,
            thrust: 48,
            boostThrust: 65,
            braking: 94,
            turn: 1.24,
            response: 1.22,
            grip: 1.16,
            boostDrain: 23,
          },
          0.82,
        ),
        ship(
          'bastion',
          'Bastion',
          'Endurance',
          'Planted and deliberate. Slower to accelerate and turn, with a longer boost reserve.',
          'Slim catamaran / twin chisel prows',
          {
            cruiseSpeed: 106,
            boostSpeed: 151,
            thrust: 35,
            boostThrust: 52,
            braking: 77,
            turn: 0.78,
            response: 0.78,
            grip: 1.2,
            boostDrain: 15.5,
          },
          1.22,
        ),
        ship(
          'needle',
          'Needle',
          'Speed',
          'The fastest in a straight line. Brake early and commit to each corner.',
          'Spear fuselage / single core engine',
          {
            cruiseSpeed: 126,
            boostSpeed: 173,
            thrust: 40,
            boostThrust: 60,
            braking: 65,
            turn: 0.88,
            response: 0.92,
            grip: 0.92,
            boostDrain: 25,
          },
          1.65,
        ),
      ]),
]);

export function getShip(id) {
  return SHIPS.find((entry) => entry.id === id) ?? SHIPS[0];
}

export function loadShipSelection() {
  try {
    return getShip(localStorage.getItem('vector-nova.ship'));
  } catch {
    return SHIPS[0];
  }
}

export function saveShipSelection(id) {
  try {
    localStorage.setItem('vector-nova.ship', getShip(id).id);
  } catch {
    /* The current session still works without storage. */
  }
}

// Only the player session carries enhancements. Catalog profiles remain immutable
// and every rival/stock trial continues to use the original tuning.
export function vehicleHandling(state) {
  return upgradedHandling(getShip(state.shipId).handling, state.enhancements);
}
