import { frameBounds } from './world-detail-art.js';
import { CAVE_EXIT_ASSETS } from './cave-exit-art.js';

const f = (biome, part, x, y, w, h, anchorX, anchorY) => ({
  biome,
  part,
  x,
  y,
  w,
  h,
  anchorX,
  anchorY,
});
const kit = (id, file, frames, backgroundSeeds) => ({
  id,
  source: `assets/world/${file}-source.png`,
  kind: 'caveKit',
  columns: 2,
  rows: 2,
  required: true,
  key: 'neutral-exterior',
  backgroundSeeds,
  metadata: { sourceWidth: 1254, sourceHeight: 1254, frames },
});

export const CAVE_KITS = [
  kit(
    'caves_coast_desert',
    'caves-coast-desert-v1',
    [
      f('coast', 'entrance', 10, 28, 717, 581, 348, 557),
      f('coast', 'station', 716, 78, 519, 514, 262, 501),
      f('coast', 'threshold', 293, 489, 235, 76, 117, 66),
      f('desert', 'entrance', 9, 630, 699, 597, 342, 576),
      f('desert', 'station', 710, 660, 518, 520, 259, 507),
      f('desert', 'threshold', 288, 1090, 240, 103, 120, 90),
    ],
    [
      [914, 153],
      [997, 775],
      [937, 219],
      [815, 394],
      [930, 809],
      [633, 272],
      [844, 135],
      [890, 146],
      [1150, 430],
    ],
  ),
  kit(
    'caves_forest_mire',
    'caves-forest-mire-v1',
    [
      f('forest', 'entrance', 7, 5, 755, 631, 377, 610),
      f('forest', 'station', 765, 94, 476, 527, 238, 513),
      f('forest', 'threshold', 277, 520, 199, 67, 99, 57),
      f('mire', 'entrance', 6, 627, 738, 616, 365, 591),
      f('mire', 'station', 728, 702, 512, 518, 256, 506),
      f('mire', 'threshold', 237, 1090, 253, 84, 126, 74),
    ],
    [
      [980, 785],
      [893, 760],
      [1083, 820],
      [1186, 854],
      [1196, 887],
      [1060, 198],
      [981, 177],
      [1156, 240],
      [1018, 187],
      [1098, 234],
      [1040, 863],
      [688, 981],
      [928, 822],
      [577, 769],
      [103, 851],
      [1124, 176],
      [932, 785],
      [1150, 184],
    ],
  ),
  kit(
    'caves_orbital_frost',
    'caves-orbital-frost-v1',
    [
      f('snow', 'entrance', 20, 37, 714, 614, 357, 575),
      f('snow', 'station', 733, 155, 510, 481, 255, 468),
      f('snow', 'threshold', 258, 512, 196, 73, 98, 63),
      f('ice', 'entrance', 14, 651, 707, 578, 358, 550),
      f('ice', 'station', 734, 717, 506, 494, 253, 480),
      f('ice', 'threshold', 244, 1090, 207, 80, 103, 68),
    ],
    [
      [922, 426],
      [942, 561],
      [984, 1135],
      [984, 577],
      [786, 451],
    ],
  ),
  kit(
    'caves_crater_crown',
    'caves-crater-crown-v1',
    [
      f('volcanic', 'entrance', 5, 16, 690, 599, 345, 573),
      f('volcanic', 'station', 687, 102, 544, 490, 272, 476),
      f('volcanic', 'threshold', 228, 492, 210, 87, 105, 75),
      f('alien', 'entrance', 7, 608, 686, 617, 343, 586),
      f('alien', 'station', 700, 700, 531, 497, 265, 483),
      f('alien', 'threshold', 213, 1057, 212, 97, 106, 84),
    ],
    [
      [964, 814],
      [820, 153],
      [464, 733],
      [880, 966],
      [985, 1090],
      [1037, 798],
      [1030, 764],
      [943, 231],
    ],
  ),
];

export const CAVE_BIOMES = [
  'coast',
  'desert',
  'forest',
  'mire',
  'volcanic',
  'snow',
  'ice',
  'alien',
];
export const CAVE_FLOOR_ASSET = {
  id: 'cave_floor_materials',
  source: 'assets/world/cave-floor-materials-v1-source.png',
  kind: 'caveFloor',
  columns: 4,
  rows: 2,
  required: true,
  metadata: {
    sourceWidth: 1774,
    sourceHeight: 887,
    preserveSourceAlpha: true,
    frames: CAVE_BIOMES.map((biome, i) =>
      f(
        biome,
        'floor',
        Math.floor((i % 4) * 443.5) + 2,
        Math.floor(i / 4) * 443 + 2,
        439,
        439,
        0,
        0,
      ),
    ),
  },
};
export const CAVE_ASSETS = [
  ...CAVE_KITS,
  ...CAVE_EXIT_ASSETS,
  CAVE_FLOOR_ASSET,
];

const frames = new Map(
  [...CAVE_KITS, ...CAVE_EXIT_ASSETS].flatMap((k) =>
    k.metadata.frames.map((f) => [`${f.biome}:${f.part}`, f]),
  ),
);
export function caveArtFrame(biome, part) {
  return frames.get(`${biome}:${part}`) || null;
}
export function caveEntranceBounds(o, biome) {
  const f = caveArtFrame(biome, 'entrance');
  return f && frameBounds(f, o.x, o.y, 190);
}
