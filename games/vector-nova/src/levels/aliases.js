// Prototype encounter links remain useful when their biome is replaced. These
// aliases never add extra cards to the course catalogue.
const ENCOUNTER_ALIASES = Object.freeze({
  'interceptor-orbital': 'interceptor-helion',
  'interceptor-halcyon': 'interceptor-nightweir',
});

export function canonicalLevelId(id) {
  return Object.hasOwn(ENCOUNTER_ALIASES, id) ? ENCOUNTER_ALIASES[id] : id;
}
