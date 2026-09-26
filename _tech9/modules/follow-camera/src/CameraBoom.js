const point = (value) =>
  value && [value.x, value.y, value.z].every(Number.isFinite);

/**
 * Shorten a world-space camera boom before shared terrain or static vertical
 * solid discs. No scene, camera, world data or persistent resources are owned.
 */
export function resolveCameraBoom(
  target,
  desired,
  {
    groundHeight = () => -Infinity,
    colliders = [],
    clearance = 0.55,
    sampleSpacing = 0.35,
    maxSamples = 4096,
  } = {},
) {
  if (!point(target) || !point(desired))
    throw new TypeError('Camera boom endpoints must be finite x, y, z points.');
  if (typeof groundHeight !== 'function' || !Array.isArray(colliders))
    throw new TypeError(
      'Camera boom requires a height query and collider array.',
    );
  if (
    !Number.isFinite(clearance) ||
    clearance < 0 ||
    !Number.isFinite(sampleSpacing) ||
    sampleSpacing <= 0 ||
    !Number.isInteger(maxSamples) ||
    maxSamples < 1 ||
    maxSamples > 16384
  )
    throw new RangeError('Invalid camera boom sampling or clearance settings.');
  for (const solid of colliders)
    if (
      !solid ||
      ![solid.x, solid.z, solid.radius].every(Number.isFinite) ||
      solid.radius <= 0
    )
      throw new TypeError(
        'Camera colliders require finite x, z and positive radius.',
      );
  const dx = desired.x - target.x;
  const dy = desired.y - target.y;
  const dz = desired.z - target.z;
  const length = Math.hypot(dx, dy, dz);
  const steps = Math.max(1, Math.ceil(length / sampleSpacing));
  if (!Number.isFinite(length) || steps > maxSamples)
    throw new RangeError('Camera boom exceeds its sampling budget.');
  const floor = (x, z) => {
    const h = groundHeight(x, z);
    if (h !== -Infinity && !Number.isFinite(h))
      throw new TypeError('Ground height must be finite or -Infinity.');
    return h + clearance;
  };
  let safe = 1;
  const horizontalLengthSq = dx * dx + dz * dz;
  // Analytic disc intersections retain thin solids between terrain samples.
  for (const solid of colliders) {
    const ox = target.x - solid.x,
      oz = target.z - solid.z;
    const radius = solid.radius + clearance;
    const c = ox * ox + oz * oz - radius * radius;
    if (c <= 0) {
      safe = 0;
      break;
    }
    if (horizontalLengthSq === 0) continue;
    const b = ox * dx + oz * dz;
    const discriminant = b * b - horizontalLengthSq * c;
    if (discriminant < 0) continue;
    const entry = (-b - Math.sqrt(discriminant)) / horizontalLengthSq;
    if (entry >= 0 && entry <= safe)
      safe = Math.max(0, entry - 1e-6 / Math.max(length, 1e-6));
  }
  for (let i = 1; i <= steps; i++) {
    const t = Math.min(i / steps, safe);
    const x = target.x + dx * t,
      z = target.z + dz * t;
    if (target.y + dy * t < floor(x, z)) {
      safe = Math.max(0, Math.min(safe, (i - 1) / steps));
      break;
    }
    if (t === safe) break;
  }
  const result = {
    x: target.x + dx * safe,
    y: target.y + dy * safe,
    z: target.z + dz * safe,
  };
  result.y = Math.max(result.y, floor(result.x, result.z));
  return result;
}
