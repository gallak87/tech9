import { smooth } from '../audio/propulsion.js';

const clamp = (value) => Math.max(0, Math.min(1, value));
const ease = (value) => value * value * (3 - 2 * value);

// A separate motor RPM gesture follows the finale drift phase. It never feeds
// an invented speed into propulsion or changes ordinary driving audio.
export function createCompletionRevAudio(context, destination) {
  const motor = context.createOscillator();
  motor.setPeriodicWave(
    context.createPeriodicWave(
      new Float32Array(6),
      new Float32Array([0, 1, 0.18, 0.07, 0.025, 0.008]),
    ),
  );
  motor.frequency.value = 100;
  const body = context.createBiquadFilter();
  body.type = 'lowpass';
  body.frequency.value = 900;
  body.Q.value = 0.5;
  const level = context.createGain();
  level.gain.value = 0;
  motor.connect(body).connect(level).connect(destination);
  motor.start();
  let disposed = false;
  const cancel = () => {
    for (const [param, value] of [
      [level.gain, 0],
      [motor.frequency, 100],
    ]) {
      param.cancelScheduledValues(context.currentTime);
      param.setValueAtTime(value, context.currentTime);
    }
  };
  return {
    update(actor, { reducedMotion = false } = {}) {
      if (disposed) return;
      if (reducedMotion) {
        cancel();
        return;
      }
      const slide = actor?.effects?.slide;
      const active =
        slide?.active === true &&
        slide.phase === 'drifting' &&
        Number.isFinite(slide.progress) &&
        actor.grounded === true &&
        !actor.recovering &&
        actor.race?.complete === true;
      const progress = active ? clamp(slide.progress) : 0;
      const rpm = active ? 100 + ease(clamp(progress / 0.8)) * 160 : 85;
      const envelope = active
        ? ease(clamp(progress / 0.24)) * (1 - progress * 0.2)
        : 0;
      smooth(motor.frequency, rpm, context.currentTime, active ? 0.035 : 0.13);
      smooth(body.frequency, 900 + progress * 800, context.currentTime, 0.07);
      smooth(
        level.gain,
        envelope * 0.045,
        context.currentTime,
        active ? 0.035 : 0.1,
      );
    },
    cancel() {
      if (!disposed) cancel();
    },
    dispose() {
      if (disposed) return;
      cancel();
      disposed = true;
      motor.stop();
      for (const node of [motor, body, level]) node.disconnect();
    },
  };
}
