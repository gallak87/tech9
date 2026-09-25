// Game-owned content. Every visible solid and collision proxy uses these placements.
export const OCEAN_HALF = 260;
export const START = Object.freeze({ x: 15, z: 110, heading: Math.PI / 2 });
export const DOCK_ZONE = Object.freeze({
  x: 15,
  z: 110,
  radius: 7,
  maxSpeed: 0.8,
  holdSeconds: 1.2,
});
export const DOCK_PARTS = Object.freeze([
  { x: 0, z: 88, width: 4, depth: 30 },
  { x: 0, z: 101, width: 16, depth: 4 },
]);
export const GATES = Object.freeze([
  { id: 1, name: 'East passage', x: 111, z: 0, nx: 0, nz: -1, halfWidth: 15 },
  { id: 2, name: 'North light', x: 0, z: -112, nx: -1, nz: 0, halfWidth: 15 },
  { id: 3, name: 'West reach', x: -112, z: 0, nx: 0, nz: 1, halfWidth: 15 },
]);
export function coastRadius(angle) {
  return (
    77 +
    4 * Math.sin(angle * 3 + 0.5) +
    3 * Math.cos(angle * 5 - 0.7) +
    1.4 * Math.sin(angle * 9)
  );
}
export function coastDistance(x, z) {
  return Math.hypot(x, z) - coastRadius(Math.atan2(z, x));
}
export function islandHeight(x, z) {
  const d = -coastDistance(x, z);
  if (d < -12) return -4;
  if (d < 0) return d / 3;
  const hill = 18 * Math.exp(-((x + 12) ** 2 + (z + 9) ** 2) / 1800);
  const beach = x > 35 && z > 5;
  return Math.min(
    d * (beach ? 0.23 : 0.42),
    3.2 + hill + Math.sin(x * 0.12) * Math.cos(z * 0.09) * 1.2,
  );
}
export const ROCKS = Object.freeze(
  Array.from({ length: 38 }, (_, i) => {
    const a = (i / 38) * Math.PI * 2;
    const radius = coastRadius(a) + (i % 5 === 0 ? 7 : 0);
    return Object.freeze({
      x: Math.cos(a) * radius,
      z: Math.sin(a) * radius,
      radius: 1.6 + (i % 4) * 0.5,
      height: 1.4 + (i % 3) * 0.8,
      angle: i * 2.4,
    });
  }).filter((r) => !(Math.abs(r.x) < 12 && r.z > 0)),
);
export function isNavigable(x, z, radius = 2.8) {
  if (
    Math.abs(x) > OCEAN_HALF - radius ||
    Math.abs(z) > OCEAN_HALF - radius ||
    coastDistance(x, z) < radius
  )
    return false;
  // A radial offset alone underestimates clearance on oblique, scalloped coast.
  // Sample a slightly enlarged disk: the 0.12m margin also covers chord gaps.
  if (coastDistance(x, z) < radius * 1.5) {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      if (
        coastDistance(
          x + Math.cos(a) * (radius + 0.12),
          z + Math.sin(a) * (radius + 0.12),
        ) < 0
      )
        return false;
    }
  }
  for (const rock of ROCKS)
    if (Math.hypot(x - rock.x, z - rock.z) < rock.radius + radius) return false;
  for (const dock of DOCK_PARTS)
    if (
      Math.abs(x - dock.x) < dock.width / 2 + radius &&
      Math.abs(z - dock.z) < dock.depth / 2 + radius
    )
      return false;
  return true;
}
export function seededRandom(seed = 7139) {
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
