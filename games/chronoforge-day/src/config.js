export const STORAGE_KEY = 'chronoforge-day.stage.v1';

export const CAMERAS = [
  { id: 'threeQuarter', label: 'Three-quarter' },
  { id: 'front', label: 'Front' },
  { id: 'side', label: 'Side' },
  { id: 'back', label: 'Back' },
  { id: 'game', label: 'Game view' },
];

export const LIGHTING_PRESETS = [
  { id: 'studio', label: 'Studio' },
  { id: 'daylight', label: 'Daylight' },
  { id: 'dusk', label: 'Dusk' },
];

export const DEFAULT_STATE = {
  version: 1,
  clip: 'idle', time: 0, playing: true, loop: true, speed: 1,
  camera: 'threeQuarter', cameraPose: null, zoom: 1,
  lighting: 'studio', exposure: 1.05,
  view: { skeleton: false, wireframe: false, grid: true, contacts: false, trajectory: false, target: true },
  character: {
    height: 1.72, build: 1, headScale: 1, weaponScale: 1,
    palette: {
      skin: '#d79e85', hair: '#b52a63', coat: '#185665', cloth: '#252837',
      leather: '#422d35', metal: '#718293', accent: '#b19161', blade: '#b880f7',
    },
  },
  motion: { stride: 1, intensity: 1, reach: 1 },
};

const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const numeric = (value, fallback, min, max) => typeof value === 'number' && Number.isFinite(value)
  ? Math.max(min, Math.min(max, value)) : fallback;
const bool = (value, fallback) => typeof value === 'boolean' ? value : fallback;
const choice = (value, fallback, options) => options.includes(value) ? value : fallback;

// Only known properties are copied. Preset imports never merge arbitrary keys.
export function sanitizeState(input = {}, base = DEFAULT_STATE) {
  const src = object(input);
  const character = object(src.character);
  const palette = object(character.palette);
  const view = object(src.view);
  const motion = object(src.motion);
  const next = {
    version: 1,
    clip: choice(src.clip, base.clip, ['rest', 'idle', 'walk', 'attack', 'hit']),
    time: numeric(src.time, base.time, 0, 60),
    playing: bool(src.playing, base.playing), loop: bool(src.loop, base.loop),
    speed: numeric(src.speed, base.speed, 0.1, 2),
    camera: choice(src.camera, base.camera, CAMERAS.map(x => x.id)),
    cameraPose: base.cameraPose ? structuredClone(base.cameraPose) : null,
    zoom: numeric(src.zoom, base.zoom, 0.55, 1.8),
    lighting: choice(src.lighting, base.lighting, LIGHTING_PRESETS.map(x => x.id)),
    exposure: numeric(src.exposure, base.exposure, 0.4, 2),
    view: Object.fromEntries(Object.keys(base.view).map(key => [key, bool(view[key], base.view[key])])),
    character: {
      height: numeric(character.height, base.character.height, 1.4, 2.1),
      build: numeric(character.build, base.character.build, 0.75, 1.3),
      headScale: numeric(character.headScale, base.character.headScale, 0.8, 1.2),
      weaponScale: numeric(character.weaponScale, base.character.weaponScale, 0.7, 1.3),
      palette: Object.fromEntries(Object.keys(base.character.palette).map(key => [
        key, typeof palette[key] === 'string' && /^#[0-9a-f]{6}$/i.test(palette[key])
          ? palette[key].toLowerCase() : base.character.palette[key],
      ])),
    },
    motion: {
      stride: numeric(motion.stride, base.motion.stride, 0.5, 1.4),
      intensity: numeric(motion.intensity, base.motion.intensity, 0.5, 1.4),
      reach: numeric(motion.reach, base.motion.reach, 0.7, 1.3),
    },
  };
  if ('camera' in src && src.camera !== base.camera) next.cameraPose = null;
  if (src.cameraPose === null) next.cameraPose = null;
  else if ('cameraPose' in src) {
    const p = object(src.cameraPose);
    const valid = key => Array.isArray(p[key]) && p[key].length === 3 && p[key].every(n => Number.isFinite(n) && Math.abs(n) <= 50);
    if (valid('position') && valid('target') && Math.hypot(...p.position.map((n, i) => n - p.target[i])) > 0.1) {
      next.cameraPose = { position: [...p.position], target: [...p.target] };
    }
  }
  return next;
}

export function readPreset(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Choose a Chronoforge Day JSON preset.');
  if (payload.version !== 1) throw new Error('This stage supports preset version 1.');
  if (!payload.character || !payload.motion) throw new Error('The preset is missing character or motion settings.');
  return sanitizeState(payload);
}

export function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return readPreset(JSON.parse(saved));
  } catch { /* Storage may be unavailable; a clean stage still works. */ }
  return sanitizeState();
}
