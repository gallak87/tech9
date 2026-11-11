import * as T from 'three';

// Verification intent only: this supplies ordinary bounded inputs to the native
// motion. The coarse variant holds/quantizes decisions instead of following a
// frame-perfect input recording. Neither variant changes contacts or outcomes.
export function createTransferPilot(
  track,
  { reaction = 0, quantum = 0, airAlignment = true, targetSpeed = null } = {},
) {
  let nextDecision = -Infinity,
    held = null;
  const clamp = (value) => T.MathUtils.clamp(value, -1, 1);
  const quantize = (value) =>
    quantum ? Math.round(value / quantum) * quantum : value;
  return ({ state, motion, pose }) => {
    const fs = motion.freestyle ?? motion.motion?.freestyle;
    const flight = motion.flight ?? motion.motion?.flight;
    const jump =
      track.jumps.find((entry) => entry.id === fs?.flight?.id) ??
      track.jumps.find((entry) => state.distance < entry.recovery) ??
      track.jumps.at(-1);
    if (held && state.time < nextDecision) return held;
    nextDecision = state.time + reaction;
    const frame = track.sample(state.distance);
    let steering = clamp(
      (state.lateral - (jump.approachLateral ?? 0)) * 0.045 +
        state.heading * 1.8 +
        state.lateralSpeed * 0.03 -
        (frame.curvature * state.speed) / 1.86,
    );
    let aerialPitch = 0,
      aerialYaw = 0,
      aerialRoll = 0;
    if (flight && airAlignment && pose) {
      const launch = track.sample(jump.takeoff);
      const along = pose.position
        .clone()
        .sub(launch.position)
        .dot(launch.tangent);
      const at = T.MathUtils.clamp(
        jump.takeoff + along + state.speed * 0.35,
        jump.landingStart + 6,
        jump.landingEnd - 6,
      );
      const velocity = new T.Vector3()
        .fromArray(flight.velocity)
        .setY(0)
        .normalize();
      const towards = track
        .sample(jump.target)
        .position.clone()
        .sub(pose.position)
        .setY(0)
        .normalize();
      const yawError = Math.atan2(
        new T.Vector3().crossVectors(velocity, towards).y,
        velocity.dot(towards),
      );
      steering = clamp(-yawError * 10);
      const targetFrame =
        track.sampleSurface?.(at, jump.targetLateral ?? 0) ?? track.sample(at);
      const delta = pose.quaternion
        .clone()
        .invert()
        .multiply(targetFrame.quaternion)
        .normalize();
      if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
      const angle = 2 * Math.acos(T.MathUtils.clamp(delta.w, -1, 1));
      const scale =
        Math.abs(Math.sin(angle / 2)) > 1e-5 ? angle / Math.sin(angle / 2) : 2;
      const angular = fs?.angular ?? [0, 0, 0];
      aerialPitch = clamp(delta.x * scale * 1.6 - angular[0] * 0.5);
      aerialYaw = clamp(delta.y * scale * 1.6 - angular[1] * 0.5);
      aerialRoll = clamp(delta.z * scale * 1.6 - angular[2] * 0.5);
    }
    const desiredSpeed =
      targetSpeed === 'course'
        ? (jump.speedRange?.[0] + jump.speedRange?.[1]) / 2 ||
          [140, 125, 155, 145, 125][track.jumps.indexOf(jump)]
        : targetSpeed;
    const tooFast =
      desiredSpeed != null && !flight && state.speed > desiredSpeed + 2;
    held = {
      throttle: tooFast ? 0 : 1,
      brake: tooFast
        ? T.MathUtils.clamp((state.speed - desiredSpeed) / 15, 0, 1)
        : 0,
      steer: quantize(steering),
      boost: false,
      airbrake: false,
      aerialPitch: quantize(aerialPitch),
      aerialYaw: quantize(aerialYaw),
      aerialRoll: quantize(aerialRoll),
    };
    return held;
  };
}
