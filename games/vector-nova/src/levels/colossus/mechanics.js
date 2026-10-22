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
// The tread clock is shared by the rendered slats, exposed drive drums and
// contact response. +side always feeds towards that road shoulder.
export const CROSSFEED_RULES = Object.freeze({
  speed: 8,
  treadPitch: 4.2,
  inner: -9,
  outer: 35,
  acceleration: 19,
  drag: 7,
  grip: 0.58,
  entryLength: 24,
  contactEnvelope: 0.15,
  contactInterval: 0.28,
});
export function crossfeedTravel(time) {
  return time * CROSSFEED_RULES.speed;
}
export function crossfeedBounds(belt) {
  return belt.side > 0
    ? { min: CROSSFEED_RULES.inner, max: CROSSFEED_RULES.outer }
    : { min: -CROSSFEED_RULES.outer, max: -CROSSFEED_RULES.inner };
}
export function sampleCrossfeed(track, distance, lateral, time) {
  distance = T.MathUtils.euclideanModulo(distance, track.length);
  const belt = track.belts.find(
    (b) => distance >= b.start && distance <= b.end,
  );
  if (!belt) return null;
  const { min, max } = crossfeedBounds(belt);
  if (lateral < min || lateral > max) return null;
  const R = CROSSFEED_RULES;
  const envelope =
    smooth((distance - belt.start) / R.entryLength) *
    smooth((belt.end - distance) / R.entryLength);
  const tread = (belt.side * lateral - crossfeedTravel(time)) / R.treadPitch;
  // A small tooth engagement variation supplies real mechanical traction
  // pulses while never reversing the advertised feed direction.
  const pulse = 0.9 + 0.1 * Math.cos(tread * Math.PI * 2);
  return {
    id: belt.id,
    side: belt.side,
    envelope,
    treadCell: Math.floor(tread),
    lateralAcceleration: belt.side * R.acceleration * envelope * pulse,
    forwardAcceleration: -R.drag * envelope,
    grip: R.grip,
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
