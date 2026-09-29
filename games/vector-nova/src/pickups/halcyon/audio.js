const clamp = (value) =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

// This bus owns only immediate road-device cues. It never writes vehicle state.
export function createPickupAudio({
  createContext = () => new AudioContext(),
} = {}) {
  let context;
  let master;
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
            master.connect(context.destination);
          }
          await context.resume();
          return !disposed && context.state === 'running';
        } catch {
          // Unsupported/blocked audio is optional; the complete visual cue remains.
          return false;
        }
      })().finally(() => {
        pending = undefined;
      });
      return pending;
    },
    update(settings = {}, active = false) {
      volume = settings.muted ? 0 : clamp(settings.volume);
      running = !!active && !disposed && volume > 0;
      if (!running) {
        silence();
        return;
      }
      if (!master) return;
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setTargetAtTime(volume * 0.55, context.currentTime, 0.025);
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
      const kind = event.payload?.kind;
      let notes;
      let gain = 0.06;
      if (event.type === 'pickup-activate')
        notes = kind === 'vector' ? [165, 330, 0.42] : [660, 990, 0.35];
      else if (event.type === 'shield-hit') {
        notes = [220, 70, 0.23];
        gain = 0.11;
      } else if (event.type === 'pickup-expire')
        notes = kind === 'aegis' ? [540, 270, 0.25] : [210, 155, 0.18];
      else if (event.type === 'pickup-unavailable') {
        notes = [280, 250, 0.08];
        gain = 0.025;
      } else if (event.type === 'pickup-cancel') {
        notes = [190, 110, 0.14];
        gain = 0.035;
      } else return;
      const [from, to, duration] = notes;
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = event.type === 'shield-hit' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(from, now);
      oscillator.frequency.exponentialRampToValueAtTime(
        to,
        now + duration * 0.8,
      );
      envelope.gain.setValueAtTime(0, now);
      envelope.gain.linearRampToValueAtTime(gain, now + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      envelope.gain.linearRampToValueAtTime(0, now + duration + 0.02);
      oscillator.connect(envelope).connect(master);
      let stopped = false;
      const shot = {
        stop() {
          if (stopped) return;
          stopped = true;
          oscillator.onended = null;
          oscillator.stop();
          oscillator.disconnect();
          envelope.disconnect();
          shots.delete(shot);
        },
      };
      oscillator.onended = shot.stop;
      shots.add(shot);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.025);
    },
    silence,
    getStatus() {
      return {
        unlocked: context?.state === 'running',
        active: running,
        volume,
        shots: shots.size,
        disposed,
      };
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      silence();
      await pending;
      master?.disconnect();
      if (context && context.state !== 'closed')
        await context.close().catch(() => {});
    },
  };
}
