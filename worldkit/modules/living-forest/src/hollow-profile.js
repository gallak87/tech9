/** Compile an authored radial cross-section without allocating renderer resources. */
export function prepareHollowBodyProfile(points, fluteDepth) {
  if (points === undefined) return null;
  if (!Array.isArray(points) || points.length < 2)
    throw new TypeError(
      'Living hollow bodyProfile requires at least two rings',
    );
  if (!Number.isFinite(fluteDepth) || fluteDepth < 0)
    throw new RangeError(
      'Living hollow fluteDepth must be finite and nonnegative',
    );
  const rings = points.map((point) => ({
    v: point?.v,
    outer: point?.outer,
    inner: point?.inner,
  }));
  if (
    rings.some(
      (point, i) =>
        ![point.v, point.outer, point.inner].every(Number.isFinite) ||
        point.v < 0 ||
        point.v > 1 ||
        point.inner <= 0 ||
        point.outer <= point.inner ||
        (i > 0 && point.v <= rings[i - 1].v),
    ) ||
    rings[0].v !== 0 ||
    rings.at(-1).v !== 1
  )
    throw new RangeError(
      'Living hollow bodyProfile needs increasing 0..1 rings and 0<inner<outer radius ratios',
    );
  const channel = (key) => {
    const widths = rings.slice(0, -1).map((ring, i) => rings[i + 1].v - ring.v);
    const secants = widths.map(
      (width, i) => (rings[i + 1][key] - rings[i][key]) / width,
    );
    // Shape-preserving Hermite slopes keep a tapered torso from overshooting
    // into swollen bands between its authored cross-sections.
    const slopes = rings.map((_, i) => {
      if (i === 0) return secants[0];
      if (i === rings.length - 1) return secants.at(-1);
      const a = secants[i - 1],
        b = secants[i];
      if (a * b <= 0) return 0;
      const w1 = 2 * widths[i] + widths[i - 1],
        w2 = widths[i] + 2 * widths[i - 1];
      return (w1 + w2) / (w1 / a + w2 / b);
    });
    return (v) => {
      let i = rings.findIndex((ring) => ring.v > v) - 1;
      if (i < 0) i = rings.length - 2;
      const a = rings[i],
        b = rings[i + 1],
        span = b.v - a.v;
      const t = (v - a.v) / span;
      return (
        (2 * t * t * t - 3 * t * t + 1) * a[key] +
        (t * t * t - 2 * t * t + t) * span * slopes[i] +
        (-2 * t * t * t + 3 * t * t) * b[key] +
        (t * t * t - t * t) * span * slopes[i + 1]
      );
    };
  };
  const outer = channel('outer'),
    inner = channel('inner');
  return {
    fluteDepth,
    sample(v) {
      return { outer: outer(v), inner: inner(v) };
    },
  };
}

/** Unequal fork crests replace a horizontal terminal rim above the torso. */
export function prepareHollowForkTransition(
  options,
  bodyPlan,
  crownPlan,
  height,
) {
  if (options === undefined) return null;
  if (!bodyPlan || !crownPlan?.bearings.length)
    throw new TypeError(
      'Living hollow forkTransition requires a bodyProfile and grown crown bearings',
    );
  const { rise, crotchDrop, start, halfWidth } = options ?? {};
  if (
    ![rise, crotchDrop, start, halfWidth].every(Number.isFinite) ||
    rise <= 0 ||
    crotchDrop < 0 ||
    crotchDrop > height * 0.15 ||
    start < 0 ||
    start > 0.85 ||
    halfWidth < 0.35 ||
    halfWidth > 1.4 ||
    (1.5 * crotchDrop) / (1 - start) >= height
  )
    throw new RangeError(
      'Living hollow forkTransition requires finite monotone crest dimensions',
    );
  const referenceScale =
    crownPlan.bearings.reduce((sum, bearing) => sum + bearing.scale, 0) /
    crownPlan.bearings.length;
  return (u, v) => {
    let crest = -crotchDrop;
    for (const bearing of crownPlan.bearings) {
      const distance = Math.abs(
        Math.atan2(Math.sin(u - bearing.angle), Math.cos(u - bearing.angle)),
      );
      if (distance >= halfWidth) continue;
      const weight = Math.cos((distance / halfWidth) * Math.PI * 0.5) ** 2;
      crest = Math.max(
        crest,
        ((rise * bearing.scale) / referenceScale + crotchDrop) * weight -
          crotchDrop,
      );
    }
    const t = Math.max(0, Math.min(1, (v - start) / (1 - start)));
    return crest * t * t * (3 - 2 * t);
  };
}
