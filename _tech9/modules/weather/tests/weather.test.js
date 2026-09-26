import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Scene,
  PerspectiveCamera,
  MeshStandardMaterial,
  MeshBasicMaterial,
  ShaderLib,
} from 'three';
import {
  createWeatherState,
  validateWeather,
  WEATHER_PRESETS,
} from '../src/state.js';
import { createWeather } from '../src/Weather.js';
import { createSurfaceField, surfaceHit } from '../src/surfaces.js';
import { installWeatherMaterials } from '../src/materials.js';
const bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
const query = (x, z) => ({
  position: [x, 0, z],
  normal: [0, 2, 0],
  exposure: x < 0 ? 0 : 1,
  coverHeight: x < 0 ? 8 : 0,
  snowRetention: 0.6,
  puddle: 1,
});
const advance = (state, seconds) => {
  for (let i = 0; i < seconds * 20; i++) state.update(0.05);
};

test('rain stops independently while wetness persists then dries; settled snow needs no snowfall', () => {
  const s = createWeatherState({ transition: 0, dryingTime: 20 });
  s.configure({ rain: 1, snow: 0.6 });
  advance(s, 10);
  assert.ok(s.current.wetness > 0.85);
  assert.equal(s.current.snow, 0.6);
  assert.equal(s.current.snowfall, 0);
  s.configure({ rain: 0 });
  advance(s, 1);
  assert.ok(s.current.wetness > 0.8);
  assert.equal(s.current.rain, 0);
  advance(s, 21);
  assert.equal(s.current.wetness, 0);
  assert.equal(s.current.snow, 0.6);
});
test('finite validation, angular wrap, defensive snapshots, pause and long-frame bounds', () => {
  assert.equal(validateWeather(null).rain, 0);
  const s = createWeatherState({ wind: 1, windDirection: 350, transition: 1 });
  s.configure({ rain: Infinity, snow: 2, windDirection: 10 });
  s.update(10);
  assert.ok(s.current.windDirection > 350);
  assert.ok(s.current.time <= 0.05);
  assert.equal(s.current.rain, 0);
  s.configure({ paused: true, transition: 0 });
  const before = s.snapshot();
  s.update(100);
  assert.equal(s.current.time, before.time);
  assert.equal(s.current.snow, before.snow);
  const snapshot = s.snapshot();
  snapshot.target.wind = 0;
  assert.equal(s.target.wind, 1);
  s.configure({ paused: false, windDirection: 90 });
  s.update(0.05);
  assert.ok(Math.abs(s.current.windX) < 1e-8);
  assert.ok(s.current.windZ > 0);
  assert.equal(WEATHER_PRESETS.winter.snowfall, 0);
});
test('surface fields distinguish receiving positions, normals, cover and exposure', () => {
  const hit = surfaceHit(query, -2, 4);
  assert.deepEqual(hit.normal, [0, 1, 0]);
  assert.equal(hit.coverHeight, 8);
  assert.equal(hit.exposure, 0);
  assert.equal(
    surfaceHit(() => null, 0, 0),
    null,
  );
  assert.equal(
    surfaceHit(() => ({ position: [0, NaN, 0], normal: [0, 1, 0] }), 0, 0),
    null,
  );
  assert.throws(
    () => createSurfaceField(query, { ...bounds, maxX: -20 }),
    /non-empty/,
  );
  const field = createSurfaceField(query, bounds, 8);
  const d = field.texture.image.data;
  assert.equal(d[1], 0);
  assert.equal(d[3], 8);
  assert.equal(d[7 * 4 + 1], 1);
  field.dispose();
});
test('shader hooks compose with existing source and restore exact owners', () => {
  const material = new MeshStandardMaterial();
  let called = 0;
  const previous = function (shader) {
    assert.equal(this, material);
    called++;
    shader.fragmentShader += '\n// previous hook';
  };
  const previousKey = () => 'consumer-key';
  material.onBeforeCompile = previous;
  material.customProgramCacheKey = previousKey;
  const field = createSurfaceField(query, bounds, 8);
  const state = createWeatherState().current;
  const installation = installWeatherMaterials(
    [{ material, wind: 0.5 }],
    field,
    state,
  );
  const shader = {
    vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader,
    uniforms: {},
  };
  material.onBeforeCompile(shader, {});
  assert.equal(called, 1);
  assert.match(shader.fragmentShader, /previous hook/);
  assert.match(material.customProgramCacheKey(), /^consumer-key:/);
  installation.dispose();
  assert.equal(material.onBeforeCompile, previous);
  assert.equal(material.customProgramCacheKey, previousKey);
  const again = installWeatherMaterials([{ material }], field, state);
  const later = () => {};
  material.onBeforeCompile = later;
  again.dispose();
  assert.equal(material.onBeforeCompile, later);
  field.dispose();
  material.dispose();
});
test('invalid material batches do not partially mutate earlier targets', () => {
  const material = new MeshStandardMaterial();
  const before = material.onBeforeCompile;
  const field = createSurfaceField(query, bounds, 8);
  assert.throws(
    () =>
      installWeatherMaterials(
        [{ material }, { material: new MeshBasicMaterial() }],
        field,
        {},
      ),
    /StandardMaterial/,
  );
  assert.equal(material.onBeforeCompile, before);
  field.dispose();
  material.dispose();
});
test('repeat activation/disposal keeps scene and caller material ownership stable', () => {
  const scene = new Scene(),
    camera = new PerspectiveCamera();
  camera.position.set(0, 2, 0);
  const material = new MeshStandardMaterial();
  const original = material.onBeforeCompile;
  for (let n = 0; n < 4; n++) {
    const weather = createWeather({
      targets: [{ material }],
      sampleSurface: query,
      features: { audio: false },
      settings: { rain: 1, snowfall: 1 },
    });
    weather.init({ scene, camera, bounds });
    weather.update(0.05);
    assert.equal(scene.children.length, 4);
    assert.ok(weather.stats.particles.rain <= 3600);
    assert.ok(weather.stats.impacts.splashes <= 100);
    camera.position.set(n * 100, 80, n * -100);
    weather.update(0.05);
    weather.dispose();
    weather.dispose();
    assert.equal(scene.children.length, 0);
    assert.equal(material.onBeforeCompile, original);
    assert.throws(() => weather.init({ scene, camera, bounds }), /fresh/);
  }
  material.dispose();
});
test('disabled features stay disabled with independent state settings', () => {
  const weather = createWeather({
    surfaceBounds: bounds,
    features: {
      rain: false,
      snowfall: false,
      impacts: false,
      audio: false,
      wetness: false,
      snow: false,
      wind: false,
    },
    settings: { wetness: 1, snow: 1, wind: 1 },
  });
  const scene = new Scene();
  weather.init({ scene, camera: new PerspectiveCamera() });
  weather.update(0.05);
  assert.equal(scene.children.length, 0);
  assert.equal(weather.condition.wetness, 0);
  assert.equal(weather.condition.snow, 0);
  assert.equal(weather.condition.windX, 0);
  weather.dispose();
});

test('wind travel stays continuous when heading changes after a long run', () => {
  const state = createWeatherState({ wind: 1, transition: 0 });
  advance(state, 120);
  const before = state.current.windTravelX;
  state.configure({ windDirection: 180 });
  state.update(0.01);
  assert.ok(Math.abs(state.current.windTravelX - before) < 0.051);
  state.configure({ paused: true });
  const paused = state.current.windTravelX;
  state.update(20);
  assert.equal(state.current.windTravelX, paused);
});
