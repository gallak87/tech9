// Separate generated RGBA sprites. Original PNGs are unmodified; frame crops only
// exclude transparent margins. Prompts and audit: docs/structure-art.md.
export const STRUCTURE_ASSETS = [
  {
    id: 'listening_dish', source: 'assets/structures/listening-dish-source.png',
    columns: 1, rows: 1, kind: 'structure', required: true,
    metadata: {
      style: 'dish', sourceWidth: 1254, sourceHeight: 1254, preserveSourceAlpha: true,
      frames: [{x: 134, y: 60, w: 1034, h: 1140, anchorX: 470, anchorY: 1135, nativeHeight: 178}],
    },
  },
  {
    id: 'expedition_caravan', source: 'assets/structures/expedition-caravan-source.png',
    columns: 1, rows: 1, kind: 'structure', required: true,
    metadata: {
      style: 'caravan', sourceWidth: 1254, sourceHeight: 1254, preserveSourceAlpha: true,
      frames: [{x: 54, y: 48, w: 1169, h: 1137, anchorX: 586, anchorY: 1127, nativeHeight: 208}],
    },
  },
];
