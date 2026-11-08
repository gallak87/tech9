import { vehicleHandling } from '../../ships/catalog.js';
import { STEERING_ASSIST } from '../../physics/index.js';
import { nomadLaunchPlan } from './pilot.js';

export const NOMAD_LAUNCH_ASSIST_RULES = Object.freeze({
  version: 1,
  length: 50,
  minimumSpeed: 70,
  minimumThrottle: 0.2,
  maximumBank: 0.1,
  hullMargin: 4,
  steeringFade: 0.12,
  steeringOverride: 0.45,
  maximumSteerCorrection: 0.28,
  maximumTargetHeading: Math.PI / 15,
  maximumHeadingError: Math.PI / 7.5,
  maximumAcceleration: 60,
  maximumLateralAcceleration: 45,
  lateralResponse: 4,
  shortfallMargin: 8,
  safeLandingInset: 120,
});

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const smooth = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};
const angle = (value) => Math.atan2(Math.sin(value), Math.cos(value));

/** The visible field ends at the real lip; it never spans unsupported air. */
export function nomadLaunchStripAt(track, distance) {
  return (
    track.jumps.find(
      (jump) =>
        jump.bigAir &&
        distance >= jump.takeoff - NOMAD_LAUNCH_ASSIST_RULES.length &&
        distance < jump.takeoff,
    ) ?? null
  );
}

/** Return ordinary grounded controls/forces without changing state or pose. */
export function nomadLaunchAssistance(track, state, input = {}, pose = null) {
  const rules = NOMAD_LAUNCH_ASSIST_RULES;
  if (
    ![
      state.distance,
      state.lateral,
      state.speed,
      state.time,
      state.heading,
      state.energy,
      input.steer ?? 0,
    ].every(Number.isFinite)
  )
    return null;
  const jump = nomadLaunchStripAt(track, state.distance);
  const rawSteer = clamp(input.steer ?? 0, -1, 1);
  if (
    !jump ||
    !pose?.grounded ||
    pose.recovering ||
    !(input.throttle > rules.minimumThrottle) ||
    input.brake >= 0.1 ||
    input.airbrake ||
    Math.abs(rawSteer) >= rules.steeringOverride ||
    !(state.speed >= rules.minimumSpeed)
  )
    return null;
  const frame = track.surfaceAtTime(state.distance, state.lateral, state.time);
  if (
    !frame ||
    Math.abs(frame.bank ?? 0) > rules.maximumBank ||
    Math.abs(state.lateral) >
      track.halfWidthAt(state.distance) - rules.hullMargin
  )
    return null;
  // Held boost may recharge and restart during the flight; the existing arc
  // forecast already models reserve hysteresis rather than treating zero as coast.
  const boost = Boolean(input.boost);
  const plan = nomadLaunchPlan(track, state, jump, {
    boost,
    catchInset: rules.safeLandingInset,
  });
  if (!plan || !Number.isFinite(plan.shortfall)) return null;
  const delta = plan.target.clone().sub(frame.position);
  const along = delta.dot(frame.tangent);
  if (!(along > 1)) return null;
  const desired = clamp(
    Math.atan2(delta.dot(frame.right), along),
    -rules.maximumTargetHeading,
    rules.maximumTargetHeading,
  );
  const error = angle(desired - state.heading);
  if (Math.abs(error) > rules.maximumHeadingError) return null;
  const weight =
    smooth((state.distance - jump.takeoff + rules.length) / rules.length) *
    (1 -
      smooth(
        (Math.abs(rawSteer) - rules.steeringFade) /
          (rules.steeringOverride - rules.steeringFade),
      ));
  const authority = (1 - STEERING_ASSIST) * 1.5 * vehicleHandling(state).turn;
  const correction =
    clamp(
      (-error * 4.4) / authority,
      -rules.maximumSteerCorrection,
      rules.maximumSteerCorrection,
    ) * weight;
  const shortfall = smooth((plan.shortfall - rules.shortfallMargin) / 35);
  const speedDeficit = Math.max(0, jump.targetSpeed - state.speed);
  const acceleration =
    Math.min(rules.maximumAcceleration, speedDeficit * 5) *
    weight *
    shortfall *
    (1 - smooth(Math.abs(state.heading) / rules.maximumHeadingError));
  const desiredLateralSpeed = state.speed * Math.sin(desired);
  const lateralAcceleration =
    clamp(
      (desiredLateralSpeed - (state.lateralSpeed ?? 0)) * rules.lateralResponse,
      -rules.maximumLateralAcceleration,
      rules.maximumLateralAcceleration,
    ) * weight;
  return {
    jumpId: jump.id,
    steer: clamp(rawSteer + correction, -1, 1),
    steerCorrection: correction,
    targetHeading: desired,
    forwardAcceleration: acceleration,
    lateralAcceleration,
    shortfall: plan.shortfall,
    weight,
  };
}

/** Compose the field with devices without mutating their input or modifiers. */
export function assistedNomadStep(track, state, input, modifiers, pose) {
  const assist = nomadLaunchAssistance(track, state, input, pose);
  if (!assist) return { input, modifiers };
  return {
    input: { ...input, steer: assist.steer },
    modifiers:
      assist.forwardAcceleration > 0 || assist.lateralAcceleration !== 0
        ? {
            ...modifiers,
            surface: {
              ...modifiers?.surface,
              forwardAcceleration:
                (modifiers?.surface?.forwardAcceleration ?? 0) +
                assist.forwardAcceleration,
              lateralAcceleration:
                (modifiers?.surface?.lateralAcceleration ?? 0) +
                assist.lateralAcceleration,
            },
          }
        : modifiers,
  };
}
