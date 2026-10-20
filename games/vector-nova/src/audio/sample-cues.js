export const RACE_SAMPLES = {
  'ship-impact': new URL(
    '../../assets/audio/sfx/ship-impact.wav',
    import.meta.url,
  ).href,
};

export function raceSample(event) {
  if (event?.type === 'impact' && !event.payload?.shielded)
    return { id: 'ship-impact', gain: 0.8 };
  return null;
}
