import { applyLandingImpulse } from '../presentation/landing-feedback.js';

// The magnetic seat is a visual impulse on the already-supported hull. Its
// clock comes from contact/settling, never an airborne landing prediction.
export function freestyleCatchImpulse(
  data,
  { reducedMotion = false, mode = 'racing' } = {},
) {
  if (
    !data ||
    reducedMotion ||
    !['racing', 'paused'].includes(mode) ||
    data.flight
  )
    return { seat: 0, lock: 0 };
  const leg = data.legs?.at(-1);
  const contactAge = data.pendingLanding
    ? data.pendingLanding.elapsed
    : leg?.landed
      ? data.clock - leg.touchdownAt
      : Infinity;
  const seat =
    Number.isFinite(contactAge) && contactAge >= 0 && contactAge < 0.22
      ? Math.sin((Math.PI * contactAge) / 0.22) ** 2
      : 0;
  const age = leg?.landed ? data.clock - leg.at : Infinity;
  const lock =
    age >= 0 && age < 0.32
      ? Math.sin((Math.PI * age) / 0.32) * Math.exp(-age * 7)
      : 0;
  return { seat, lock };
}

export function withFreestyleCatchFeedback(feedback, data, options) {
  return applyLandingImpulse(feedback, freestyleCatchImpulse(data, options));
}
