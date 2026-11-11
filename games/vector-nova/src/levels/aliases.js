// Prototype links and saved selections remain useful after a course is renamed.
// These aliases never add extra cards to the course catalogue.
const LEVEL_ALIASES = Object.freeze({
  launchworks: 'zephyr-skywell',
  'interceptor-orbital': 'interceptor-helion',
  'interceptor-halcyon': 'interceptor-nightweir',
});

export function canonicalLevelId(id) {
  return Object.hasOwn(LEVEL_ALIASES, id) ? LEVEL_ALIASES[id] : id;
}
