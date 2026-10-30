export const RACE_SAMPLES = {
  'wraith-charge': new URL(
    '../../assets/audio/sfx/bosses/wraith-charge.wav',
    import.meta.url,
  ).href,
  'wraith-lock': new URL(
    '../../assets/audio/sfx/bosses/wraith-lock.wav',
    import.meta.url,
  ).href,
  'wraith-turn': new URL(
    '../../assets/audio/sfx/bosses/wraith-turn.wav',
    import.meta.url,
  ).href,
  'wraith-fire': new URL(
    '../../assets/audio/sfx/bosses/wraith-fire.wav',
    import.meta.url,
  ).href,
  'wraith-counter': new URL(
    '../../assets/audio/sfx/bosses/wraith-counter.wav',
    import.meta.url,
  ).href,
  'wraith-expose': new URL(
    '../../assets/audio/sfx/bosses/wraith-expose.wav',
    import.meta.url,
  ).href,
  'wraith-core-hit': new URL(
    '../../assets/audio/sfx/bosses/wraith-core-hit.wav',
    import.meta.url,
  ).href,
  'wraith-disable': new URL(
    '../../assets/audio/sfx/bosses/wraith-disable.wav',
    import.meta.url,
  ).href,
  'goliath-charge': new URL(
    '../../assets/audio/sfx/bosses/goliath-charge.wav',
    import.meta.url,
  ).href,
  'goliath-turn': new URL(
    '../../assets/audio/sfx/bosses/goliath-turn.wav',
    import.meta.url,
  ).href,
  'goliath-fire': new URL(
    '../../assets/audio/sfx/bosses/goliath-fire.wav',
    import.meta.url,
  ).href,
  'goliath-expose': new URL(
    '../../assets/audio/sfx/bosses/goliath-expose.wav',
    import.meta.url,
  ).href,
  'goliath-recover': new URL(
    '../../assets/audio/sfx/bosses/goliath-recover.wav',
    import.meta.url,
  ).href,
  'goliath-core-hit': new URL(
    '../../assets/audio/sfx/bosses/goliath-core-hit.wav',
    import.meta.url,
  ).href,
  'goliath-lock': new URL(
    '../../assets/audio/sfx/bosses/goliath-lock.wav',
    import.meta.url,
  ).href,
  'goliath-disable': new URL(
    '../../assets/audio/sfx/bosses/goliath-disable.wav',
    import.meta.url,
  ).href,
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
    case 'interceptor-cue': {
      const levels = {
        charge: 0.74,
        turn: 0.82,
        fire: 0.9,
        expose: 0.74,
        recover: 0.82,
        lock: 0.9,
        return: 0.55,
        disable: 0.95,
        counter: 0.9,
      };
      const { bossId, cue } = event.payload ?? {};
      const id = `${bossId}-${cue === 'return' ? 'turn' : cue}`;
      return Object.hasOwn(levels, cue) && Object.hasOwn(RACE_SAMPLES, id)
        ? { id, gain: levels[cue] }
        : null;
    }
    case 'interceptor-hit': {
      const { bossId, target, source, weakPoint } = event.payload ?? {};
      const id = `${bossId ?? target}-core-hit`;
      return source === 'player' &&
        weakPoint === true &&
        target === (bossId ?? target) &&
        Object.hasOwn(RACE_SAMPLES, id)
        ? { id, gain: 0.88 }
        : null;
    }
    case 'freestyle-bank':
      return event.payload?.clean ? { id: 'freestyle-bank', gain: 0.65 } : null;
    case 'eliminator-cut':
      return event.payload?.id === 'player'
        ? null
        : { id: 'race-finisher', gain: 0.35 };
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
