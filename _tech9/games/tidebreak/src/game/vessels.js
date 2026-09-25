// One shared hull contract for the chooser, rendered ship and collision footprint.
export const VESSELS = Object.freeze([
  Object.freeze({
    id: 'schooner',
    name: 'Kestrel',
    type: 'Schooner',
    description: 'A two-masted coastal schooner with fore-and-aft sails.',
    length: 14,
    beam: 4.2,
    mastHeight: 12,
    footprint: 7.4,
  }),
  Object.freeze({
    id: 'galleon',
    name: 'Resolute',
    type: 'Galleon',
    description:
      'A broad-decked galleon carrying a tall square-rigged sail plan.',
    length: 18,
    beam: 5.5,
    mastHeight: 16,
    footprint: 9.5,
  }),
]);

export function getVessel(id) {
  return VESSELS.find((vessel) => vessel.id === id) ?? VESSELS[0];
}
