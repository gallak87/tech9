export const RACE_SAMPLES = {
  'cup-champion': new URL(
    '../../assets/audio/sfx/cup-champion.wav',
    import.meta.url,
  ).href,
  'lap-complete': new URL(
    '../../assets/audio/sfx/lap-complete.wav',
    import.meta.url,
  ).href,
  'final-lap': new URL('../../assets/audio/sfx/final-lap.wav', import.meta.url)
    .href,
  'race-finisher': new URL(
    '../../assets/audio/sfx/race-finisher.wav',
    import.meta.url,
  ).href,
  'race-invalid': new URL(
    '../../assets/audio/sfx/race-invalid.wav',
    import.meta.url,
  ).href,
  'race-winner': new URL(
    '../../assets/audio/sfx/race-winner.wav',
    import.meta.url,
  ).href,
  'ship-impact': new URL(
    '../../assets/audio/sfx/ship-impact.wav',
    import.meta.url,
  ).href,
};

export function raceSample(event) {
  switch (event?.type) {
    case 'cup-champion':
      return { id: 'cup-champion', gain: 0.85 };
    case 'lap':
      return { id: 'lap-complete', gain: 1 };
    case 'final-lap':
      return { id: 'final-lap', gain: 1 };
    case 'player-race-complete':
      return {
        id:
          event.payload?.valid === false
            ? 'race-invalid'
            : event.payload?.position === 1
              ? 'race-winner'
              : 'race-finisher',
        gain: 1,
      };
    case 'impact':
      return event.payload?.shielded ? null : { id: 'ship-impact', gain: 0.8 };
    default:
      return null;
  }
}
