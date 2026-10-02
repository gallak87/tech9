/** The amber resin ribbon preserves baseline grip; milky flowing sap adds only local drag. */
export function sampleVesperSurface(track, state) {
  const s = ((state.distance % track.length) + track.length) % track.length;
  const zone = track.sapZones.find((z) => s >= z.start && s < z.end);
  const onResin =
    !zone || Math.abs(state.lateral - zone.resinCenter) <= zone.resinHalfWidth;
  return {
    id: onResin ? 'resin' : 'sap',
    zone: zone?.id ?? null,
    drag: onResin ? 0 : zone.drag,
  };
}
