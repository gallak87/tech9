export const EQUIPMENT_CONTROLS = Object.freeze(
  [
    ['Q', 'X'],
    ['E', 'Y'],
    ['Z', 'D-pad ←'],
    ['X', 'D-pad →'],
  ].map(([keyboard, gamepad]) => ({
    key: `Key${keyboard}`,
    keyboard,
    gamepad,
    label: `${keyboard} / ${gamepad}`,
  })),
);
