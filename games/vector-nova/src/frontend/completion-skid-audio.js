import { smooth } from '../audio/propulsion.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = (value) => (Number.isFinite(value) ? value : 0);

// Observe the native post-finish slide; neither steering input alone nor the
// camera's slide shot can produce sound without actual sideways motion.
function slideIntensity(actor) {
  const slide = actor?.effects?.slide;
  if (
    !slide?.active ||
    actor.grounded !== true ||
    actor.recovering ||
    actor.race?.complete !== true
  )
    return 0;
  const braking = actor.input?.airbrake
    ? 1
    : clamp(finite(actor.input?.brake), 0, 1);
  // Native slip already supplies the motion intensity. Forward speed only
  // fades the breath near standstill, including a deliberately slow slide.
  return (
    clamp((Math.abs(finite(slide.slipSpeed)) - 0.1) / 8, 0, 1) *
    clamp((finite(actor.state?.speed) - 2) / 18, 0, 1) *
    braking
  );
}

// A quiet magnetic air-brake breath below the existing propulsion bed. It has
// no pitched/squealing component, sample asset, timer, or independently owned bus.
export function createCompletionSkidAudio(context, destination) {
  const buffer = context.createBuffer(
    1,
    Math.round(context.sampleRate * 1.5),
    context.sampleRate,
  );
  const data = buffer.getChannelData(0);
  let seed = 3911;
  for (let index = 0; index < data.length; index++) {
    seed = (seed * 16807) % 2147483647;
    data[index] = seed / 1073741824 - 1;
  }
  const wrap = Math.round(context.sampleRate * 0.025);
  for (let index = 0; index < wrap; index++) {
    const mix = index / (wrap - 1);
    const tail = data.length - wrap + index;
    data[tail] = data[tail] * (1 - mix) + data[index] * mix;
  }

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.loopStart = wrap / context.sampleRate;
  source.loopEnd = buffer.duration;
  const highpass = context.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 140;
  highpass.Q.value = 0.5;
  const lowpass = context.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 850;
  lowpass.Q.value = 0.5;
  const softener = context.createBiquadFilter();
  softener.type = 'lowpass';
  softener.frequency.value = 1800;
  softener.Q.value = 0.5;
  const level = context.createGain();
  level.gain.value = 0;
  source.connect(highpass).connect(lowpass).connect(softener).connect(level);
  level.connect(destination);
  source.start();
  let disposed = false,
    previousIntensity = 0;
  const cancel = () => {
    level.gain.cancelScheduledValues(context.currentTime);
    level.gain.setValueAtTime(0, context.currentTime);
    previousIntensity = 0;
  };
  return {
    update(actor, { reducedMotion = false } = {}) {
      if (disposed) return;
      if (reducedMotion) {
        cancel();
        return;
      }
      const intensity = slideIntensity(actor);
      smooth(
        level.gain,
        intensity * 0.028,
        context.currentTime,
        intensity > previousIntensity ? 0.04 : 0.11,
      );
      smooth(
        lowpass.frequency,
        850 + intensity * 450,
        context.currentTime,
        0.08,
      );
      previousIntensity = intensity;
    },
    cancel() {
      if (!disposed) cancel();
    },
    dispose() {
      if (disposed) return;
      cancel();
      disposed = true;
      source.stop();
      for (const node of [source, highpass, lowpass, softener, level])
        node.disconnect();
      source.buffer = null;
    },
  };
}
