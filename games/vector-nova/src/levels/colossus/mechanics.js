import * as T from 'three';
import { smooth } from './track/model.js';

export const PRESS_RULES = Object.freeze({
  period: 6.4,
  warning: 1.65,
  fall: 0.24,
  hold: 2.35,
  rise: 1.05,
  clearance: 27,
  minimum: 0.4,
});
export function samplePress(time, press) {
  const phase =
    (((time + press.phaseOffset) % PRESS_RULES.period) + PRESS_RULES.period) %
    PRESS_RULES.period;
  const fallEnd = PRESS_RULES.warning + PRESS_RULES.fall;
  const riseStart = fallEnd + PRESS_RULES.hold;
  const closure =
    phase < PRESS_RULES.warning
      ? 0
      : phase < fallEnd
        ? smooth((phase - PRESS_RULES.warning) / PRESS_RULES.fall)
        : phase < riseStart
          ? 1
          : 1 - smooth((phase - riseStart) / PRESS_RULES.rise);
  return {
    phase,
    closure,
    warning: phase < PRESS_RULES.warning,
    bottom: T.MathUtils.lerp(
      PRESS_RULES.clearance,
      PRESS_RULES.minimum,
      closure,
    ),
    active: closure > 0.8,
  };
}
export function pressPose(track, press, time) {
  const frame = track.sample(press.distance);
  return {
    position: frame.position
      .clone()
      .addScaledVector(frame.right, press.lateral)
      .addScaledVector(
        frame.up,
        samplePress(time, press).bottom + press.height / 2,
      ),
    quaternion: frame.quaternion,
  };
}
export function sampleCrossfeed(track, distance, lateral, time) {
  distance = T.MathUtils.euclideanModulo(distance, track.length);
  const belt = track.belts.find(
    (b) => distance >= b.start && distance <= b.end,
  );
  if (!belt || belt.side * lateral < -9) return null;
  const envelope =
    smooth((distance - belt.start) / 24) * smooth((belt.end - distance) / 24);
  const pulse = 0.82 + 0.18 * Math.sin(time * 0.9);
  return {
    id: belt.id,
    side: belt.side,
    envelope,
    lateralAcceleration: belt.side * 19 * envelope * pulse,
    forwardAcceleration: -7 * envelope,
    grip: 0.58,
  };
}

export const EJECTOR_RULES = Object.freeze({
  period: 6.8,
  warning: 1.15,
  stroke: 0.38,
  hold: 0.6,
  retract: 1.65,
  parked: -58,
  extended: 48,
});
export function sampleEjector(time, ejector) {
  const R = EJECTOR_RULES;
  const phase = T.MathUtils.euclideanModulo(
    time + ejector.phaseOffset,
    R.period,
  );
  const end = R.warning + R.stroke,
    back = end + R.hold;
  const extension =
    phase < R.warning
      ? 0
      : phase < end
        ? smooth((phase - R.warning) / R.stroke)
        : phase < back
          ? 1
          : 1 - smooth((phase - back) / R.retract);
  const clearance =
    22 *
    smooth((phase - end) / 0.5) *
    (1 - smooth((phase - back - R.retract) / 0.8));
  return {
    phase,
    extension,
    clearance,
    warning: phase < R.warning,
    striking: phase >= R.warning && phase < end,
    lateral: ejector.side * T.MathUtils.lerp(R.parked, R.extended, extension),
  };
}
export function ejectorPose(track, ejector, time) {
  const frame = track.sample(ejector.distance),
    phase = sampleEjector(time, ejector);
  return {
    position: frame.position
      .clone()
      .addScaledVector(frame.right, phase.lateral)
      .addScaledVector(frame.up, ejector.height / 2 + 0.4 + phase.clearance),
    quaternion: frame.quaternion,
  };
}
