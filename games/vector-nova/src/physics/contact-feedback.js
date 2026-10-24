import { toughness } from '../progression/catalog.js';
// One contact episode has one feedback event, regardless of manifold point
// count or whether the vehicle takes off / reattaches during that episode.
export function createContactFeedback() {
  let touching = new Set();
  let impacts = new Map();
  return {
    collect(contacts, time, eligible = () => true) {
      const current = new Set();
      const candidates = new Map();
      for (const hit of contacts) {
        current.add(hit.shape.id);
        if (!eligible(hit)) continue;
        const previous = candidates.get(hit.shape.id);
        if (!previous || hit.incomingSpeed > previous.incomingSpeed)
          candidates.set(hit.shape.id, hit);
      }
      const fresh = [];
      for (const [id, hit] of candidates) {
        if (
          touching.has(id) ||
          hit.incomingSpeed <= 2 ||
          time - (impacts.get(id) ?? -Infinity) < 0.4
        )
          continue;
        impacts.set(id, time);
        fresh.push(hit);
      }
      touching = current;
      return fresh;
    },
    reset() {
      touching.clear();
      impacts.clear();
    },
    snapshot() {
      return { touching: [...touching], impacts: [...impacts] };
    },
    restore(data) {
      touching = new Set(data.touching);
      impacts = new Map(data.impacts);
    },
  };
}

export function racerImpact(incomingSpeed) {
  const severity = Math.min(1, Math.max(0.1, incomingSpeed / 45));
  return { severity, energyCost: 2 + severity * 8 };
}

// Only explicitly authored machinery is a world hazard. Walls and racer
// contacts retain their original costs, and solid collision response is intact.
export function mitigateHazardImpact(impact, state, shape) {
  const reduction = shape?.hazard ? toughness(state) : 0;
  return reduction
    ? {
        ...impact,
        severity: impact.severity * (1 - reduction),
        energyCost: impact.energyCost * (1 - reduction),
      }
    : impact;
}
