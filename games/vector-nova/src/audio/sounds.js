// Audition entries use the same events and synthesis as gameplay. Shared cues
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
  device('vector-activate', 'Vector · activate', 'pickup-activate', {
    kind: 'vector',
  }),
  device('aegis-activate', 'Aegis · activate', 'pickup-activate', {
    kind: 'aegis',
  }),
  device('repulsor-activate', 'Repulsor · charge', 'pickup-activate', {
    kind: 'repulsor',
  }),
  device('arc-activate', 'Arc · activate', 'pickup-activate', {
    kind: 'arc',
  }),
  device('ion-activate', 'Ion · activate', 'pickup-activate', {
    kind: 'ion',
  }),
  device('repulsor-fire', 'Repulsor · fire', 'combat-fire', {
    kind: 'repulsor',
  }),
  device('arc-fire', 'Arc · fire', 'combat-fire', { kind: 'arc' }),
  device('shield-hit', 'Aegis · absorb hit', 'shield-hit'),
  device('combat-hit', 'Combat · unshielded hit', 'combat-hit', {
    shielded: false,
  }),
  device('combat-confirm', 'Combat · hit confirmed', 'combat-confirm', {
    shielded: false,
  }),
  device(
    'combat-confirm-shield',
    'Combat · shield hit confirmed',
    'combat-confirm',
    { shielded: true },
  ),
  device('device-expire', 'Device · expire', 'pickup-expire', {
    kind: 'aegis',
  }),
  device('ion-expire', 'Ion · expire', 'pickup-expire', { kind: 'ion' }),
  device('device-unavailable', 'Device · unavailable', 'pickup-unavailable'),
  device('device-cancel', 'Device · cancelled', 'pickup-cancel'),
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
  race('lap', 'Lap complete', 'lap'),
  race('final-lap', 'Final lap', 'final-lap'),
  race(
    'race-win',
    'Race complete · winner',
    'player-race-complete',
    { valid: true, position: 1 },
    2.2,
  ),
  race(
    'race-finish',
    'Race complete · finisher',
    'player-race-complete',
    { valid: true, position: 2 },
    1.9,
  ),
  race(
    'race-invalid',
    'Race complete · invalid run',
    'player-race-complete',
    { valid: false },
    1.9,
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
  {
    id: 'nacre-thunder',
    label: 'Nacre · thunder',
    group: 'Environment',
    bus: 'race',
    event: { type: 'nacre-thunder', id: 'audition', submerged: 0 },
    seconds: 3,
  },
  {
    id: 'nacre-thunder-submerged',
    label: 'Nacre · submerged thunder',
    group: 'Environment',
    bus: 'race',
    event: { type: 'nacre-thunder', id: 'audition', submerged: 1 },
    submerged: 1,
    seconds: 3,
  },
  {
    id: 'glasswake-shelf',
    label: 'Glasswake · ice shelf collapse',
    group: 'Environment',
    bus: 'race',
    event: { type: 'glasswake-shelf', id: 'opening-sheet' },
    seconds: 3.6,
  },
];
