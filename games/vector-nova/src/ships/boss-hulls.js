import { GOLIATH_HULL } from './interceptor-target-hull.js';

// Frozen metre-space convex contact proxies. Formed visual skins retain the
// overall measured envelopes and exhaust origins without changing gameplay.
const boundsOf = (vertices) => {
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertices.length; i += 3)
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], vertices[i + axis]);
      max[axis] = Math.max(max[axis], vertices[i + axis]);
    }
  return Object.freeze({ min: Object.freeze(min), max: Object.freeze(max) });
};
const part = (id, vertices) =>
  Object.freeze({
    id,
    version: 1,
    bounds: boundsOf(vertices),
    vertices: Object.freeze(vertices),
  });
const prism = (id, footprint, low, high) =>
  part(id, [
    ...footprint.flatMap(([x, z]) => [x, low, z]),
    ...footprint.flatMap(([x, z]) => [x, high, z]),
  ]);
const ring = (x, z, halfWidth, low, high, bevel = 0.15) => [
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
const hull = (id, parts, hullSha256) => {
  const vertices = parts.flatMap((entry) => entry.vertices);
  return Object.freeze({
    id,
    version: 1,
    hullSha256,
    bounds: boundsOf(vertices),
    vertices: Object.freeze(vertices),
    parts: Object.freeze(parts),
  });
};

const wraithParts = [
  prism(
    'wraith-keel',
    [
      [-1.4, -7],
      [1.4, -7],
      [1.8, -2],
      [1.1, 1.4],
      [-1.1, 1.4],
      [-1.8, -2],
    ],
    -0.15,
    0.65,
  ),
  prism(
    'wraith-root-bridge',
    [
      [-2.9, -6.7],
      [2.9, -6.7],
      [3.3, -4.6],
      [2.2, -3.1],
      [-2.2, -3.1],
      [-3.3, -4.6],
    ],
    0.2,
    1.05,
  ),
  ...[-1, 1].map((side) =>
    part(side < 0 ? 'wraith-port-cutter' : 'wraith-starboard-cutter', [
      ...ring(side * 2.8, -5.8, 1.2, 0.05, 1.45),
      ...ring(side * 2.5, 1.2, 0.7, 0.1, 1.05),
      ...ring(side * 2.2, 9, 0.16, 0.28, 0.61, 0.06),
    ]),
  ),
  ...[-1, 1].map((side) =>
    part(side < 0 ? 'wraith-port-drive' : 'wraith-starboard-drive', [
      ...ring(side * 2.4, -9, 0.8, 0, 1.6),
      ...ring(side * 2.4, -6.1, 0.95, 0.05, 1.55),
    ]),
  ),
  prism(
    'wraith-command-coaming',
    [
      [-1.1, -5.8],
      [1.1, -5.8],
      [1.3, -3.8],
      [0.75, -0.8],
      [-0.75, -0.8],
      [-1.3, -3.8],
    ],
    0.85,
    1.75,
  ),
  part('wraith-glazed-command-spine', [
    ...ring(0, -4.9, 0.73, 1.65, 2.85),
    ...ring(0, -2.7, 0.58, 1.6, 2.65),
    ...ring(0, -0.9, 0.3, 1.6, 1.9, 0.08),
  ]),
];
const bulwarkParts = [
  prism(
    'bulwark-armored-undertray',
    [
      [-4.5, -9.2],
      [4.5, -9.2],
      [5.8, -6.7],
      [5.8, 5.5],
      [4.5, 8.6],
      [-4.5, 8.6],
      [-5.8, 5.5],
      [-5.8, -6.7],
    ],
    -0.2,
    0.75,
  ),
  prism(
    'bulwark-aft-engine-bank',
    [
      [-4.4, -10],
      [4.4, -10],
      [4.8, -6],
      [3.5, -3.2],
      [-3.5, -3.2],
      [-4.8, -6],
    ],
    0.1,
    2.1,
  ),
  ...[-1, 1].map((side) =>
    part(side < 0 ? 'bulwark-port-shoulder' : 'bulwark-starboard-shoulder', [
      ...ring(side * 4.2, -10, 1.25, 0.1, 2.2, 0.22),
      ...ring(side * 4.2, -5.5, 1.8, 0.05, 2.55, 0.28),
      ...ring(side * 4.2, 4.4, 1.6, 0.1, 2.4, 0.24),
    ]),
  ),
  prism(
    'bulwark-shield-foundation',
    [
      [-6, 3],
      [6, 3],
      [6, 6.2],
      [4.7, 10],
      [-4.7, 10],
      [-6, 6.2],
    ],
    0.1,
    2.25,
  ),
  part(
    'bulwark-sloped-shield-crown',
    [
      -5.7, 1.9, 3.5, 5.7, 1.9, 3.5, 5.7, 1.9, 6.2, 4.6, 1.9, 9.7, -4.6, 1.9,
      9.7, -5.7, 1.9, 6.2, -5.4, 3.8, 3.8, 5.4, 3.8, 3.8, 5.4, 3.8, 5.4, 4.3,
      3.8, 7.8, -4.3, 3.8, 7.8, -5.4, 3.8, 5.4,
    ],
  ),
  prism(
    'bulwark-command-citadel',
    [
      [-1.9, -3.1],
      [1.9, -3.1],
      [2.1, -1.4],
      [1.7, 2.7],
      [-1.7, 2.7],
      [-2.1, -1.4],
    ],
    1.8,
    3.2,
  ),
];

export const WRAITH_HULL = hull(
  'wraith',
  wraithParts,
  '1a329d0fd3a9bb0aa669f6a609c916b00b408753596ee88417170396878bac2d',
);
export const BULWARK_HULL = hull(
  'bulwark',
  bulwarkParts,
  '64408a06b1b80637c1a9b49cd217a151a1a1c164d3beb2332efecfe6afa2cdb4',
);
export const BOSS_HULLS = Object.freeze({
  goliath: GOLIATH_HULL,
  wraith: WRAITH_HULL,
  bulwark: BULWARK_HULL,
});
export function getBossHull(id) {
  if (!Object.hasOwn(BOSS_HULLS, id))
    throw new Error(`Unknown boss chassis: ${id}`);
  return BOSS_HULLS[id];
}
