import field from '../../../../assets/levels/oriel/blender/ground/height-field.json' with { type: 'json' };

/** Match the authored mesh's diagonal exactly, including the angular seam. */
export function groundHeight(angle, z) {
  const u =
    ((((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) /
      (Math.PI * 2)) *
    field.thetaSegments;
  const v = Math.max(
    0,
    Math.min(
      field.zSegments,
      ((z - field.zMin) / (field.zMax - field.zMin)) * field.zSegments,
    ),
  );
  const i = Math.min(field.thetaSegments - 1, Math.floor(u)),
    j = Math.min(field.zSegments - 1, Math.floor(v));
  const x = u - i,
    y = v - j;
  const a = field.heights[j][i],
    b = field.heights[j][i + 1],
    c = field.heights[j + 1][i],
    d = field.heights[j + 1][i + 1];
  return x + y <= 1
    ? a + (b - a) * x + (c - a) * y
    : d + (c - d) * (1 - x) + (b - d) * (1 - y);
}

export function groundSlope(angle, z) {
  return Math.hypot(
    (groundHeight(angle + 0.006, z) - groundHeight(angle - 0.006, z)) / 12,
    (groundHeight(angle, z + 6) - groundHeight(angle, z - 6)) / 12,
  );
}

export const groundGuideVersion = field.guideVersion;
