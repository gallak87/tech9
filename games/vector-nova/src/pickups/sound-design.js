// Current authored synthesis. Sample-backed cues live in sample-cues.js.
// [wave, start Hz, end Hz, duration, gain, delay, attack]
export function deviceCue(event) {
  const { kind, shielded } = event.payload ?? {};
  if (
    event.type === 'combat-fire' &&
    kind === 'arc' &&
    event.payload?.equipment !== 'lance'
  )
    return [
      ['noise', 1200, 220, 0.14, 0.13, 0, 0.002],
      ['triangle', 170, 65, 0.18, 0.2, 0, 0.003],
      ['sine', 82, 36, 0.235, 0.32, 0, 0.004],
      ['noise', 650, 150, 0.2, 0.065, 0.015, 0.008],
    ];
  if (event.type === 'combat-hit' && kind === 'ion' && !shielded)
    return [
      ['noise', 3200, 260, 0.2, 0.23, 0, 0.002],
      ['sine', 130, 42, 0.3, 0.22, 0, 0.003],
      ['triangle', 410, 80, 0.13, 0.06, 0.006, 0.002],
    ];
  if (event.type === 'combat-confirm' && kind === 'ion' && !shielded)
    return [
      ['noise', 2300, 1500, 0.065, 0.05, 0, 0.002],
      ['sine', 1260, 1540, 0.1, 0.025, 0, 0.003],
    ];
  if (event.type === 'pickup-activate') {
    if (kind === 'vector')
      return [
        ['noise', 650, 3800, 0.42, 0.24, 0, 0.009],
        ['triangle', 88, 195, 0.34, 0.13, 0, 0.006],
        ['noise', 5000, 1600, 0.55, 0.075, 0.025, 0.02],
        ['sine', 65, 140, 0.26, 0.12, 0, 0.007],
      ];
    if (kind === 'ion')
      return [
        ['noise', 4800, 1100, 0.55, 0.15, 0, 0.012],
        ['sine', 120, 75, 0.35, 0.1, 0, 0.008],
        ['triangle', 380, 190, 0.24, 0.045, 0.01, 0.01],
      ];
  }
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
