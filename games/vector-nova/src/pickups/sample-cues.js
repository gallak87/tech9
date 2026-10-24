// One sound set shared by racing, the Sounds picker and the ship inspector.
export const DEVICE_SAMPLES = {
  'jump-activate': new URL(
    '../../assets/audio/sfx/jump-activate.wav',
    import.meta.url,
  ).href,
  'jump-land': new URL('../../assets/audio/sfx/jump-land.wav', import.meta.url)
    .href,
  'injector-activate': new URL(
    '../../assets/audio/sfx/injector-activate.wav',
    import.meta.url,
  ).href,
  'slipstream-activate': new URL(
    '../../assets/audio/sfx/slipstream-activate.wav',
    import.meta.url,
  ).href,
  'deflector-activate': new URL(
    '../../assets/audio/sfx/deflector-activate.wav',
    import.meta.url,
  ).href,
  'stabilizer-activate': new URL(
    '../../assets/audio/sfx/stabilizer-activate.wav',
    import.meta.url,
  ).href,
  'lance-fire': new URL(
    '../../assets/audio/sfx/lance-fire.wav',
    import.meta.url,
  ).href,
  'lance-hit': new URL('../../assets/audio/sfx/lance-hit.wav', import.meta.url)
    .href,
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
  const { kind, shielded, equipment } = event.payload ?? {};
  if (
    event.type === 'jump-transfer' &&
    event.payload?.id === 'equipment-jump' &&
    event.payload?.outcome === 'landed'
  )
    return { id: 'jump-land', gain: 0.6 };
  if (
    event.type === 'equipment-activate' &&
    kind !== 'lance' &&
    DEVICE_SAMPLES[`${kind}-activate`]
  )
    return { id: `${kind}-activate`, gain: 0.85 };
  if (event.type === 'equipment-block')
    return { id: 'shield-block', gain: 0.8 };
  if (event.type === 'equipment-expire' && kind === 'deflector')
    return { id: 'shield-block', gain: 0.5 };
  if (equipment === 'lance') {
    if (event.type === 'combat-fire') return { id: 'lance-fire', gain: 1 };
    if (
      !shielded &&
      ['combat-hit', 'combat-confirm', 'combat-contact'].includes(event.type)
    )
      return {
        id: 'lance-hit',
        gain:
          event.type === 'combat-hit'
            ? 1
            : event.type === 'combat-confirm'
              ? 0.6
              : 0.35,
      };
  }
  if (event.type === 'shield-hit') return { id: 'shield-block', gain: 0.8 };
  if (
    event.type === 'combat-confirm' &&
    shielded &&
    ['arc', 'repulsor', 'ion'].includes(kind)
  )
    return { id: 'shield-block', gain: 0.6 };
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
  if (event.type === 'combat-confirm') return { id: `${kind}-hit`, gain: 0.6 };
  // Physical contact during damage grace is audible, without another hit claim.
  if (event.type === 'combat-contact') return { id: `${kind}-hit`, gain: 0.35 };
  return null;
}
