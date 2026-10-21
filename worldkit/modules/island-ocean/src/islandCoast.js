const TAU = Math.PI * 2;
const defaults = [
  { amplitude: 4, frequency: 3, phase: 0.5 },
  { amplitude: 3, frequency: 5, phase: Math.PI / 2 - 0.7 },
  { amplitude: 1.4, frequency: 9, phase: 0 },
];
const glslNumber = (n) => (Number.isInteger(n) ? `${n}.0` : String(n));

/** One immutable star-shaped island definition for terrain, water and navigation. */
export function createIslandCoast({
  x = 0,
  z = 0,
  radius = 77,
  level = 0,
  harmonics = defaults,
  segments = 256,
  landSlope = 0.23,
  underwaterSlope = 0.42,
  maxDepth = 4,
} = {}) {
  if (
    ![x, z, radius, level, landSlope, underwaterSlope, maxDepth].every(
      Number.isFinite,
    ) ||
    radius <= 0 ||
    landSlope <= 0 ||
    underwaterSlope <= 0 ||
    maxDepth <= 0
  )
    throw new RangeError(
      'Coast coordinates must be finite and dimensions positive.',
    );
  if (!Number.isInteger(segments) || segments < 64 || segments > 1024)
    throw new RangeError('Coast segments must be 64–1024.');
  if (!Array.isArray(harmonics) || harmonics.length > 8)
    throw new RangeError('At most eight harmonics are supported.');
  const waves = harmonics.map(({ amplitude, frequency, phase = 0 }) => {
    if (
      ![amplitude, frequency, phase].every(Number.isFinite) ||
      !Number.isInteger(frequency) ||
      frequency < 1 ||
      frequency > 16
    )
      throw new RangeError('Invalid coast harmonic.');
    return Object.freeze({ amplitude, frequency, phase });
  });
  const variation = waves.reduce((s, h) => s + Math.abs(h.amplitude), 0);
  if (variation >= radius * 0.5)
    throw new RangeError('Coast variation must be less than half the radius.');
  const definition = Object.freeze({
    x,
    z,
    radius,
    level,
    segments,
    landSlope,
    underwaterSlope,
    maxDepth,
    harmonics: Object.freeze(waves),
  });
  const radiusAt = (a) =>
    radius +
    waves.reduce(
      (r, h) => r + h.amplitude * Math.sin(a * h.frequency + h.phase),
      0,
    );
  const point = (a, inset = 0) => [
    x + Math.cos(a) * (radiusAt(a) - inset),
    z + Math.sin(a) * (radiusAt(a) - inset),
  ];
  const distance = (px, pz) =>
    Math.hypot(px - x, pz - z) - radiusAt(Math.atan2(pz - z, px - x));
  const polygon = Array.from({ length: segments }, (_, i) =>
    point((i / segments) * TAU),
  );
  // A bound on linear interpolation error of the parametric coastline. Expands
  // the polygon so a disc cannot slip through an unsampled coastal bulge.
  const curvatureBound =
    radius +
    waves.reduce(
      (s, h) =>
        s + Math.abs(h.amplitude) * (1 + 2 * h.frequency + h.frequency ** 2),
      0,
    );
  const padding = (curvatureBound * (TAU / segments) ** 2) / 8 + 1e-6;
  const isNavigable = (px, pz, footprint = 0) => {
    if (
      ![px, pz, footprint].every(Number.isFinite) ||
      footprint < 0 ||
      distance(px, pz) <= 0
    )
      return false;
    if (Math.hypot(px - x, pz - z) > radius + variation + footprint + padding)
      return true;
    const clearance = footprint + padding;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      const dx = b[0] - a[0],
        dz = b[1] - a[1];
      const t = Math.max(
        0,
        Math.min(
          1,
          ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz),
        ),
      );
      if (Math.hypot(px - a[0] - t * dx, pz - a[1] - t * dz) <= clearance)
        return false;
    }
    return true;
  };
  const glsl = `float islandRadius(float a) { return ${glslNumber(radius)}${waves.map((h) => ` + (${glslNumber(h.amplitude)}) * sin(a * ${glslNumber(h.frequency)} + (${glslNumber(h.phase)}))`).join('')}; }
float islandDistance(vec2 p) { vec2 q = p - vec2(${glslNumber(x)}, ${glslNumber(z)}); return length(q) - islandRadius(atan(q.y, q.x)); }`;
  return Object.freeze({
    definition,
    radiusAt,
    point,
    distance,
    isNavigable,
    glsl,
    maxRadius: radius + variation,
    terrainHeight(px, pz) {
      const d = distance(px, pz);
      return (
        level -
        (d > 0 ? Math.min(maxDepth, d * underwaterSlope) : d * landSlope)
      );
    },
    vegetationAllowed(px, pz, margin = 2) {
      return distance(px, pz) < -margin;
    },
  });
}

/** Collision records should come from the same placements used for rendering. */
export function createNavigationArea({
  coast,
  bounds,
  circles = [],
  boxes = [],
}) {
  if (
    !coast?.isNavigable ||
    !bounds ||
    ![bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].every(
      Number.isFinite,
    ) ||
    bounds.minX >= bounds.maxX ||
    bounds.minZ >= bounds.maxZ
  )
    throw new RangeError('A coast and finite ordered bounds are required.');
  const frame = { ...bounds };
  const round = circles.map(({ x, z, radius }) => {
    if (![x, z, radius].every(Number.isFinite) || radius <= 0)
      throw new RangeError('Invalid circle placement.');
    return { x, z, radius };
  });
  const rect = boxes.map(({ x, z, width, depth }) => {
    if (
      ![x, z, width, depth].every(Number.isFinite) ||
      width <= 0 ||
      depth <= 0
    )
      throw new RangeError('Invalid box placement.');
    return { x, z, width, depth };
  });
  return (x, z, radius = 0) => {
    if (
      !coast.isNavigable(x, z, radius) ||
      x - radius < frame.minX ||
      x + radius > frame.maxX ||
      z - radius < frame.minZ ||
      z + radius > frame.maxZ
    )
      return false;
    if (round.some((c) => Math.hypot(x - c.x, z - c.z) <= radius + c.radius))
      return false;
    return !rect.some(
      (b) =>
        Math.hypot(
          Math.max(0, Math.abs(x - b.x) - b.width / 2),
          Math.max(0, Math.abs(z - b.z) - b.depth / 2),
        ) <= radius,
    );
  };
}
