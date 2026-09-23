// Selected six-tile ground atlases already include runtime tint and seam processing.
const ids = new Set([
  'coast_ground',
  'emberline_ground',
  'forest_veil_ground',
  'mire_bog_ground',
  'crater_ember_ground',
  'orbital_reach_ground',
  'frost_canyon_ground',
  'last_crown_ground',
]);
export function preparedGround(entry) {
  return ids.has(entry.id)
    ? {
        ...entry,
        preparedGround: true,
        authoring: { url: entry.url.replace('assets/', 'art/sources/ground/') },
      }
    : entry;
}
