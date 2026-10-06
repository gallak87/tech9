import { VEHICLE_HULL, sweptLateralExtent } from './hull.js';
import { getShip } from '../ships/catalog.js';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const finite = (value, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;
const STEP = 1 / 120;
const GRAVITY = 9.81;
const HOLD_SPEED = 0.12;
const { halfWidth: HALF_WIDTH, halfLength: HALF_LENGTH } = VEHICLE_HULL;
export const STEERING_ASSIST = 0.3;

function roadYawBetween(frame, next, distance) {
  if (frame.right && frame.tangent && next.tangent) {
    const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
    return Math.atan2(
      dot(frame.right, next.tangent),
      dot(frame.tangent, next.tangent),
    );
  }
  return finite(frame.curvature) * distance;
}

export function createVehicleState(shipId = 'kestrel') {
  return {
    shipId: getShip(shipId).id,
    distance: 0,
    lateral: 0,
    speed: 0,
    lateralSpeed: 0,
    heading: 0,
    steeringHeading: 0,
    energy: 100,
    time: 0,
    boosting: false,
    impact: 0,
    resetCount: 0,
    steer: 0,
  };
}

function integrate(s, controls, track, dt, events) {
  const { throttle, brake, steer, airbrake, steeringAssist } = controls;
  const handling = getShip(s.shipId).handling;
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
  // Keep the quick control response separate from persistent vehicle yaw.
  // A spring on total heading would eventually restore full road-following,
  // even if we subtracted some road turn each tick.
  const previousSteering =
    steeringAssist === 1 ? s.heading : finite(s.steeringHeading);
  const targetHeading =
    -steer * (airbrake ? 0.27 : 0.18) * steeringAssist * handling.turn;
  const response = (airbrake ? 10.5 : 8.5) * handling.response;
  const yawBlend = -Math.expm1(-response * dt);
  s.steeringHeading =
    previousSteering + (targetHeading - previousSteering) * yawBlend;
  const manualYawRate =
    -steer *
    (airbrake ? 2.1 : 1.5) *
    handling.turn *
    clamp(previousSpeed / 30, 0, 1);
  const manualYawStep = (1 - steeringAssist) * manualYawRate * dt;
  s.heading += s.steeringHeading - previousSteering + manualYawStep;
  const estimatedRoadYaw =
    finite(frame.curvature) * previousSpeed * Math.cos(previousHeading) * dt;
  let meanHeading =
    previousHeading -
    previousSteering +
    targetHeading +
    ((previousSteering - targetHeading) * yawBlend) / (response * dt) +
    (manualYawStep - (1 - steeringAssist) * estimatedRoadYaw) * 0.5;

  // Hover parking is an explicit active hold, including while steering at rest.
  // It captures only a nearly stopped craft; a moving sideways craft still has
  // to dissipate its momentum before capture. Throttle releases the hold.
  const pad = controls.propulsion && brake < 0.1;
  const driveThrottle = pad ? 1 : throttle;
  const parking = driveThrottle === 0 && previousSpeed <= HOLD_SPEED;
  const parked = parking && Math.abs(s.lateralSpeed) < 0.12;
  const forwardGravity = -GRAVITY * finite(frame.tangent?.y);
  const lateralGravity =
    -GRAVITY * finite(frame.right?.y, Math.sin(finite(frame.bank)));
  // Magnetic adhesion balances the normal component, even upside-down. Only
  // tangent/right projections accelerate this deliberately surface-bound model.

  if (parked) {
    s.speed = 0;
    s.lateralSpeed = 0;
  } else {
    // Engine force and quadratic drag meet at the nominal flat-road speed.
    // No speed clamp: grades cost/gain energy and boost release decelerates
    // continuously, instead of snapping a fast craft to its cruise speed.
    // A road impulse is a separate, free profile. Choose the strongest active
    // profile once; a road catapult may exceed manual boost. Holding boost
    // still spends reserve, but cannot weaken the strip's free propulsion.
    const cruiseSpeed = Math.max(
      boost ? handling.boostSpeed : handling.cruiseSpeed,
      pad ? controls.propulsion.cruiseSpeed : 0,
    );
    const thrust = Math.max(
      boost ? handling.boostThrust : handling.thrust,
      pad ? controls.propulsion.thrust : 0,
    );
    const cruiseDrag = 4.4 + 0.0018 * cruiseSpeed * cruiseSpeed;
    const engine = Math.max(
      0,
      thrust - (thrust - cruiseDrag) * (previousSpeed / cruiseSpeed) ** 2,
    );
    const drag = 4.4 + 0.0018 * previousSpeed * previousSpeed;
    const acceleration =
      driveThrottle * engine * controls.surface.thrustScale -
      brake * handling.braking -
      drag -
      (airbrake ? 7 : 0) -
      controls.surface.drag +
      controls.surface.forwardAcceleration +
      (parking ? 0 : forwardGravity);
    s.speed = Math.max(0, previousSpeed + acceleration * dt);
    const meanSpeed = (previousSpeed + s.speed) * 0.5;
    const distanceStep = Math.cos(meanHeading) * meanSpeed * dt;
    if (steeringAssist < 1 && distanceStep !== 0) {
      const nextFrame = track.sample(s.distance + distanceStep);
      const roadYaw = roadYawBetween(frame, nextFrame, distanceStep);
      // Remove the unassisted part of actual road yaw. Roll and pitch still
      // follow the magnetic surface, including through inversion and drops.
      s.heading -= (1 - steeringAssist) * roadYaw;
      meanHeading += (1 - steeringAssist) * (estimatedRoadYaw - roadYaw) * 0.5;
    }
    s.distance += distanceStep;

    // Project world gravity through the actual banked frame. Positive right.y
    // means +lateral is uphill, so gravity must act toward -lateral. Magnetic
    // grip resists the outward corner load but does not cancel it entirely.
    const grip =
      (parking ? 24 : airbrake ? 4.5 : 7.2) *
      controls.surface.grip *
      handling.grip;
    const outwardForce =
      -finite(frame.curvature) * meanSpeed * meanSpeed * 0.75 +
      controls.surface.lateralAcceleration;
    const desiredLateral = parking ? 0 : Math.sin(meanHeading) * meanSpeed;
    const targetLateralSpeed =
      desiredLateral + (parking ? 0 : outwardForce + lateralGravity) / grip;
    const lateralBlend = -Math.expm1(-grip * dt);
    const previousLateralSpeed = s.lateralSpeed;
    s.lateralSpeed += (targetLateralSpeed - s.lateralSpeed) * lateralBlend;
    const lateralStep =
      targetLateralSpeed * dt +
      ((previousLateralSpeed - targetLateralSpeed) * lateralBlend) / grip;
    // Sweep the whole step against both rails, including rotated body width.
    const edge = Math.max(
      0,
      track.width / 2 - sweptLateralExtent(previousHeading, s.heading),
    );
    // Optional split decks constrain only grounded travel. The authored inner
    // divider is a real rail; a skipped launch cannot drift over absent road.
    const extent = sweptLateralExtent(previousHeading, s.heading);
    const bounds = controls.roadBounds;
    const lower = bounds ? bounds.min + extent : -edge;
    const upper = bounds ? bounds.max - extent : edge;
    const midpoint = bounds ? (bounds.min + bounds.max) / 2 : 0;
    const leftLimit = Math.min(lower, midpoint);
    const rightLimit = Math.max(upper, midpoint);
    const next = s.lateral + lateralStep;
    let side = next > rightLimit ? 1 : next < leftLimit ? -1 : 0;

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
        side = extreme > rightLimit ? 1 : extreme < leftLimit ? -1 : 0;
      }
    }
    if (side) {
      const incoming = Math.max(
        0,
        side * previousLateralSpeed,
        side * s.lateralSpeed,
      );
      const severity = Math.min(1, incoming / 15);
      s.lateral = side > 0 ? rightLimit : leftLimit;
      s.lateralSpeed = -side * incoming * 0.22;
      if (s.impact < 0.08) {
        s.speed *= 0.84;
        const shielded = controls.shield;
        if (shielded) controls.shield = false;
        else s.energy = Math.max(0, s.energy - 6 - severity * 9);
        s.impact = 1;
        const contact = bounds
          ? { railLateral: side > 0 ? bounds.max : bounds.min }
          : {};
        events.push({
          type: 'impact',
          payload: shielded
            ? { severity, side, shielded: true, ...contact }
            : { severity, side, ...contact },
        });
      }
      s.heading *= 0.65;
      s.steeringHeading *= 0.65;
    } else s.lateral = next;
  }
  s.energy = clamp(
    s.energy + (boost ? -handling.boostDrain : handling.recharge) * dt,
    0,
    100,
  );
}

export function stepVehicle(state, input, track, dt, options = {}) {
  const events = [];
  if (!Number.isFinite(dt) || dt <= 0) return events;
  const controls = {
    throttle: clamp(finite(input?.throttle), 0, 1),
    brake: clamp(finite(input?.brake), 0, 1),
    steer: clamp(finite(input?.steer), -1, 1),
    boost: !!input?.boost,
    airbrake: !!input?.airbrake,
    // Options are per-call values, never global feature state. Invalid profiles
    // are ignored. Authored road catapults may exceed manual boost profiles.
    propulsion:
      Number.isFinite(options.propulsion?.cruiseSpeed) &&
      Number.isFinite(options.propulsion?.thrust)
        ? {
            cruiseSpeed: clamp(options.propulsion.cruiseSpeed, 112, 200),
            thrust: clamp(options.propulsion.thrust, 42, 2000),
          }
        : null,
    // Level-scoped surface response. Omitted values reproduce the baseline.
    // Acceleration uses the route tangent/right axes; +right is driver-left.
    surface: {
      grip: clamp(finite(options.surface?.grip, 1), 0.05, 4),
      drag: clamp(finite(options.surface?.drag), 0, 100),
      thrustScale: clamp(finite(options.surface?.thrustScale, 1), 0, 1),
      forwardAcceleration: clamp(
        finite(options.surface?.forwardAcceleration),
        -100,
        100,
      ),
      lateralAcceleration: clamp(
        finite(options.surface?.lateralAcceleration),
        -100,
        100,
      ),
    },
    roadBounds:
      Number.isFinite(options.roadBounds?.min) &&
      Number.isFinite(options.roadBounds?.max) &&
      options.roadBounds.min >= -track.width / 2 &&
      options.roadBounds.max <= track.width / 2 &&
      options.roadBounds.max - options.roadBounds.min >=
        2 * Math.hypot(HALF_WIDTH, HALF_LENGTH)
        ? { min: options.roadBounds.min, max: options.roadBounds.max }
        : null,
    shield: options.shield === true,
    steeringAssist: clamp(
      finite(options.steeringAssist, STEERING_ASSIST),
      0,
      1,
    ),
  };
  // Core already ticks at 120Hz. Subdivide standalone/test calls as well, with
  // the same 100ms backlog bound as core, to prevent unstable giant steps.
  const elapsed = Math.min(dt, 0.1);
  const steps = Math.ceil(elapsed / STEP - 1e-10);
  for (let tick = 0; tick < steps; tick++)
    integrate(state, controls, track, elapsed / steps, events);
  return events;
}
