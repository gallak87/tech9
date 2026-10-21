import { createWeatherState, WEATHER_PRESETS } from './state.js';
import { createSurfaceField, surfaceHit } from './surfaces.js';
import { installWeatherMaterials } from './materials.js';
import { createPrecipitation } from './precipitation.js';
import { createImpacts } from './impacts.js';
import { createWeatherAudio } from './audio.js';
export { DEFAULT_WEATHER, WEATHER_PRESETS, validateWeather } from './state.js';

/** Caller owns renderer, frame loop, targets, queries and environment. */
export function createWeather({
  targets = [],
  sampleSurface,
  surfaceBounds,
  features = {},
  settings = {},
  fieldResolution = 128,
} = {}) {
  const enabledSettings = (values) => {
    const patch = { ...(values?.weather ?? values) };
    for (const key of ['rain', 'snowfall', 'wetness', 'snow', 'wind'])
      if (features[key] === false) patch[key] = 0;
    return patch;
  };
  const state = createWeatherState(enabledSettings(settings));
  let context, field, materials, particles, impacts, audio, abort;
  let disposed = false;
  let inactive = false;
  const layer = {
    id: 'weather',
    init(value) {
      if (context || disposed)
        throw new Error('Create a fresh weather layer for each activation.');
      context = value;
      try {
        field = createSurfaceField(
          sampleSurface,
          surfaceBounds ?? context.bounds,
          fieldResolution,
        );
        materials = installWeatherMaterials(targets, field, state.current);
        particles = createPrecipitation(context.scene, context.camera, field, {
          rain: features.rain !== false,
          snow: features.snowfall !== false,
        });
        if (features.impacts !== false && sampleSurface)
          impacts = createImpacts(context.scene, context.camera, sampleSurface);
        if (features.audio !== false) audio = createWeatherAudio();
        if (typeof window !== 'undefined') {
          abort = new AbortController();
          const suspend = () => {
            inactive = true;
            audio?.update(state.current, 0, true);
          };
          const resume = () => {
            inactive = document.hidden;
          };
          window.addEventListener('blur', suspend, { signal: abort.signal });
          window.addEventListener('focus', resume, { signal: abort.signal });
          document.addEventListener(
            'visibilitychange',
            () => (document.hidden ? suspend() : resume()),
            { signal: abort.signal },
          );
        }
        layer.update(0);
      } catch (error) {
        layer.dispose();
        throw error;
      }
    },
    configure(patch) {
      state.configure(enabledSettings(patch));
    },
    setPreset(name) {
      if (!Object.hasOwn(WEATHER_PRESETS, name))
        throw new Error(`Unknown weather preset: ${name}`);
      state.configure(enabledSettings(WEATHER_PRESETS[name]));
    },
    update(dt) {
      if (!context || disposed) return;
      state.update(inactive ? 0 : dt);
      for (const [feature, key] of [
        ['wetness', 'wetness'],
        ['snow', 'snow'],
        ['wind', 'wind'],
      ])
        if (features[feature] === false) state.current[key] = 0;
      if (features.wind === false) {
        state.current.windX = 0;
        state.current.windZ = 0;
      }
      materials.update();
      particles.update(state.current);
      impacts?.update(state.current);
      const p = context.camera.position;
      const hit = surfaceHit(sampleSurface, p.x, p.z);
      const exposure = hit && p.y < hit.coverHeight ? hit.exposure : 1;
      audio?.update(state.current, exposure, inactive);
    },
    unlockAudio: () => audio?.unlock(),
    get condition() {
      return { ...state.current };
    },
    get stats() {
      return {
        ...state.snapshot(),
        particles: particles?.snapshot() ?? {},
        impacts: impacts?.snapshot() ?? {},
        audio: audio?.snapshot() ?? null,
        inactive,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      abort?.abort();
      audio?.dispose();
      impacts?.dispose();
      particles?.dispose();
      materials?.dispose();
      field?.dispose();
    },
  };
  return layer;
}
