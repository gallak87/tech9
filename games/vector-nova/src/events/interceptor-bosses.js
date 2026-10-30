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
    attack: attack('lance', {
      telegraph: 1.4,
      turn: 0.8,
      hold: 2,
      shotInterval: 1,
      markers: Object.freeze([0.15, 0.43, 0.88]),
      pressure: Object.freeze({
        lockLead: 1.2,
        laneStep: 8,
        breach: 3,
        coreMultiplier: 3,
        armorPlayer: Object.freeze({ lance: 9, arc: 2, repulsor: 6 }),
        coreHalfWidth: 1.5,
        coreRearMin: -21.2,
        coreRearMax: -17.5,
        coreLow: -0.3,
        coreHigh: 3.2,
      }),
    }),
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
