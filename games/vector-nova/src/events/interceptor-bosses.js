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
    initialLead: 100,
    chargeKph: 200,
    attack: attack('arc', {
      markers: Object.freeze([
        1900 / 4953.926474328469,
        3500 / 4953.926474328469,
      ]),
      telegraph: 1.2,
      turn: 0.55,
      hold: 1.05,
      fireDelay: 0.25,
      shotInterval: 0.45,
      resonance: Object.freeze({
        lockTime: 0.9,
        counterClose: 1.7,
        boostHold: 0.3,
        armorPlayer: Object.freeze({ lance: 9, arc: 2, repulsor: 6 }),
        laneStep: 2.5,
        deflection: 10,
        breach: 2.65,
        coreMultiplier: 3,
        coreHalfWidth: 1.4,
        coreRearMin: -10,
        coreRearMax: -7,
        coreLow: -0.3,
        coreHigh: 2.6,
      }),
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
