// Four gait phases, rows side / toward camera / away from camera.
// Source export dimensions differ by one pixel from the requested grid;
// explicit measured crops and one fixed source scale are authoritative.
const frames = (bounds, anchors) =>
  bounds.map(([x, y, r, b], i) => ({
    x,
    y,
    w: r - x,
    h: b - y,
    anchorX: anchors[i][0] - x,
    anchorY: anchors[i][1] - y,
  }));
export const HERO_WALK_ART = [
  {
    id: 'vex',
    source: 'assets/vex/faceless-vex-hood-v2-walk-source.png',
    columns: 4,
    rows: 3,
    sourceWidth: 1447,
    sourceHeight: 1087,
    pixelScale: 0.24,
    preserveSourceAlpha: true,
    frames: frames(
      [
        [34, 5, 334, 343],
        [403, 4, 691, 344],
        [760, 4, 1065, 344],
        [1128, 4, 1401, 344],
        [60, 343, 345, 691],
        [439, 343, 684, 691],
        [784, 343, 1061, 691],
        [1158, 343, 1417, 691],
        [85, 691, 379, 1054],
        [451, 691, 712, 1056],
        [805, 691, 1098, 1050],
        [1168, 691, 1443, 1053],
      ],
      [
        [235, 338],
        [580, 338],
        [963, 339],
        [1315, 338],
        [204, 685],
        [560, 685],
        [928, 685],
        [1296, 685],
        [215, 1046],
        [570, 1048],
        [938, 1042],
        [1298, 1045],
      ],
    )
      // One constant source scale per direction preserves gait bob while matching
      // standing stature; no frame-by-frame fitting of the swaying cloak bounds.
      .map((frame, i) => ({
        ...frame,
        pixelScale: i < 4 ? 0.24 : i < 8 ? 0.232 : 0.226,
      })),
  },
  {
    id: 'rune',
    source: 'assets/rune-walk-source.png',
    columns: 4,
    rows: 3,
    sourceWidth: 1447,
    sourceHeight: 1087,
    pixelScale: 0.25,
    key: 'neutral-exterior',
    backgroundSeeds: [
      [121, 518],
      [487, 507],
      [844, 516],
      [1210, 510],
    ],
    frames: frames(
      [
        [37, 18, 316, 353],
        [411, 18, 679, 353],
        [756, 18, 1051, 353],
        [1129, 18, 1394, 353],
        [43, 371, 317, 715],
        [415, 371, 671, 718],
        [762, 371, 1035, 716],
        [1133, 370, 1391, 715],
        [57, 731, 304, 1069],
        [423, 731, 684, 1066],
        [779, 731, 1020, 1069],
        [1146, 731, 1409, 1066],
      ],
      [
        [176, 349],
        [549, 349],
        [916, 349],
        [1290, 349],
        [168, 711],
        [552, 714],
        [914, 712],
        [1287, 711],
        [167, 1065],
        [546, 1062],
        [904, 1065],
        [1272, 1062],
      ],
    ),
  },
];
