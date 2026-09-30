/** The monumental shelf is a route-synchronised scenery event, never a hazard.
 * An absolute pose supports seeking, section starts, pause and replay without
 * replaying frame history. Every quality preset evaluates exactly this state.
 */
const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};
export function sampleCalvingState(track, state = {}) {
  const distance =
    ((Number(state.distance ?? 0) % track.length) + track.length) %
    track.length;
  const start = track.bridge.start - 180;
  const end = track.bridge.end + 300;
  const crack = smooth((distance - start) / 200);
  const separation = smooth((distance - track.bridge.start - 40) / 430);
  const reveal = smooth((separation - 0.1) / 0.8);
  return {
    distance,
    start,
    end,
    crack,
    separation,
    reveal,
    phase:
      crack === 0
        ? 'intact'
        : separation === 0
          ? 'cracking'
          : separation < 1
            ? 'separating'
            : 'open',
  };
}
export function sampleCaveBlend(track, distance = 0) {
  const d = ((distance % track.length) + track.length) % track.length;
  let blend = 0;
  for (const section of track.sections.filter(({ id }) =>
    ['mouth', 'gallery', 'chasm'].includes(id),
  )) {
    blend = Math.max(
      blend,
      smooth((d - section.start + 25) / 95) *
        (1 - smooth((d - section.end + 100) / 100)),
    );
  }
  return blend;
}
