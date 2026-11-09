import { TRICKS } from './rules.js';

export const FREESTYLE_GRADES = Object.freeze({
  good: Object.freeze({ label: 'Good', color: '#69d8f2', hex: 0x69d8f2 }),
  great: Object.freeze({ label: 'Great', color: '#8ff5c4', hex: 0x8ff5c4 }),
  perfect: Object.freeze({ label: 'Perfect', color: '#ffe3a0', hex: 0xffe3a0 }),
  miss: Object.freeze({ label: 'Miss', color: '#d9877c', hex: 0xd9877c }),
});

export function freestyleLandingGrade(leg) {
  if (!leg?.landed) return 'miss';
  return leg.perfect ? 'perfect' : leg.clean ? 'great' : 'good';
}

// Shared by banking and its provisional HUD preview. Only completed tricks
// count; repeating one trick halves that trick's next award within this flight.
export function freestyleStylePoints(tricks) {
  const repeats = new Map();
  return tricks.reduce((total, kind) => {
    const repeated = repeats.get(kind) ?? 0;
    repeats.set(kind, repeated + 1);
    return total + TRICKS[kind].points * 0.5 ** repeated;
  }, 0);
}

export function freestyleRotationCharge(data) {
  if (!data.flight || data.flight.failed || data.pendingLanding) return null;
  const angular = data.angular ?? [0, 0, 0];
  const compound = angular.filter((value) => Math.abs(value) > 0.45).length > 1;
  const axis = angular.reduce(
    (best, value, index) =>
      Math.abs(value) > Math.abs(angular[best]) ? index : best,
    0,
  );
  if (!compound && Math.abs(angular[axis]) < 0.05) return null;
  return {
    kind: compound ? 'corkscrew' : ['flip', 'spin', 'roll'][axis],
    progress: Math.max(
      0,
      Math.min(
        1,
        (compound
          ? (data.compoundProgress ?? 0)
          : (data.progress?.[axis] ?? 0)) /
          (2 * Math.PI - 0.15),
      ),
    ),
  };
}

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const easeOut = (value) => 1 - (1 - clamp01(value)) ** 3;

// Presentation follows the simulation clock: pausing freezes it and restarting
// clears it. No animation owns a timer or can award gameplay points.
export function createFreestyleArcade() {
  let previous = null;
  let shownAir = 0;
  let callout = null;
  let payoff = null;
  return {
    update(data, { running = true, reducedMotion = false, session = '' } = {}) {
      const clock = data.clock ?? 0;
      const legs = data.legs ?? [];
      const flight = data.flight;
      const tricks = flight?.tricks ?? data.pendingLanding?.tricks ?? [];
      const airPoints =
        data.pendingLanding?.style ?? freestyleStylePoints(tricks);
      const reset =
        !previous ||
        session !== previous.session ||
        clock < previous.clock ||
        data.score < previous.score ||
        legs.length < previous.legs;
      const dt = !reset && running ? Math.min(0.1, clock - previous.clock) : 0;
      if (reset) {
        shownAir = airPoints;
        callout = null;
        payoff = null;
      } else {
        if (callout) callout.age += dt;
        if (payoff) payoff.age += dt;
        const sameFlight = flight && flight.id === previous.flight;
        if (flight && !sameFlight) shownAir = 0;
        const newTricks = sameFlight ? previous.tricks : 0;
        if (flight && flight.tricks.length > newTricks) {
          const ordinal = flight.tricks.length;
          const kind = flight.tricks[ordinal - 1];
          callout = {
            kind,
            ordinal,
            label: TRICKS[kind].name,
            points:
              freestyleStylePoints(flight.tricks) -
              freestyleStylePoints(flight.tricks.slice(0, -1)),
            age: 0,
          };
        }
        if (legs.length > previous.legs) {
          const leg = legs.at(-1);
          payoff = {
            grade: freestyleLandingGrade(leg),
            bank: legs
              .slice(previous.legs)
              .reduce((sum, entry) => sum + entry.bank, 0),
            chain: leg.chain,
            age: 0,
          };
          callout = null;
        }
      }
      if (reducedMotion) shownAir = airPoints;
      else {
        shownAir += (airPoints - shownAir) * -Math.expm1(-16 * dt);
        if (Math.abs(airPoints - shownAir) < 0.5) shownAir = airPoints;
      }
      const visiblePayoff = payoff && payoff.age < 1.7 ? payoff : null;
      const sweep = visiblePayoff ? easeOut((payoff.age - 0.42) / 0.68) : 1;
      const result = {
        score: Math.round(
          data.score -
            (reducedMotion ? 0 : (visiblePayoff?.bank ?? 0) * (1 - sweep)),
        ),
        airPoints,
        airScore: Math.round(shownAir),
        charge: freestyleRotationCharge(data),
        callout: callout && callout.age < 1.45 ? { ...callout } : null,
        payoff: visiblePayoff
          ? {
              ...visiblePayoff,
              points: Math.round(
                payoff.bank *
                  (reducedMotion
                    ? 1
                    : easeOut(payoff.age / 0.18) * (1 - sweep)),
              ),
              sweep: reducedMotion ? 0 : sweep,
              entrance: reducedMotion ? 1 : easeOut(payoff.age / 0.18),
              opacity: clamp01((1.7 - payoff.age) / 0.35),
            }
          : null,
      };
      previous = {
        clock,
        score: data.score,
        legs: legs.length,
        flight: flight?.id ?? null,
        tricks: flight?.tricks.length ?? 0,
        session,
      };
      return result;
    },
  };
}
