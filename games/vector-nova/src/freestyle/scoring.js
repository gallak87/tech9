import { TRICKS } from './rules.js';

// Completed tricks remain bonuses on top of continuous held-rotation points.
// Repeating a kind halves its next bonus within this flight.
export function freestyleStylePoints(tricks) {
  const repeats = new Map();
  return tricks.reduce((total, kind) => {
    const repeated = repeats.get(kind) ?? 0;
    repeats.set(kind, repeated + 1);
    return total + TRICKS[kind].points * 0.5 ** repeated;
  }, 0);
}

export function freestyleAirPoints(data) {
  if (data.pendingLanding) return data.pendingLanding.style;
  if (!data.flight) return 0;
  return (
    (data.flight.rotationPoints ?? 0) + freestyleStylePoints(data.flight.tricks)
  );
}
