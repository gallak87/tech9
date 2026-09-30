export const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function interiorAt(track, distance) {
  const s = ((distance % track.length) + track.length) % track.length;
  return (track.interiors ?? []).reduce(
    (v, zone) =>
      Math.max(
        v,
        smooth(zone.start, zone.start + 30, s) *
          (1 - smooth(zone.end - 30, zone.end, s)),
      ),
    0,
  );
}
export function wetnessAt(track, distance) {
  const s = ((distance % track.length) + track.length) % track.length;
  return (track.curtains ?? []).reduce((v, curtain) => {
    const d = s - curtain.s;
    return Math.max(v, smooth(-5, 1, d) * (1 - smooth(9, 125, d)));
  }, 0);
}
export function sampleTowerEvent(age) {
  const fall = smooth(0, 18, age);
  return {
    fall,
    tilt: fall * 1.17,
    drop: Math.pow(fall, 3) * 165,
    trail: smooth(2, 19, age),
    dust: smooth(0, 4, age) * (1 - smooth(16, 26, age)),
  };
}

export function wetnessForFrame(track, distance, time) {
  const start = track.zephyrPresentation?.wetStart;
  return Math.max(
    wetnessAt(track, distance),
    start == null ? 0 : 1 - smooth(0.4, 5.8, time - start),
  );
}
