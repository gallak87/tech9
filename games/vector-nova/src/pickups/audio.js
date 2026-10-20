import { createImmersionMix } from '../audio/immersion.js';

const clamp = (value) =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

// Short acquisition signatures sit above the existing propulsion/boost bed.
// Aegis has a rising harmonic ring; Vector has a quick accelerating sweep.
function cueFor(event) {
  const kind = event.payload?.kind;
  if (event.type === 'combat-fire')
    return kind === 'repulsor'
      ? [
          ['triangle', 130, 36, 0.4, 0.14],
          ['sine', 620, 90, 0.28, 0.055],
        ]
      : [
          ['sawtooth', 1100, 280, 0.14, 0.045],
          ['sine', 1700, 680, 0.12, 0.025],
        ];
  if (event.type === 'combat-hit' && !event.payload?.shielded)
    return [['triangle', 180, 55, 0.22, 0.09]];
  if (event.type === 'combat-confirm') return [['sine', 880, 1320, 0.11, 0.03]];
  if (
    event.type === 'pickup-activate' &&
    ['repulsor', 'arc', 'ion'].includes(kind)
  )
    return kind === 'repulsor'
      ? [['sine', 150, 650, 0.48, 0.075]]
      : kind === 'ion'
        ? [
            ['triangle', 220, 660, 0.5, 0.065],
            ['sine', 330, 990, 0.4, 0.03],
          ]
        : [['sine', 740, 1480, 0.16, 0.05]];
  const aegis = event.payload?.kind === 'aegis';
  if (event.type === 'pickup-activate')
    return aegis
      ? [
          ['sine', 396, 528, 0.45, 0.085],
          ['sine', 594, 792, 0.6, 0.038, 0.035],
          ['sine', 792, 1056, 0.65, 0.025, 0.06],
        ]
      : [
          ['triangle', 210, 640, 0.45, 0.12],
          ['sine', 420, 1280, 0.29, 0.035, 0.025],
        ];
  if (event.type === 'shield-hit')
    return [
      ['triangle', 180, 50, 0.3, 0.11],
      ['sine', 990, 220, 0.32, 0.06],
    ];
  if (event.type === 'pickup-expire' && aegis)
    return [
      ['sine', 792, 396, 0.28, 0.035],
      ['sine', 528, 264, 0.34, 0.025],
    ];
  if (event.type === 'pickup-unavailable')
    return [['sine', 280, 250, 0.08, 0.02]];
  if (event.type === 'pickup-cancel')
    return [['triangle', 190, 95, 0.14, 0.03]];
  return [];
}

// This bus owns only immediate road-device cues. It never writes vehicle state.
export function createPickupAudio({
  createContext = () => new AudioContext(),
  immersion = false,
} = {}) {
  let context;
  let master;
  let waterMix;
  let pending;
  let disposed = false;
  let running = false;
  let volume = 0;
  const shots = new Set();
  const stopShots = () => {
    for (const shot of shots) shot.stop();
    shots.clear();
  };
  function silence() {
    running = false;
    stopShots();
    if (master) {
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setValueAtTime(0, context.currentTime);
    }
  }
  return {
    async unlock() {
      if (disposed) return false;
      if (pending) return pending;
      pending = (async () => {
        try {
          if (!context) {
            context = createContext();
            master = context.createGain();
            master.gain.value = 0;
            waterMix = immersion
              ? createImmersionMix(context, context.destination)
              : null;
            master.connect(waterMix?.input ?? context.destination);
          }
          await context.resume();
          return !disposed && context.state === 'running';
        } catch {
          // Unsupported/blocked audio is optional; the complete visual cue remains.
          master?.disconnect();
          waterMix?.dispose();
          waterMix = undefined;
          master = undefined;
          const failed = context;
          context = undefined;
          if (failed && failed.state !== 'closed')
            await failed.close().catch(() => {});
          return false;
        }
      })().finally(() => {
        pending = undefined;
      });
      return pending;
    },
    update(settings = {}, active = false, submerged = 0) {
      waterMix?.update(submerged);
      volume = settings.muted ? 0 : clamp(settings.volume);
      running = !!active && !disposed && volume > 0;
      if (!running) {
        silence();
        return;
      }
      if (!master) return;
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setTargetAtTime(volume * 0.7, context.currentTime, 0.025);
    },
    event(event) {
      if (
        !running ||
        disposed ||
        !context ||
        context.state !== 'running' ||
        shots.size >= 4
      )
        return;
      const notes = cueFor(event);
      if (!notes.length) return;
      const now = context.currentTime;
      const voices = [];
      const shot = {
        stop() {
          for (const voice of voices) {
            if (voice.ended) continue;
            voice.ended = true;
            voice.oscillator.onended = null;
            voice.oscillator.stop();
            voice.oscillator.disconnect();
            voice.envelope.disconnect();
          }
          shots.delete(shot);
        },
      };
      shots.add(shot);
      for (const [type, from, to, duration, gain, delay = 0] of notes) {
        const start = now + delay;
        const oscillator = context.createOscillator();
        const envelope = context.createGain();
        const voice = { oscillator, envelope, ended: false };
        voices.push(voice);
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(from, start);
        oscillator.frequency.exponentialRampToValueAtTime(
          to,
          start + duration * 0.8,
        );
        envelope.gain.setValueAtTime(0, now);
        envelope.gain.setValueAtTime(0, start);
        envelope.gain.linearRampToValueAtTime(gain, start + 0.012);
        envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        envelope.gain.linearRampToValueAtTime(0, start + duration + 0.02);
        oscillator.connect(envelope).connect(master);
        oscillator.onended = () => {
          voice.ended = true;
          oscillator.disconnect();
          envelope.disconnect();
          if (voices.every((entry) => entry.ended)) shots.delete(shot);
        };
        oscillator.start(start);
        oscillator.stop(start + duration + 0.025);
      }
    },
    silence,
    getStatus() {
      return {
        unlocked: context?.state === 'running',
        active: running,
        volume,
        shots: shots.size,
        disposed,
        immersion: waterMix?.getStatus() ?? null,
      };
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      silence();
      await pending;
      master?.disconnect();
      waterMix?.dispose();
      if (context && context.state !== 'closed')
        await context.close().catch(() => {});
    },
  };
}
