/** Weather uses metres, seconds, +Y up; heading 0 blows toward +X, 90 toward +Z. */
export const DEFAULT_WEATHER = Object.freeze({
  rain: 0,
  snowfall: 0,
  wetness: 0,
  snow: 0,
  wind: 0.18,
  windDirection: 25,
  cloud: 0,
  winter: 0,
  transition: 3,
  dryingTime: 100,
  muted: true,
  paused: false,
});
export const WEATHER_PRESETS = Object.freeze(
  Object.fromEntries(
    Object.entries({
      clear: {
        label: 'Clear',
        rain: 0,
        snowfall: 0,
        snow: 0,
        wind: 0.18,
        cloud: 0,
        winter: 0,
      },
      drizzle: {
        label: 'Drizzle',
        rain: 0.3,
        snowfall: 0,
        snow: 0,
        wind: 0.28,
        cloud: 0.7,
        winter: 0,
      },
      rain: {
        label: 'Heavy rain',
        rain: 0.95,
        snowfall: 0,
        snow: 0,
        wind: 0.65,
        cloud: 1,
        winter: 0,
      },
      winter: {
        label: 'Clear winter',
        rain: 0,
        snowfall: 0,
        snow: 0.86,
        wind: 0.22,
        cloud: 0.12,
        winter: 1,
      },
      snowfall: {
        label: 'Snowfall',
        rain: 0,
        snowfall: 0.8,
        snow: 0.9,
        wind: 0.35,
        cloud: 0.88,
        winter: 1,
      },
    }).map(([key, value]) => [key, Object.freeze(value)]),
  ),
);
const unitKeys = [
  'rain',
  'snowfall',
  'wetness',
  'snow',
  'wind',
  'cloud',
  'winter',
];
export const clamp = (value, low = 0, high = 1) =>
  Math.min(high, Math.max(low, value));
export function validateWeather(patch = {}, previous = DEFAULT_WEATHER) {
  patch = patch && typeof patch === 'object' ? patch : {};
  const next = { ...previous };
  for (const key of unitKeys)
    if (Number.isFinite(patch[key])) next[key] = clamp(patch[key]);
  if (Number.isFinite(patch.windDirection))
    next.windDirection = ((patch.windDirection % 360) + 360) % 360;
  if (Number.isFinite(patch.transition))
    next.transition = clamp(patch.transition, 0, 30);
  if (Number.isFinite(patch.dryingTime))
    next.dryingTime = clamp(patch.dryingTime, 1, 3600);
  for (const key of ['muted', 'paused'])
    if (typeof patch[key] === 'boolean') next[key] = patch[key];
  return next;
}
export function createWeatherState(settings) {
  let target = validateWeather(settings);
  const current = {
    ...target,
    time: 0,
    windX: 0,
    windZ: 0,
    windTravelX: 0,
    windTravelZ: 0,
    gust: 1,
  };
  return {
    current,
    get target() {
      return { ...target };
    },
    configure(patch) {
      target = validateWeather(patch?.weather ?? patch, target);
      // Wetness is a reservoir. Only an explicit wetness command sets it directly.
      const values = patch?.weather ?? patch;
      if (Number.isFinite(values?.wetness)) current.wetness = target.wetness;
    },
    update(rawDt) {
      current.paused = target.paused;
      current.muted = target.muted;
      const dt =
        target.paused || !Number.isFinite(rawDt) ? 0 : clamp(rawDt, 0, 0.05);
      current.time += dt;
      const alpha =
        dt === 0
          ? 0
          : target.transition === 0
            ? 1
            : 1 - Math.exp((-dt * 3) / target.transition);
      for (const key of ['rain', 'snowfall', 'snow', 'wind', 'cloud', 'winter'])
        current[key] += (target[key] - current[key]) * alpha;
      const angle =
        ((target.windDirection - current.windDirection + 540) % 360) - 180;
      current.windDirection =
        (current.windDirection + angle * alpha + 360) % 360;
      current.wetness = clamp(
        current.wetness +
          dt *
            (current.rain * 0.22 * (1 - current.wetness) -
              (1 - current.rain) / target.dryingTime),
      );
      current.gust =
        0.87 +
        0.09 * Math.sin(current.time * 0.61) +
        0.04 * Math.sin(current.time * 1.47);
      const strength = current.wind * current.gust * 5;
      current.windX =
        Math.cos((current.windDirection * Math.PI) / 180) * strength;
      current.windZ =
        Math.sin((current.windDirection * Math.PI) / 180) * strength;
      current.windTravelX += current.windX * dt;
      current.windTravelZ += current.windZ * dt;
      return dt;
    },
    snapshot() {
      return { ...current, target: { ...target } };
    },
  };
}
