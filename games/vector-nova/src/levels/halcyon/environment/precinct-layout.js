export function precinctLayout(track) {
  // Keep the gardens beneath the return, opening district and crown when lap
  // pacing changes; fixed metres or percentages otherwise strand footbridges.
  const start = track.sections.find((section) => section.id === 'start');
  const bank = track.sections.find((section) => section.id === 'bank');
  const returning = track.sections.find((section) => section.id === 'return');
  const from = returning
    ? returning.start + (returning.end - returning.start) * 0.35
    : track.length * 0.922;
  const to = bank
    ? track.length + bank.end - Math.min(100, (bank.end - bank.start) * 0.1)
    : track.length * 1.254;
  const startLength = start ? start.end - start.start : track.length * 0.056;
  return {
    from,
    to,
    hallDistance: from + (track.length - from) * 0.62,
    hallOffset: -98,
    concourseDistance: (start?.start ?? 0) + startLength * 0.8,
    bridgeDistances: [0.08, 0.29, 0.5, 0.71, 0.92].map(
      (fraction) => from + (to - from) * fraction,
    ),
  };
}
