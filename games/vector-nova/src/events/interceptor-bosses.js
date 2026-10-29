const attack = (kind, options = {}) =>
  Object.freeze({
    kind,
    marker: 0.15,
    telegraph: 1.2,
    turn: 0.75,
    hold: 1.2,
    shotInterval: 0.55,
    reverse: true,
    blasts: Object.freeze({ easy: 1, medium: 2, hard: 2 }),
    ...options,
  });

export const INTERCEPTOR_BOSSES = Object.freeze([
  Object.freeze({
    id: 'goliath',
    name: 'Goliath',
    kind: 'Armored courier',
    cruiseKph: 300,
    laneWeave: 0,
    attack: attack('lance'),
    countermeasureInterval: 7,
  }),
  Object.freeze({
    id: 'wraith',
    name: 'Wraith',
    kind: 'Arc hunter',
    cruiseKph: 300,
    laneWeave: 0,
    attack: attack('arc', {
      marker: 0.2,
      telegraph: 1,
      turn: 0.6,
      hold: 3,
      shotInterval: 1.3,
    }),
    countermeasureInterval: null,
  }),
  Object.freeze({
    id: 'bulwark',
    name: 'Bulwark',
    kind: 'Wake layer',
    cruiseKph: 300,
    laneWeave: 3,
    attack: attack('lance', {
      marker: 0.15,
      telegraph: 1.6,
      turn: 1,
      hold: 2.4,
      shotInterval: 1.1,
    }),
    countermeasureInterval: 9,
  }),
]);

export function interceptorBoss(id = 'goliath') {
  const boss = INTERCEPTOR_BOSSES.find((entry) => entry.id === id);
  if (!boss) throw new Error(`Unknown Interceptor boss: ${id}`);
  return boss;
}
