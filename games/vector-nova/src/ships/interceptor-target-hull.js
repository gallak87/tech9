// Original source-authored courier structure, in metres. +Z forward, +Y up.
// Rendered primary masses use these same vertices; small fitted details remain
// inside the compound envelope. Exhaust effects never participate in contact.
const boundsOf = (vertices) => {
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertices.length; i += 3)
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], vertices[i + axis]);
      max[axis] = Math.max(max[axis], vertices[i + axis]);
    }
  return { min: Object.freeze(min), max: Object.freeze(max) };
};
const part = (id, vertices) =>
  Object.freeze({
    id,
    version: 1,
    bounds: Object.freeze(boundsOf(vertices)),
    vertices: Object.freeze(vertices),
  });
const prism = (id, footprint, low, high) =>
  part(id, [
    ...footprint.flatMap(([x, z]) => [x, low, z]),
    ...footprint.flatMap(([x, z]) => [x, high, z]),
  ]);
const section = (x, z, halfWidth, low, high, bevel = 0.3) => [
  x - halfWidth + bevel,
  low,
  z,
  x + halfWidth - bevel,
  low,
  z,
  x + halfWidth,
  low + bevel,
  z,
  x + halfWidth,
  high - bevel,
  z,
  x + halfWidth - bevel,
  high,
  z,
  x - halfWidth + bevel,
  high,
  z,
  x - halfWidth,
  high - bevel,
  z,
  x - halfWidth,
  low + bevel,
  z,
];
const parts = [
  prism(
    'goliath-keel',
    [
      [-4.5, -18],
      [4.5, -18],
      [5.7, -11],
      [5.7, 12],
      [2.4, 20],
      [-2.4, 20],
      [-5.7, 12],
      [-5.7, -11],
    ],
    -0.2,
    1.15,
  ),
  prism(
    'goliath-cargo-spine',
    [
      [-4.9, -11],
      [4.9, -11],
      [5.3, -5],
      [5.3, 10],
      [2.8, 18],
      [-2.8, 18],
      [-5.3, 10],
      [-5.3, -5],
    ],
    1.1,
    4.3,
  ),
  ...[-1, 1].map((side) =>
    part(side < 0 ? 'goliath-drive-left' : 'goliath-drive-right', [
      ...section(side * 5.4, -20, 2.6, 0.2, 4.8, 0.32),
      ...section(side * 5.4, -10.5, 2.6, 0.1, 4.8, 0.35),
      ...section(side * 5.1, -5, 1.7, 0.8, 3.6, 0.3),
    ]),
  ),
  part('goliath-central-drive', [
    ...section(0, -19, 1.8, 0.15, 3.75, 0.25),
    ...section(0, -11, 1.8, 0.15, 3.75, 0.25),
  ]),
  prism(
    'goliath-command-aft',
    [
      [-2.6, 4],
      [2.6, 4],
      [2.6, 5.7],
      [-2.6, 5.7],
    ],
    3.8,
    5.8,
  ),
  prism(
    'goliath-command-front',
    [
      [-2.1, 11.5],
      [2.1, 11.5],
      [1.3, 15],
      [-1.3, 15],
    ],
    3.8,
    5.8,
  ),
  ...[-1, 1].map((side) =>
    prism(
      side < 0 ? 'goliath-command-left' : 'goliath-command-right',
      [
        [side * 1.88, 5.6],
        [side * 2.6, 5.6],
        [side * 2.3, 11.6],
        [side * 1.82, 11.6],
      ],
      3.8,
      5.8,
    ),
  ),
  prism(
    'goliath-command-glazing',
    [
      [-1.8, 5.9],
      [1.8, 5.9],
      [1.72, 11.2],
      [-1.72, 11.2],
    ],
    5.38,
    5.68,
  ),
  ...[-1, 1].map((side) =>
    prism(
      side < 0 ? 'goliath-fore-armor-left' : 'goliath-fore-armor-right',
      [
        [side * 2, 3],
        [side * 5.6, 3],
        [side * 5.3, 10],
        [side * 3.8, 14],
        [side * 2.1, 13],
      ],
      3.6,
      4.7,
    ),
  ),
];
const vertices = parts.flatMap((p) => p.vertices);
export const GOLIATH_HULL = Object.freeze({
  id: 'goliath',
  version: 1,
  // SHA-256 of JSON.stringify({vertices,parts}); the test guards stale contact
  // identities if the authored structure changes in a later revision.
  hullSha256:
    '62a8db0c94ded2b8d8ca7556f1e855c35ef3f0f1c9d63e16c09f3ce9c881750b',
  bounds: Object.freeze(boundsOf(vertices)),
  vertices: Object.freeze(vertices),
  parts: Object.freeze(parts),
});
