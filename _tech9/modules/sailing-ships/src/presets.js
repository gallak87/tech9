// Supported authored shapes, not dimensions for an arbitrary ship generator.
export const SHIP_PRESETS = Object.freeze([
  Object.freeze({
    id: 'schooner',
    name: 'Kestrel',
    type: 'Schooner',
    length: 14,
    beam: 4.2,
    mastHeight: 12,
    footprint: 7.4,
  }),
  Object.freeze({
    id: 'galleon',
    name: 'Resolute',
    type: 'Galleon',
    length: 18,
    beam: 5.5,
    mastHeight: 16,
    footprint: 9.5,
  }),
]);

export function getShipPreset(id) {
  const preset = SHIP_PRESETS.find((candidate) => candidate.id === id);
  if (!preset)
    throw new RangeError(`Unknown sailing ship preset: ${String(id)}`);
  return preset;
}
