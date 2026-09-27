/** Horizontal collision proxies derived from the same affine transforms as art. */
function transformPoint(matrix, point) {
  const e = matrix?.elements ?? matrix;
  if (!e || e.length !== 16 || !Array.from(e).every(Number.isFinite))
    throw new TypeError(
      'Placement requires a finite, column-major 4×4 matrix.',
    );
  const [x, y, z] = point;
  if (![x, y, z].every(Number.isFinite))
    throw new TypeError('Local collision points require three finite numbers.');
  return {
    x: e[0] * x + e[4] * y + e[8] * z + e[12],
    z: e[2] * x + e[6] * y + e[10] * z + e[14],
  };
}

function horizontalScale(matrix) {
  const e = matrix?.elements ?? matrix;
  // Largest singular value of the XZ transform also handles authored shear.
  const a = e[0] ** 2 + e[2] ** 2;
  const b = e[0] * e[8] + e[2] * e[10];
  const c = e[8] ** 2 + e[10] ** 2;
  return Math.sqrt((a + c + Math.hypot(a - c, 2 * b)) / 2);
}

function positive(value, name) {
  if (!Number.isFinite(value) || value <= 0)
    throw new TypeError(`${name} must be positive and finite.`);
}

/** A conservative XZ disc. Matrix is a Three Matrix4 or its 16-value array. */
export function placementCircle(
  { id, kind, matrix },
  { radius, center = [0, 0, 0] },
) {
  positive(radius, 'radius');
  const point = transformPoint(matrix, center);
  const scale = horizontalScale(matrix);
  positive(scale, 'horizontal scale');
  return Object.freeze({ id, kind, ...point, radius: radius * scale });
}

/**
 * A conservative overlapping disc chain for a log/beam's local center line.
 * Points use local metres. Inflation covers the gap between sampled centers.
 */
export function placementCapsuleChain(
  placement,
  { start = [0, 0, 0], end, radius, spacing = radius },
) {
  positive(radius, 'radius');
  positive(spacing, 'spacing');
  const a = transformPoint(placement.matrix, start);
  const b = transformPoint(placement.matrix, end);
  const scale = horizontalScale(placement.matrix);
  positive(scale, 'horizontal scale');
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const count = Math.max(1, Math.ceil(length / (spacing * scale)));
  if (count > 4096)
    throw new RangeError('Capsule chain exceeds 4096 segments.');
  const expanded = Math.hypot(radius * scale, length / count / 2);
  return Object.freeze(
    Array.from({ length: count + 1 }, (_, index) =>
      Object.freeze({
        id: `${placement.id}-${index}`,
        kind: placement.kind,
        x: a.x + ((b.x - a.x) * index) / count,
        z: a.z + ((b.z - a.z) * index) / count,
        radius: expanded,
      }),
    ),
  );
}

/** Static horizontal discs plus an optional shore/surface predicate. */
export function canStandAt(
  x,
  z,
  { bounds, playerRadius = 0.3, colliders = [], isWalkable = () => true },
) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const r = playerRadius;
  if (
    x < bounds.minX + r ||
    x > bounds.maxX - r ||
    z < bounds.minZ + r ||
    z > bounds.maxZ - r ||
    !isWalkable(x, z)
  )
    return false;
  // Eight perimeter samples prevent the center entering water before the feet.
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    if (!isWalkable(x + Math.cos(angle) * r, z + Math.sin(angle) * r))
      return false;
  }
  return !colliders.some(
    (circle) =>
      (x - circle.x) ** 2 + (z - circle.z) ** 2 < (circle.radius + r) ** 2,
  );
}

/** Bounded substeps and axis sliding; preserves the input position object. */
export function moveGrounded(position, dx, dz, options) {
  const radius = options.playerRadius ?? 0.3;
  positive(radius, 'playerRadius');
  if (![dx, dz].every(Number.isFinite)) return { x: position.x, z: position.z };
  const { bounds } = options;
  const clampX = (x) =>
    Math.max(bounds.minX + radius, Math.min(bounds.maxX - radius, x));
  const clampZ = (z) =>
    Math.max(bounds.minZ + radius, Math.min(bounds.maxZ - radius, z));
  const distance = Math.hypot(dx, dz);
  const maxStep = Math.min(0.12, radius * 0.5);
  const requested = Math.max(1, Math.ceil(distance / maxStep));
  // Extreme caller deltas advance only the first 512 substeps, never tunnel.
  const count = Math.min(512, requested);
  let { x, z } = position;
  for (let i = 0; i < count; i++) {
    const nextX = clampX(x + dx / requested);
    const nextZ = clampZ(z + dz / requested);
    if (canStandAt(nextX, nextZ, options)) {
      x = nextX;
      z = nextZ;
    } else {
      if (canStandAt(nextX, z, options)) x = nextX;
      if (canStandAt(x, nextZ, options)) z = nextZ;
    }
  }
  return { x, z };
}
