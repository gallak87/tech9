import { vehicleHandling } from '../../ships/catalog.js';

export const NOMAD_PILOT_RULES = Object.freeze({
  version: 10,
  approach: 240,
  gravity: 26,
  rangeIterations: 6,
  boostArcStep: 1 / 60,
  forecastTime: 9.5,
  lateralVelocityLeadLimit: 12,
});

/** The primary long-transfer line holds the ordinary boost button. Shared
 * reserve hysteresis/drain/recharge still decides when the engine can fire.
 * This never changes heading or position; coasting uses its own grounded line.
 */
export function nomadFlightBoost(
  track,
  state,
  jump,
  { runtime, allowBoost = true } = {},
) {
  return (
    allowBoost && Boolean(jump?.bigAir) && Boolean(runtime) && state.energy >= 0
  );
}

// Ordinary hard-driver boost is already part of shared flight propulsion.
// Predict that input on the ground; the actual jump remains wholly inertial.
function boostedArc(
  horizontal,
  vertical,
  energy,
  handling,
  duration,
  boosting,
) {
  const step = NOMAD_PILOT_RULES.boostArcStep;
  const points = [{ height: 0, range: 0 }];
  let height = 0,
    range = 0,
    apex = 0;
  for (
    let time = step;
    time <= NOMAD_PILOT_RULES.forecastTime + step / 2;
    time += step
  ) {
    const speed = Math.hypot(horizontal, vertical);
    boosting = time <= duration && energy > (boosting ? 0 : 12);
    const thrust = boosting ? handling.boostThrust - handling.thrust : 0;
    horizontal += ((thrust * horizontal) / speed) * step;
    vertical +=
      ((thrust * vertical) / speed - NOMAD_PILOT_RULES.gravity) * step;
    energy = Math.min(
      100,
      Math.max(
        0,
        energy + (boosting ? -handling.boostDrain : handling.recharge) * step,
      ),
    );
    range += horizontal * step;
    height += vertical * step;
    points.push({ height, range });
    if (height > points[apex].height) apex = points.length - 1;
  }
  const at = (time) => {
    const index = Math.min(
      points.length - 2,
      Math.max(0, Math.floor(time / step)),
    );
    const fraction = Math.min(1, Math.max(0, time / step - index));
    return {
      height:
        points[index].height +
        fraction * (points[index + 1].height - points[index].height),
      range:
        points[index].range +
        fraction * (points[index + 1].range - points[index].range),
    };
  };
  return {
    at,
    timeAtHeight(target) {
      let low = apex * step,
        high = NOMAD_PILOT_RULES.forecastTime;
      if (target > points[apex].height) return null;
      for (let i = 0; i < 14; i++) {
        const middle = (low + high) / 2;
        if (at(middle).height > target) low = middle;
        else high = middle;
      }
      return (low + high) / 2;
    },
  };
}

// Shared with the level's visual approach lights. This is the identical pure
// range/height forecast used by grounded planning; it applies no flight force.
export { boostedArc as forecastNomadPoweredArc };

/** Pure moving-receiver forecast shared by ordinary AI and the launch strip. */
export function nomadLaunchPlan(
  track,
  state,
  jump,
  {
    boost = false,
    boostDuration = Infinity,
    catchInset = 18,
    interceptLateral = 0,
  } = {},
) {
  const ahead = jump.takeoff - state.distance;
  const approach =
    jump.interceptApproach ?? (jump.bigAir ? NOMAD_PILOT_RULES.approach : 140);
  if (ahead < 0 || ahead > approach) return null;
  // Keep ordinary road-following through the banked climb. Interception is a
  // final ground alignment, not a request to cut across the wall's inner rail.
  if (Math.abs(track.frameAtTime(state.distance, state.time).bank ?? 0) > 0.35)
    return null;
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
  const expectsBoost = boost;
  const arc = expectsBoost
    ? boostedArc(
        horizontalSpeed,
        verticalSpeed,
        state.energy,
        vehicleHandling(state),
        boostDuration,
        state.boosting,
      )
    : null;
  const targetLateral = expectsBoost ? interceptLateral : 0;
  const targetAt = (station, time) => {
    const frame = track.frameAtTime(station, time);
    return frame.position.addScaledVector(frame.right, targetLateral);
  };
  const candidate = (station) => {
    let flightTime = jump.bigAir ? 4.5 : 1.5,
      target;
    for (let iteration = 0; iteration < 4; iteration++) {
      target = targetAt(station, launchTime + flightTime);
      const height = departure.position.y - target.y;
      if (arc) {
        const time = arc.timeAtHeight(-height);
        if (time === null) return { error: Infinity, target, flightTime };
        flightTime = time;
        continue;
      }
      const discriminant =
        verticalSpeed * verticalSpeed + 2 * NOMAD_PILOT_RULES.gravity * height;
      if (discriminant < 0) return { error: Infinity, target, flightTime };
      flightTime = Math.max(
        0.35,
        Math.min(
          NOMAD_PILOT_RULES.forecastTime,
          (verticalSpeed + Math.sqrt(discriminant)) / NOMAD_PILOT_RULES.gravity,
        ),
      );
    }
    target = targetAt(station, launchTime + flightTime);
    const x = target.x - departure.position.x - materialVelocity.x * flightTime,
      z = target.z - departure.position.z - materialVelocity.z * flightTime;
    return {
      error:
        Math.hypot(x, z) -
        (arc ? arc.at(flightTime).range : horizontalSpeed * flightTime),
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
  // Magnetic body velocity can lag the nose through the last banked bend.
  // Aim the grounded nose ahead of that measured sideways velocity; release
  // still inherits the unchanged actual native velocity, with no air steering.
  const lateralMismatch = Math.max(
    -NOMAD_PILOT_RULES.lateralVelocityLeadLimit,
    Math.min(
      NOMAD_PILOT_RULES.lateralVelocityLeadLimit,
      (state.lateralSpeed ?? 0) - speed * Math.sin(state.heading),
    ),
  );
  const target = result.target
    .clone()
    .addScaledVector(materialVelocity, -result.flightTime)
    .addScaledVector(departure.right, -lateralMismatch * result.flightTime);
  return {
    target,
    flightTime: result.flightTime,
    rangeError: result.error,
    shortfall: Math.max(
      0,
      candidate(Math.min(jump.landingEnd - 35, jump.landingStart + catchInset))
        .error,
    ),
  };
}

/** Ordinary AI steering clears the hero crown; the player's field stays centred. */
export function nomadLaunchTarget(track, state, jump, options = {}) {
  return (
    nomadLaunchPlan(track, state, jump, {
      ...options,
      interceptLateral: options.boost ? (jump.boostInterceptLateral ?? 0) : 0,
    })?.target ?? null
  );
}
