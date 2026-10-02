import { createPropulsion, smooth } from './propulsion.js';
import { createNacreThunder } from './nacre-thunder.js';

const close = (context) => {
  if (context.state === 'closed') return Promise.resolve();
  return context.close().catch(() => {});
};

export function createAudio({
  createContext = () => new AudioContext(),
  nacre = false,
  environment,
} = {}) {
  let resources;
  let unlocking;
  let disposed = false;
  let disposal;
  let active = false;
  let audible = false;

  function release(owned) {
    owned.propulsion.dispose();
    owned.thunder?.dispose();
    owned.environment?.dispose();
    for (const shot of owned.shots) shot.stop();
    owned.shots.clear();
    owned.bus.disconnect();
    owned.compressor.disconnect();
    owned.master.disconnect();
    return close(owned.context);
  }

  return {
    unlock() {
      if (disposed) return Promise.resolve(false);
      if (unlocking) return unlocking;
      unlocking = (async () => {
        let context;
        try {
          if (!resources) {
            context = createContext();
            const bus = context.createBiquadFilter();
            bus.type = 'highpass';
            bus.frequency.value = 24;
            bus.Q.value = 0.5;
            const compressor = context.createDynamicsCompressor();
            compressor.threshold.value = -12;
            compressor.knee.value = 10;
            compressor.ratio.value = 3;
            compressor.attack.value = 0.008;
            compressor.release.value = 0.18;
            const master = context.createGain();
            master.gain.value = 0;
            bus
              .connect(compressor)
              .connect(master)
              .connect(context.destination);
            const propulsion = createPropulsion(context, bus);
            resources = {
              context,
              bus,
              compressor,
              master,
              propulsion,
              thunder: nacre ? createNacreThunder(context, bus) : null,
              environment: environment?.(context, bus),
              shots: new Set(),
            };
          }
          await resources.context.resume();
          return !disposed && resources.context.state === 'running';
        } catch {
          if (resources) {
            const failed = resources;
            resources = undefined;
            await release(failed);
          } else if (context) await close(context);
          return false;
        }
      })().finally(() => {
        unlocking = undefined;
      });
      return unlocking;
    },
    update(state, volume, running) {
      active = !!running && !disposed;
      if (!resources || disposed) return;
      const { context, master, propulsion } = resources;
      const level = Number.isFinite(volume)
        ? Math.max(0, Math.min(1, volume))
        : 0;
      audible = active && level > 0;
      smooth(
        master.gain,
        active ? level : 0,
        context.currentTime,
        active ? 0.06 : 0.012,
      );
      propulsion.update(state);
      if (!active || level === 0) {
        resources.thunder?.stop();
        resources.environment?.stop();
      }
    },
    resetEnvironment() {
      resources?.thunder?.stop();
      resources?.environment?.stop();
    },
    getPresentation() {
      return (
        resources?.thunder?.getPresentation() ??
        resources?.environment?.getPresentation() ??
        null
      );
    },
    event(event) {
      if (resources && !disposed && audible)
        resources.environment?.trigger(event);
      if (event?.type === 'nacre-thunder') {
        if (resources && !disposed && audible)
          resources.thunder?.trigger(event);
        return;
      }
      // Retain the existing contact/lap cues; broader effects are a later phase.
      if (
        !resources ||
        disposed ||
        !active ||
        !['impact', 'lap'].includes(event?.type)
      )
        return;
      const { context, bus, shots } = resources;
      if (shots.size >= 4) return;
      const time = context.currentTime;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.connect(envelope).connect(bus);
      envelope.gain.setValueAtTime(0, time);
      if (event.type === 'impact') {
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(92, time);
        oscillator.frequency.exponentialRampToValueAtTime(28, time + 0.2);
        envelope.gain.linearRampToValueAtTime(0.12, time + 0.004);
        envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.25);
      } else {
        oscillator.frequency.setValueAtTime(550, time);
        oscillator.frequency.setValueAtTime(550, time + 0.1);
        oscillator.frequency.exponentialRampToValueAtTime(825, time + 0.12);
        envelope.gain.linearRampToValueAtTime(0.07, time + 0.008);
        envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.4);
      }
      envelope.gain.linearRampToValueAtTime(0, time + 0.44);
      oscillator.start();
      oscillator.stop(time + 0.45);
      const shot = {
        stop() {
          oscillator.onended = null;
          oscillator.stop();
          oscillator.disconnect();
          envelope.disconnect();
        },
      };
      shots.add(shot);
      oscillator.onended = () => {
        shots.delete(shot);
        oscillator.disconnect();
        envelope.disconnect();
      };
    },
    dispose() {
      if (disposed) return disposal || Promise.resolve();
      disposed = true;
      active = false;
      if (!resources) return Promise.resolve();
      const owned = resources;
      smooth(owned.master.gain, 0, owned.context.currentTime, 0.008);
      // Let a running output fade below audibility before closing the device.
      // Suspended audio has no output and can be released immediately.
      disposal = new Promise((resolve) => {
        if (owned.context.state === 'running') setTimeout(resolve, 64);
        else resolve();
      }).then(() => release(owned));
      return disposal;
    },
  };
}
