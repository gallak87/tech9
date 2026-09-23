// Authoring dimensions stay with the selected source; only the 256px result ships.
export function preparedIcon(entry) {
  if (entry.prepared) return entry;
  return {
    ...entry,
    authoring: {
      url: entry.source.replace('assets/', 'art/sources/'),
      width: entry.width,
      height: entry.height,
      bounds: entry.bounds,
    },
    width: 256,
    height: 256,
    bounds: [0, 0, 256, 256],
    prepared: true,
  };
}
