import { createPropulsion, smooth } from './propulsion.js';
import { createNacreThunder } from './nacre-thunder.js';
import { createImmersionMix } from './immersion.js';
import { createSampleBank } from './sample-bank.js';
import { RACE_SAMPLES, raceSample } from './sample-cues.js';

const close = (context) => {
  if (context.state === 'closed') return Promise.resolve();
  return context.close().catch(() => {});
};

export function createAudio({
  createContext = () => new AudioContext(),
  nacre = false,
  environment,
  immersion = false,
  engine = true,
  samples = RACE_SAMPLES,
  fetchAudio = (url, options) => fetch(url, options),
} = {}) {
  let resources;
  let unlocking;
  let disposed = false;
  let disposal;
  let active = false;
  let audible = false;
  let mixReady = false;
  let environmentActive = false;
  let resultsActive = false;

  function release(owned) {
    owned.samples.dispose();
    owned.propulsion?.dispose();
    owned.thunder?.dispose();
    owned.environment?.dispose();
    for (const shot of owned.shots) shot.stop();
    owned.shots.clear();
    owned.bus.disconnect();
    owned.compressor.disconnect();
    owned.master.disconnect();
    owned.propulsionBus.disconnect();
    owned.cueBus.disconnect();
    owned.immersion?.dispose();
    return close(owned.context);
  }

  return {
    unlock() {
      if (disposed) return Promise.resolve(false);
      if (unlocking) {
        // A blocked Safari resume promise can remain pending until a gesture.
        // Retry resume inside that gesture instead of only returning the promise.
        if (resources?.context.state === 'suspended')
          void resources.context.resume().catch(() => {});
        return unlocking;
      }
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
            const waterMix = immersion
              ? createImmersionMix(context, compressor)
              : null;
            bus.connect(waterMix?.input ?? compressor);
            compressor.connect(master).connect(context.destination);
            const propulsionBus = context.createGain();
            propulsionBus.gain.value = 0;
            propulsionBus.connect(bus);
            const propulsion = engine
              ? createPropulsion(context, propulsionBus)
              : null;
            // Race announcements stay clear of the world's immersion filter;
            // they still obey the common effects volume and output limiter.
            const cueBus = context.createGain();
            cueBus.gain.value = 1;
            cueBus.connect(compressor);
            resources = {
              context,
              samples: createSampleBank(context, samples, { fetchAudio }),
              bus,
              compressor,
              master,
              propulsionBus,
              propulsion,
              cueBus,
              immersion: waterMix,
              thunder: nacre
                ? createNacreThunder(context, bus, {
                    immersionAtOutput: Boolean(waterMix),
                  })
                : null,
              environment: environment?.(context, bus),
              shots: new Set(),
            };
          }
          await resources.context.resume();
          if (!disposed && resources.context.state === 'running')
            await resources.samples.prepare();
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
    update(
      state,
      volume,
      running,
      { countdown = false, results = false } = {},
    ) {
      resultsActive = results;
      active = (!!running || countdown || results) && !disposed;
      if (!resources || disposed) return;
      const { context, master, propulsion, propulsionBus } = resources;
      const level = Number.isFinite(volume)
        ? Math.max(0, Math.min(1, volume))
        : 0;
      audible = active && level > 0;
      environmentActive = !!running && audible;
      // Set the bus before its first transient instead of swallowing the attack.
      if (audible && !mixReady) {
        master.gain.cancelScheduledValues(context.currentTime);
        master.gain.setValueAtTime(level, context.currentTime);
      } else
        smooth(
          master.gain,
          active ? level : 0,
          context.currentTime,
          active ? 0.06 : 0.012,
        );
      mixReady = audible;
      smooth(propulsionBus.gain, running ? 1 : 0, context.currentTime, 0.012);
      if (running) propulsion?.update(state);
      if (!environmentActive) {
        resources.environment?.stop();
        resources.thunder?.stop();
      }
      for (const shot of resources.shots)
        if (!audible || (results && !shot.finish)) {
          shot.stop();
          resources.shots.delete(shot);
        }
    },
    resetEnvironment() {
      resources?.thunder?.stop();
      resources?.environment?.stop();
      if (resources)
        for (const shot of resources.shots)
          if (shot.finish) {
            shot.stop();
            resources.shots.delete(shot);
          }
    },
    setImmersion(submerged) {
      resources?.immersion?.update(submerged);
    },
    getStatus() {
      return {
        active,
        audible,
        loadedSamples: resources?.samples.loaded() ?? [],
        missingSamples: resources?.samples.missing() ?? Object.keys(samples),
        immersion: resources?.immersion?.getStatus() ?? null,
      };
    },
    getPresentation() {
      return (
        resources?.thunder?.getPresentation() ??
        resources?.environment?.getPresentation() ??
        null
      );
    },
    duration(event) {
      const sample = raceSample(event);
      return sample ? (resources?.samples.get(sample.id)?.duration ?? 0) : 0;
    },
    event(event) {
      if (resources && !disposed && environmentActive)
        resources.environment?.trigger(event);
      if (event?.type === 'nacre-thunder') {
        if (resources && !disposed && environmentActive)
          resources.thunder?.trigger(event);
        return;
      }
      // Countdown and contact cues share the unlocked, volume-controlled bus.
      if (
        !resources ||
        disposed ||
        !audible ||
        resultsActive ||
        ![
          'impact',
          'lap',
          'countdown-beep',
          'countdown-go',
          'final-lap',
          'player-race-complete',
        ].includes(event?.type)
      )
        return;
      const { context, bus, cueBus, shots } = resources;
      const sample = raceSample(event);
      const buffer = sample && resources.samples.get(sample.id);
      // A shield owns its block sound. Missing authored collisions stay silent.
      if (event.type === 'impact' && !buffer) return;
      const finish = event.type === 'player-race-complete';
      const finalLap = event.type === 'final-lap';
      if (finish || finalLap)
        for (const shot of shots)
          if (!shot.finish) {
            shot.stop();
            shots.delete(shot);
          }
      if (shots.size >= 4) return;
      const time = context.currentTime;
      const oscillator = buffer
        ? context.createBufferSource()
        : context.createOscillator();
      const envelope = context.createGain();
      oscillator.connect(envelope).connect(finish || finalLap ? cueBus : bus);
      envelope.gain.setValueAtTime(0, time);
      let end;
      if (buffer) {
        oscillator.buffer = buffer;
        end = buffer.duration;
        envelope.gain.setValueAtTime(sample.gain, time);
        envelope.gain.setValueAtTime(
          sample.gain,
          time + Math.max(0, end - 0.01),
        );
      } else if (finish || finalLap) {
        const winner =
          event.payload?.valid !== false && event.payload?.position === 1;
        const notes = finalLap
          ? [660, 880]
          : event.payload?.valid === false
            ? [440, 349.23]
            : winner
              ? [523.25, 659.25, 783.99, 1046.5]
              : [587.33, 783.99];
        const gap = finalLap ? 0.19 : 0.17;
        end = finalLap ? 0.55 : winner ? 2.05 : 1.7;
        oscillator.type = 'sine';
        notes.forEach((frequency, index) => {
          const start = time + gap * index;
          const release =
            index === notes.length - 1 ? time + end - 0.03 : start + gap - 0.02;
          oscillator.frequency.setValueAtTime(frequency, start);
          envelope.gain.setValueAtTime(0.0001, start);
          envelope.gain.linearRampToValueAtTime(
            finalLap ? 0.065 : 0.09,
            start + 0.012,
          );
          envelope.gain.exponentialRampToValueAtTime(0.0001, release);
        });
      } else if (
        event.type === 'countdown-beep' ||
        event.type === 'countdown-go'
      ) {
        const go = event.type === 'countdown-go';
        const duration = go ? 0.76 : 0.27;
        const peak = go ? 0.095 : 0.075;
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(go ? 960 : 480, time);
        envelope.gain.linearRampToValueAtTime(peak, time + 0.012);
        envelope.gain.setValueAtTime(peak, time + (go ? 0.54 : 0.16));
        envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      } else {
        oscillator.frequency.setValueAtTime(550, time);
        oscillator.frequency.setValueAtTime(550, time + 0.1);
        oscillator.frequency.exponentialRampToValueAtTime(825, time + 0.12);
        envelope.gain.linearRampToValueAtTime(0.07, time + 0.008);
        envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.4);
      }
      end ??=
        event.type === 'countdown-beep'
          ? 0.29
          : event.type === 'countdown-go'
            ? 0.78
            : 0.44;
      envelope.gain.linearRampToValueAtTime(0, time + end);
      oscillator.start();
      oscillator.stop(time + end + 0.01);
      let ended = false;
      const shot = {
        finish,
        stop() {
          if (ended) return;
          ended = true;
          oscillator.onended = null;
          oscillator.stop();
          oscillator.disconnect();
          envelope.disconnect();
        },
      };
      shots.add(shot);
      oscillator.onended = () => {
        ended = true;
        oscillator.onended = null;
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
      owned.samples.dispose();
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
