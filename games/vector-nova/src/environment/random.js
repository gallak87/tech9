/** The level LCG keeps seed coercion deferred until the first draw. */
export function createLcgRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
