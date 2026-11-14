// Low is a complete rendering budget, shared by phones and desktop selection.
// Physical road/collision geometry and navigation cues remain level-owned.
export function graphicsBudget(
  settings = {},
  { mobile = false, dpr = 1, shadowSize = 3072 } = {},
) {
  const low = settings.quality === 'low';
  return {
    low,
    pixelRatio: Math.min(dpr, low ? (mobile ? 0.85 : 1) : mobile ? 1 : 1.25),
    shadowSize: low ? 1024 : shadowSize,
    textureSize: low ? 512 : Infinity,
    anisotropy: low ? 2 : Infinity,
    postEffects: !low,
  };
}
