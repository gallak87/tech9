// Separate generated RGBA sprites. Original PNGs are unmodified; frame crops only
// exclude transparent margins.
export const STRUCTURE_ASSETS = [
  {
    id: 'signal_beacon', source: 'assets/structures/signal-beacon-source.png',
    columns: 1, rows: 1, kind: 'structure', required: true,
    metadata: {
      style: 'beacon', sourceWidth: 1254, sourceHeight: 1254, preserveSourceAlpha: true,
      frames: [{x: 400, y: 10, w: 472, h: 1175, anchorX: 237, anchorY: 1152, nativeHeight: 184}],
    },
  },
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
