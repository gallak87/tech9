import { EQUIPMENT } from '../progression/catalog.js';

// Audition entries use the same event sounds as gameplay. Shared cues
// appear once; continuous engine/effect beds have short representative previews.
const device = (id, label, type, payload = {}, seconds = 0.7) => ({
  id,
  label,
  group: 'Pickups & combat',
  bus: 'devices',
  event: { type, payload },
  seconds,
});
const race = (id, label, type, payload = {}, seconds = 0.8) => ({
  id,
  label,
  group: 'Race & contact',
  bus: 'race',
  event: { type, payload },
  seconds,
});

export const soundEffects = [
  ...[
    ['charge', 'Shield bulkheads loading', 1.6],
    ['lock', 'Vault latch', 0.25],
    ['turn', 'Barge gyro turn', 0.9],
    ['fire', 'Pressure slab', 0.45],
    ['counter', 'Shoulder emitter ruptured', 0.55],
    ['expose', 'Shoulder shutters open', 0.6],
    ['disable', 'Shield collapse', 1.4],
  ].map(([cue, label, seconds]) => ({
    ...race(
      `bulwark-${cue}`,
      `Bulwark · ${label}`,
      'interceptor-cue',
      { bossId: 'bulwark', cue },
      seconds,
    ),
    group: 'Interceptor · Bulwark',
  })),
  {
    ...race(
      'bulwark-core-hit',
      'Bulwark · Critical shoulder hit',
      'interceptor-hit',
      {
        bossId: 'bulwark',
        target: 'bulwark',
        source: 'player',
        weakPoint: true,
      },
      0.35,
    ),
    group: 'Interceptor · Bulwark',
  },
  ...[
    ['charge', 'Twin capacitors', 1.2],
    ['lock', 'Ion lock', 0.25],
    ['turn', 'Reverse thrust', 0.55],
    ['fire', 'Ion scissors', 0.45],
    ['counter', 'Lock ruptured', 0.55],
    ['expose', 'Capacitor vent', 0.8],
    ['disable', 'Twin drives quenched', 1.2],
  ].map(([cue, label, seconds]) => ({
    ...race(
      `wraith-${cue}`,
      `Wraith · ${label}`,
      'interceptor-cue',
      { bossId: 'wraith', cue },
      seconds,
    ),
    group: 'Interceptor · Wraith',
  })),
  {
    ...race(
      'wraith-core-hit',
      'Wraith · Critical capacitor hit',
      'interceptor-hit',
      { bossId: 'wraith', target: 'wraith', source: 'player', weakPoint: true },
      0.4,
    ),
    group: 'Interceptor · Wraith',
  },
  ...[
    ['charge', 'Pressure charge', 1.4],
    ['turn', 'Magnetic turn', 0.8],
    ['fire', 'Siege cannon', 0.7],
    ['expose', 'Breach vent', 1.1],
    ['recover', 'Cannon recharged', 0.6],
    ['lock', 'Target lane locked', 0.3],
    ['return', 'Cannon returning', 0.8],
    ['disable', 'Core quenched', 1.2],
  ].map(([cue, label, seconds]) => ({
    ...race(
      `goliath-${cue}`,
      `Goliath · ${label}`,
      'interceptor-cue',
      { bossId: 'goliath', cue },
      seconds,
    ),
    group: 'Interceptor · Goliath',
  })),
  {
    ...race(
      'goliath-core-hit',
      'Goliath · Critical core hit',
      'interceptor-hit',
      { target: 'goliath', source: 'player', weakPoint: true },
      0.5,
    ),
    group: 'Interceptor · Goliath',
  },
  ...EQUIPMENT.filter(({ id }) => id !== 'lance').map(({ id, name }) => ({
    ...device(
      `${id}-activate`,
      `${name} · activate`,
      'equipment-activate',
      { kind: id },
      2.1,
    ),
    group: 'Equipped abilities',
  })),
  {
    ...device(
      'jump-land',
      'Jump Drive · landing catch',
      'jump-transfer',
      { id: 'equipment-jump', outcome: 'landed' },
      0.9,
    ),
    group: 'Equipped abilities',
  },
  ...[
    device(
      'lance-fire',
      'Lance · fire',
      'combat-fire',
      { kind: 'arc', equipment: 'lance' },
      2.1,
    ),
    device(
      'lance-hit',
      'Lance · hull impact',
      'combat-hit',
      { kind: 'repulsor', equipment: 'lance', shielded: false },
      1.6,
    ),
  ].map((sound) => ({ ...sound, group: 'Equipped abilities' })),
  device('vector-activate', 'Vector · activate', 'pickup-activate', {
    kind: 'vector',
  }),
  device(
    'aegis-activate',
    'Aegis · activate',
    'pickup-activate',
    {
      kind: 'aegis',
    },
    1,
  ),
  device('repulsor-activate', 'Repulsor · charge', 'pickup-activate', {
    kind: 'repulsor',
  }),
  device(
    'arc-activate',
    'Arc · activate',
    'pickup-activate',
    {
      kind: 'arc',
    },
    1.4,
  ),
  device('ion-activate', 'Ion · activate', 'pickup-activate', {
    kind: 'ion',
  }),
  device(
    'repulsor-fire',
    'Repulsor · fire',
    'combat-fire',
    {
      kind: 'repulsor',
    },
    1.6,
  ),
  device('arc-fire', 'Arc · fire', 'combat-fire', { kind: 'arc' }),
  device('arc-hit', 'Arc · hull impact', 'combat-hit', { kind: 'arc' }),
  device(
    'repulsor-hit',
    'Repulsor · hull impact',
    'combat-hit',
    { kind: 'repulsor' },
    1,
  ),
  device(
    'shield-hit',
    'Aegis / Deflector · collapse / hit',
    'shield-hit',
    {},
    1,
  ),
  device('ion-hit', 'Ion · hull impact', 'combat-hit', {
    kind: 'ion',
    shielded: false,
  }),
  device('ion-confirm', 'Ion · target contact', 'combat-confirm', {
    kind: 'ion',
    shielded: false,
  }),
  {
    id: 'vector-bed',
    label: 'Vector · sustained rush',
    group: 'Pickups & combat',
    bus: 'devices',
    effects: { vector: true },
    seconds: 3,
  },
  {
    id: 'ion-bed',
    label: 'Ion · sustained wake',
    group: 'Pickups & combat',
    bus: 'devices',
    effects: { ion: true },
    seconds: 3,
  },
  race('countdown-beep', 'Countdown · 3 / 2 / 1', 'countdown-beep', {
    step: 3,
  }),
  race('countdown-go', 'Countdown · go', 'countdown-go', {}, 0.9),
  race('lap', 'Lap complete', 'lap', {}, 1.4),
  race('final-lap', 'Final lap', 'final-lap', {}, 1),
  race('cup-champion', 'Cup · champion', 'cup-champion', {}, 3.7),
  race(
    'race-win',
    'Race complete · winner',
    'player-race-complete',
    { valid: true, position: 1 },
    3,
  ),
  race(
    'race-finish',
    'Race complete · finisher',
    'player-race-complete',
    { valid: true, position: 2 },
    2.6,
  ),
  race(
    'race-invalid',
    'Race complete · invalid run',
    'player-race-complete',
    { valid: false },
    1.65,
  ),
  race('impact', 'Ship · impact', 'impact'),
  ...[
    ['engine-idle', 'Ship · hover / idle', { speed: 0 }],
    ['engine-cruise', 'Ship · cruise', { speed: 112 }],
    ['engine-boost', 'Ship · manual boost', { speed: 157, boosting: true }],
  ].map(([id, label, state]) => ({
    id,
    label,
    group: 'Propulsion',
    bus: 'race',
    state: { time: 0, steer: 0, boosting: false, ...state },
    seconds: 3,
  })),
].sort(
  (a, b) =>
    a.group.localeCompare(b.group, 'en') ||
    a.label.localeCompare(b.label, 'en'),
);
