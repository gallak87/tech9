const missLabels = Object.freeze({
  short: 'Dropped below the receiver',
  below: 'Dropped below the receiver',
  long: 'Carried past the receiver',
  overshoot: 'Carried past the receiver',
  lateral: 'Wide of the receiver',
  timeout: 'Airborne too long',
  rail: 'Clipped the rail',
  deck: 'Hard deck contact',
  structure: 'Struck a structure',
});

// Read the actual contact/recovery event. A miss code does not prove whether
// the pilot chose the wrong speed, attitude or control direction.
export function freestylePracticeOutcome(event) {
  if (!['freestyle-bank', 'jump-miss'].includes(event?.type)) return null;
  const payload = event.payload ?? {};
  return {
    landed:
      event.type === 'freestyle-bank' &&
      (payload.landed === true || payload.clean === true),
    clean: event.type === 'freestyle-bank' && payload.clean === true,
    reason:
      event.type === 'freestyle-bank'
        ? (payload.reason ?? 'Receiver contact')
        : (missLabels[payload.reason] ?? 'Missed receiver'),
    kind: event.type,
    sourceReason: payload.reason ?? null,
    diagnostics: structuredClone(payload),
  };
}

// Authored/calibrated bands use simulation units; display alone converts to km/h.
// Missing data never fabricates an "ideal" speed or penalizes the pilot.
export function freestyleLaunchSpeed(range, speed) {
  if (
    !Array.isArray(range) ||
    range.length !== 2 ||
    !range.every(Number.isFinite) ||
    range[0] <= 0 ||
    range[1] < range[0] ||
    !Number.isFinite(speed)
  )
    return null;
  const [min, max] = range;
  const state = speed < min ? 'low' : speed > max ? 'high' : 'ready';
  return {
    min,
    max,
    state,
    label: `${Math.round(min * 3.6)}–${Math.round(max * 3.6)} km/h`,
    advice: {
      low: 'Build speed',
      high: 'Bleed speed',
      ready: 'In launch band',
    }[state],
  };
}

// Shortest receiver rotation expressed in the real hull's local control axes.
// This is a visible aiming reference, never an applied force or landing verdict.
export function freestyleReceiverCorrection(hull, receiver) {
  const local = hull.clone().invert().multiply(receiver).normalize();
  if (local.w < 0) local.set(-local.x, -local.y, -local.z, -local.w);
  const sine = Math.hypot(local.x, local.y, local.z);
  const scale = sine > 1e-8 ? (2 * Math.atan2(sine, local.w)) / sine : 0;
  return {
    pitch: local.x * scale,
    yaw: local.y * scale,
    roll: local.z * scale,
  };
}

export function freestyleAttitudeCue(
  reference,
  { gamepad = false, brake = 'SPACE', angularSpeed = 0 } = {},
) {
  if (!reference?.correction) return '';
  if (angularSpeed > 0.65) return `Release rotation · ${brake} fine trim`;
  const keys = gamepad
    ? {
        pitch: ['STICK ↑', 'STICK ↓'],
        yaw: ['X', 'Y'],
        roll: ['STICK →', 'STICK ←'],
      }
    : { pitch: ['↑', '↓'], yaw: ['Q', 'E'], roll: ['→', '←'] };
  const actions = {
    pitch: ['nose up', 'nose down'],
    yaw: ['turn left', 'turn right'],
    roll: ['roll right', 'roll left'],
  };
  const corrections = Object.entries(reference.correction)
    .filter(
      ([axis, angle]) =>
        keys[axis] &&
        Number.isFinite(angle) &&
        Math.abs(angle) > (8 * Math.PI) / 180,
    )
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 2);
  return corrections.length
    ? corrections
        .map(([axis, angle]) => {
          const sign = angle > 0 ? 1 : 0;
          return `${keys[axis][sign]} ${actions[axis][sign]}`;
        })
        .join(' · ')
    : 'Attitude matched · hold your bank';
}
