// The existing third Mouth vault is the large sheet visible from Aurora Berth.
// Fixed-step runtime owns elapsed time; rendering only samples this pose.
export const FIRST_SHELF_RULES = Object.freeze({
  triggerDistance: 285,
  duration: 3.4,
  crackSeconds: 0.25,
  roofIndex: 2,
});
export function sampleFirstShelf(elapsed = null) {
  const { duration, crackSeconds } = FIRST_SHELF_RULES;
  const age = elapsed ?? 0;
  const separation = Math.max(
    0,
    Math.min(1, (age - crackSeconds) / (duration - crackSeconds)),
  );
  return {
    elapsed,
    crack: elapsed === null ? 0 : Math.min(1, age / crackSeconds),
    separation,
    phase:
      elapsed === null
        ? 'intact'
        : age < crackSeconds
          ? 'cracking'
          : age < duration
            ? 'falling'
            : 'fallen',
  };
}
