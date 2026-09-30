const wrap = (value, length) => ((value % length) + length) % length;
const smooth = (value) => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

// Fixture-index space adapts to street/tunnel spacing while keeping exactly three
// candidate slots. At every membership boundary the outgoing and incoming
// fixtures have zero weight and zero derivative. This also holds in reverse and
// across the circuit seam; it needs no elapsed time or camera state.
export function selectPracticalFixtures(
  fixtures,
  length,
  distance,
  lookAhead = 20,
) {
  const target = wrap(distance + lookAhead, length);
  let low = 0;
  let high = fixtures.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (fixtures[middle].distance <= target) low = middle + 1;
    else high = middle;
  }
  const previous = wrap(low - 1, fixtures.length);
  const next = low % fixtures.length;
  const start = fixtures[previous].distance;
  const span = wrap(fixtures[next].distance - start, length);
  const phase = previous + wrap(target - start, length) / span;
  const nearest = Math.floor(phase + 0.5);
  return [-1, 0, 1].map((offset) => {
    const logicalIndex = nearest + offset;
    const index = wrap(logicalIndex, fixtures.length);
    return {
      index,
      fixture: fixtures[index],
      weight: smooth(1.5 - Math.abs(logicalIndex - phase)),
    };
  });
}
