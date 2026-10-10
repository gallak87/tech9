export const vesperGraphicsDefaults = {
  vesperClearcoat: true,
  vesperResinDetail: true,
  vesperSurfaceDetail: true,
};
export const defaults = {
  volume: 0.35,
  quality: 'high',
  reducedMotion: false,
  difficulty: 'easy',
  ...vesperGraphicsDefaults,
};
let current;
const listeners = new Set();
function normalize(saved = {}) {
  return {
    ...Object.fromEntries(
      Object.entries(vesperGraphicsDefaults).map(([key, fallback]) => [
        key,
        typeof saved[key] === 'boolean' ? saved[key] : fallback,
      ]),
    ),
    volume: Number.isFinite(saved.volume)
      ? Math.max(0, Math.min(1, saved.volume))
      : defaults.volume,
    quality: ['low', 'high'].includes(saved.quality)
      ? saved.quality
      : defaults.quality,
    reducedMotion:
      typeof saved.reducedMotion === 'boolean'
        ? saved.reducedMotion
        : defaults.reducedMotion,
    difficulty: ['easy', 'medium', 'hard'].includes(saved.difficulty)
      ? saved.difficulty
      : defaults.difficulty,
  };
}
export function loadSettings() {
  if (current) return { ...current };
  try {
    current = normalize(
      JSON.parse(localStorage.getItem('vector-nova.settings') || '{}') ?? {},
    );
  } catch {
    current = { ...defaults };
  }
  return { ...current };
}
export function saveSettings(s) {
  current = normalize({ ...loadSettings(), ...s });
  // The menu and loaded runtime share one live preference source, even when
  // browser storage is unavailable. Subscribers receive independent snapshots.
  for (const listener of listeners) listener({ ...current });
  try {
    localStorage.setItem('vector-nova.settings', JSON.stringify(current));
    return true;
  } catch {
    return false;
  }
}

export function subscribeSettings(listener) {
  listeners.add(listener);
  listener(loadSettings());
  return () => listeners.delete(listener);
}
