import { CONTROLLER_DEFAULTS, controllerSettings } from '../input/gamepad.js';
import { mobileGraphics } from '../renderer/device.js';

export const vesperGraphicsDefaults = {
  vesperClearcoat: true,
  vesperResinDetail: true,
  vesperSurfaceDetail: true,
};
export const halcyonGraphicsDefaults = {
  halcyonRoadSheen: 0.8,
  halcyonRoadReflections: true,
};
export const defaults = {
  ...CONTROLLER_DEFAULTS,
  masterVolume: 1,
  volume: 0.35,
  musicVolume: 0.4,
  quality: 'high',
  reducedMotion: false,
  difficulty: 'easy',
  ...vesperGraphicsDefaults,
  ...halcyonGraphicsDefaults,
};
const volumeLane = (value, fallback) =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;

export const effectsVolume = (settings = {}) =>
  settings.muted
    ? 0
    : volumeLane(settings.masterVolume, defaults.masterVolume) *
      volumeLane(settings.volume, defaults.volume);

let current;
const listeners = new Set();
function normalize(saved = {}) {
  return {
    ...controllerSettings(saved),
    halcyonRoadSheen: Number.isFinite(saved.halcyonRoadSheen)
      ? Math.max(0, Math.min(1, saved.halcyonRoadSheen))
      : halcyonGraphicsDefaults.halcyonRoadSheen,
    halcyonRoadReflections:
      typeof saved.halcyonRoadReflections === 'boolean'
        ? saved.halcyonRoadReflections
        : halcyonGraphicsDefaults.halcyonRoadReflections,
    ...Object.fromEntries(
      Object.entries(vesperGraphicsDefaults).map(([key, fallback]) => [
        key,
        typeof saved[key] === 'boolean' ? saved[key] : fallback,
      ]),
    ),
    masterVolume: volumeLane(saved.masterVolume, defaults.masterVolume),
    volume: volumeLane(saved.volume, defaults.volume),
    musicVolume: volumeLane(saved.musicVolume, defaults.musicVolume),
    quality: ['low', 'high'].includes(saved.quality)
      ? saved.quality
      : mobileGraphics()
        ? 'low'
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
    current = normalize();
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
