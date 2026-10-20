import { createImmersionMix } from '../audio/immersion.js';

const clamp = (value) =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

import { deviceCue, createDeviceNoise } from './sound-design.js';
import { DEVICE_SAMPLES, deviceSample } from './sample-cues.js';

// This bus owns only immediate road-device cues. It never writes vehicle state.
export function createPickupAudio({
  createContext = () => new AudioContext(),
  immersion = false,
  samples = DEVICE_SAMPLES,
  fetchAudio = (url, options) => fetch(url, options),
} = {}) {
  let context;
  let master;
  let compressor;
  let noise;
  let beds = [];
  let waterMix;
  let pending;
  let disposed = false;
  let running = false;
  let volume = 0;
  const buffers = new Map();
  const requests = new AbortController();
  const shots = new Set();
  const tails = new Set();
  const stopShots = () => {
    for (const shot of [...shots, ...tails]) shot.stop();
    shots.clear();
    tails.clear();
  };
  function silence() {
    running = false;
    stopShots();
    for (const bed of beds) {
      bed.gain.gain.cancelScheduledValues(context.currentTime);
      bed.gain.gain.setValueAtTime(0, context.currentTime);
    }
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
            compressor = context.createDynamicsCompressor();
            compressor.threshold.value = -10;
            compressor.knee.value = 8;
            compressor.ratio.value = 4;
            compressor.attack.value = 0.002;
            compressor.release.value = 0.16;
            master
              .connect(compressor)
              .connect(waterMix?.input ?? context.destination);
            noise = createDeviceNoise(context);
            beds = ['vector', 'ion'].map((kind) => {
              const source = context.createBufferSource();
              source.buffer = noise;
              source.loop = true;
              source.loopStart = 0.025;
              const filter = context.createBiquadFilter();
              filter.type = 'bandpass';
              filter.Q.value = 0.65;
              filter.frequency.value = kind === 'vector' ? 2400 : 780;
              const gain = context.createGain();
              gain.gain.value = 0;
              source.connect(filter).connect(gain).connect(master);
              source.start();
              return { kind, source, filter, gain };
            });
          }
          await context.resume();
          if (!disposed && context.state === 'running')
            await Promise.all(
              Object.entries(samples).map(async ([id, url]) => {
                if (buffers.has(id)) return;
                try {
                  const response = await fetchAudio(url, {
                    signal: requests.signal,
                  });
                  if (!response.ok) return;
                  const bytes = await response.arrayBuffer();
                  if (disposed) return;
                  const buffer = await context.decodeAudioData(bytes);
                  if (!disposed) buffers.set(id, buffer);
                } catch {
                  // A missing sample retains the original procedural cue.
                }
              }),
            );
          return !disposed && context.state === 'running';
        } catch {
          // Unsupported/blocked audio is optional; the complete visual cue remains.
          for (const bed of beds) {
            bed.source.stop();
            bed.source.disconnect();
            bed.filter.disconnect();
            bed.gain.disconnect();
          }
          beds = [];
          compressor?.disconnect();
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
      master.gain.setTargetAtTime(volume * 0.95, context.currentTime, 0.025);
    },
    setEffects(effects = {}) {
      if (!context) return;
      for (const bed of beds) {
        bed.gain.gain.cancelScheduledValues(context.currentTime);
        bed.gain.gain.setTargetAtTime(
          running && effects[bed.kind] ? (bed.kind === 'ion' ? 0.07 : 0.09) : 0,
          context.currentTime,
          0.045,
        );
      }
    },
    event(event) {
      if (!running || disposed || !context || context.state !== 'running')
        return;
      const notes = deviceCue(event);
      const sample = deviceSample(event);
      const buffer = sample && buffers.get(sample.id);
      if (!notes.length && !buffer) return;
      const priority = /hit|fire|confirm|contact/.test(event.type)
        ? 3
        : event.type === 'pickup-activate'
          ? 2
          : 1;
      if (shots.size >= 4) {
        const victim = [...shots].sort((a, b) => a.priority - b.priority)[0];
        if (victim.priority > priority) return;
        victim.stop(true);
      }
      const now = context.currentTime;
      const voices = [];
      const shot = {
        priority,
        stop(soft = false) {
          if (soft && tails.size >= 4) tails.values().next().value.stop();
          for (const voice of voices) {
            if (voice.ended) continue;
            if (soft) {
              voice.envelope.gain.cancelAndHoldAtTime(context.currentTime);
              voice.envelope.gain.linearRampToValueAtTime(
                0,
                context.currentTime + 0.008,
              );
              voice.oscillator.stop(context.currentTime + 0.01);
              continue;
            }
            voice.ended = true;
            voice.oscillator.onended = null;
            voice.oscillator.stop();
            voice.oscillator.disconnect();
            voice.envelope.disconnect();
            voice.filter?.disconnect();
          }
          shots.delete(shot);
          if (soft) tails.add(shot);
          else tails.delete(shot);
        },
      };
      shots.add(shot);
      if (buffer) {
        const oscillator = context.createBufferSource();
        const envelope = context.createGain();
        oscillator.buffer = buffer;
        envelope.gain.value = sample.gain;
        const voice = { oscillator, envelope, ended: false };
        voices.push(voice);
        oscillator.connect(envelope).connect(master);
        oscillator.onended = () => {
          voice.ended = true;
          oscillator.disconnect();
          envelope.disconnect();
          shots.delete(shot);
          tails.delete(shot);
        };
        oscillator.start(now);
        return;
      }
      for (const [
        type,
        from,
        to,
        duration,
        gain,
        delay = 0,
        attack = 0.008,
      ] of notes) {
        const start = now + delay;
        const oscillator =
          type === 'noise'
            ? context.createBufferSource()
            : context.createOscillator();
        const filter = type === 'noise' ? context.createBiquadFilter() : null;
        const envelope = context.createGain();
        const voice = { oscillator, envelope, filter, ended: false };
        voices.push(voice);
        if (filter) {
          oscillator.buffer = noise;
          filter.type = 'bandpass';
          filter.Q.value = 0.65;
        } else oscillator.type = type;
        const frequency = filter?.frequency ?? oscillator.frequency;
        frequency.setValueAtTime(from, start);
        frequency.exponentialRampToValueAtTime(to, start + duration * 0.8);
        envelope.gain.setValueAtTime(0, now);
        envelope.gain.setValueAtTime(0, start);
        envelope.gain.linearRampToValueAtTime(gain, start + attack);
        envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        envelope.gain.linearRampToValueAtTime(0, start + duration + 0.02);
        if (filter) oscillator.connect(filter).connect(envelope);
        else oscillator.connect(envelope);
        envelope.connect(master);
        oscillator.onended = () => {
          voice.ended = true;
          oscillator.disconnect();
          envelope.disconnect();
          filter?.disconnect();
          if (voices.every((entry) => entry.ended)) {
            shots.delete(shot);
            tails.delete(shot);
          }
        };
        oscillator.start(start);
        oscillator.stop(start + duration + 0.025);
      }
    },
    silence,
    duration(event) {
      const sample = deviceSample(event);
      const buffer = sample && buffers.get(sample.id);
      if (buffer) return buffer.duration;
      return Math.max(
        0,
        ...deviceCue(event).map((note) => note[3] + (note[5] ?? 0) + 0.025),
      );
    },
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
      requests.abort();
      silence();
      await pending;
      for (const bed of beds) {
        bed.source.stop();
        bed.source.disconnect();
        bed.filter.disconnect();
        bed.gain.disconnect();
      }
      beds = [];
      compressor?.disconnect();
      master?.disconnect();
      waterMix?.dispose();
      buffers.clear();
      if (context && context.state !== 'closed')
        await context.close().catch(() => {});
    },
  };
}
