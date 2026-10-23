// Shared simulation and presentation tuning. Later hits can upgrade an active
// disruption, but its original start is retained: a volley cannot restart it.
export const COMBAT_CONSEQUENCES = Object.freeze({
  ion: Object.freeze({ duration: 1, retainedSpeed: 0.72, reserveCost: 10 }),
  arc: Object.freeze({ duration: 2, retainedSpeed: 0.62, reserveCost: 14 }),
  repulsor: Object.freeze({
    duration: 3,
    retainedSpeed: 0.55,
    reserveCost: 18,
  }),
});
const clamp = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => value * value * (3 - 2 * value);

export function combatDisruption(previous, kind, time, speed) {
  const current = previous && time < previous.startedAt + previous.duration;
  const strongest =
    current && previous.duration >= COMBAT_CONSEQUENCES[kind].duration
      ? previous.kind
      : kind;
  return {
    kind: strongest,
    startedAt: current ? previous.startedAt : time,
    duration: COMBAT_CONSEQUENCES[strongest].duration,
    entrySpeed: current ? previous.entrySpeed : Math.max(0, speed),
  };
}

export function sampleCombatDisruption(disruption, time) {
  if (!disruption) return null;
  const age = time - disruption.startedAt;
  if (age < 0 || age >= disruption.duration) return null;
  const remaining = disruption.duration - age;
  const strength = 1 - smooth(clamp((age / disruption.duration - 0.55) / 0.45));
  const retained = COMBAT_CONSEQUENCES[disruption.kind].retainedSpeed;
  return {
    ...disruption,
    age,
    remaining,
    strength,
    // A hit never brakes a crawling ship to a stop or compounds a volley's loss.
    speedLimit: Math.max(
      30,
      disruption.entrySpeed * (1 - (1 - retained) * strength),
    ),
  };
}
