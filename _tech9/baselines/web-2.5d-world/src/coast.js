// Authored composition belongs to this starting package. The module supplies
// rendering, art and traversal, without knowing these names, routes or stories.
const prop = (id, frame, x, y, height, footprints = [], extra = {}) => ({
  id,
  frame,
  x,
  y,
  height,
  footprints,
  occludes: true,
  ...extra,
});
const trunk = (radius = 18) => [{ x: -radius, y: -10, w: radius * 2, h: 18 }];
const rock = (radius = 32) => [{ x: -radius, y: -20, w: radius * 2, h: 25 }];

export const coastScene = {
  id: 'coastal-study',
  width: 1800,
  height: 1340,
  spawn: { x: 870, y: 980 },
  roads: [
    {
      points: [
        [710, 1340],
        [745, 1200],
        [870, 980],
        [890, 860],
        [1040, 700],
        [1010, 490],
        [1100, 300],
      ],
      width: 84,
    },
    {
      points: [
        [875, 950],
        [690, 905],
        [550, 800],
        [380, 735],
        [170, 790],
      ],
      width: 68,
    },
    {
      points: [
        [1030, 700],
        [1180, 760],
        [1330, 830],
        [1550, 900],
      ],
      width: 58,
    },
    {
      points: [
        [1020, 540],
        [770, 480],
        [590, 340],
        [350, 220],
      ],
      width: 64,
    },
  ],
  water: [
    [
      [1530, 0],
      [1800, 0],
      [1800, 1340],
      [1250, 1340],
      [1335, 1210],
      [1300, 1100],
      [1480, 1015],
      [1570, 865],
      [1460, 730],
      [1510, 570],
      [1440, 430],
      [1550, 250],
    ],
    [
      [0, 1000],
      [100, 1070],
      [245, 1170],
      [350, 1340],
      [0, 1340],
    ],
  ],
  clearings: [
    { x: 1000, y: 570, radius: 135 },
    { x: 480, y: 750, radius: 125 },
  ],
  props: [
    prop(
      'observatory',
      'ring',
      1005,
      515,
      290,
      [
        { x: -115, y: -44, w: 67, h: 66 },
        { x: 57, y: -44, w: 63, h: 66 },
      ],
      { interact: { label: 'Read the observatory stone', radius: 145 } },
    ),
    prop(
      'gate',
      'arch',
      820,
      1160,
      225,
      [
        { x: -94, y: -25, w: 57, h: 35 },
        { x: 43, y: -25, w: 54, h: 35 },
      ],
      { interact: { label: 'Read the waystone', radius: 110 } },
    ),
    prop(
      'cottage',
      'cottage',
      480,
      740,
      245,
      [{ x: -80, y: -105, w: 204, h: 120 }],
      { interact: { label: 'Read the cottage note', radius: 130 } },
    ),
    prop('overlook', 'cliff', 1450, 985, 190, rock(65), {
      interact: { label: 'Look out to sea', radius: 110 },
    }),
    prop('tree-west', 'tree', 260, 865, 340, trunk(28)),
    prop('tree-cottage', 'tree', 600, 715, 260, trunk(20)),
    prop('tree-north', 'tree', 725, 405, 295, trunk(24)),
    prop('tree-east', 'tree', 1320, 670, 320, trunk(24)),
    prop('tree-south', 'tree', 1090, 1215, 335, trunk(28)),
    prop('tree-distant', 'tree', 1185, 245, 265, trunk(22)),
    prop('tree-boundary', 'tree', 140, 435, 340, trunk(25)),
    prop('tree-edge', 'tree', 405, 1270, 300, trunk(24)),
    prop('cypress-a', 'cypress', 770, 1000, 242, trunk(16)),
    prop('cypress-b', 'cypress', 1050, 955, 265, trunk(17)),
    prop('cypress-c', 'cypress', 1188, 555, 235, trunk(17)),
    prop('cypress-d', 'cypress', 830, 560, 225, trunk(16)),
    prop('cypress-e', 'cypress', 360, 630, 258, trunk(17)),
    prop('cypress-f', 'cypress', 1220, 1085, 230, trunk(16)),
    prop('cypress-g', 'cypress', 565, 280, 258, trunk(17)),
    prop('cypress-h', 'cypress', 1440, 345, 250, trunk(17)),
    prop('rock-east', 'rock', 1420, 820, 122, rock(30)),
    prop('rock-north', 'rock', 1290, 400, 115, rock(28)),
    prop('rock-west', 'rock', 355, 990, 142, rock(36)),
    prop('rock-low', 'rock', 600, 1110, 125, rock(30)),
    prop('rock-ring', 'rock', 1130, 655, 80, rock(19)),
    prop('fern-a', 'fern', 698, 1025, 64, [], { occludes: false }),
    prop('fern-b', 'fern', 1110, 1090, 73, [], { occludes: false }),
    prop('fern-c', 'fern', 1110, 835, 64, [], { occludes: false }),
    prop('fern-d', 'fern', 420, 850, 58, [], { occludes: false }),
    prop('fern-e', 'fern', 835, 688, 58, [], { occludes: false }),
    prop('fern-f', 'fern', 1240, 710, 72, [], { occludes: false }),
    prop('fern-g', 'fern', 1170, 420, 55, [], { occludes: false }),
    prop('fern-h', 'fern', 520, 980, 66, [], { occludes: false }),
    prop('fern-i', 'fern', 1300, 1180, 70, [], { occludes: false }),
    prop('fern-j', 'fern', 500, 510, 65, [], { occludes: false }),
    prop('ruin-west', 'arch', 230, 380, 190, [
      { x: -72, y: -24, w: 42, h: 30 },
      { x: 36, y: -24, w: 42, h: 30 },
    ]),
    prop('cliff-north', 'cliff', 1470, 465, 135, rock(42)),
  ],
};

export const coastNotes = {
  observatory: {
    title: 'The tide keeps its own time.',
    body: 'Before the roof fell, the brass ring held a lens for watching the stars. Sea lavender grows between its steps now. The view is still worth the walk.',
  },
  gate: {
    title: 'The long way to the sea.',
    body: 'The old coast road passes beneath these stones. Follow it north to the observatory, or take the western fork to the keeper’s cottage.',
  },
  cottage: {
    title: 'Back when the tide turns.',
    body: 'A note is tucked beneath the teal door: “If you arrive before me, leave the kettle by the window. The path to the observatory is clear.”',
  },
  overlook: {
    title: 'Nothing to hurry for.',
    body: 'The shallows fade from jade to blue. For a moment the only movement is the light on the water.',
  },
};

export function regionAt({ x, y }) {
  if (x > 1250) return 'The limestone shore';
  if (y < 660 && x > 760) return 'The old observatory';
  if (x < 680) return 'Keeper’s cottage';
  if (y > 1090) return 'The southern gate';
  return 'Cypress approach';
}
