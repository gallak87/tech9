// Asset-free race identities: shared by simulation, setup and the driving HUD.
const opponent = (id, name, shipId, lane, pace, color) =>
  Object.freeze({ id, name, shipId, lane, pace, color });

export const RACE_OPPONENTS = Object.freeze([
  opponent('rook', 'Rook', 'kestrel', -4, 0.96, '#72d9ff'),
  opponent('latch', 'Latch', 'shrike', 4, 0.99, '#c799ff'),
  opponent('mule', 'Mule', 'bastion', -4, 0.94, '#ffe075'),
  opponent('pike', 'Pike', 'needle', 4, 0.93, '#a5a7ed'),
  opponent('tern', 'Tern', 'shrike', -4, 0.97, '#ffbd90'),
  opponent('manta', 'Manta', 'bastion', 4, 0.96, '#74dbbd'),
  opponent('vise', 'Vise', 'kestrel', -4, 0.95, '#ed938b'),
  opponent('kite', 'Kite', 'shrike', 4, 0.98, '#849fff'),
  opponent('gannet', 'Gannet', 'needle', -4, 0.91, '#d4c99a'),
]);

export const RACE_FIELD_SIZE = RACE_OPPONENTS.length + 1;
export const RACE_ORDER = Object.freeze([
  'player',
  ...RACE_OPPONENTS.map(({ id }) => id),
]);
export function createRaceGrid(order = RACE_ORDER) {
  if (
    !Array.isArray(order) ||
    order.length !== RACE_FIELD_SIZE ||
    new Set(order).size !== RACE_FIELD_SIZE ||
    !order.every((id) => RACE_ORDER.includes(id))
  )
    throw new Error('Race grid requires every racer exactly once');
  return Object.freeze(
    Object.fromEntries(
      order.map((id, index) => [
        id,
        Object.freeze({
          distance: -12 * Math.floor(index / 2) || 0,
          lateral: index % 2 ? -4 : 4,
        }),
      ]),
    ),
  );
}
export const RACE_GRID = createRaceGrid();
export const RACER_COLORS = Object.freeze({
  player: '#fb7959',
  ...Object.fromEntries(RACE_OPPONENTS.map(({ id, color }) => [id, color])),
});
