// Seeded Nightweir regional profiles. Environment layout version 0 retains
// the historical roadside builder; 1 retains the original regional survey and
// 2 stabilizes regional buffers for bounded nearby editing.
export const REGIONAL_LAYOUT_VERSION = 2;
export const WORLD_PRESETS = Object.freeze([
  Object.freeze({
    id: 'waterfront',
    label: 'Waterfront',
    description:
      'Harbor neighborhoods, canals, connected quays and civic landmarks.',
    density: 0.82,
    waterLevel: -28,
  }),
  Object.freeze({
    id: 'industrial',
    label: 'Industrial basin',
    description:
      'Working basins, dockyard districts, pump stations and zinc-roofed halls.',
    density: 0.88,
    waterLevel: -36,
  }),
  Object.freeze({
    id: 'reclaimed',
    label: 'Reclaimed waterfront',
    description:
      'Reclaimed islands, wooded parkland and old basin neighborhoods.',
    density: 0.9,
    waterLevel: -20,
  }),
]);

export function worldPreset(id = 'waterfront') {
  return WORLD_PRESETS.find((preset) => preset.id === id) ?? WORLD_PRESETS[0];
}
