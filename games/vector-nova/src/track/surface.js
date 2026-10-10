/** Interpolate a wrapped lateral coordinate along the short physical arc.
 * Keep the endpoint representation at a closed-to-open handoff so the collector
 * always receives the same side of its emerging seam. */
export function interpolateSurfaceLateral(track, previous, current, alpha) {
  const before = track.sampleSurface?.(previous.distance, previous.lateral);
  const after = track.sampleSurface?.(current.distance, current.lateral);
  const period = before?.period || after?.period || 0;
  let delta = current.lateral - previous.lateral;
  if (period) delta -= Math.round(delta / period) * period;
  return current.lateral - delta * (1 - alpha);
}
