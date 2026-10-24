import { sampleHazardSurface } from '../../physics/hazard-surface.js';
export const VESPER_SAP_SEVERITY = 0.5;
/** Amber resin keeps baseline grip; viscous sap resists momentum and thrust. */
export function sampleVesperSurface(track, state) {
  const s = ((state.distance % track.length) + track.length) % track.length;
  const zone = track.sapZones.find((z) => s >= z.start && s < z.end);
  const onResin =
    !zone || Math.abs(state.lateral - zone.resinCenter) <= zone.resinHalfWidth;
  return {
    id: onResin ? 'resin' : 'sap',
    zone: zone?.id ?? null,
    ...sampleHazardSurface(
      state.speed,
      VESPER_SAP_SEVERITY,
      onResin ? 0 : zone.drag / 5.5,
    ),
  };
}
