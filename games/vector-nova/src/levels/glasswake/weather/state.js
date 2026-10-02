import { sampleCaveBlend } from '../environment/event.js';
const clamp = (v) => Math.max(0, Math.min(1, v));
/** Absolute presentation phase: seeking, reset and replay need no weather history.
 * Sheltered chambers keep the same grip and hazard state as the clear exterior.
 */
export function sampleGlasswakeWeather(track, state = {}, settings = {}) {
  const time = Math.max(0, Number(state.time ?? 0));
  const cave = sampleCaveBlend(track, state.distance ?? 0);
  const exposure = 1 - cave;
  const gust = clamp(
    0.62 + Math.sin(time * 0.41) * 0.23 + Math.sin(time * 0.93 + 1.3) * 0.12,
  );
  const storm = exposure * (0.5 + gust * 0.5);
  const motion = settings.reducedMotion ? 0 : time;
  return {
    time: motion,
    exposure,
    cave,
    gust,
    storm,
    windX: 4.2 + gust * 5,
    windZ: -2.1 - gust * 3,
    sheltered: exposure < 0.25,
  };
}
