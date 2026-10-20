// Original procedural sound design: transient, physical body and short tail.
// [wave, start Hz, end Hz, duration, gain, delay, attack]
export function deviceCue(event) {
  const kind = event.payload?.kind;
  if (event.type === 'combat-fire')
    return kind === 'repulsor'
      ? [
          ['sine', 112, 34, 0.55, 0.3, 0, 0.004],
          ['noise', 2400, 180, 0.32, 0.34, 0, 0.003],
          ['noise', 7600, 1900, 0.45, 0.07, 0.055, 0.025],
          ['triangle', 310, 62, 0.2, 0.08, 0.008, 0.003],
        ]
      : [
          ['noise', 6200, 900, 0.16, 0.3, 0, 0.002],
          ['triangle', 1050, 160, 0.13, 0.13, 0, 0.002],
          ['sine', 2600, 430, 0.09, 0.06, 0.005, 0.002],
          ['noise', 1800, 600, 0.18, 0.045, 0.025, 0.008],
        ];
  if (event.type === 'shield-hit')
    return [
      ['noise', 5800, 800, 0.23, 0.22, 0, 0.002],
      ['triangle', 260, 63, 0.28, 0.16, 0, 0.003],
      ['sine', 1320, 990, 0.4, 0.045, 0.012, 0.006],
    ];
  if (event.type === 'combat-hit')
    return event.payload?.shielded
      ? []
      : [
          ['noise', 3200, 260, 0.2, 0.23, 0, 0.002],
          ['sine', 130, 42, 0.3, 0.22, 0, 0.003],
          ['triangle', 410, 80, 0.13, 0.06, 0.006, 0.002],
        ];
  if (event.type === 'combat-confirm')
    return [
      ['noise', 2300, 1500, 0.065, 0.05, 0, 0.002],
      [
        'sine',
        event.payload?.shielded ? 540 : 1260,
        event.payload?.shielded ? 420 : 1540,
        0.1,
        0.025,
        0,
        0.003,
      ],
    ];
  if (event.type === 'pickup-activate') {
    if (kind === 'vector')
      return [
        ['noise', 650, 3800, 0.42, 0.24, 0, 0.009],
        ['triangle', 88, 195, 0.34, 0.13, 0, 0.006],
        ['noise', 5000, 1600, 0.55, 0.075, 0.025, 0.02],
        ['sine', 65, 140, 0.26, 0.12, 0, 0.007],
      ];
    if (kind === 'aegis')
      return [
        ['noise', 1700, 650, 0.4, 0.095, 0, 0.012],
        ['sine', 72, 110, 0.3, 0.11, 0, 0.008],
        ['sine', 1100, 880, 0.58, 0.045, 0.015, 0.025],
        ['sine', 1670, 1320, 0.48, 0.022, 0.025, 0.03],
      ];
    if (kind === 'repulsor')
      return [
        ['noise', 240, 2600, 0.49, 0.13, 0, 0.03],
        ['sine', 95, 420, 0.49, 0.09, 0, 0.02],
        ['triangle', 180, 710, 0.46, 0.045, 0.02, 0.025],
      ];
    if (kind === 'arc')
      return [
        ['noise', 2400, 6800, 0.12, 0.085, 0, 0.003],
        ['sine', 460, 1120, 0.14, 0.055, 0, 0.004],
      ];
    if (kind === 'ion')
      return [
        ['noise', 4800, 1100, 0.55, 0.15, 0, 0.012],
        ['sine', 120, 75, 0.35, 0.1, 0, 0.008],
        ['triangle', 380, 190, 0.24, 0.045, 0.01, 0.01],
      ];
  }
  if (event.type === 'pickup-expire')
    return [
      ['noise', kind === 'ion' ? 1600 : 2400, 350, 0.3, 0.04, 0, 0.03],
      ['sine', 440, 220, 0.26, 0.014, 0, 0.025],
    ];
  if (event.type === 'pickup-unavailable')
    return [['noise', 1600, 900, 0.05, 0.018, 0, 0.002]];
  if (event.type === 'pickup-cancel')
    return [['noise', 850, 260, 0.14, 0.03, 0, 0.012]];
  return [];
}

export function createDeviceNoise(context) {
  const buffer = context.createBuffer(
    2,
    context.sampleRate * 2,
    context.sampleRate,
  );
  for (let channel = 0; channel < 2; channel++) {
    const samples = buffer.getChannelData(channel);
    let seed = 9281 + channel * 1777;
    for (let i = 0; i < samples.length; i++) {
      seed = (seed * 16807) % 2147483647;
      samples[i] = seed / 1073741824 - 1;
    }
    // Wrap at a matching short crossfade, so held effects have no loop click.
    const fade = Math.round(context.sampleRate * 0.025);
    for (let i = 0; i < fade; i++) {
      const at = samples.length - fade + i;
      const t = i / fade;
      samples[at] = samples[at] * (1 - t) + samples[i] * t;
    }
  }
  return buffer;
}
