export const DEFAULT_SETTINGS = Object.freeze({
  quality: 'high',
  sunlight: 1,
  atmosphere: 1,
  richness: 1,
  exposure: 1,
});
export const QUALITY = Object.freeze({
  balanced: { pixelRatio: 1, shadowSize: 2048, samples: 0, rays: 20 },
  high: { pixelRatio: 1.35, shadowSize: 3072, samples: 2, rays: 32 },
  ultra: { pixelRatio: 1.75, shadowSize: 4096, samples: 4, rays: 48 },
});
export function validateSettings(input = {}) {
  const result = { ...DEFAULT_SETTINGS };
  if (Object.hasOwn(QUALITY, input.quality)) result.quality = input.quality;
  for (const key of ['sunlight', 'atmosphere', 'richness', 'exposure']) {
    if (Number.isFinite(input[key]))
      result[key] = Math.min(1.6, Math.max(0.4, input[key]));
  }
  return result;
}
export function loadSettings() {
  try {
    return validateSettings(
      JSON.parse(localStorage.getItem('alder-vale.settings') || '{}'),
    );
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
export function saveSettings(settings) {
  try {
    localStorage.setItem('alder-vale.settings', JSON.stringify(settings));
  } catch {
    /* Private browsing may disable storage. */
  }
}
