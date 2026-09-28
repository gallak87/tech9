const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const finite = (value, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;
const STEP = 1 / 120;
const GRAVITY = 9.81;
const HOLD_SPEED = 0.12;
const HALF_WIDTH = 2.25;
const HALF_LENGTH = 3.5;

export function createVehicleState() {
  return {
    distance: 0,
    lateral: 0,
    speed: 0,
    lateralSpeed: 0,
    heading: 0,
    energy: 100,
    time: 0,
    boosting: false,
    impact: 0,
    resetCount: 0,
    steer: 0,
  };
}

function integrate(s, controls, track, dt, events) {
  const { throttle, brake, steer, airbrake } = controls;
  const frame = track.sample(s.distance);
  const previousSpeed = s.speed;
  const previousHeading = s.heading;
  s.time += dt;
  s.impact = Math.max(0, s.impact - dt * 2.4);
  s.steer = steer;

  // A depleted reserve must recharge before starting again: held boost cannot
  // toggle every other tick. Once engaged it may spend the remaining reserve.
  const boost =
    controls.boost &&
    throttle > 0 &&
    s.energy > (s.boosting ? 0 : 12) &&
    s.speed > 20 &&
    brake < 0.1;
  if (boost !== s.boosting)
    events.push({ type: 'boost', payload: { active: boost } });
  s.boosting = boost;

  // Input +1 is the driver's right. A +Z-facing chase view sees geometric +X
  // on its left, so yaw/lateral commands have the opposite sign to input.
  // The magnetic surface-following frame and its automatic bend alignment are
  // retained for the Gate 2 decision; this does not add lane-centering.
  const targetHeading = -steer * (airbrake ? 0.27 : 0.18);
  const response = airbrake ? 10.5 : 8.5;
  const yawBlend = -Math.expm1(-response * dt);
  s.heading += (targetHeading - s.heading) * yawBlend;
  const meanHeading =
    targetHeading +
    ((previousHeading - targetHeading) * yawBlend) / (response * dt);

  // Hover parking is an explicit active hold, including while steering at rest.
  // It captures only a nearly stopped craft; a moving sideways craft still has
  // to dissipate its momentum before capture. Throttle releases the hold.
  const parking = throttle === 0 && previousSpeed <= HOLD_SPEED;
  const parked = parking && Math.abs(s.lateralSpeed) < 0.12;
  const forwardGravity = -GRAVITY * finite(frame.tangent?.y);
  const lateralGravity =
    -GRAVITY * finite(frame.right?.y, Math.sin(finite(frame.bank)));

  if (parked) {
    s.speed = 0;
    s.lateralSpeed = 0;
  } else {
    // Engine force and quadratic drag meet at the nominal flat-road speed.
    // No speed clamp: grades cost/gain energy and boost release decelerates
    // continuously, instead of snapping a fast craft to its cruise speed.
    const cruiseSpeed = boost ? 157 : 112;
    const thrust = boost ? 59 : 42;
    const cruiseDrag = 4.4 + 0.0018 * cruiseSpeed * cruiseSpeed;
    const engine = Math.max(
      0,
      thrust - (thrust - cruiseDrag) * (previousSpeed / cruiseSpeed) ** 2,
    );
    const drag = 4.4 + 0.0018 * previousSpeed * previousSpeed;
    const acceleration =
      throttle * engine -
      brake * 83 -
      drag -
      (airbrake ? 7 : 0) +
      (parking ? 0 : forwardGravity);
    s.speed = Math.max(0, previousSpeed + acceleration * dt);
    const meanSpeed = (previousSpeed + s.speed) * 0.5;

    // Project world gravity through the actual banked frame. Positive right.y
    // means +lateral is uphill, so gravity must act toward -lateral. Magnetic
    // grip resists the outward corner load but does not cancel it entirely.
    const grip = parking ? 24 : airbrake ? 4.5 : 7.2;
    const outwardForce =
      -finite(frame.curvature) * meanSpeed * meanSpeed * 0.75;
    const desiredLateral = parking ? 0 : Math.sin(meanHeading) * meanSpeed;
    const targetLateralSpeed =
      desiredLateral + (parking ? 0 : outwardForce + lateralGravity) / grip;
    const lateralBlend = -Math.expm1(-grip * dt);
    const previousLateralSpeed = s.lateralSpeed;
    s.lateralSpeed += (targetLateralSpeed - s.lateralSpeed) * lateralBlend;
    const lateralStep =
      targetLateralSpeed * dt +
      ((previousLateralSpeed - targetLateralSpeed) * lateralBlend) / grip;
    s.distance += Math.cos(meanHeading) * meanSpeed * dt;

    // Sweep the whole step against both rails, including the craft's rotated
    // width. The widest endpoint bounds its yaw envelope over this small tick.
    const hullExtent = (heading) =>
      Math.abs(Math.cos(heading)) * HALF_WIDTH +
      Math.abs(Math.sin(heading)) * HALF_LENGTH;
    const edge = Math.max(
      0,
      track.width / 2 -
        Math.max(hullExtent(previousHeading), hullExtent(s.heading)),
    );
    const next = s.lateral + lateralStep;
    let side = next > edge ? 1 : next < -edge ? -1 : 0;

    // Exponential grip can reverse velocity inside a tick. Include that swept
    // extremum even if the endpoint itself has returned inside the barrier.
    if (
      !side &&
      previousLateralSpeed * s.lateralSpeed < 0 &&
      targetLateralSpeed !== previousLateralSpeed
    ) {
      const reversal =
        -Math.log(
          -targetLateralSpeed / (previousLateralSpeed - targetLateralSpeed),
        ) / grip;
      if (reversal > 0 && reversal < dt) {
        const extreme =
          s.lateral +
          targetLateralSpeed * reversal +
          previousLateralSpeed / grip;
        side = extreme > edge ? 1 : extreme < -edge ? -1 : 0;
      }
    }
    if (side) {
      const incoming = Math.max(
        0,
        side * previousLateralSpeed,
        side * s.lateralSpeed,
      );
      const severity = Math.min(1, incoming / 15);
      s.lateral = side * edge;
      s.lateralSpeed = -side * incoming * 0.22;
      if (s.impact < 0.08) {
        s.speed *= 0.84;
        s.energy = Math.max(0, s.energy - 6 - severity * 9);
        s.impact = 1;
        events.push({ type: 'impact', payload: { severity, side } });
      }
      s.heading *= 0.65;
    } else s.lateral = next;
  }
  s.energy = clamp(s.energy + (boost ? -21 : 5.5) * dt, 0, 100);
}

export function stepVehicle(state, input, track, dt) {
  const events = [];
  if (!Number.isFinite(dt) || dt <= 0) return events;
  const controls = {
    throttle: clamp(finite(input?.throttle), 0, 1),
    brake: clamp(finite(input?.brake), 0, 1),
    steer: clamp(finite(input?.steer), -1, 1),
    boost: !!input?.boost,
    airbrake: !!input?.airbrake,
  };
  // Core already ticks at 120Hz. Subdivide standalone/test calls as well, with
  // the same 100ms backlog bound as core, to prevent unstable giant steps.
  const elapsed = Math.min(dt, 0.1);
  const steps = Math.ceil(elapsed / STEP - 1e-10);
  for (let tick = 0; tick < steps; tick++)
    integrate(state, controls, track, elapsed / steps, events);
  return events;
}
