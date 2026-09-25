export const DEFAULT_SETTINGS = Object.freeze({
  quality: 'balanced',
  sunlight: 1,
  atmosphere: 1,
  richness: 1,
  exposure: 1,
});
export const QUALITY = Object.freeze({
  balanced: {
    pixelRatio: 1,
    maxPixels: 1600000,
    shadowSize: 2048,
    samples: 0,
    rays: 20,
  },
  high: {
    pixelRatio: 1.35,
    maxPixels: 2600000,
    shadowSize: 3072,
    samples: 4,
    rays: 32,
  },
  ultra: {
    pixelRatio: 1.75,
    maxPixels: 5200000,
    shadowSize: 4096,
    samples: 4,
    rays: 48,
  },
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
export function loadSettings(storageKey = 'stillwater-pond.settings') {
  try {
    return validateSettings(
      JSON.parse(localStorage.getItem(storageKey) || '{}'),
    );
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
export function saveSettings(
  settings,
  storageKey = 'stillwater-pond.settings',
) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(settings));
  } catch {
    /* Private browsing may disable storage. */
  }
}
