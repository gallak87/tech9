import { createPropulsion } from '../audio/propulsion.js';
import { createSampleBank } from '../audio/sample-bank.js';
import { DEVICE_SAMPLES } from '../pickups/sample-cues.js';
import { RACE_SAMPLES } from '../audio/sample-cues.js';
import { effectsVolume } from '../progression/index.js';
import { completionCueForEvent } from './completion-timeline.js';

// Reuse the game's authored weapons, jump and victory cues. A separate effects
// bus follows the same saved master/effects controls and owns no music player.
export function createCompletionAudio(settings) {
  const readSettings = () =>
    typeof settings === 'function' ? settings() : (settings ?? {});
  const AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!AudioContext || effectsVolume(readSettings()) === 0) return null;
  let context;
  try {
    context = new AudioContext();
  } catch {
    return null;
  }
  const master = context.createGain();
  master.gain.value = 0;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.knee.value = 15;
  compressor.ratio.value = 5;
  master.connect(compressor).connect(context.destination);
  const engineGain = context.createGain();
  engineGain.gain.value = 0.65;
  engineGain.connect(master);
  const propulsion = createPropulsion(context, engineGain);
  const bank = createSampleBank(context, {
    ...DEVICE_SAMPLES,
    'race-winner': RACE_SAMPLES['race-winner'],
    'race-finisher': RACE_SAMPLES['race-finisher'],
  });
  void bank.prepare();
  const sources = new Set();
  let disposed = false,
    paused = true,
    previousTime = -1e-8;
  const stopSources = () => {
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        /* A finished cue is already silent. */
      }
    }
    sources.clear();
  };
  const play = (id, gain) => {
    const buffer = bank.get(id);
    if (!buffer || context.state !== 'running') return;
    const source = context.createBufferSource();
    const level = context.createGain();
    source.buffer = buffer;
    level.gain.value = gain;
    source.connect(level).connect(master);
    sources.add(source);
    source.onended = () => {
      sources.delete(source);
      source.disconnect();
      level.disconnect();
    };
    source.start();
  };
  return {
    update(sample) {
      if (disposed || paused) return;
      const volume = effectsVolume(readSettings());
      master.gain.setTargetAtTime(volume, context.currentTime, 0.05);
      const hero = sample.hero.state ?? sample.hero;
      propulsion.update({
        speed: hero.speed,
        time: sample.time,
        boosting: hero.boosting ?? sample.hero.boost,
        steer: hero.steer ?? sample.hero.input?.steer ?? 0,
      });
      const played = new Set();
      for (const event of sample.eventsThroughTime ?? sample.events ?? [])
        if (
          event.time > previousTime &&
          event.time <= sample.time &&
          sample.time - event.time < 0.2 &&
          volume > 0
        ) {
          const cue = completionCueForEvent(event);
          if (!cue) continue;
          const key = `${cue.id}:${Math.round(event.time * 120)}`;
          if (!played.has(key)) play(cue.id, cue.gain);
          played.add(key);
        }
      previousTime = sample.time;
    },
    pause() {
      if (disposed) return;
      paused = true;
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.value = 0;
      stopSources();
      void context.suspend().catch(() => {});
    },
    resume() {
      if (disposed) return;
      paused = false;
      void context.resume().catch(() => {});
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      master.gain.value = 0;
      stopSources();
      bank.dispose();
      propulsion.dispose();
      engineGain.disconnect();
      master.disconnect();
      compressor.disconnect();
      void context.close().catch(() => {});
    },
  };
}
