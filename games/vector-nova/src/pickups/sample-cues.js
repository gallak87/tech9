// One sound set shared by racing, the Sounds picker and the ship inspector.
export const DEVICE_SAMPLES = {
  'aegis-activate': new URL(
    '../../assets/audio/sfx/aegis-activate.wav',
    import.meta.url,
  ).href,
  'arc-activate': new URL(
    '../../assets/audio/sfx/arc-activate.wav',
    import.meta.url,
  ).href,
  'arc-hit': new URL('../../assets/audio/sfx/arc-hit.wav', import.meta.url)
    .href,
  'repulsor-charge': new URL(
    '../../assets/audio/sfx/repulsor-charge.wav',
    import.meta.url,
  ).href,
  'repulsor-fire': new URL(
    '../../assets/audio/sfx/repulsor-fire.wav',
    import.meta.url,
  ).href,
  'repulsor-hit': new URL(
    '../../assets/audio/sfx/repulsor-hit.wav',
    import.meta.url,
  ).href,
  'shield-block': new URL(
    '../../assets/audio/sfx/shield-block.wav',
    import.meta.url,
  ).href,
};

export function deviceSample(event) {
  const { kind, shielded } = event.payload ?? {};
  if (event.type === 'shield-hit') return { id: 'shield-block', gain: 0.8 };
  if (kind === 'aegis') {
    if (event.type === 'pickup-activate')
      return { id: 'aegis-activate', gain: 1 };
    if (event.type === 'pickup-expire')
      return { id: 'shield-block', gain: 0.65 };
    if (event.type === 'pickup-cancel')
      return { id: 'shield-block', gain: 0.4 };
  }
  if (!['arc', 'repulsor'].includes(kind)) return null;
  if (event.type === 'pickup-activate')
    return { id: kind === 'arc' ? 'arc-activate' : 'repulsor-charge', gain: 1 };
  if (event.type === 'combat-fire' && kind === 'repulsor')
    return { id: 'repulsor-fire', gain: 1 };
  if (event.type === 'combat-hit' && !shielded)
    return { id: `${kind}-hit`, gain: 1 };
  if (event.type === 'combat-confirm')
    return { id: shielded ? 'shield-block' : `${kind}-hit`, gain: 0.6 };
  // Physical contact during damage grace is audible, without another hit claim.
  if (event.type === 'combat-contact') return { id: `${kind}-hit`, gain: 0.35 };
  return null;
}
