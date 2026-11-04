export const NOMAD_PILOT_RULES = Object.freeze({
  version: 2,
  approach: 170,
  gravity: 26,
  rangeIterations: 6,
});

/** Aim an ordinary grounded driver at the future receiver, never its old lip. */
export function nomadLaunchTarget(track, state, jump) {
  const ahead = jump.takeoff - state.distance;
  if (ahead < 0 || ahead > NOMAD_PILOT_RULES.approach) return null;
  const speed = Math.max(60, state.speed);
  const launchTime = state.time + ahead / speed;
  const departure = track.frameAtTime(jump.takeoff, launchTime);
  departure.position.addScaledVector(departure.right, state.lateral);
  const materialVelocity = track.motionAt(jump.takeoff, launchTime).velocity;
  const roadVerticalSpeed =
    speed *
    (departure.tangent.y * Math.cos(state.heading) +
      departure.right.y * Math.sin(state.heading));
  const verticalSpeed = roadVerticalSpeed + materialVelocity.y;
  const horizontalSpeed = Math.sqrt(
    Math.max(1, speed * speed - roadVerticalSpeed * roadVerticalSpeed),
  );
  const candidate = (station) => {
    let flightTime = 1.5,
      target;
    for (let iteration = 0; iteration < 2; iteration++) {
      target = track.frameAtTime(station, launchTime + flightTime).position;
      const height = departure.position.y - target.y;
      const discriminant =
        verticalSpeed * verticalSpeed + 2 * NOMAD_PILOT_RULES.gravity * height;
      if (discriminant < 0) return { error: Infinity, target, flightTime };
      flightTime = Math.max(
        0.35,
        Math.min(
          3,
          (verticalSpeed + Math.sqrt(discriminant)) / NOMAD_PILOT_RULES.gravity,
        ),
      );
    }
    target = track.frameAtTime(station, launchTime + flightTime).position;
    const x = target.x - departure.position.x - materialVelocity.x * flightTime,
      z = target.z - departure.position.z - materialVelocity.z * flightTime;
    return {
      error: Math.hypot(x, z) / flightTime - horizontalSpeed,
      target,
      flightTime,
    };
  };
  let low = jump.landingStart + 18,
    high = jump.landingEnd - 35;
  let result;
  for (
    let iteration = 0;
    iteration < NOMAD_PILOT_RULES.rangeIterations;
    iteration++
  ) {
    const station = (low + high) / 2;
    result = candidate(station);
    if (result.error > 0) high = station;
    else low = station;
  }
  return result.target
    .clone()
    .addScaledVector(materialVelocity, -result.flightTime);
}
