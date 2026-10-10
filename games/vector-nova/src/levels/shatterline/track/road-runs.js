/** Opaque supported intervals, excluding each independently sampled tube. */
export function roadIntervals(track) {
  let result = [];
  let start = -50;
  for (const jump of track.jumps) {
    result.push({ start, end: jump.takeoff });
    start = jump.landingStart;
  }
  result.push({ start, end: track.length });
  for (const tube of track.tubes ?? []) {
    result = result.flatMap((interval) => {
      if (interval.end <= tube.start || interval.start >= tube.end)
        return [interval];
      const pieces = [];
      if (interval.start < tube.start)
        pieces.push({ start: interval.start, end: tube.start });
      if (interval.end > tube.end)
        pieces.push({ start: tube.end, end: interval.end });
      return pieces;
    });
  }
  return result;
}
