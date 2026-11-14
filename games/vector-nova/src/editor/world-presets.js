// Seeded Nightweir roadside assemblies. The seed resolves their placement;
// choosing a world never requires arranging individual buildings or plants.
export const WORLD_PRESETS = Object.freeze([
  Object.freeze({
    id: 'waterfront',
    label: 'Waterfront',
    description: 'Brick districts, harbor warehouses and tree-lined quays.',
    density: 0.82,
    waterLevel: -28,
  }),
  Object.freeze({
    id: 'industrial',
    label: 'Industrial basin',
    description: 'Working dockyards, pump stations and zinc-roofed halls.',
    density: 0.88,
    waterLevel: -36,
  }),
  Object.freeze({
    id: 'reclaimed',
    label: 'Reclaimed waterfront',
    description: 'Dense waterside greenery around old basin buildings.',
    density: 0.9,
    waterLevel: -20,
  }),
]);

export function worldPreset(id = 'waterfront') {
  return WORLD_PRESETS.find((preset) => preset.id === id) ?? WORLD_PRESETS[0];
}
