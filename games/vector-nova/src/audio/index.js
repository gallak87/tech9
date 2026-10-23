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
      const champion = event?.type === 'cup-champion';
      if (!resources || disposed || !audible || (resultsActive && !champion))
        return;
      const { context, bus, cueBus, shots } = resources;
      const sample = raceSample(event);
      const buffer = sample && resources.samples.get(sample.id);
      const countdown =
        event?.type === 'countdown-beep' || event?.type === 'countdown-go';
      // Countdown retains its original tones; authored cues have no fallback.
      if (!buffer && !countdown) return;
      const finish = event.type === 'player-race-complete' || champion;
      if (champion && [...shots].some((shot) => shot.champion)) return;
      const finalLap = event.type === 'final-lap';
      if (finish || finalLap)
        for (const shot of shots)
          if (!shot.finish) {
            shot.stop();
            shots.delete(shot);
          }
      if (shots.size >= 4) return;
      // Schedule against the actual finish voice, including any remaining tail.
      const time = champion
        ? Math.max(
            context.currentTime + 0.6,
            ...[...shots]
              .filter((shot) => shot.finish)
              .map((shot) => shot.endsAt + 0.25),
          )
        : context.currentTime;
      const source = countdown
        ? context.createOscillator()
        : context.createBufferSource();
      const envelope = context.createGain();
      source
        .connect(envelope)
        .connect(countdown || event.type === 'impact' ? bus : cueBus);
      envelope.gain.setValueAtTime(0, time);
      let end;
      if (countdown) {
        const go = event.type === 'countdown-go';
        const duration = go ? 0.76 : 0.27;
        const peak = go ? 0.095 : 0.075;
        source.type = 'sine';
        source.frequency.setValueAtTime(go ? 960 : 480, time);
        envelope.gain.linearRampToValueAtTime(peak, time + 0.012);
        envelope.gain.setValueAtTime(peak, time + (go ? 0.54 : 0.16));
        envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        end = go ? 0.78 : 0.29;
      } else {
        source.buffer = buffer;
        end = buffer.duration;
        envelope.gain.setValueAtTime(champion ? 0 : sample.gain, time);
        if (champion)
          envelope.gain.linearRampToValueAtTime(sample.gain, time + 0.008);
        envelope.gain.setValueAtTime(
          sample.gain,
          time + Math.max(0, end - 0.01),
        );
      }
      envelope.gain.linearRampToValueAtTime(0, time + end);
      source.start(time);
      source.stop(time + end + 0.01);
      let ended = false;
      const shot = {
        finish,
        champion,
        endsAt: time + end + 0.01,
        stop() {
          if (ended) return;
          ended = true;
          source.onended = null;
          source.stop();
          source.disconnect();
          envelope.disconnect();
        },
      };
      shots.add(shot);
      source.onended = () => {
        ended = true;
        source.onended = null;
        shots.delete(shot);
        source.disconnect();
        envelope.disconnect();
      };
      return time - context.currentTime;
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
